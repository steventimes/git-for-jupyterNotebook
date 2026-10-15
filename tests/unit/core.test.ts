import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, parseNotebook } from '../../src/normalize';
import { lineDiff } from '../../src/lineDiff';

const notebook = (source: unknown, extra = {}) => JSON.stringify({ nbformat: 4, nbformat_minor: 5,
  cells: [{ cell_type: 'code', id: 'one', source, ...extra }], metadata: {} });

test('source arrays use join(""); source whitespace and Unicode survive', () => {
  assert.equal(parseNotebook(notebook(['  中', '文😀\r\n', '\n']))[0]?.source, '  中文😀\n\n');
  assert.equal(parseNotebook(notebook('  中文😀\n\n'))[0]?.source, '  中文😀\n\n');
  assert.equal(normalizeText('a\r\nb\n'), 'a\nb\n');
});
test('output, execution count and unrelated metadata have no source effect', () => {
  assert.deepEqual(parseNotebook(notebook('x', { outputs: [1], metadata: { foo: 1 }, execution_count: 99 })),
    parseNotebook(notebook('x', { outputs: [], metadata: { foo: 2 }, execution_count: null })));
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
test('line addition, replacement, deletion and revert', () => {
  assert.deepEqual(lineDiff('a\nb\n', 'a\nb\nc\n').changes.map(c => c.kind), ['added']);
  assert.deepEqual(lineDiff('a\nb\n', 'a\nB\n').changes.map(c => c.kind), ['modified']);
  assert.deepEqual(lineDiff('a\nb\n', 'a\n').changes.map(c => c.kind), ['deleted']);
  assert.deepEqual(lineDiff('a\nb\n', 'a\nb\n').changes, []);
});
test('replacement pairs common count as modified, surplus as added or deleted', () => {
  assert.deepEqual(lineDiff('a\n', 'x\ny\n').changes.map(c => c.kind), ['modified', 'added']);
  assert.deepEqual(lineDiff('a\nb\n', 'x\n').changes.map(c => c.kind), ['modified', 'deleted']);
});
test('deleted anchors are valid at beginning, end and after clearing the cell', () => {
  for (const [before, after] of [['a\nb\n', 'b\n'], ['a\nb', 'a\n'], ['a\nb\n', '']]) {
    assert.ok(before !== undefined && after !== undefined);
    const result = lineDiff(before, after);
    for (const change of result.changes.filter(c => c.kind === 'deleted')) {
      assert.ok(change.anchor >= 0 && change.anchor < after.split('\n').length);
      assert.ok(change.base.end > change.base.start);
    }
  }
});
test('empty source, final newline, CRLF, indentation and Unicode', () => {
  assert.deepEqual(lineDiff('', '').changes, []);
  assert.equal(lineDiff('', '\n').changes[0]?.kind, 'added');
  assert.equal(lineDiff('中😀', '中😀\n').changes[0]?.kind, 'modified');
  assert.deepEqual(lineDiff('a\r\n', 'a\n').changes, []);
  assert.equal(lineDiff(' x', '  x').changes[0]?.kind, 'modified');
});
test('oversized and expensive input is incomplete, never reported unchanged', () => {
  assert.equal(lineDiff('a', 'x'.repeat(600_000)).state, 'incomplete');
  assert.equal(lineDiff('a\n'.repeat(2001), 'b\n'.repeat(2001)).state, 'incomplete');
});
