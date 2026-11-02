import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignCells } from '../../src/notebook/alignment';
import { SourceCell } from '../../src/notebook/normalize';
const c = (source: string, id?: string, session?: string): SourceCell => ({ kind: 'code', source, id, session });

test('inserting a cell with missing IDs leaves subsequent matches unchanged', () => {
  const base = [c('one'), c('two')];
  const result = alignCells(base, [c('inserted'), ...base]);
  assert.deepEqual(result.pairs.map(p => [p.current, p.base]), [[1, 0], [2, 1]]);
  assert.deepEqual(result.added, [0]);
  assert.equal(result.pairs.filter(p => p.moved).length, 0);
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
test('cell type mismatch never pairs despite equal source and ID', () => {
  const result = alignCells([c('x', 'x')], [{ kind: 'markdown', id: 'x', source: 'x' }]);
  assert.equal(result.pairs.length, 0);
});
test('distinct replacement IDs stay added/deleted despite identical source, up to 2000 cells', () => {
  const base = Array.from({ length: 2000 }, (_, i) => c(`source ${i}`, `old-${i}`));
  const current = base.map((cell, i) => ({ ...cell, id: `new-${i}` }));
  const result = alignCells(base, current);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.added.length, 2000);
  assert.equal(result.deleted.length, 2000);
});

test('non-BMP similarity uses the same character units as diffChars', () => {
  const result = alignCells([c('𝑥'.repeat(10) + ' = 1')], [c('𝑥'.repeat(10) + ' = 2')]);
  assert.equal(result.pairs[0]?.reason, 'similarity');
});
test('thirteen separate edited regions remain bounded by their exact anchors', () => {
  const base = Array.from({ length: 13 }, (_, i) => [c(`value_${i} = 100`), c(`anchor ${i}`)]).flat();
  const current = base.map((cell, i) => i % 2 ? cell : c(cell.source.replace('100', '200')));
  const result = alignCells(base, current);
  assert.equal(result.complete, true);
  assert.equal(result.pairs.length, 26);
});
test('adjacent long edited cells stay between their anchors, while duplicate candidates remain uncertain', () => {
  const sources = ['alpha', 'beta'].map(name => Array.from({ length: 400 }, (_, i) => `${name}_${i} = ${i}\n`).join(''));
  const changes = sources.map(source => source.replace('_3 = 3', '_3 = 4'));
  assert.ok(sources.every((source, i) => source.length + changes[i]!.length > 8000));
  const result = alignCells([c('start'), ...sources.map(source => c(source)), c('end')],
    [c('start'), ...changes.map(source => c(source)), c('end')]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.pairs.map(pair => [pair.current, pair.base]), [[0, 0], [1, 1], [2, 2], [3, 3]]);
  const ambiguous = alignCells([c(sources[0]!), c(sources[0]!)], [c(changes[0]!), c(changes[0]!)]);
  assert.equal(ambiguous.pairs.length, 0);
  assert.deepEqual(ambiguous.uncertainCurrent, [0, 1]);
});
test('an unevaluated expensive competitor prevents similarity admission', () => {
  const result = alignCells([c('a'.repeat(1800) + '1'), c('b'.repeat(1800))],
    [c('a'.repeat(1800) + '2'), c('c'.repeat(1800))]);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.complete, false);
});
