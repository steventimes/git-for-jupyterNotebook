import * as vscode from 'vscode';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setup, sleep, waitFor, replace } from './support';
import { record } from '../../src/normalize';

export async function run() {
  const { root, uri, notebook, editor, api, extensionId } = await setup();
  const controller = vscode.notebooks.createNotebookController('ngg-test-kernel', 'jupyter-notebook', 'NGG Test Kernel');
  controller.supportedLanguages = ['python'];
  controller.updateNotebookAffinity(notebook, vscode.NotebookControllerAffinity.Preferred);
  const first = notebook.cellAt(0);
  const source = first.document.getText();
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  const getState = () => ({ diagnostics: api.snapshot(), dirty: notebook.isDirty,
    visible: vscode.window.visibleTextEditors.map(e => e.document.uri.toString()),
    notebookEditors: vscode.window.visibleNotebookEditors.length, baselineRestored: first.document.getText() === source,
    activeCell: vscode.window.activeTextEditor?.document.uri.toString(), focused: vscode.window.state.focused });
  await writeFile(path.join(root, '.tmp/ui-ready.json'), JSON.stringify(getState()));
  let lastRequest = 0;
  try {
    for (let tick = 0; tick < 6000; tick++) {
      await sleep(100);
      await writeFile(path.join(root, '.tmp/ui-live.json'), JSON.stringify(getState()));
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
            await vscode.commands.executeCommand('notebook.selectKernel', { id: controller.id, extension: extensionId });
            const execution = controller.createNotebookCellExecution(first);
            execution.start(Date.now()); execution.executionOrder = 2;
            await execution.replaceOutput([new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text('New synthetic output, no Python kernel needed.\n')])]);
            execution.end(true, Date.now()); break;
          }
          case 'disable': case 'enable': await vscode.commands.executeCommand('notebookGitGutter.toggle'); break;
          case 'refresh': await vscode.commands.executeCommand('notebookGitGutter.refresh'); break;
          case 'light': case 'dark': case 'contrast': case 'contrast-light': {
            const names: Record<string, string> = { light: 'Default Light Modern', dark: 'Default Dark Modern', contrast: 'Default High Contrast', 'contrast-light': 'Default High Contrast Light' };
            await vscode.workspace.getConfiguration('workbench').update('colorTheme', names[request.action], vscode.ConfigurationTarget.Global); break;
          }
          case 'breakpoint':
            await replace(first, source.replace('Notebook 0', 'Breakpoint'));
            vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(new vscode.Location(first.document.uri, new vscode.Position(0, 0)))]); break;
          case 'clear-source': await replace(first, ''); break;
          case 'restore-source': await replace(first, source); break;
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
            await writeFile(path.join(root, '.tmp/ui-response.json'), JSON.stringify({ id: request.id, ...getState() })); return;
          default: throw new Error('Unknown UI fixture request');
        }
        await sleep(700);
        await waitFor(() => !api.snapshot().notebooks[0]?.pending, 'UI analysis');
        await writeFile(path.join(root, '.tmp/ui-response.json'), JSON.stringify({ id: request.id, ...getState() }));
      } catch (error) {
        await writeFile(path.join(root, '.tmp/ui-response.json'), JSON.stringify({ id: request.id, error: String(error), ...getState() }));
        throw error;
      }
    }
    throw new Error('UI driver timed out');
  } finally { controller.dispose(); }
}
