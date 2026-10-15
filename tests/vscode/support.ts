import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { record } from '../../src/normalize';
import type { activate } from '../../src/extension';

type Api = ReturnType<typeof activate>;
export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export async function waitFor(predicate: () => boolean, description: string, timeout = 10_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${description}`);
    await sleep(30);
  }
}
export async function replace(cell: vscode.NotebookCell, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(cell.document.uri, new vscode.Range(0, 0, cell.document.lineCount, 0), text);
  assert.ok(await vscode.workspace.applyEdit(edit));
}
export async function setup() {
  const root = process.env.NGG_ROOT; const repo = process.env.NGG_REPO;
  assert.ok(root && repo);
  const uri = vscode.Uri.file(path.join(repo, 'demo.ipynb'));
  const notebook = await vscode.workspace.openNotebookDocument(uri);
  const editor = await vscode.window.showNotebookDocument(notebook);
  const manifest: unknown = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(record(manifest) && typeof manifest.publisher === 'string' && typeof manifest.name === 'string');
  const extensionId = `${manifest.publisher}.${manifest.name}`;
  const extension = vscode.extensions.getExtension<Api>(extensionId);
  assert.ok(extension);
  const api = await extension.activate();
  assert.equal(api.snapshot().extension, manifest.version);
  await waitFor(() => api.snapshot().notebooks[0]?.state === 'ready' && !api.snapshot().notebooks[0]?.pending, 'initial baseline');
  return { root, repo, uri, notebook, editor, api, extensionId };
}
