import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
  await check('raw/code language changes invalidate source semantics without a text edit', async () => {
    await replace(notebook.cellAt(0), 'changed'); await settled();
    const runs = state()?.runs;
    await vscode.languages.setTextDocumentLanguage(notebook.cellAt(0).document, 'plaintext'); await sleep(350);
    assert.equal(state()?.runs, runs, 'code-to-code language changes do not recalculate source');
    assert.equal(state()?.summaries[0]?.items[0], 'Git: modified');
    await vscode.languages.setTextDocumentLanguage(notebook.cellAt(0).document, 'raw');
    await waitFor(() => !state()?.pending && state()?.cells?.[0]?.status === 'uncertain', 'raw language event');
    await vscode.languages.setTextDocumentLanguage(notebook.cellAt(0).document, 'python');
    await waitFor(() => !state()?.pending && state()?.cells?.[0]?.status === 'modified', 'code language event');
    await replace(notebook.cellAt(0), original); await settled();
  });
  await check('native hover previews preserve source safely and reject stale results', async () => {
    const cell = notebook.cellAt(0);
    const previews = async () => {
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', cell.document.uri, new vscode.Position(0, 0));
      return (hovers ?? []).flatMap(hover => hover.contents).filter((content): content is vscode.MarkdownString =>
        content instanceof vscode.MarkdownString && content.value.replace(/&nbsp;/g, ' ').includes('Jupyter Notebook Git Marks:'));
    };
    const payload = '```\n[run](command:notebookGitGutter.toggle)\n<script>untrusted</script>';
    await replace(cell, payload); await settled();
    const content = (await previews())[0]; assert.ok(content);
    assert.equal(content.isTrusted, false); assert.equal(content.supportHtml, false);
    assert.ok(content.value.includes('Original source')); assert.ok(content.value.includes('Current source'));
    assert.ok(content.value.includes('name = "Notebook 0"')); assert.ok(content.value.includes(payload));
    assert.ok(content.value.includes('````python'), 'embedded source fences cannot escape the code block');
    assert.ok(content.value.replace(/&nbsp;/g, ' ').includes('No trailing newline.'));
    await replace(cell, 'x'.repeat(3999) + '😀tail'); await settled();
    const bounded = (await previews())[0]; assert.ok(bounded);
    assert.ok(bounded.value.replace(/&nbsp;/g, ' ').includes('Preview truncated.'));
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(bounded.value), 'preview limits cannot split a Unicode surrogate pair');
    const settings = vscode.workspace.getConfiguration('notebookGitGutter');
    await settings.update('debounceMs', 1000, vscode.ConfigurationTarget.Workspace); await settled();
    await replace(cell, 'newer source');
    assert.deepEqual(await previews(), [], 'pending results must not expose a previous version preview');
    await replace(cell, original); await settings.update('debounceMs', 200, vscode.ConfigurationTarget.Workspace); await settled();
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
  await check('failed HEAD baselines stay quiet while typing and recover on repository events', async () => {
    const originalText = notebook.cellAt(0).document.getText();
    const broken = path.join(repo, '.git', 'broken-notebook'); await writeFile(broken, '{broken');
    const object = git(repo, 'hash-object', '-w', '--', broken);
    git(repo, 'update-index', '--cacheinfo', `100644,${object},demo.ipynb`);
    git(repo, 'commit', '-m', 'broken baseline fixture');
    await waitFor(() => !state()?.pending && state()?.reason === 'invalid-json', 'invalid HEAD reported');
    assert.equal(state()?.cachedSources, 0, 'unavailable baselines must not capture current source');
    await sleep(800); const calls = api.snapshot().gitCalls; const runs = state()?.runs ?? 0;
    for (let i = 0; i < 3; i++) { await replace(notebook.cellAt(0), `typing while unavailable ${i}`); await settled(); }
    assert.equal(api.snapshot().gitCalls, calls, 'a failed baseline must not run Git on every input');
    assert.equal((state()?.runs ?? 0) - runs, 3, 'each input still updates analysis state');
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
