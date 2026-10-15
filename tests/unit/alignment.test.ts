import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignCells } from '../../src/alignment';
import { SourceCell } from '../../src/normalize';
const c = (source: string, id?: string, session?: string): SourceCell => ({ kind: 'code', source, id, session });

test('inserting a cell leaves subsequent matches unchanged, with and without IDs', () => {
  for (const ids of [true, false]) {
    const base = [c('one', ids ? 'a' : undefined), c('two', ids ? 'b' : undefined)];
    const result = alignCells(base, [c('inserted', ids ? 'new' : undefined), ...base]);
    assert.deepEqual(result.pairs.map(p => [p.current, p.base]), [[1, 0], [2, 1]]);
    assert.deepEqual(result.added, [0]);
    assert.equal(result.pairs.filter(p => p.moved).length, 0);
  }
});
test('unique IDs match changed and moved cells regardless of position', () => {
  const result = alignCells([c('a', 'a'), c('b', 'b'), c('c', 'c')], [c('changed', 'c'), c('a', 'a'), c('b', 'b')]);
  assert.equal(result.pairs.find(p => p.current === 0)?.base, 2);
  assert.equal(result.pairs.filter(p => p.moved).length, 1);
  assert.deepEqual(result.added, []);
});
test('exact unique source supports moves with missing IDs', () => {
  const result = alignCells([c('one'), c('two'), c('three')], [c('three'), c('one'), c('two')]);
  assert.equal(result.pairs.find(p => p.current === 0)?.base, 2);
});
test('duplicates use one-to-one ordered matches and never reuse a base cell', () => {
  const base = [c('same'), c('same'), c('anchor')];
  const result = alignCells(base, [c('new'), ...base]);
  assert.equal(new Set(result.pairs.map(p => p.base)).size, result.pairs.length);
  assert.equal(result.pairs.length, 3);
});
test('duplicate IDs safely fall back to content, not arbitrary ID selection', () => {
  const result = alignCells([c('one', 'dup'), c('two', 'dup')], [c('two', 'dup'), c('one', 'dup')]);
  assert.deepEqual(result.pairs.map(p => p.base), [1, 0]);
  assert.ok(result.pairs.every(p => p.reason !== 'id'));
});
test('invalid IDs safely fall back to content', () => {
  const result = alignCells([c('one', 'invalid id')], [c('one', 'also invalid')]);
  assert.equal(result.pairs[0]?.reason, 'exact');
});
test('hashes of unpaired Unicode surrogates never substitute for exact source equality', () => {
  const result = alignCells([c('\ud800')], [c('\ud801')]);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.complete, false);
});
test('ambiguous edited duplicates are incomplete rather than fake precise matches', () => {
  const result = alignCells([c('same'), c('same')], [c('same'), c('changed')]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.uncertainCurrent, [0, 1]);
  assert.equal(result.pairs.length, 0);
});
test('session identity preserves mappings through arbitrary source edits', () => {
  const result = alignCells([c('same'), c('same')], [c('rewritten', undefined, 'uri-a'), c('same', undefined, 'uri-b')], new Map([['uri-a', 0], ['uri-b', 1]]));
  assert.deepEqual(result.pairs.map(p => p.base), [0, 1]);
});
test('bounded similarity between sequence anchors matches a local edit', () => {
  const result = alignCells([c('start'), c('value = 100\nprint(value)'), c('end')], [c('start'), c('value = 200\nprint(value)'), c('end')]);
  assert.equal(result.pairs.find(p => p.current === 1)?.base, 1);
  assert.equal(result.pairs.find(p => p.current === 1)?.reason, 'similarity');
});
test('cell deletion is separate from source deletion; raw/type mismatch never paired', () => {
  assert.deepEqual(alignCells([c('one', 'one')], []).deleted, [0]);
  const result = alignCells([c('x', 'x')], [{ kind: 'markdown', id: 'x', source: 'x' }]);
  assert.equal(result.pairs.length, 0);
});
test('cell limit reports unfinished analysis', () => {
  const result = alignCells(Array.from({ length: 2001 }, (_, i) => c(String(i))), []);
  assert.equal(result.complete, false);
});
test('distinct replacement IDs stay added/deleted despite identical source, up to 2000 cells', () => {
  const base = Array.from({ length: 2000 }, (_, i) => c(`source ${i}`, `old-${i}`));
  const current = base.map((cell, i) => ({ ...cell, id: `new-${i}` }));
  const result = alignCells(base, current);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.added.length, 2000);
  assert.equal(result.deleted.length, 2000);
});
