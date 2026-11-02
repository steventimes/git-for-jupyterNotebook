import * as vscode from 'vscode';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setup, sleep, waitFor, replace } from './support';
import { record } from '../../src/notebook/normalize';
import { git } from '../gitFixture';

export async function run() {
  const { root, repo, uri, notebook, editor, api, extensionId } = await setup();
  const controller = vscode.notebooks.createNotebookController('ngg-test-kernel', 'jupyter-notebook', 'NGG Test Kernel');
  controller.supportedLanguages = ['python'];
  controller.updateNotebookAffinity(notebook, vscode.NotebookControllerAffinity.Preferred);
  const first = notebook.cellAt(0);
  const source = first.document.getText();
  let longBaseline = false;
  const commitSource = async () => {
    assert.ok(await notebook.save()); git(repo, 'add', '--', 'demo.ipynb'); git(repo, 'commit', '-m', 'UI source fixture');
    await vscode.commands.executeCommand('notebookGitGutter.refresh');
    await waitFor(() => !api.snapshot().notebooks[0]?.pending && api.snapshot().notebooks[0]?.cells?.[0]?.status === 'unchanged', 'UI fixture baseline');
  };
  const editFirst = async (text: string) => {
    await vscode.window.showNotebookDocument(notebook, { viewColumn: vscode.ViewColumn.One, selections: [new vscode.NotebookRange(0, 1)] });
    await vscode.commands.executeCommand('notebook.cell.edit');
    const active = vscode.window.activeTextEditor;
    assert.equal(active?.document.uri.toString(), first.document.uri.toString()); assert.ok(active);
    assert.ok(await active.edit(edit => edit.replace(new vscode.Range(0, 0, first.document.lineCount, 0), text)));
    assert.ok(first.document.getText() === text, 'Cell editor must preserve the exact fixture source, including Unicode');
  };
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  const getState = () => ({ diagnostics: api.snapshot(), dirty: notebook.isDirty,
    visible: vscode.window.visibleTextEditors.map(e => e.document.uri.toString()),
    notebookEditors: vscode.window.visibleNotebookEditors.length, baselineRestored: first.document.getText() === source,
    activeCell: vscode.window.activeTextEditor?.document.uri.toString(), focused: vscode.window.state.focused });
  const publish = async (name: string, value: object) => {
    const file = path.join(root, '.tmp', `${name}.json`);
    // The browser reads concurrently: never expose a truncated JSON snapshot.
    await writeFile(`${file}.next`, JSON.stringify(value));
    await rename(`${file}.next`, file);
  };
  await publish('ui-ready', getState());
  let lastRequest = 0;
  try {
    for (let tick = 0; tick < 6000; tick++) {
      await sleep(100);
      await publish('ui-live', getState());
      let request: unknown;
      try { request = JSON.parse(await readFile(path.join(root, '.tmp/ui-request.json'), 'utf8')) as unknown; } catch { continue; }
      if (!record(request) || typeof request.id !== 'number' || request.id <= lastRequest || typeof request.action !== 'string') continue;
      lastRequest = request.id;
      try {
        switch (request.action) {
          case 'insert': {
            const data = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'inserted = True', 'python'); data.metadata = { id: 'inserted' };
            const edit = new vscode.WorkspaceEdit(); edit.set(uri, [vscode.NotebookEdit.insertCells(0, [data])]);
            assert.ok(await vscode.workspace.applyEdit(edit)); break;
          }
          case 'remove-insert': {
            const edit = new vscode.WorkspaceEdit(); edit.set(uri, [vscode.NotebookEdit.deleteCells(new vscode.NotebookRange(0, 1))]);
            assert.ok(await vscode.workspace.applyEdit(edit)); break;
          }
          case 'scroll-end': editor.revealRange(new vscode.NotebookRange(35, 36), vscode.NotebookEditorRevealType.AtTop); break;
          case 'scroll-start': editor.revealRange(new vscode.NotebookRange(0, 1), vscode.NotebookEditorRevealType.AtTop); break;
          case 'focus-first': editor.selection = new vscode.NotebookRange(0, 1); await vscode.commands.executeCommand('notebook.cell.edit'); break;
          case 'undo': await vscode.commands.executeCommand('undo'); break;
          case 'split': await vscode.window.showNotebookDocument(notebook, { viewColumn: vscode.ViewColumn.Beside }); break;
          case 'output': {
            const metadata = new vscode.WorkspaceEdit();
            metadata.set(uri, [vscode.NotebookEdit.updateCellMetadata(0, { ...first.metadata, execution_count: 42, metadata: { duration: 100 } })]);
            assert.ok(await vscode.workspace.applyEdit(metadata));
            await vscode.commands.executeCommand('notebook.selectKernel', { id: controller.id, extension: extensionId });
            const execution = controller.createNotebookCellExecution(first);
            execution.start(Date.now()); execution.executionOrder = 2;
            await execution.replaceOutput([new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text('New synthetic output, no Python kernel needed.\n')])]);
            execution.end(true, Date.now()); break;
          }
          case 'disable': case 'enable': await vscode.commands.executeCommand('notebookGitGutter.toggle'); break;
          case 'refresh': await vscode.commands.executeCommand('notebookGitGutter.refresh'); break;
          case 'raw-cell': await vscode.languages.setTextDocumentLanguage(first.document, 'raw'); break;
          case 'code-cell': await vscode.languages.setTextDocumentLanguage(first.document, 'python'); break;
          case 'light': case 'dark': case 'contrast': case 'contrast-light': {
            const names: Record<string, string> = { light: 'Default Light Modern', dark: 'Default Dark Modern', contrast: 'Default High Contrast', 'contrast-light': 'Default High Contrast Light' };
            await vscode.workspace.getConfiguration('workbench').update('colorTheme', names[request.action], vscode.ConfigurationTarget.Global); break;
          }
          case 'breakpoint':
            await replace(first, source.replace('Notebook 0', 'Breakpoint'));
            vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(new vscode.Location(first.document.uri, new vscode.Position(0, 0)))]); break;
          case 'clear-probe-breakpoints': vscode.debug.removeBreakpoints([...vscode.debug.breakpoints]); break;
          case 'delete-last-line': await replace(first, 'name = \"Notebook 0\"\ncount = 3'); break;
          case 'clear-source': await replace(first, ''); break;
          case 'restore-source':
            if (longBaseline) { await editFirst(source); await commitSource(); longBaseline = false; }
            else await replace(first, source);
            break;
          case 'long-line': case 'chinese-preview': {
            const text = request.action === 'long-line'
              ? 'first target=old; ' + 'unchanged words; '.repeat(320) + 'second target=old; ' +
                'unchanged context; '.repeat(240) + 'price=10; owner=👩‍💻; end'
              : '首次目标=旧值；' + '这段上下文保持原样；'.repeat(360) + '第二目标=旧值；数量=10；作者=👩‍💻；结束';
            await editFirst(text); await commitSource(); longBaseline = true;
            const next = text.replace('second target=old', 'second target=new').replace('price=10', 'price=11').replace('owner=👩‍💻', 'owner=👨‍💻')
              .replace('第二目标=旧值', '第二目标=新值').replace('数量=10', '数量=11').replace('作者=👩‍💻', '作者=👨‍💻');
            // Bulk WorkspaceEdit minimization in the minimum host can split a
            // surrogate pair even when switching between the language fixtures.
            await editFirst(next);
            break;
          }
          case 'unsafe-preview': {
            await editFirst('safe original'); await commitSource(); longBaseline = true;
            await editFirst('```\n</code></pre><img src="https://example.invalid/test.png"><script>bad()</script> [run](command:notebookGitGutter.toggle)\n```');
            break;
          }
          case 'markdown': {
            const active = vscode.window.activeNotebookEditor ?? editor;
            active.selection = new vscode.NotebookRange(1, 2);
            active.revealRange(new vscode.NotebookRange(1, 2), vscode.NotebookEditorRevealType.InCenter);
            await sleep(100);
            await vscode.commands.executeCommand('notebook.cell.edit');
            await waitFor(() => vscode.window.visibleTextEditors.some(e => e.document.uri.toString() === notebook.cellAt(1).document.uri.toString()), 'Markdown source editor');
            await replace(notebook.cellAt(1), '# Edited Markdown\nMarkdown source is compared too.'); break;
          }
          case 'markdown-render': await vscode.commands.executeCommand('notebook.quitEditAllCells'); break;
          case 'finish':
            await publish('ui-response', { id: request.id, ...getState() }); return;
          default: throw new Error('Unknown UI fixture request');
        }
        await sleep(700);
        await waitFor(() => !api.snapshot().notebooks[0]?.pending, 'UI analysis');
        await publish('ui-response', { id: request.id, ...getState() });
      } catch (error) {
        await publish('ui-response', { id: request.id, error: String(error), ...getState() });
        throw error;
      }
    }
    throw new Error('UI driver timed out');
  } finally { controller.dispose(); }
}
