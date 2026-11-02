import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { git } from '../gitFixture';
import { setup, sleep, waitFor, replace } from './support';
import { changePreview } from '../../src/ui/details';
import type { GitExtension } from '../../types/git-api';
import { Status } from '../../types/git-api';
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
  await check('unsaved edits, debounce and zero per-keystroke Git reads', async () => {
    await sleep(800); const gitCalls = api.snapshot().gitCalls; const runs = state()?.runs ?? 0;
    for (let i = 0; i < 12; i++) await replace(notebook.cellAt(0), `name = "edit ${i}"\ncount = 3\nprint(name, count)\n`);
    await settled();
    assert.ok(notebook.isDirty); assert.equal(state()?.cells?.[0]?.changes[0]?.kind, 'modified');
    assert.ok((state()?.runs ?? 0) - runs <= 2); assert.equal(api.snapshot().gitCalls, gitCalls);
    assert.equal(state()?.computed, 1);
    await replace(notebook.cellAt(0), original); await settled();
  });
  await check('pending edits hide old coordinates and structural summaries never shift by index', async () => {
    const settings = vscode.workspace.getConfiguration('notebookGitGutter');
    await settings.update('debounceMs', 1000, vscode.ConfigurationTarget.Workspace);
    await settled();
    await replace(notebook.cellAt(0), original.replace('count = 3', 'count = 4')); await settled();
    assert.equal(state()?.summaries[0]?.items[0], 'Git: modified');
    const changedUri = notebook.cellAt(0).document.uri.toString();
    await replace(notebook.cellAt(0), '\n' + notebook.cellAt(0).document.getText());
    await sleep(60);
    assert.equal(state()?.pending, true);
    assert.ok(api.snapshot().status.text.startsWith('$(sync~spin)'));
    assert.match(String(api.snapshot().status.tooltip), /Analysing current source/);
    assert.ok(!api.snapshot().rendered.includes(changedUri), 'old coordinates must be hidden until the new version is analysed');
    const submissions = api.snapshot().decorationSubmissions;
    for (let i = 0; i < 12; i++) {
      await replace(notebook.cellAt(0), `rapid pending ${i}\n` + original); await sleep(10);
    }
    assert.equal(api.snapshot().decorationSubmissions, submissions, 'pending typing must not resubmit unchanged visible decorators');
    const edit = new vscode.WorkspaceEdit();
    edit.set(uri, [vscode.NotebookEdit.insertCells(0, [new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'inserted', 'python')])]);
    assert.ok(await vscode.workspace.applyEdit(edit)); await sleep(60);
    assert.equal(state()?.pending, true);
    assert.deepEqual(state()?.summaries[0]?.items, [], 'new cell cannot inherit the previous index zero summary');
    assert.deepEqual(state()?.summaries[1]?.items, [], 'structural changes invalidate the whole snapshot');
    const cleanup = new vscode.WorkspaceEdit(); cleanup.set(uri, [vscode.NotebookEdit.deleteCells(new vscode.NotebookRange(0, 1))]);
    assert.ok(await vscode.workspace.applyEdit(cleanup));
    await replace(notebook.cellAt(0), original); await settled();
    await settings.update('debounceMs', 200, vscode.ConfigurationTarget.Workspace); await settled();
  });
  await check('native hover previews preserve source safely and reject stale results', async () => {
    const cell = notebook.cellAt(0);
    const previews = () => vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', cell.document.uri, new vscode.Position(0, 0));
    await replace(cell, 'x'.repeat(3999) + '😀tail'); await settled();
    const bounded = (await previews())?.[0]?.contents[0]; assert.ok(bounded instanceof vscode.MarkdownString);
    assert.ok(bounded.value.replace(/&nbsp;/g, ' ').includes('Preview truncated.'));
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(bounded.value), 'preview limits cannot split a Unicode surrogate pair');
    // Exercise formatting against a real TextDocument without depending on the
    // generic line diff's timeout for this deliberately dense replacement.
    const dense = await vscode.workspace.openTextDocument({ content: 'new\n'.repeat(405) });
    const replacement = { kind: 'modified' as const, base: { start: 0, end: 405 },
      current: { start: 0, end: 405 }, anchor: 0, removed: 'old\n'.repeat(405) };
    const balanced = changePreview(replacement, dense).value;
    assert.equal((balanced.match(/removedLineBackground/g) ?? []).length, 200);
    assert.equal((balanced.match(/insertedLineBackground/g) ?? []).length, 200);
    assert.ok(balanced.includes('- old') && balanced.includes('+ new'));
    assert.match(balanced.replace(/&nbsp;/g, ' '), /Preview truncated/);
    for (const kind of ['added', 'deleted'] as const) {
      const single = changePreview({ ...replacement, kind, removed: kind === 'deleted' ? replacement.removed : '' }, dense).value;
      assert.equal((single.match(/LineBackground/g) ?? []).length, 400, 'single-sided changes retain the full row budget');
    }
    assert.equal(dense.getText(), 'new\n'.repeat(405), 'formatting must not modify current source');
    const contextOriginal = 'first target=old; ' + 'unchanged words; '.repeat(400) +
      'second target=old; price=10; [run](command:x)';
    const contextSource = contextOriginal.replace('second target=old', 'second target=new').replace('price=10', 'price=11');
    const contextDocument = await vscode.workspace.openTextDocument({ content: contextSource });
    const contextPreview = changePreview({ kind: 'modified', base: { start: 0, end: 1 },
      current: { start: 0, end: 1 }, anchor: 0, removed: contextOriginal }, contextDocument).value;
    assert.ok(contextPreview.includes('[run](command:x)'), 'unchanged context must remain literal source');
    assert.doesNotMatch(contextPreview, /<a\b|href=/i, 'unchanged source links cannot become active markup');
    assert.ok(contextPreview.includes('…') && contextPreview.length < 3000, 'long previews retain their HTML size bound');
    const settings = vscode.workspace.getConfiguration('notebookGitGutter');
    await settings.update('debounceMs', 1000, vscode.ConfigurationTarget.Workspace); await settled();
    await replace(cell, 'newer source');
    assert.deepEqual(await previews(), [], 'pending results must not expose a previous version preview');
    await replace(cell, original); await settings.update('debounceMs', 200, vscode.ConfigurationTarget.Workspace); await settled();
  });
  await check('HEAD stage semantics and index invalidation via built-in Git events', async () => {
    await replace(notebook.cellAt(0), 'staged\n'); await notebook.save(); await settled();
    git(repo, 'add', '--', 'demo.ipynb');
    await sleep(1200); await settled(); assert.equal(state()?.cells?.[0]?.status, 'modified');
    await vscode.workspace.getConfiguration('notebookGitGutter').update('baseline', 'index', vscode.ConfigurationTarget.Workspace);
    await waitFor(() => state()?.baseline === 'index' && !state()?.pending && state()?.cells?.[0]?.status === 'unchanged', 'index baseline');
    await replace(notebook.cellAt(0), 'after stage\n'); await settled(); assert.equal(state()?.cells?.[0]?.status, 'modified');
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', notebook.cellAt(0).document.uri, new vscode.Position(0, 0));
    const content = (hovers ?? []).flatMap(hover => hover.contents).find(content =>
      content instanceof vscode.MarkdownString && content.value.includes('staged') && content.value.includes('after stage'));
    assert.ok(content instanceof vscode.MarkdownString, 'hover source uses the index snapshot after switching modes');
    assert.equal(content.isTrusted, false); assert.equal(content.supportHtml, true);
    await notebook.save(); git(repo, 'add', '--', 'demo.ipynb');
    await waitFor(() => !state()?.pending && state()?.cells?.[0]?.status === 'unchanged', 'stage event reload', 15_000);
    await vscode.workspace.getConfiguration('notebookGitGutter').update('baseline', 'HEAD', vscode.ConfigurationTarget.Workspace);
    await settled(); assert.equal(state()?.cells?.[0]?.status, 'modified');
    git(repo, 'commit', '-m', 'updated');
    await waitFor(() => !state()?.pending && state()?.cells?.[0]?.status === 'unchanged', 'commit event reload', 15_000);
  });
  await check('failed HEAD baselines stay quiet while typing and recover on repository events', async () => {
    const originalText = notebook.cellAt(0).document.getText();
    const broken = path.join(repo, '.git', 'broken-notebook'); await writeFile(broken, '{broken');
    const object = git(repo, 'hash-object', '-w', '--', broken);
    git(repo, 'update-index', '--cacheinfo', `100644,${object},demo.ipynb`);
    git(repo, 'commit', '-m', 'broken baseline fixture');
    await waitFor(() => !state()?.pending && state()?.reason === 'invalid-json', 'invalid HEAD reported');
    await waitFor(() => api.snapshot().status.text.includes('baseline contains invalid JSON'), 'readable error status');
    assert.match(String(api.snapshot().status.tooltip), /Use Refresh to retry/);
    assert.equal(state()?.cachedSources, 0, 'unavailable baselines must not capture current source');
    await sleep(800); const calls = api.snapshot().gitCalls;
    for (let i = 0; i < 3; i++) { await replace(notebook.cellAt(0), `typing while unavailable ${i}`); await settled(); }
    assert.equal(api.snapshot().gitCalls, calls, 'a failed baseline must not run Git on every input');
    await replace(notebook.cellAt(0), originalText); await notebook.save();
    git(repo, 'add', '--', 'demo.ipynb'); git(repo, 'commit', '-m', 'recovered baseline fixture');
    await waitFor(() => !state()?.pending && state()?.state === 'ready', 'error cache invalidated by repository event');
  });
  await check('refresh during Git API lag and checkout restore the actual immutable HEAD', async () => {
    const a = git(repo, 'rev-parse', 'HEAD'); const sourceA = notebook.cellAt(0).document.getText();
    const file = path.join(repo, 'demo.ipynb'); const data = JSON.parse(await readFile(file, 'utf8'));
    data.cells[0].source = 'fast checkout B\n';
    await writeFile(file, JSON.stringify(data)); git(repo, 'add', '--', file); git(repo, 'commit', '-m', 'B checkout fixture');
    const b = git(repo, 'rev-parse', 'HEAD');
    await vscode.commands.executeCommand('notebookGitGutter.refresh');
    await waitFor(() => !state()?.pending && state()?.revision?.startsWith(b + ':') === true &&
      notebook.cellAt(0).document.getText() === 'fast checkout B\n' && state()?.cells?.[0]?.status === 'unchanged', 'HEAD B after immediate refresh', 15_000);
    git(repo, 'checkout', '--detach', a);
    await waitFor(() => !state()?.pending && state()?.revision?.startsWith(a + ':') === true &&
      notebook.cellAt(0).document.getText() === sourceA && state()?.cells?.[0]?.status === 'unchanged', 'checkout A without manual refresh', 15_000);
    git(repo, 'checkout', 'main');
    await waitFor(() => !state()?.pending && state()?.revision?.startsWith(b + ':') === true &&
      notebook.cellAt(0).document.getText() === 'fast checkout B\n' && state()?.cells?.[0]?.status === 'unchanged', 'checkout B again', 15_000);
  });
  await check('oversized current notebooks stop before source capture', async () => {
    const data = new vscode.NotebookData(Array.from({ length: 2001 }, () => new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'x', 'python')));
    const large = await vscode.workspace.openNotebookDocument('jupyter-notebook', data);
    await vscode.window.showNotebookDocument(large);
    await waitFor(() => api.snapshot().notebooks.some(item => item.name === large.uri.path.split('/').at(-1) && !item.pending && item.reason === 'Notebook size limit'), 'current notebook count limit');
    const limited = api.snapshot().notebooks.find(item => item.name === large.uri.path.split('/').at(-1));
    assert.equal(limited?.cachedSources, 0); assert.equal(limited?.computed, 0); assert.equal(limited?.state, 'incomplete');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await vscode.window.showNotebookDocument(notebook);
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
    // Discard the earlier unsaved edit before moving and later reusing its path.
    // A retained dirty tab would otherwise conflict with the fixture's new file.
    await vscode.window.showNotebookDocument(second);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    git(secondRepo, 'mv', '--', 'demo.ipynb', 'renamed.ipynb');
    const renamed = await vscode.workspace.openNotebookDocument(vscode.Uri.file(path.join(secondRepo, 'renamed.ipynb')));
    await vscode.window.showNotebookDocument(renamed);
    const renamedState = () => api.snapshot().notebooks.find(n => n.name === 'renamed.ipynb');
    await waitFor(() => !renamedState()?.pending && renamedState()?.baselineState === 'ready' && renamedState()?.cells?.[0]?.status === 'unchanged', 'Git API rename old path', 15_000);
    await replace(renamed.cellAt(0), 'rename edited');
    await waitFor(() => !renamedState()?.pending && renamedState()?.cells?.[0]?.status === 'modified', 'renamed source edit');
    assert.equal(renamedState()?.cells?.[0]?.changes[0]?.kind, 'modified');
    const builtInGit = await vscode.extensions.getExtension<GitExtension>('vscode.git')?.activate();
    const repository = builtInGit?.getAPI(1).getRepository(renamed.uri); assert.ok(repository);
    const gitSettings = vscode.workspace.getConfiguration('git');
    const previousAutorefresh = gitSettings.inspect<boolean>('autorefresh')?.workspaceValue;
    try {
      await gitSettings.update('autorefresh', false, vscode.ConfigurationTarget.Workspace);
      await renamed.save(); await repository.status();
      const reportedHead = repository.state.HEAD?.commit; assert.ok(reportedHead);
      assert.ok(repository.state.indexChanges.some(change => change.status === Status.INDEX_RENAMED && change.renameUri?.fsPath === renamed.uri.fsPath));
      const reused = JSON.parse(await readFile(renamed.uri.fsPath, 'utf8'));
      reused.cells[0].source = 'unrelated content at the reused old path';
      await writeFile(path.join(secondRepo, 'demo.ipynb'), JSON.stringify(reused));
      git(secondRepo, 'add', '--', 'demo.ipynb', 'renamed.ipynb'); git(secondRepo, 'commit', '-m', 'Rename and reuse path');
      const actualHead = git(secondRepo, 'rev-parse', 'HEAD'); assert.notEqual(actualHead, reportedHead);
      await sleep(150);
      assert.equal(repository.state.HEAD?.commit, reportedHead, 'fixture must retain stale Git API rename evidence');
      await vscode.commands.executeCommand('notebookGitGutter.refresh');
      await waitFor(() => !renamedState()?.pending && renamedState()?.revision?.startsWith(actualHead + ':') === true &&
        renamedState()?.cells?.[0]?.status === 'unchanged', 'stale rename hint must not select reused old source', 15_000);
      assert.equal(repository.state.HEAD?.commit, reportedHead, 'success must not depend on the Git API catching up');
    } finally {
      await gitSettings.update('autorefresh', previousAutorefresh, vscode.ConfigurationTarget.Workspace);
      await repository.status();
    }
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
  await check('notebook diff tabs release both document sessions when the final tab closes', async () => {
    for (const open of vscode.workspace.notebookDocuments) if (open.isDirty) await open.save();
    const before = vscode.Uri.file(path.join(repo, 'diff-before.ipynb'));
    const after = vscode.Uri.file(path.join(repo, 'diff-after.ipynb'));
    for (const [file, source] of [[before, 'before'], [after, 'after']] as const) {
      await writeFile(file.fsPath, JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {},
        cells: [{ cell_type: 'code', id: 'diff-cell', metadata: {}, source, outputs: [], execution_count: null }] }));
    }
    await vscode.commands.executeCommand('vscode.diff', before, after, 'Fixture notebook comparison');
    await waitFor(() => vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputNotebookDiff)), 'native diff tab');
    await waitFor(() => ['diff-before.ipynb', 'diff-after.ipynb'].every(name =>
      api.snapshot().notebooks.some(n => n.name === name && !n.pending)), 'both diff documents analysed');
    // Let the workbench finish constructing its diff view before closing it.
    await sleep(500);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await waitFor(() => api.snapshot().notebooks.length === 0, 'all diff sessions released');
    assert.equal(api.snapshot().cachedBaselines, 0); assert.equal(api.snapshot().repositories, 0);
  });
  await writeFile(path.join(root, '.tmp', process.env.NGG_HOST_RESULTS ?? 'host-results.json'), JSON.stringify({ passed: done, diagnostics: api.snapshot() }, null, 2));
  console.log(`${done.length} extension-host checks passed.`);
}
