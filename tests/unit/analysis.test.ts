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

test('budget exhaustion cannot promote an unverified match through session replay', async t => {
  const baseline: Baseline = { kind: 'ready', revision: 'budget', path: 'test.ipynb', cells: [
    { kind: 'code', source: 'result = 100' }, { kind: 'code', source: 'result = 101' },
  ] };
  const current = [{ kind: 'code' as const, source: 'result = 201', session: 'a' },
    { kind: 'code' as const, source: 'result = 200', session: 'b' }];
  const fresh = await new Analyzer().analyze(baseline, current);
  for (let allowed = 1; allowed <= 20; allowed++) {
    const analyzer = new Analyzer(); let calls = 0;
    const clock = t.mock.method(performance, 'now', () => calls++ < allowed ? 0 : 1000);
    try { await analyzer.analyze(baseline, current); } finally { clock.mock.restore(); }
    const replay = await analyzer.analyze(baseline, current);
    assert.deepEqual(replay?.alignment?.pairs.map(p => [p.base, p.current]), fresh?.alignment?.pairs.map(p => [p.base, p.current]), `clock cutoff ${allowed}`);
    assert.equal(replay?.state, fresh?.state);
  }
});

test('transient typed baseline errors are evicted even when the HEAD cache key is unchanged', async () => {
  const cache = new BaselineCache<Baseline>();
  const reusable = (value: Baseline) => value.kind !== 'error';
  await cache.get('same-head', async () => ({ kind: 'error', code: 'merge-conflict' }), reusable);
  assert.equal(cache.size, 0);
  assert.equal(await cache.get('same-head', async () => base, reusable), base);
});
test('reliable cell identities avoid hashing unchanged notebook source', async () => {
  const analyzer = new Analyzer();
  const cells = [{ kind: 'code' as const, source: 'changed', id: 'a', session: 'uri' }];
  assert.equal((await analyzer.analyze(base, cells))?.alignment?.hashedChars, 0);
  cells[0] = { ...cells[0]!, source: 'changed again' };
  const result = await analyzer.analyze(base, cells);
  assert.equal(result?.alignment?.hashedChars, 0); assert.equal(result?.computed, 1);
});
