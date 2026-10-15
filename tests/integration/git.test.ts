import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
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
