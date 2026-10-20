const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const dir = 'output/playwright/product';
let sequence = 0;
async function read(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return undefined; } }
async function until(predicate, name, timeout = 15000) {
  const start = Date.now();
  for (;;) {
    const value = await predicate(); if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${name}`);
    await delay(100);
  }
}
async function request(action) {
  const id = ++sequence;
  await fs.writeFile('.tmp/ui-request.json', JSON.stringify({ id, action }));
  const result = await until(async () => { const r = await read('.tmp/ui-response.json'); return r?.id === id ? r : undefined; }, action);
  assert.equal(result.error, undefined, result.error); return result;
}
async function analysis(predicate) {
  return until(async () => {
    const data = await read('.tmp/ui-live.json');
    return data && !data.diagnostics.notebooks[0]?.pending && predicate(data) ? data : undefined;
  }, 'source analysis');
}
async function main() {
  await fs.mkdir(dir, { recursive: true });
  assert.ok(/^\d+$/.test(process.env.NGG_UI_PORT || ''), 'the launcher must supply an isolated CDP port');
  assert.ok(process.env.NGG_UI_WORKSPACE, 'the launcher must identify its test workspace');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.NGG_UI_PORT}`);
  const pages = browser.contexts().flatMap(context => context.pages());
  let page;
  for (const candidate of pages) if ((await candidate.title()).includes(process.env.NGG_UI_WORKSPACE)) { page = candidate; break; }
  assert.ok(page, 'CDP target must belong to the unique temporary test workspace');
  const quickDiffOnly = process.env.NGG_UI_QUICKDIFF_ONLY === '1';
  const evidence = [];
  async function capture(name) {
    await delay(400);
    const icons = await page.locator('.glyph-margin-widgets div').evaluateAll(elements => elements.flatMap(element => {
      const style = getComputedStyle(element); const image = style.backgroundImage;
      const match = image.match(/\/(added|modified|deleted)-(contrast-light|contrast|dark|light)((?:-after|-both)?(?:-added|-modified)?)\.svg/);
      const rect = element.getBoundingClientRect();
      return match && element.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        ? [{ kind: match[1], palette: match[2], x: rect.x, y: rect.y, width: rect.width, height: rect.height }] : [];
    }));
    const state = await read('.tmp/ui-live.json');
    await page.screenshot({ path: `${dir}/${name}.png` });
    evidence.push({ name, icons, state });
    await fs.writeFile(`${dir}/${quickDiffOnly ? 'quickdiff-evidence' : 'evidence'}.json`, JSON.stringify(evidence, null, 2));
    console.log(`UI ${name}: ${icons.map(i => i.kind).join(', ') || 'no markers'}`);
    return icons;
  }
  const first = () => page.getByRole('listitem', { name: 'code cell', exact: true }).first().locator('.view-lines');
  const renderedText = async locator => (await locator.innerText()).replace(/\u00a0/g, ' ');
  const changed = data => data.diagnostics.notebooks[0].cells[0].changes;
  try {
    if (!quickDiffOnly) {
      await fs.writeFile(`${dir}/initial-accessibility.txt`, await page.locator('body').ariaSnapshot());
      assert.equal((await capture('01-baseline')).length, 0);
      await first().click({ position: { x: 90, y: 10 } });
      await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End'); await page.keyboard.type('name = "Changed without saving"');
      const edited = await analysis(data => changed(data).some(c => c.kind === 'modified'));
      assert.equal(edited.dirty, true);
      assert.ok((await capture('02-unsaved-modified')).some(i => i.kind === 'modified'));
      await page.keyboard.press('Control+End'); await page.keyboard.type('added = True\n');
      await analysis(data => changed(data).some(c => c.kind === 'added'));
      assert.ok((await capture('03-added')).some(i => i.kind === 'added'));
      await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home');
      await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Backspace');
      await analysis(data => changed(data).some(c => c.kind === 'deleted'));
      const three = await capture('04-deleted');
      for (const kind of ['added', 'modified', 'deleted']) assert.ok(three.some(i => i.kind === kind));
      // A real click on a gutter decoration cannot be proxied by selection events.
      const selections = (await read('.tmp/ui-live.json')).selectionEvents;
      const blue = three.find(icon => icon.kind === 'modified');
      const red = three.find(icon => icon.kind === 'deleted');
      await page.mouse.click(blue.x + blue.width / 2, blue.y + blue.height / 2);
      await page.mouse.click(red.x + red.width / 2, red.y + 1);
      await delay(250);
      assert.equal((await read('.tmp/ui-live.json')).selectionEvents, selections, 'glyph clicks do not expose a text-selection callback');
      await request('clear-probe-breakpoints');
      async function showChange(icon) {
        await page.mouse.click(icon.x + icon.width / 2, icon.y + icon.height / 2, { button: 'right' });
        const action = page.getByRole('menuitem', { name: /Jupyter Notebook Git Marks: Show Change/ });
        await action.waitFor(); await action.hover(); await page.keyboard.press('Enter');
        const hover = page.locator('.monaco-hover:visible').filter({ hasText: 'Jupyter Notebook Git Marks:' }).last();
        if ((await read('.tmp/ui-live.json')).notebookEditors > 1) {
          await delay(500);
          assert.equal(await hover.isVisible(), false, 'ambiguous gutter context must not open details in another group');
          // Use the real source-hover path in the same copy as the clicked icon.
          const target = await page.evaluate(icon => {
            const editor = document.elementFromPoint(icon.x + icon.width / 2, icon.y + icon.height / 2)?.closest('.monaco-editor');
            const line = [...(editor?.querySelectorAll('.view-line') || [])].find(element => {
              const rect = element.getBoundingClientRect(); return rect.top <= icon.y + icon.height / 2 && rect.bottom > icon.y + icon.height / 2;
            });
            const rect = line?.querySelector('span span')?.getBoundingClientRect();
            return rect ? { x: rect.x + Math.min(20, rect.width / 2), y: rect.y + rect.height / 2 } : undefined;
          }, icon);
          assert.ok(target, 'locate source next to the clicked split gutter');
          await page.mouse.click(target.x, target.y);
          await page.mouse.move(icon.x + icon.width / 2, icon.y + icon.height / 2);
          await page.mouse.move(target.x, target.y);
        }
        await until(async () => await hover.isVisible(), 'native Cell hover');
        assert.equal(await page.locator('.monaco-diff-editor:visible').count(), 0, 'details must stay in the Notebook');
        return hover;
      }
      const modifiedDetails = await showChange(blue);
      assert.ok((await renderedText(modifiedDetails)).includes('name = "Notebook 0"'));
      assert.ok((await renderedText(modifiedDetails)).includes('name = "Changed without saving"'));
      await capture('04a-modified-details'); await page.keyboard.press('Escape');
      const deletedDetails = await showChange(red);
      assert.ok((await renderedText(deletedDetails)).includes('count = 3'));
      assert.ok((await renderedText(deletedDetails)).includes('Deleted source'));
      assert.ok((await renderedText(deletedDetails)).includes('between current lines 1 and 2'));
      await capture('04b-deleted-details'); await page.keyboard.press('Escape');
      // Focus another Cell and the native output layer; source markers must remain visible.
      const nextCell = page.getByRole('listitem', { name: 'code cell', exact: true }).nth(1);
      await nextCell.locator('.view-lines').click({ position: { x: 70, y: 10 } });
      assert.ok((await capture('05-other-cell-focus')).some(i => i.kind === 'modified'));
      const outputBox = await nextCell.locator('.rendered-output').boundingBox(); assert.ok(outputBox);
      await page.mouse.click(outputBox.x + 40, outputBox.y + 18);
      const outputFrame = page.frames().find(frame => frame.name() === 'active-frame');
      assert.ok(outputFrame && await outputFrame.evaluate(() => document.hasFocus()));
      assert.ok((await capture('06-output-focus')).some(i => i.kind === 'modified'));
      const beforeScroll = (await read('.tmp/ui-live.json')).visible;
      const scrolled = await request('scroll-end');
      assert.notDeepEqual(scrolled.visible, beforeScroll);
      await capture('07-scrolled-away');
      await request('scroll-start');
      assert.ok((await capture('08-scrolled-back')).some(i => i.kind === 'modified'));
      await request('focus-first');
      await first().click({ position: { x: 70, y: 10 } });
      for (let i = 0; i < 64; i++) {
        const state = await read('.tmp/ui-live.json'); if (state.baselineRestored) break;
        await request('undo');
      }
      await analysis(data => data.baselineRestored && changed(data).length === 0);
      assert.equal((await capture('09-undo-clean')).length, 0);
      const inserted = await request('insert');
      assert.equal(inserted.diagnostics.notebooks[0].cells[0].status, 'added');
      assert.ok(inserted.diagnostics.notebooks[0].cells.slice(1).every(cell => cell.changes.length === 0));
      assert.ok(inserted.diagnostics.notebooks[0].cells.slice(1).every(cell => cell.status === 'unchanged' && !cell.moved));
      assert.ok((await capture('10-insert-cell')).some(i => i.kind === 'added'));
      const removed = await request('remove-insert');
      const beforeOutput = removed.diagnostics.notebooks[0].computedTotal;
      const output = await request('output');
      assert.equal(output.diagnostics.notebooks[0].computedTotal, beforeOutput);
      assert.ok(output.diagnostics.notebooks[0].cells.every(cell => cell.changes.length === 0));
      assert.equal((await capture('11-output-only')).length, 0);
      await first().click({ position: { x: 70, y: 10 } });
      await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End'); await page.keyboard.type('name = "Split view"');
      await analysis(data => changed(data).some(c => c.kind === 'modified'));
      const split = await request('split'); assert.equal(split.notebookEditors, 2);
      assert.ok(split.visible.some(uri => split.visible.filter(other => other === uri).length === 2), 'the same Cell URI must have editors in both groups');
      assert.equal((await capture('12-split')).filter(i => i.kind === 'modified').length, 2);
      for (const theme of ['light', 'contrast', 'contrast-light', 'dark']) {
        await request(theme);
        const icons = await capture(`13-theme-${theme}`);
        assert.equal(icons.filter(i => i.kind === 'modified').length, 2);
        assert.ok(icons.every(icon => icon.palette === theme));
      }
      await request('scroll-end');
      await request('disable'); assert.equal((await capture('14-disabled')).length, 0);
      await request('scroll-start'); assert.equal((await capture('14-disabled-recreated-editor')).length, 0);
      await request('enable'); assert.equal((await capture('15-enabled')).filter(i => i.kind === 'modified').length, 2);
      await request('refresh'); assert.equal((await capture('16-refreshed')).filter(i => i.kind === 'modified').length, 2);
      await request('clear-source'); const emptyIcons = await capture('17-source-emptied');
      assert.equal(emptyIcons.filter(i => i.kind === 'deleted').length, 2);
      const emptyDetails = await showChange(emptyIcons.find(icon => icon.kind === 'deleted'));
      assert.ok((await renderedText(emptyDetails)).includes('print(name, count)'));
      await capture('17b-empty-details'); await page.keyboard.press('Escape');
      await request('delete-last-line');
      const eofIcons = (await capture('17c-eof-anchor')).filter(icon => icon.kind === 'deleted');
      const eof = eofIcons[0];
      assert.ok(eof);
      const eofDetails = await showChange(eof);
      assert.ok((await renderedText(eofDetails)).includes('print(name, count)'));
      assert.ok((await renderedText(eofDetails)).includes('after current line 2'));
      await capture('17d-eof-details'); await page.keyboard.press('Escape');
      const otherDetails = await showChange(eofIcons[1]);
      assert.ok((await renderedText(otherDetails)).includes('after current line 2'));
      await capture('17f-other-split-details'); await page.keyboard.press('Escape');
      for (const theme of ['light', 'contrast', 'contrast-light', 'dark']) {
        await request(theme);
        const icons = await capture(`17e-deletion-theme-${theme}`);
        assert.ok(icons.some(icon => icon.kind === 'deleted' && icon.palette === theme));
      }
      await request('restore-source');
      await request('markdown'); assert.ok((await capture('18-markdown-source')).some(i => i.kind === 'modified'));
      await request('markdown-render'); assert.equal((await capture('19-markdown-rendered')).length, 0);
      await request('breakpoint'); await capture('20-breakpoint-shared-line');
      assert.ok(await page.locator('[class*="debug-breakpoint"]').count());
    }
    // Can the public SCM QuickDiffProvider replace custom Notebook decorations?
    // The same provider works for a normal text file but is never asked for a Cell.
    await request('clear-probe-breakpoints'); await request('disable');
    const native = await request('quickdiff-file');
    assert.ok(native.quickDiffProbe.fileRequests > 0 && native.quickDiffProbe.originalReads > 0);
    const nativeBlue = page.locator('.margin-view-overlays .dirty-diff-modified').first();
    await nativeBlue.waitFor({ state: 'visible' });
    await capture('21-native-quickdiff-file');
    const nativeBox = await nativeBlue.boundingBox(); assert.ok(nativeBox);
    await page.mouse.click(nativeBox.x + 1, nativeBox.y + nativeBox.height / 2);
    await page.locator('.zone-widget.dirty-diff').waitFor({ state: 'visible' });
    await capture('22-native-quickdiff-click'); await page.keyboard.press('Escape');
    const cellProbe = await request('quickdiff-cell');
    await delay(1000);
    assert.ok(cellProbe.activeCell?.startsWith('vscode-notebook-cell:'), 'the negative control must focus a real Cell text editor');
    assert.equal(cellProbe.quickDiffProbe.cellRequests, 0);
    assert.equal(await page.locator('.notebookOverlay .dirty-diff-glyph').count(), 0);
    assert.equal(await page.locator('.zone-widget.dirty-diff:visible').count(), 0);
    await capture('23-native-quickdiff-notebook-unsupported');
    console.log(`Native QuickDiffProvider probe: file=${cellProbe.quickDiffProbe.fileRequests}, cell=${cellProbe.quickDiffProbe.cellRequests}.`);
    console.log('UI acceptance checks passed; screenshots show the actual native Notebook editor.');
  } catch (error) {
    await capture('failure');
    await fs.writeFile(`${dir}/failure-accessibility.txt`, await page.locator('body').ariaSnapshot());
    throw error;
  } finally {
    try { await request('finish'); } finally { await browser.close(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
