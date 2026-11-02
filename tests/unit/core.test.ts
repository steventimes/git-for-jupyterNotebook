import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotebook } from '../../src/notebook/normalize';
import { changedText, lineDiff, MAX_TEXT_PREVIEW, textContexts } from '../../src/notebook/lineDiff';

test('character previews preserve whitespace, normalize CRLF and bound work', () => {
  for (const [before, after, changes] of [
    ['a b\r\n', 'a  b\n', [{ before: '', after: ' ' }]],
    ['unchanged\r\n', 'unchanged\n', []],
  ] as const) assert.deepEqual(changedText(before, after)?.map(({ before, after }) => ({ before, after })), changes);
  assert.equal(changedText('a'.repeat(MAX_TEXT_PREVIEW), 'b'), undefined);
  assert.equal(changedText('a'.repeat(700), 'b'.repeat(700)), undefined);
});

test('long-line excerpts locate sparse and repeated-word edits without losing Unicode or nearby changes', () => {
  const before = 'first target=old; ' + 'unchanged words; '.repeat(320) + 'second target=old; ' +
    '更多不变文字👩‍💻; '.repeat(240) + 'price=10; owner=👩‍💻; accent=café; end';
  const after = before.replace('second target=old', 'second target=new').replace('price=10', 'price=11')
    .replace('owner=👩‍💻', 'owner=👨‍💻').replace('accent=café', 'accent=cafe\u0300');
  const edits = changedText(before, after); assert.ok(edits);
  assert.deepEqual(edits.map(({ before, after }) => [before, after]),
    [['old', 'new'], ['0', '1'], ['👩‍💻', '👨‍💻'], ['é', 'e\u0300']]);
  const contexts = textContexts(before, after, edits);
  assert.equal(contexts.length, 2, 'nearby edits share one excerpt while distant edits stay separate');
  for (const [side, source] of [['before', before], ['after', after]] as const) {
    const fragments = contexts.map(context => context[side]);
    for (const fragment of fragments) {
      assert.equal(fragment.parts.map(part => part.text).join(''), source.slice(fragment.start, fragment.end));
      const boundaries = new Set([...Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source), part => part.index), source.length]);
      assert.ok(boundaries.has(fragment.start) && boundaries.has(fragment.end));
    }
    assert.ok(fragments.reduce((sum, fragment) => sum + fragment.end - fragment.start, 0) < 250);
    assert.deepEqual(fragments.flatMap(fragment => fragment.parts.filter(part => part.changed).map(part => part.text)), edits.map(edit => edit[side]));
  }
  assert.ok(contexts[0]!.before.parts.some(part => part.text.includes('second target=')));
  assert.ok(!contexts[0]!.before.parts.some(part => part.text.includes('first target=')));
  for (const [old, next] of [['start ' + before, before], [before, before + ' tail'], ['a'.repeat(180) + ' end', 'a'.repeat(180) + ' NEW end']]) {
    const changes = changedText(old!, next!); assert.ok(changes);
    for (const context of textContexts(old!, next!, changes)) {
      assert.ok(context.before.start >= 0 && context.before.end <= old!.length);
      assert.ok(context.after.start >= 0 && context.after.end <= next!.length);
    }
  }
});

const notebook = (source: unknown, extra = {}) => JSON.stringify({ nbformat: 4, nbformat_minor: 5,
  cells: [{ cell_type: 'code', id: 'one', source, ...extra }], metadata: {} });

test('source arrays use join(""); source whitespace and Unicode survive', () => {
  assert.equal(parseNotebook(notebook(['  中', '文😀\r\n', '\n']))[0]?.source, '  中文😀\n\n');
  assert.equal(parseNotebook(notebook('  中文😀\n\n'))[0]?.source, '  中文😀\n\n');
});
test('invalid JSON, nbformat and source types fail explicitly', () => {
  assert.throws(() => parseNotebook('{'));
  assert.throws(() => parseNotebook('{"nbformat":3,"cells":[]}'));
  assert.throws(() => parseNotebook(notebook(['x', 1])));
  assert.throws(() => parseNotebook(notebook('x', { cell_type: ['code'] })));
});
test('cell count is bounded before normalizing any oversized notebook cells', () => {
  assert.throws(() => parseNotebook(JSON.stringify({ nbformat: 4, cells: Array.from({ length: 2001 }, () => null) })), /cell count limit/);
  assert.equal(parseNotebook(JSON.stringify({ nbformat: 4, cells: Array.from({ length: 2000 }, () => ({ cell_type: 'code', source: '' })) })).length, 2000);
});
test('replacement hunks mark the full current range as modified and retain all removed source', () => {
  for (const [before, after, oldLines, newLines] of [['a\n', 'x\ny\n', 1, 2], ['a\nb\n', 'x\n', 2, 1]] as const) {
    const changes = lineDiff(before, after).changes;
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0], { kind: 'modified', base: { start: 0, end: oldLines }, current: { start: 0, end: newLines },
      anchor: 0, anchorSide: undefined, removed: before });
  }
});
test('inserting statements before a changed return forms one replacement, while an unchanged return anchors a pure addition', () => {
  const before = '    h = self.conv1(x)\n    return h\n';
  const inserted = '    h = h + self.conv2(F.relu(h))\n    h = F.max_pool2d(h, 2)\n';
  const after = '    h = self.conv1(x)\n' + inserted + '    return F.log_softmax(h, dim=1)\n';
  const changes = lineDiff(before, after).changes;
  assert.deepEqual(changes.map(c => [c.kind, c.base.start, c.base.end, c.current.start, c.current.end, c.removed]),
    [['modified', 1, 2, 1, 4, '    return h\n']]);
  const addition = lineDiff(before, '    h = self.conv1(x)\n' + inserted + '    return h\n').changes;
  assert.deepEqual(addition.map(c => [c.kind, c.current.start, c.current.end]), [['added', 1, 3]]);
});
test('deletion anchors preserve the boundary at start, middle, EOF and empty source', () => {
  const cases: [string, string, number, 'before' | 'after'][] = [
    ['a\nb\n', 'b\n', 0, 'before'], ['a\nb\nc', 'a\nc', 1, 'before'],
    ['a\nb', 'a', 0, 'after'], ['a\nb\n', 'a\n', 1, 'before'], ['a\nb\n', '', 0, 'before'],
  ];
  for (const [before, after, anchor, side] of cases) {
    const change = lineDiff(before, after).changes.find(c => c.kind === 'deleted');
    assert.ok(change); assert.equal(change.anchor, anchor); assert.equal(change.anchorSide, side);
    assert.ok(change.anchor < after.split('\n').length);
    assert.ok(change.base.end > change.base.start);
  }
});
test('empty source, final newline, CRLF, indentation and Unicode', () => {
  assert.deepEqual(lineDiff('', '').changes, []);
  assert.equal(lineDiff('', '\n').changes[0]?.kind, 'added');
  assert.equal(lineDiff('中😀', '中😀\n').changes[0]?.kind, 'modified');
  assert.deepEqual(lineDiff('a\r\n', 'a\n').changes, []);
  assert.equal(lineDiff(' x', '  x').changes[0]?.kind, 'modified');
  assert.deepEqual(lineDiff('a\nb', 'A\nb\n').changes.map(change => [change.kind, change.current.start, change.removed]),
    [['modified', 0, 'a\n'], ['modified', 1, 'b']]);
});
test('oversized and expensive input is incomplete, never reported unchanged', () => {
  assert.equal(lineDiff('a', 'x'.repeat(600_000)).state, 'incomplete');
  assert.equal(lineDiff('a\n'.repeat(2001), 'b\n'.repeat(2001)).state, 'incomplete');
});

test('pure additions and deletions bypass the edit search limit but respect size limits', () => {
  const source = 'line\n'.repeat(5000);
  const added = lineDiff('', source); const deleted = lineDiff(source, '');
  assert.equal(added.state, 'ready'); assert.equal(deleted.state, 'ready');
  assert.deepEqual(added.changes.map(c => [c.kind, c.current.start, c.current.end]), [['added', 0, 5000]]);
  assert.deepEqual(deleted.changes.map(c => [c.kind, c.base.end, c.anchor]), [['deleted', 5000, 0]]);
  assert.equal(lineDiff('', 'line\n'.repeat(20001)).state, 'incomplete');
});
