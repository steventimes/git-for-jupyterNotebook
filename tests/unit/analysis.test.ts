import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Analyzer } from '../../src/analysis';
import { BaselineCache } from '../../src/cache';
import { Baseline } from '../../src/gitReader';
import { Generation } from '../../src/generation';
const base: Baseline = { kind: 'ready', revision: 'one', path: 'test.ipynb', cells: [{ kind: 'code', id: 'a', source: 'base' }] };
test('baseline error is never treated as an empty file', async () => {
  const result = await new Analyzer().analyze({ kind: 'error', code: 'git-read-failed' }, [{ kind: 'code', source: 'current' }]);
  assert.equal(result?.state, 'error'); assert.deepEqual(result?.cells, []);
});
test('a size-limited live cell is never represented as deleted or unchanged source', async () => {
  const result = await new Analyzer().analyze(base, [{ kind: 'code', id: 'a', source: '', limited: true }]);
  assert.equal(result?.state, 'incomplete');
  assert.equal(result?.cells[0]?.status, 'uncertain');
  assert.deepEqual(result?.cells[0]?.diff.changes, []);
  assert.deepEqual(result?.alignment?.deleted, []);
});
test('only changed sources are recomputed and a removed cell is a notebook-level deletion', async () => {
  const analyzer = new Analyzer();
  const cells = [{ kind: 'code' as const, source: 'changed', id: 'a', session: 'uri' }];
  assert.equal((await analyzer.analyze(base, cells))?.computed, 1);
  assert.equal((await analyzer.analyze(base, cells))?.computed, 0);
  assert.equal((await analyzer.analyze(base, [{ ...cells[0]!, source: 'base' }]))?.cells[0]?.diff.changes.length, 0);
  const deleted = await analyzer.analyze(base, []);
  assert.deepEqual(deleted?.alignment?.deleted, [0]); assert.deepEqual(deleted?.cells, []);
});
test('a metadata-only baseline revision preserves reliable session mappings for duplicate sources', async () => {
  const analyzer = new Analyzer();
  const baseline: Baseline = { kind: 'ready', revision: 'commit-one', path: 'test.ipynb', cells: [
    { kind: 'code', source: 'same' }, { kind: 'code', source: 'same' },
  ] };
  const current = [{ kind: 'code' as const, source: 'same', session: 'a' }, { kind: 'code' as const, source: 'same', session: 'b' }];
  await analyzer.analyze(baseline, current);
  current[0] = { ...current[0]!, source: 'edited' };
  await analyzer.analyze(baseline, current);
  const updated = await analyzer.analyze({ ...baseline, revision: 'commit-two', cells: baseline.cells.map(cell => ({ ...cell })) }, current);
  assert.equal(updated?.state, 'ready');
  assert.equal(updated?.cells[0]?.status, 'modified');
  assert.equal(updated?.cells[1]?.status, 'unchanged');
});
test('stale and disposed analysis cannot overwrite fresh cached results', async () => {
  const analyzer = new Analyzer();
  const generation = new Generation();
  const slowInput = Array.from({ length: 30 }, (_, i) => ({ kind: 'code' as const, id: String(i), source: 'old' }));
  const old = generation.next();
  const work = analyzer.analyze(base, slowInput, () => generation.current(old));
  const fresh = generation.next();
  const current = [{ kind: 'code' as const, id: 'a', source: 'fresh', session: 'cell-uri' }];
  assert.equal((await analyzer.analyze(base, current, () => generation.current(fresh)))?.cells[0]?.status, 'modified');
  assert.equal(await work, undefined);
  assert.equal((await analyzer.analyze(base, current))?.computed, 0, 'old work must not replace the fresh diff cache');
  const closing = generation.next();
  const pending = analyzer.analyze(base, slowInput, () => generation.current(closing));
  generation.dispose();
  assert.equal(await pending, undefined);
});
test('cache shares in-flight reads and invalidation cannot reinsert an old result', async () => {
  const cache = new BaselineCache<string>();
  let finish: (value: string) => void = () => {};
  let calls = 0;
  const load = () => { calls++; return new Promise<string>(resolve => { finish = resolve; }); };
  const old = cache.get('repo/file/HEAD', load);
  assert.equal(cache.get('repo/file/HEAD', load), old); assert.equal(calls, 1);
  cache.invalidate();
  assert.equal(await cache.get('repo/file/HEAD', async () => 'fresh'), 'fresh');
  finish('old'); assert.equal(await old, 'old');
  assert.equal(await cache.get('repo/file/HEAD', load), 'fresh');
});
