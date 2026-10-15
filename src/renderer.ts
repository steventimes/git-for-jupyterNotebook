import * as vscode from 'vscode';
import { LineChange, LineDiff } from './lineDiff';

const kinds = ['added', 'modified', 'deleted'] as const;
export class Renderer implements vscode.Disposable {
  private types: vscode.TextEditorDecorationType[] = [];
  private readonly applied = new Set<vscode.TextEditor>();
  constructor(private readonly extensionUri: vscode.Uri) { this.rebuild(); }
  rebuild(): void {
    this.dispose();
    const theme = vscode.window.activeColorTheme.kind;
    const palette = theme === vscode.ColorThemeKind.HighContrastLight ? 'contrast-light' : theme === vscode.ColorThemeKind.HighContrast
      ? 'contrast' : theme === vscode.ColorThemeKind.Light ? 'light' : 'dark';
    this.types = kinds.map(kind => vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(this.extensionUri, 'media', `${kind}-${palette}.svg`),
      gutterIconSize: 'contain',
      overviewRulerColor: new vscode.ThemeColor(`editorGutter.${kind}Background`),
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    }));
  }
  apply(results: ReadonlyMap<string, LineDiff>, ownedUris: ReadonlySet<string>): void {
    const visible = new Set(vscode.window.visibleTextEditors);
    for (const editor of this.applied) if (!visible.has(editor)) this.applied.delete(editor);
    for (const editor of visible) {
      const diff = results.get(editor.document.uri.toString());
      if (!diff && !this.applied.has(editor) && !ownedUris.has(editor.document.uri.toString())) continue;
      this.types.forEach((type, index) => {
        const options: vscode.DecorationOptions[] = [];
        for (const change of diff?.changes ?? []) {
          if (change.kind !== kinds[index]) continue;
          const hoverMessage = this.hover(change);
          const first = change.kind === 'deleted' ? change.anchor : change.current.start;
          const last = change.kind === 'deleted' ? first + 1 : change.current.end;
          for (let line = first; line < last && line < editor.document.lineCount; line++) {
            if (line >= 0) options.push({ range: editor.document.lineAt(line).range, hoverMessage });
          }
        }
        editor.setDecorations(type, options);
      });
      if (diff) this.applied.add(editor); else this.applied.delete(editor);
    }
  }
  private hover(change: LineChange): vscode.MarkdownString {
    const message = new vscode.MarkdownString();
    message.isTrusted = false;
    message.supportHtml = false;
    const range = change.kind === 'added' ? `Current lines ${change.current.start + 1}–${change.current.end}`
      : `Baseline lines ${change.base.start + 1}–${change.base.end}`;
    message.appendText(`Jupyter Notebook Git Marks: ${change.kind}. ${range}.`);
    if (change.removed) message.appendText(`\n\nPrevious source:\n${change.removed.slice(0, 3000)}${change.removed.length > 3000 ? '\n…' : ''}`);
    return message;
  }
  clear(): void {
    const visible = new Set(vscode.window.visibleTextEditors);
    for (const editor of this.applied) if (visible.has(editor)) for (const type of this.types) editor.setDecorations(type, []);
    this.applied.clear();
  }
  dispose(): void {
    this.clear();
    for (const type of this.types) type.dispose();
    this.types = [];
  }
}
