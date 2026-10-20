import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { GitReader } from '../../src/gitReader';
import { git } from '../gitFixture';

export const nb = (source: string) => JSON.stringify({ nbformat: 4, cells: [{ cell_type: 'code', id: 'one', source }], metadata: {} });
const reader = new GitReader('git');
async function repo(run: (root: string, file: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'ngg-git-'));
  try {
    git(root, 'init', '-b', 'main');
    await run(root, path.join(root, '空 格 [特殊] ;$.ipynb'));
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('HEAD/index, stage then edit, commits, missing baselines and literal paths', async () => repo(async (root, file) => {
  await writeFile(file, nb('a'));
  assert.deepEqual((await reader.read(root, file, 'HEAD')).kind, 'missing');
  assert.deepEqual((await reader.read(root, file, 'index')).kind, 'missing');
  git(root, 'add', '--', file);
  const initialIndex = await reader.read(root, file, 'index');
  assert.equal(initialIndex.kind, 'ready');
  git(root, 'commit', '-m', 'initial');
  await writeFile(file, nb('b'));
  git(root, 'add', '--', file);
  await writeFile(file, nb('c'));
  const head = await reader.read(root, file, 'HEAD');
  const index = await reader.read(root, file, 'index');
  assert.equal(head.kind, 'ready'); assert.equal(index.kind, 'ready');
  if (head.kind === 'ready' && index.kind === 'ready') {
    assert.equal(head.cells[0]?.source, 'a'); assert.equal(index.cells[0]?.source, 'b');
  }
  git(root, 'commit', '-m', 'staged');
  const committed = await reader.read(root, file, 'HEAD');
  assert.equal(committed.kind, 'ready');
  if (committed.kind === 'ready') assert.equal(committed.cells[0]?.source, 'b');
  assert.equal((await reader.read(root, path.join(root, 'untracked.ipynb'), 'HEAD')).kind, 'missing');
  git(root, 'mv', '--', file, path.join(root, 'renamed.ipynb'));
  const renamed = await reader.read(root, path.join(root, 'renamed.ipynb'), 'HEAD', file);
  assert.equal(renamed.kind, 'ready');
  if (renamed.kind === 'ready') assert.equal(renamed.cells[0]?.source, 'b');
}));
test('linked worktree and nested repository resolve their actual root', async () => repo(async (root, file) => {
  await writeFile(file, nb('worktree')); git(root, 'add', '.'); git(root, 'commit', '-m', 'initial');
  const linked = path.join(root, 'linked');
  git(root, 'worktree', 'add', '-b', 'linked', linked);
  assert.equal(await reader.rootFor(path.join(linked, path.basename(file))), linked);
  assert.equal((await reader.read(linked, path.join(linked, path.basename(file)), 'HEAD')).kind, 'ready');
  const nested = path.join(root, 'nested'); await mkdir(nested); git(nested, 'init');
  assert.equal(await reader.rootFor(path.join(nested, 'a.ipynb')), nested);
}));
test('conflict, malformed JSON, missing Git and failed reads never become empty baseline', async () => repo(async (root, file) => {
  await writeFile(file, nb('base')); git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  git(root, 'checkout', '-b', 'other'); await writeFile(file, nb('other')); git(root, 'commit', '-am', 'other');
  git(root, 'checkout', 'main'); await writeFile(file, nb('main')); git(root, 'commit', '-am', 'main');
  assert.throws(() => git(root, 'merge', 'other'));
  assert.equal((await reader.read(root, file, 'index')).kind, 'error');
  git(root, 'merge', '--abort');
  await writeFile(file, '{broken'); git(root, 'add', '.');
  const malformed = await reader.read(root, file, 'index');
  assert.equal(malformed.kind, 'error');
  if (malformed.kind === 'error') assert.equal(malformed.code, 'invalid-json');
  assert.equal((await new GitReader('/does/not/exist').read(root, file, 'HEAD')).kind, 'error');
  assert.equal((await reader.read(path.join(root, 'missing'), file, 'HEAD')).kind, 'error');
}));
test('raw object reads do not execute a configured textconv', async () => repo(async (root, file) => {
  await writeFile(file, nb('safe'));
  await writeFile(path.join(root, '.gitattributes'), '*.ipynb diff=evil\n');
  git(root, 'config', 'diff.evil.textconv', 'a-command-that-must-not-run');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  assert.equal((await reader.read(root, file, 'HEAD')).kind, 'ready');
}));
test('repository paths retain trailing spaces, Unicode and shell characters', async () => repo(async root => {
  const nested = path.join(root, '空 格 [x] $ '); await mkdir(nested); git(nested, 'init');
  const file = path.join(nested, '-literal.ipynb'); await writeFile(file, nb('literal'));
  git(nested, 'add', '--', file); git(nested, 'commit', '-m', 'literal');
  assert.equal(await reader.rootFor(file), nested);
  assert.equal((await reader.read(nested, file, 'HEAD')).kind, 'ready');
}));

test('missing promisor objects never execute a configured remote helper', async () => repo(async (root, file) => {
  const marker = path.join(root, '.git', 'remote-helper-ran');
  const helper = path.join(root, '.git', 'probe-helper.cjs');
  await writeFile(helper, "require('node:fs').writeFileSync(process.argv[2], 'executed'); process.exit(1);\n");
  const extArgument = (value: string) => value.replace(/%/g, '%%').replace(/ /g, '% ');
  git(root, 'config', 'remote.audit.url', `ext::${[process.execPath, helper, marker].map(extArgument).join(' ')}`);
  git(root, 'config', 'remote.audit.promisor', 'true');
  git(root, 'config', 'protocol.ext.allow', 'always');
  git(root, 'update-index', '--add', '--cacheinfo', `100644,${'a'.repeat(40)},${path.basename(file)}`);
  const result = await reader.read(root, file, 'index');
  assert.equal(result.kind, 'error');
  assert.equal(existsSync(marker), false, 'a local object read must not invoke a remote helper');
}));

test('inherited Git context cannot redirect repository discovery, HEAD or index', async () => repo(async (root, file) => {
  await writeFile(file, nb('correct repository')); git(root, 'add', '.'); git(root, 'commit', '-m', 'correct');
  const other = path.join(root, 'other'); await mkdir(other); git(other, 'init');
  const otherFile = path.join(other, path.basename(file));
  await writeFile(otherFile, nb('wrong repository')); git(other, 'add', '.'); git(other, 'commit', '-m', 'wrong');
  const trace = path.join(root, '.git', 'unexpected-trace');
  const overrides = { GIT_DIR: path.join(other, '.git'), GIT_WORK_TREE: other, GIT_INDEX_FILE: path.join(other, '.git', 'index'),
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.worktree', GIT_CONFIG_VALUE_0: other, GIT_TRACE: trace };
  const saved = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    assert.equal(git(root, 'rev-parse', '--show-toplevel'), root, 'fixture writes must also use the requested repository');
    assert.equal(await reader.rootFor(file), root);
    for (const mode of ['HEAD', 'index'] as const) {
      const result = await reader.read(root, file, mode);
      assert.equal(result.kind, 'ready');
      if (result.kind === 'ready') assert.equal(result.cells[0]?.source, 'correct repository');
    }
    assert.equal(existsSync(trace), false);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}));

test('a baseline exceeding the cell count limit fails explicitly', async () => repo(async (root, file) => {
  await writeFile(file, JSON.stringify({ nbformat: 4, cells: Array.from({ length: 2001 }, () => ({ cell_type: 'code', source: '' })) }));
  git(root, 'add', '.');
  const result = await reader.read(root, file, 'index');
  assert.equal(result.kind, 'error');
  if (result.kind === 'error') assert.equal(result.code, 'too-many-cells');
}));

test('intent-to-add differs from a genuinely staged empty notebook through add and reset', async () => repo(async (root, file) => {
  await writeFile(file, nb('new'));
  git(root, 'add', '-N', '--', file);
  const intent = await reader.read(root, file, 'index');
  assert.equal(intent.kind, 'missing');
  if (intent.kind === 'missing') assert.equal(intent.reason, 'intent-to-add');
  git(root, 'add', '--', file); assert.equal((await reader.read(root, file, 'index')).kind, 'ready');
  git(root, 'reset', '--', file); assert.equal((await reader.read(root, file, 'index')).kind, 'missing');
  await writeFile(file, ''); git(root, 'add', '--', file);
  assert.deepEqual(await reader.read(root, file, 'index'), { kind: 'error', code: 'invalid-json' });
}));
test('directory aliases use the physical root while tracked file symlinks stay unsupported', { skip: process.platform === 'win32' }, async () => repo(async (root, file) => {
  const physical = path.join(root, 'physical'); await mkdir(physical); git(physical, 'init');
  const target = path.join(physical, path.basename(file)); await writeFile(target, nb('alias'));
  git(physical, 'add', '.'); git(physical, 'commit', '-m', 'base');
  const alias = path.join(root, 'alias'); await symlink(physical, alias, 'dir');
  const logical = path.join(alias, path.basename(file));
  assert.equal(await reader.rootFor(logical), physical);
  assert.equal((await reader.read(physical, logical, 'HEAD')).kind, 'ready');
  const link = path.join(physical, 'file-link.ipynb'); await symlink(target, link);
  git(physical, 'add', '.');
  assert.deepEqual(await reader.read(physical, link, 'index'), { kind: 'error', code: 'unsupported-git-entry' });
}));

test('unchanged index blobs are parsed once and transient reads can recover', async () => repo(async (root, file) => {
  const engine = new GitReader('git');
  await writeFile(file, nb('cached')); git(root, 'add', '.');
  const first = await engine.read(root, file, 'index');
  assert.equal(first.kind, 'ready'); const reads = engine.blobReads;
  for (let i = 0; i < 3; i++) assert.equal((await engine.read(root, file, 'index')).kind, 'ready');
  assert.equal(engine.blobReads, reads); assert.equal(engine.blobHits, 3);
  await writeFile(file, '{broken'); git(root, 'add', '.');
  assert.deepEqual(await engine.read(root, file, 'index'), { kind: 'error', code: 'invalid-json' });
  await writeFile(file, nb('recovered')); git(root, 'add', '.');
  assert.equal((await engine.read(root, file, 'index')).kind, 'ready');
  engine.clear(root);
  assert.equal((await engine.read(root, file, 'index')).kind, 'ready');
  assert.equal(engine.blobReads, reads + 3);
}));

test('HEAD reads stay pinned to their cache identity while Git advances', async () => repo(async (root, file) => {
  const engine = new GitReader('git');
  assert.equal(await engine.resolveHead(root), undefined);
  await writeFile(file, nb('A')); git(root, 'add', '.'); git(root, 'commit', '-m', 'A');
  const a = await engine.resolveHead(root); assert.ok(a);
  await writeFile(file, nb('B')); git(root, 'commit', '-am', 'B');
  const pinned = await engine.read(root, file, 'HEAD', undefined, { revision: a });
  assert.equal(pinned.kind, 'ready');
  if (pinned.kind === 'ready') { assert.ok(pinned.revision.startsWith(a + ':')); assert.equal(pinned.cells[0]?.source, 'A'); }
  const unborn = await engine.read(root, file, 'HEAD', undefined, { revision: undefined });
  assert.deepEqual(unborn, { kind: 'missing', reason: 'unborn', revision: 'unborn' });
  assert.equal((await engine.read(root, file, 'HEAD')).kind, 'ready');
}));

test('parallel notebook reads bound subprocesses and share immutable blobs', async () => repo(async (root, file) => {
  const engine = new GitReader('git');
  await writeFile(file, nb('shared')); git(root, 'add', '.');
  const results = await Promise.all(Array.from({ length: 80 }, () => engine.read(root, file, 'index')));
  assert.ok(results.every(result => result.kind === 'ready'));
  assert.equal(engine.peakActive, 4); assert.equal(engine.activeCalls, 0); assert.equal(engine.queuedCalls, 0);
  assert.equal(engine.blobReads, 1);
}));

test('the raw baseline byte limit includes outputs even when source is small', async () => repo(async (root, file) => {
  const engine = new GitReader('git');
  await writeFile(file, JSON.stringify({ nbformat: 4, metadata: {}, cells: [{ cell_type: 'code', source: 'print(1)',
    outputs: [{ output_type: 'display_data', data: { 'image/png': 'A'.repeat(8 * 1024 * 1024) } }] }] }));
  git(root, 'add', '--', file);
  assert.deepEqual(await engine.read(root, file, 'index'), { kind: 'error', code: 'baseline-too-large' });
  assert.equal(engine.blobReads, 0, 'reject by size before decoding or parsing a large output blob');
}));

test('a reliable rename still reads the old path after its parent directory was moved', async () => repo(async root => {
  const oldDirectory = path.join(root, 'old folder'); await mkdir(oldDirectory);
  const oldFile = path.join(oldDirectory, 'old.ipynb'); await writeFile(oldFile, nb('before move'));
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  const newDirectory = path.join(root, 'new folder'); git(root, 'mv', '--', oldDirectory, newDirectory);
  const result = await reader.read(root, path.join(newDirectory, 'old.ipynb'), 'HEAD', oldFile);
  assert.equal(result.kind, 'ready');
  if (result.kind === 'ready') assert.equal(result.cells[0]?.source, 'before move');
}));
