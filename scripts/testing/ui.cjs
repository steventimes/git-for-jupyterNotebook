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
  const evidence = [];
  async function screenshot(file) {
    const cdp = await page.context().newCDPSession(page);
    try {
      // Capture the existing view. Viewport clipping in Electron can trigger a
      // layout that dismisses a native hover; do not resize or style the page.
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
      await fs.writeFile(file, Buffer.from(data, 'base64'));
    } finally { await cdp.detach(); }
  }
  async function visibleIcons() {
    return page.locator('.glyph-margin-widgets div').evaluateAll(elements => elements.flatMap(element => {
      const style = getComputedStyle(element); const image = style.backgroundImage;
      const match = image.match(/\/(added|modified|deleted)-(contrast-light|contrast|dark|light)((?:-after|-both)?(?:-added|-modified)?)\.svg/);
      const rect = element.getBoundingClientRect();
      return match && element.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        ? [{ kind: match[1], palette: match[2], x: rect.x, y: rect.y, width: rect.width, height: rect.height }] : [];
    }));
  }
  async function capture(name) {
    await delay(400);
    const icons = await visibleIcons();
    const state = await read('.tmp/ui-live.json');
    await screenshot(`${dir}/${name}.png`);
    evidence.push({ name, icons, state });
    await fs.writeFile(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2));
    console.log(`UI ${name}: ${icons.map(i => i.kind).join(', ') || 'no markers'}`);
    return icons;
  }
  const first = () => page.getByRole('listitem', { name: 'code cell', exact: true }).first().locator('.view-lines');
  const renderedText = async locator => (await locator.innerText()).replace(/\u00a0/g, ' ');
  async function previewFonts() {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument');
      const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.monaco-hover pre span[style*=insertedTextBackground] b' });
      const fonts = [];
      for (const nodeId of nodeIds) fonts.push(...(await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts);
      return fonts;
    } finally { await cdp.detach(); }
  }
  const changed = data => data.diagnostics.notebooks[0].cells[0].changes;
  async function showChange(icon) {
    await page.mouse.click(icon.x + icon.width / 2, icon.y + icon.height / 2, { button: 'right' });
    const action = page.getByRole('menuitem', { name: 'Show Change', exact: true });
    await action.waitFor(); await action.hover(); await page.keyboard.press('Enter');
    const hover = page.locator('.monaco-hover:visible').filter({ has: page.locator('pre span[style*=LineBackground]') }).last();
    if ((await read('.tmp/ui-live.json')).notebookEditors > 1) {
      await delay(500);
      assert.equal(await hover.isVisible(), false, 'ambiguous gutter context must not open details in another group');
      // Use the real source-hover path in the same copy as the clicked icon.
      const target = await page.evaluate(icon => {
        // A status tooltip can cover the gutter after its context menu closes.
        // Locate the editor by its bounds rather than hit-testing an overlay.
        const editor = [...document.querySelectorAll('.monaco-editor')].find(element => {
          const rect = element.getBoundingClientRect();
          return rect.left <= icon.x && rect.right >= icon.x + icon.width && rect.top <= icon.y && rect.bottom >= icon.y + icon.height;
        });
        const line = [...(editor?.querySelectorAll('.view-line') || [])].find(element => {
          const rect = element.getBoundingClientRect(); return rect.top <= icon.y + icon.height / 2 && rect.bottom > icon.y + icon.height / 2;
        });
        const rect = line?.querySelector('span span')?.getBoundingClientRect();
        return rect ? { x: rect.x + Math.min(20, rect.width / 2), y: rect.y + rect.height / 2,
          lineIndex: [...document.querySelectorAll('.view-line')].indexOf(line) } : undefined;
      }, icon);
      assert.ok(target, 'locate source next to the clicked split gutter');
      await page.mouse.move(10, 10);
      await page.keyboard.press('Escape');
      await until(() => page.evaluate(target => !!document.elementFromPoint(target.x, target.y)?.closest('.monaco-editor'), target),
        'source unobscured after context menu');
      await page.mouse.click(target.x, target.y);
      await until(() => page.evaluate(location =>
        document.elementFromPoint(location.x, location.y)?.closest('.monaco-editor')?.contains(document.activeElement), target),
      'source editor focused before hover');
      await page.mouse.move(10, 10);
      // Focusing can reveal the caret and scroll the source asynchronously.
      // Wait for its actual bounds, then move without scrolling a long line.
      const sourceLine = page.locator('.view-line').nth(target.lineIndex);
      let previousBounds;
      await until(async () => {
        const bounds = await sourceLine.boundingBox();
        const settled = bounds && previousBounds && bounds.x === previousBounds.x && bounds.y === previousBounds.y &&
          bounds.width === previousBounds.width && bounds.height === previousBounds.height;
        previousBounds = bounds;
        return settled;
      }, 'source layout settled before hover');
      await page.mouse.move(target.x, target.y, { steps: 8 });

    }
    await until(async () => await hover.isVisible() && await hover.evaluate(element => getComputedStyle(element).opacity === '1'), 'native Cell hover painted after fade-in');
    assert.equal(await page.locator('.monaco-diff-editor:visible').count(), 0, 'details must stay in the Notebook');
    return hover;
  }
  try {
    assert.equal((await capture('01-baseline')).length, 0);
    await first().click({ position: { x: 90, y: 10 } });
    await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End'); await page.keyboard.type('name = "Changed without saving"');
    const edited = await analysis(data => changed(data).some(c => c.kind === 'modified'));
    assert.equal(edited.dirty, true);
    assert.ok((await capture('02-unsaved-modified')).some(i => i.kind === 'modified'));
    await page.keyboard.press('Control+End'); await page.keyboard.type('added = True\n');
    await analysis(data => changed(data).some(c => c.kind === 'added'));
    const additionIcons = await capture('03-added');
    assert.ok(additionIcons.some(i => i.kind === 'added'));
    const blue = additionIcons.find(icon => icon.kind === 'modified'); assert.ok(blue);
    const modifiedDetails = await showChange(blue);
    assert.doesNotMatch(await renderedText(modifiedDetails), /Jupyter Notebook Git Marks:|Baseline:|including unsaved edits/);
    assert.equal(await modifiedDetails.locator('del, s').count(), 0, 'Git-style previews do not use strikethrough');
    assert.deepEqual(await modifiedDetails.locator('span[style*=removedTextBackground] b').allTextContents(), ['Notebook 0']);
    assert.deepEqual(await modifiedDetails.locator('span[style*=insertedTextBackground] b').allTextContents(), ['Changed without saving']);
    assert.ok((await renderedText(modifiedDetails)).includes('name = "Notebook 0"'));
    assert.ok((await renderedText(modifiedDetails)).includes('name = "Changed without saving"'));
    await capture('04a-modified-details');
    await page.mouse.move(10, 10);
    await page.keyboard.press('Escape');
    await until(async () => await page.locator('.monaco-hover:visible').count() === 0, 'modified preview dismissed');
    // Keep an unchanged line between independent edit hunks. Adjacent removal
    // and replacement belong to one modified hunk in the native Git gutter.
    await first().click({ position: { x: 90, y: 10 } });
    await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End'); await page.keyboard.type('name = "Notebook 0"');
    await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Backspace');
    await analysis(data => changed(data).some(c => c.kind === 'deleted'));
    const deleted = await capture('04-deleted');
    const red = deleted.find(icon => icon.kind === 'deleted'); assert.ok(red);
    assert.ok(deleted.some(icon => icon.kind === 'added'));
    const deletedDetails = await showChange(red);
    assert.ok((await renderedText(deletedDetails)).includes('count = 3'));
    assert.ok((await renderedText(deletedDetails)).includes('Between lines 1 and 2.'));
    await capture('04b-deleted-details');
    await page.mouse.move(10, 10);
    await page.keyboard.press('Escape');
    await until(async () => await page.locator('.monaco-hover:visible').count() === 0, 'deleted preview dismissed');
    await first().click({ position: { x: 90, y: 10 } });
    await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End'); await page.keyboard.type('name = "Changed without saving"');
    await analysis(data => changed(data).some(c => c.kind === 'modified'));
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
    await first().click({ position: { x: 70, y: 10 } });
    await page.keyboard.press('Control+Home'); await page.keyboard.type('changed = True\n');
    await analysis(data => changed(data).some(change => change.kind === 'added'));
    await request('raw-cell');
    assert.equal((await visibleIcons()).length, 0);
    await analysis(data => data.diagnostics.notebooks[0].state === 'incomplete');
    const warningStatus = page.locator('.statusbar-item').filter({ hasText: 'JGM HEAD: analysis incomplete' }).last();
    await warningStatus.waitFor();
    assert.equal(await warningStatus.locator('.codicon-warning').count(), 1);
    await warningStatus.hover();
    await page.getByText('Raw cells are not analysed.', { exact: false }).last().waitFor();
    await capture('09a-incomplete-explanation');
    await page.mouse.move(550, 200); await page.keyboard.press('Escape');
    await request('code-cell');
    await analysis(data => data.diagnostics.notebooks[0].state === 'ready');
    await request('restore-source');
    const inserted = await request('insert');
    assert.equal(inserted.diagnostics.notebooks[0].cells[0].status, 'added');
    assert.ok(inserted.diagnostics.notebooks[0].cells.slice(1).every(cell => cell.changes.length === 0));
    assert.ok(inserted.diagnostics.notebooks[0].cells.slice(1).every(cell => cell.status === 'unchanged' && !cell.moved));
    assert.ok((await capture('10-insert-cell')).some(i => i.kind === 'added'));
    const removed = await request('remove-insert');
    const beforeOutput = removed.diagnostics.notebooks[0].computedTotal;
    const beforeOutputRuns = removed.diagnostics.notebooks[0].runs;
    // Raw/code language changes can clear the notebook's kernel selection.
    // Explicitly select our isolated test kernel before producing output.
    await page.getByRole('button', { name: /^(Select Kernel|NGG Test Kernel)$/ }).click();
    await page.getByRole('option').filter({ hasText: 'NGG Test Kernel' }).first().click();
    const output = await request('output');
    assert.equal(output.diagnostics.notebooks[0].computedTotal, beforeOutput);
    assert.equal(output.diagnostics.notebooks[0].runs, beforeOutputRuns);
    assert.ok(output.diagnostics.notebooks[0].cells.every(cell => cell.changes.length === 0));
    assert.equal((await capture('11-output-only')).length, 0);
    await first().click({ position: { x: 70, y: 10 } });
    await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End'); await page.keyboard.type('name = "Split view"');
    await analysis(data => changed(data).some(c => c.kind === 'modified'));
    const split = await request('split'); assert.equal(split.notebookEditors, 2);
    assert.ok(split.visible.some(uri => split.visible.filter(other => other === uri).length === 2), 'the same Cell URI must have editors in both groups');
    assert.equal((await capture('12-split')).filter(i => i.kind === 'modified').length, 2);
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
    assert.ok((await renderedText(eofDetails)).includes('After line 2.'));
    await capture('17d-eof-details'); await page.keyboard.press('Escape');
    const otherDetails = await showChange(eofIcons[1]);
    assert.ok((await renderedText(otherDetails)).includes('After line 2.'));
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
    await request('clear-probe-breakpoints'); await request('long-line');
    const longIcons = await capture('20a-long-line');
    const longDetails = await showChange(longIcons.find(icon => icon.kind === 'modified'));
    assert.deepEqual(await longDetails.locator('span[style*=removedTextBackground] b').allTextContents(), ['old', '0', '👩‍💻']);
    assert.deepEqual(await longDetails.locator('span[style*=insertedTextBackground] b').allTextContents(), ['new', '1', '👨‍💻']);
    const longText = await renderedText(longDetails);
    assert.ok(longText.includes('second target=') && longText.includes('price=1') && longText.includes('owner='));
    assert.ok(!longText.includes('first target='), 'unchanged occurrence of the repeated word stays out of the preview');
    assert.ok(longText.includes('…') && longText.length < 700, 'long unchanged text is collapsed around every edit');
    await capture('20b-long-line-details');
    // DOM strings alone cannot show whether the platform can draw an emoji.
    const fonts = await previewFonts();
    assert.ok(fonts.some(font => /emoji/i.test(font.familyName) && font.glyphCount > 0), 'an emoji font must actually render the changed word');
    await fs.writeFile(`${dir}/preview-fonts.json`, JSON.stringify(fonts, null, 2));
    await page.keyboard.press('Escape');
    await request('chinese-preview');
    const chineseIcons = await capture('20b2-chinese-source');
    const chinese = await showChange(chineseIcons.find(icon => icon.kind === 'modified'));
    const chineseText = await renderedText(chinese);
    assert.ok(chineseText.includes('第二目标=旧值') && chineseText.includes('第二目标=新值'));
    assert.ok(!chineseText.includes('first target') && !chineseText.includes('unchanged context'), 'source language is preserved, never translated');
    const chineseFonts = await previewFonts();
    assert.ok(chineseFonts.some(font => /CJK/i.test(font.familyName) && font.glyphCount > 0), 'a CJK font must actually render the changed source');
    await fs.writeFile(`${dir}/preview-fonts-chinese.json`, JSON.stringify(chineseFonts, null, 2));
    await capture('20b3-chinese-details'); await page.keyboard.press('Escape');
    for (const theme of ['light', 'contrast', 'contrast-light', 'dark']) {
      await request(theme);
      const icons = await capture(`20c-preview-${theme}`);
      assert.equal(icons.filter(icon => icon.kind === 'modified').length, 2);
      assert.ok(icons.every(icon => icon.palette === theme));
      const details = await showChange(icons.find(icon => icon.kind === 'modified'));
      const colors = await details.locator('pre span[style*=Background]').evaluateAll(spans => spans.map(span => ({
        style: span.getAttribute('style'), background: getComputedStyle(span).backgroundColor,
        text: span.textContent, color: getComputedStyle(span).color, weight: getComputedStyle(span.querySelector('b') ?? span).fontWeight,
      })));
      assert.ok(colors.some(color => color.style.includes('removedLineBackground')) && colors.some(color => color.style.includes('insertedLineBackground')));
      for (const side of ['removed', 'inserted']) {
        const word = colors.find(color => color.style.includes(`${side}TextBackground`)); assert.ok(word);
        const line = colors.find(color => color.style.includes(`${side}LineBackground`)); assert.ok(line);
        assert.ok(word.background !== 'rgba(0, 0, 0, 0)' || (word.color !== line.color && Number(word.weight) >= 600), 'high contrast words need a distinct diff color and emphasis when their background is transparent');
      }
      await fs.writeFile(`${dir}/preview-colors-${theme}.json`, JSON.stringify(colors, null, 2));
      await capture(`20d-preview-details-${theme}`); await page.keyboard.press('Escape');
    }
    await request('unsafe-preview');
    await until(async () => (await visibleIcons()).some(icon => icon.kind === 'modified'), 'escaped-source marker painted');
    const unsafeIcons = await capture('20e-escaped-source');
    const unsafe = await showChange(unsafeIcons.find(icon => icon.kind === 'modified'));
    assert.ok((await renderedText(unsafe)).includes('```'), 'source fences stay literal');
    assert.equal(await unsafe.locator('img, a, script, iframe').count(), 0, 'source cannot create HTML elements, links, or remote image requests');
    assert.ok((await renderedText(unsafe)).includes('<img src=') && (await renderedText(unsafe)).includes('[run](command:'));
    await capture('20f-escaped-source-details'); await page.keyboard.press('Escape'); await request('restore-source');
    console.log('UI acceptance checks passed; screenshots show the actual native Notebook editor.');
  } catch (error) {
    console.error('UI verification failed:', error);
    try {
      await capture('failure');
      await fs.writeFile(`${dir}/failure-accessibility.txt`, await page.locator('body').ariaSnapshot());
    } catch (diagnosticError) { console.error('Additional UI diagnostics unavailable:', diagnosticError); }
    throw error;
  } finally {
    try { await request('finish'); } finally { await browser.close(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
