import * as vscode from 'vscode';
import { CellSnapshot } from '../notebook/analysis';
import { changedText, LineChange, MAX_TEXT_PREVIEW, textContexts, TextExcerpt } from '../notebook/lineDiff';
import { normalizeText, record } from '../notebook/normalize';

const PREVIEW_CHARS = 4000;
export function changesAt(snapshot: CellSnapshot, line: number): LineChange[] {
  return snapshot.analysis.diff.changes.filter(change => change.kind === 'deleted'
    ? change.anchor === line : change.current.start <= line && line < change.current.end);
}
// Only fixed tags and VS Code theme identifiers are emitted as markup. Source
// is escaped as HTML text inside <pre>; it cannot create elements or links.
const htmlText = (source: string) => source.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function changePreview(change: LineChange, document: vscode.TextDocument): vscode.MarkdownString {
  const message = new vscode.MarkdownString();
  message.isTrusted = false; message.supportHtml = true;
  let current = ''; let truncated = false;
  if (change.kind !== 'deleted') {
    const first = document.offsetAt(new vscode.Position(change.current.start, 0));
    const last = document.offsetAt(new vscode.Position(change.current.end, 0));
    const limit = change.kind === 'modified' ? MAX_TEXT_PREVIEW : PREVIEW_CHARS;
    current = normalizeText(document.getText(new vscode.Range(document.positionAt(first), document.positionAt(Math.min(last, first + limit + 1)))));
    truncated = last - first > limit;
  }
  const edits = change.kind === 'modified' && !truncated ? changedText(change.removed, current) : undefined;
  const span = (content: string, color: string) => {
    // High contrast themes use diff borders instead of translucent backgrounds.
    // Reuse that color for text: borders are not allowed by hover sanitization.
    const foreground = color.endsWith('TextBackground') ? `color:var(--vscode-diffEditor-${color.replace('Background', 'Border')});` : '';
    return `<span style="${foreground}background-color:var(--vscode-diffEditor-${color});">${content}</span>`;
  };
  const renderedRows = { removed: 0, inserted: 0 };
  // A large original must not consume the current side's entire preview.
  const rowLimit = change.kind === 'modified' ? 200 : 400;
  const rows = (fragment: TextExcerpt, source: string, side: 'removed' | 'inserted') => {
    const lines = [''];
    if (fragment.start > 0) lines[0] = '…';
    for (const part of fragment.parts) {
      const pieces = part.text.split('\n');
      for (let i = 0; i < pieces.length; i++) {
        if (i) lines.push('');
        const text = htmlText(pieces[i]!);
        lines[lines.length - 1] += part.changed && text ? span(`<b>${text}</b>`, `${side}TextBackground`) : text;
      }
    }
    if (fragment.end < source.length) lines[lines.length - 1] += '…';
    else if (source.endsWith('\n') && lines.at(-1) === '') lines.pop();
    const prefix = side === 'removed' ? '- ' : '+ ';
    const visible = lines.slice(0, Math.max(0, rowLimit - renderedRows[side]));
    renderedRows[side] += visible.length;
    if (visible.length < lines.length) truncated = true;
    return visible.map(line => span(prefix + line, `${side}LineBackground`)).join('\n');
  };
  const sections: string[] = [];
  if (edits?.length) {
    const focused = change.removed.length > PREVIEW_CHARS || current.length > PREVIEW_CHARS ||
      [change.removed, current].some(source => source.split('\n').some(line => line.length > 160));
    for (const context of textContexts(change.removed, current, edits, focused ? 24 : MAX_TEXT_PREVIEW)) {
      sections.push(rows(context.before, change.removed, 'removed') + '\n' + rows(context.after, current, 'inserted'));
    }
  } else {
    const excerpt = (source: string): TextExcerpt => {
      let end = Math.min(source.length, PREVIEW_CHARS);
      if (end < source.length && /[\uD800-\uDBFF]/.test(source[end - 1]!)) end--;
      return { start: 0, end, parts: [{ text: source.slice(0, end), changed: false }] };
    };
    if (change.removed) sections.push(rows(excerpt(change.removed), change.removed, 'removed'));
    if (change.kind !== 'deleted') sections.push(rows(excerpt(current), current, 'inserted'));
  }
  message.appendMarkdown('<pre><code>' + sections.join('\n') + '</code></pre>');
  if (truncated) message.appendText('\nPreview truncated.');
  if (edits === undefined) {
    if (!truncated && (change.removed.length > PREVIEW_CHARS || current.length > PREVIEW_CHARS)) message.appendText('\nPreview truncated.');
    else if (!truncated && ((change.removed && !change.removed.endsWith('\n')) || (current && !current.endsWith('\n')))) message.appendText('\nNo trailing newline.');
    if (change.kind === 'modified') message.appendText('\nWord preview limit; showing source.');
  } else if (change.removed.endsWith('\n') !== current.endsWith('\n')) {
    message.appendText(`\nNo trailing newline in ${current.endsWith('\n') ? 'original' : 'current'} source.`);
  }
  if (change.kind === 'deleted') {
    const location = change.anchorSide === 'after' ? `After line ${change.anchor + 1}.`
      : change.anchor === 0 ? 'At cell start.' : `Between lines ${change.anchor} and ${change.anchor + 1}.`;
    message.appendText(`\n${location}`);
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
