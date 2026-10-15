import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { git } from '../gitFixture';
import { setup, sleep, waitFor, replace } from './support';
export async function run() {
  const { root, repo, uri, notebook, api } = await setup();
  const done: string[] = [];
  async function check(name: string, body: () => Promise<void>) {
    try { await body(); }
    catch (error) {
      await writeFile(path.join(root, '.tmp/host-failure.json'), JSON.stringify({ name, diagnostics: api.snapshot(),
        gitAutorefresh: vscode.workspace.getConfiguration('git').get('autorefresh'), window: vscode.window.state,
        gitIndex: git(repo, 'ls-files', '--stage') }, null, 2));
      throw error;
    }
    done.push(name); console.log(`PASS ${name}`);
  }
  const state = () => api.snapshot().notebooks[0];
  const settled = async () => { await sleep(300); await waitFor(() => !state()?.pending, 'analysis settled'); };
  const original = notebook.cellAt(0).document.getText();
  await check('activation, serializer ID and Cell URI -> visible TextEditor', async () => {
    assert.equal(notebook.cellAt(0).metadata.id, 'fixture-0');
    assert.ok(vscode.window.visibleTextEditors.some(e => e.document.uri.toString() === notebook.cellAt(0).document.uri.toString()));
    assert.equal(state()?.matched, notebook.cellCount);
    assert.equal(api.snapshot().repositories, 1);
  });
  await check('unsaved edits, debounce and zero per-keystroke Git reads', async () => {
    await sleep(800); const gitCalls = api.snapshot().gitCalls; const runs = state()?.runs ?? 0;
    for (let i = 0; i < 12; i++) await replace(notebook.cellAt(0), `name = "edit ${i}"\ncount = 3\nprint(name, count)\n`);
    await settled();
    assert.ok(notebook.isDirty); assert.equal(state()?.cells?.[0]?.changes[0]?.kind, 'modified');
    assert.ok((state()?.runs ?? 0) - runs <= 2); assert.equal(api.snapshot().gitCalls, gitCalls);
    assert.equal(state()?.computed, 1);
    assert.equal(api.snapshot().repositories, 1);
    await replace(notebook.cellAt(0), original); await settled();
  });
  await check('output and execution metadata do not recalculate source diffs', async () => {
    const runs = state()?.runs;
    const edit = new vscode.WorkspaceEdit(); edit.set(uri, [vscode.NotebookEdit.updateCellMetadata(0, { ...notebook.cellAt(0).metadata, execution_count: 42, metadata: { duration: 100 } })]);
    assert.ok(await vscode.workspace.applyEdit(edit)); await settled();
    assert.equal(state()?.runs, runs); assert.ok(state()?.cells?.every(cell => cell.changes.length === 0));
  });
  await check('HEAD stage semantics and index invalidation via built-in Git events', async () => {
    await replace(notebook.cellAt(0), 'staged\n'); await notebook.save(); await settled();
    git(repo, 'add', '--', 'demo.ipynb');
    await sleep(1200); await settled(); assert.equal(state()?.cells?.[0]?.status, 'modified');
    await vscode.workspace.getConfiguration('notebookGitGutter').update('baseline', 'index', vscode.ConfigurationTarget.Workspace);
    await waitFor(() => state()?.baseline === 'index' && !state()?.pending && state()?.cells?.[0]?.status === 'unchanged', 'index baseline');
    await replace(notebook.cellAt(0), 'after stage\n'); await settled(); assert.equal(state()?.cells?.[0]?.status, 'modified');
    await notebook.save(); git(repo, 'add', '--', 'demo.ipynb');
    await waitFor(() => !state()?.pending && state()?.cells?.[0]?.status === 'unchanged', 'stage event reload', 15_000);
    await vscode.workspace.getConfiguration('notebookGitGutter').update('baseline', 'HEAD', vscode.ConfigurationTarget.Workspace);
    await settled(); assert.equal(state()?.cells?.[0]?.status, 'modified');
    git(repo, 'commit', '-m', 'updated');
    await waitFor(() => !state()?.pending && state()?.cells?.[0]?.status === 'unchanged', 'commit event reload', 15_000);
  });
  await check('Refresh and Toggle invalidate pending work and disable analysis', async () => {
    await replace(notebook.cellAt(0), 'modified again');
    await vscode.commands.executeCommand('notebookGitGutter.toggle'); await settled();
    assert.equal(state()?.enabled, false); assert.equal(state()?.cells, undefined);
    assert.equal(api.snapshot().cachedBaselines, 0); assert.equal(api.snapshot().repositories, 0);
    await vscode.commands.executeCommand('notebookGitGutter.toggle');
    await vscode.commands.executeCommand('notebookGitGutter.refresh'); await settled();
    assert.equal(state()?.enabled, true); assert.equal(state()?.cells?.[0]?.status, 'modified');
  });
  await check('close, release caches, reopen and recover baseline', async () => {
    await notebook.save(); await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await waitFor(() => api.snapshot().notebooks.length === 0, 'Notebook disposed');
    assert.equal(api.snapshot().cachedBaselines, 0);
    assert.equal(api.snapshot().repositories, 0);
    const reopened = await vscode.workspace.openNotebookDocument(uri); await vscode.window.showNotebookDocument(reopened);
    await waitFor(() => state()?.state === 'ready' && !state()?.pending, 'reopened notebook');
    assert.equal(state()?.cells?.[0]?.status, 'modified');
  });
  await check('multi-root, folder overrides, reliable rename and nested repository baselines', async () => {
    const secondRepo = process.env.NGG_SECOND_REPO; assert.ok(secondRepo);
    assert.equal(vscode.workspace.workspaceFolders?.length, 2);
    const second = await vscode.workspace.openNotebookDocument(vscode.Uri.file(path.join(secondRepo, 'demo.ipynb')));
    await vscode.window.showNotebookDocument(second);
    const secondState = () => api.snapshot().notebooks.find(n => n.workspaceFolder === path.basename(secondRepo));
    await waitFor(() => secondState()?.state === 'ready' && !secondState()?.pending, 'second workspace root');
    assert.equal(secondState()?.cells?.[0]?.status, 'unchanged');
    await replace(second.cellAt(0), 'second changed');
    await waitFor(() => !secondState()?.pending && secondState()?.cells?.[0]?.status === 'modified', 'second root edit');
    assert.equal(secondState()?.cells?.[0]?.changes[0]?.kind, 'modified');
    const secondConfig = vscode.workspace.getConfiguration('notebookGitGutter', second.uri);
    await secondConfig.update('enabled', false, vscode.ConfigurationTarget.WorkspaceFolder);
    await waitFor(() => secondState()?.enabled === false && !secondState()?.pending, 'folder setting disable');
    await vscode.commands.executeCommand('notebookGitGutter.toggle');
    await waitFor(() => secondState()?.enabled === true && !secondState()?.pending, 'Toggle respects folder override');
    assert.equal(secondConfig.inspect<boolean>('enabled')?.workspaceFolderValue, true);
    git(secondRepo, 'mv', '--', 'demo.ipynb', 'renamed.ipynb');
    const renamed = await vscode.workspace.openNotebookDocument(vscode.Uri.file(path.join(secondRepo, 'renamed.ipynb')));
    await vscode.window.showNotebookDocument(renamed);
    const renamedState = () => api.snapshot().notebooks.find(n => n.name === 'renamed.ipynb');
    await waitFor(() => !renamedState()?.pending && renamedState()?.baselineState === 'ready' && renamedState()?.cells?.[0]?.status === 'unchanged', 'Git API rename old path', 15_000);
    await replace(renamed.cellAt(0), 'rename edited');
    await waitFor(() => !renamedState()?.pending && renamedState()?.cells?.[0]?.status === 'modified', 'renamed source edit');
    assert.equal(renamedState()?.cells?.[0]?.changes[0]?.kind, 'modified');
    const nestedRoot = path.join(repo, 'nested'); await mkdir(nestedRoot);
    await writeFile(path.join(nestedRoot, 'nested.ipynb'), JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {},
      cells: [{ cell_type: 'code', id: 'nested', metadata: {}, source: 'nested baseline', outputs: [], execution_count: null }] }));
    for (const args of [['init', '-b', 'main'], ['add', '.'], ['-c', 'user.name=Notebook Test', '-c', 'user.email=test@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'nested']]) {
      git(nestedRoot, ...args);
    }
    const nested = await vscode.workspace.openNotebookDocument(vscode.Uri.file(path.join(nestedRoot, 'nested.ipynb')));
    await vscode.window.showNotebookDocument(nested);
    const nestedState = () => api.snapshot().notebooks.find(n => n.name === 'nested.ipynb');
    await waitFor(() => nestedState()?.state === 'ready' && !nestedState()?.pending, 'nested repository baseline');
    assert.equal(nestedState()?.cells?.[0]?.status, 'unchanged');
    assert.equal(api.snapshot().repositories, 3);
  });
  await writeFile(path.join(root, '.tmp', process.env.NGG_HOST_RESULTS ?? 'host-results.json'), JSON.stringify({ passed: done, diagnostics: api.snapshot() }, null, 2));
  console.log(`${done.length} extension-host checks passed.`);
}
