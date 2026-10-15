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
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9335');
  const page = browser.contexts()[0].pages()[0];
  const evidence = [];
  async function capture(name) {
    await delay(400);
    const icons = await page.locator('.glyph-margin-widgets div').evaluateAll(elements => elements.flatMap(element => {
      const style = getComputedStyle(element); const image = style.backgroundImage;
      const match = image.match(/\/(added|modified|deleted)-(contrast-light|contrast|dark|light)\.svg/);
      const rect = element.getBoundingClientRect();
      return match && element.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight
        ? [{ kind: match[1], palette: match[2], x: rect.x, y: rect.y, width: rect.width, height: rect.height }] : [];
    }));
    const state = await read('.tmp/ui-live.json');
    await page.screenshot({ path: `${dir}/${name}.png` });
    evidence.push({ name, icons, state });
    await fs.writeFile(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2));
    console.log(`UI ${name}: ${icons.map(i => i.kind).join(', ') || 'no markers'}`);
    return icons;
  }
  const first = () => page.getByRole('listitem', { name: 'code cell', exact: true }).first().locator('.view-lines');
  const changed = data => data.diagnostics.notebooks[0].cells[0].changes;
  try {
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
    await request('clear-source'); assert.equal((await capture('17-source-emptied')).filter(i => i.kind === 'deleted').length, 2);
    await request('restore-source');
    await request('markdown'); assert.ok((await capture('18-markdown-source')).some(i => i.kind === 'modified'));
    await request('markdown-render'); assert.equal((await capture('19-markdown-rendered')).length, 0);
    await request('breakpoint'); await capture('20-breakpoint-shared-line');
    assert.ok(await page.locator('[class*="debug-breakpoint"]').count());
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
