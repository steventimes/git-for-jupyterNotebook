import * as vscode from 'vscode';
import { CellSnapshot } from './analysis';
import { LineChange } from './lineDiff';
import { record } from './normalize';

const PREVIEW_CHARS = 4000;
export function changesAt(snapshot: CellSnapshot, line: number): LineChange[] {
  return snapshot.analysis.diff.changes.filter(change => change.kind === 'deleted'
    ? change.anchor === line : change.current.start <= line && line < change.current.end);
}
export function changePreview(change: LineChange, document: vscode.TextDocument): vscode.MarkdownString {
  const message = new vscode.MarkdownString();
  message.isTrusted = false; message.supportHtml = false;
  message.appendText(`Jupyter Notebook Git Marks: ${change.kind}.`);
  if (change.kind === 'deleted') {
    const location = change.anchorSide === 'after' ? `after current line ${change.anchor + 1}`
      : change.anchor === 0 ? 'at the start of this cell' : `between current lines ${change.anchor} and ${change.anchor + 1}`;
    message.appendText(`\nDeletion ${location}. The adjacent current line is not deleted.`);
  }
  const appendSource = (heading: string, source: string, truncated = source.length > PREVIEW_CHARS) => {
    let end = Math.min(source.length, PREVIEW_CHARS);
    if (end < source.length && /[\uD800-\uDBFF]/.test(source[end - 1]!)) end--;
    message.appendMarkdown(`\n\n**${heading}**\n\n`);
    // The native Markdown renderer escapes embedded code fences; no trusted HTML
    // or command links are constructed from either Git or current source.
    message.appendCodeblock(source.slice(0, end), document.languageId);
    if (truncated) message.appendText('\nPreview truncated.');
    else if (source && !source.endsWith('\n')) message.appendText('\nNo trailing newline.');
  };
  if (change.removed) appendSource(change.kind === 'deleted' ? 'Deleted source' : 'Original source', change.removed);
  if (change.kind !== 'deleted') {
    const first = document.offsetAt(new vscode.Position(change.current.start, 0));
    const last = document.offsetAt(new vscode.Position(change.current.end, 0));
    const end = Math.min(last, first + PREVIEW_CHARS + 1);
    appendSource('Current source', document.getText(new vscode.Range(document.positionAt(first), document.positionAt(end))), last - first > PREVIEW_CHARS);
  }
  return message;
}
export class ChangeDetails implements vscode.HoverProvider, vscode.Disposable {
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private request = 0;
  constructor(private readonly getResult: (uri: string) => CellSnapshot | undefined,
    private readonly getCell: (uri: string) => vscode.NotebookCell | undefined, private readonly onError: () => void) {}
  private current(document: vscode.TextDocument): CellSnapshot | undefined {
    const result = this.getResult(document.uri.toString());
    return result?.version === document.version && result.analysis.diff.state === 'ready' ? result : undefined;
  }
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const result = this.current(document); if (!result) return undefined;
    const changes = changesAt(result, position.line); if (!changes.length) return undefined;
    return new vscode.Hover(changes.map(change => changePreview(change, document)), document.lineAt(position.line).range);
  }
  show(context: unknown): void {
    if (this.disposed) return;
    const request = ++this.request;
    if (this.timer) clearTimeout(this.timer);
    // Let the native context menu finish releasing focus before opening a hover.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.disposed) void this.open(context, request).catch(() => { if (!this.disposed && request === this.request) this.onError(); });
    }, 0);
  }
  dispose(): void { this.disposed = true; if (this.timer) clearTimeout(this.timer); }
  private async open(context: unknown, request: number): Promise<void> {
    // Public editor/lineNumber/context supplies { uri, lineNumber }, one-based.
    if (!record(context) || !(context.uri instanceof vscode.Uri) || !Number.isInteger(context.lineNumber) ||
      typeof context.lineNumber !== 'number' || context.lineNumber < 1) return;
    const key = context.uri.toString(); const cell = this.getCell(key); if (!cell) return;
    const result = this.current(cell.document); const line = context.lineNumber - 1;
    if (!result || line >= cell.document.lineCount || !changesAt(result, line).length) {
      vscode.window.setStatusBarMessage('No analysed Git change at this line. Analysis may still be pending.', 2500); return;
    }
    const editors = vscode.window.visibleTextEditors.filter(editor => editor.document.uri.toString() === key);
    if (!editors.length) return;
    const notebooks = vscode.window.visibleNotebookEditors.filter(editor => editor.notebook === cell.notebook);
    if (!notebooks.length) return;
    // The stable gutter command context has a URI and line, but no split-editor
    // identity. Do not guess a group and open details beside the wrong copy.
    if (notebooks.length > 1) {
      vscode.window.setStatusBarMessage('In split view, hover over the changed source to see details in that editor.', 4000); return;
    }
    const viewColumn = notebooks[0]!.viewColumn;
    await vscode.window.showNotebookDocument(cell.notebook, { viewColumn,
      selections: [new vscode.NotebookRange(cell.index, cell.index + 1)], preserveFocus: false });
    if (this.disposed || request !== this.request || cell.notebook.isClosed || this.current(cell.document) !== result) return;
    await vscode.commands.executeCommand('notebook.cell.edit');
    const editor = vscode.window.activeTextEditor;
    if (this.disposed || request !== this.request || cell.notebook.isClosed || !editor || editor.document.uri.toString() !== key || this.current(editor.document) !== result) return;
    editor.selection = new vscode.Selection(line, 0, line, 0);
    await vscode.commands.executeCommand('editor.action.showHover');
  }
}
