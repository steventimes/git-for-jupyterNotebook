import * as vscode from 'vscode';
import { LineDiff } from './lineDiff';
import type { CellSnapshot } from './analysis';

// One glyph per row: separate decoration types in the same gutter slot can
// conceal each other. Composite icons retain source changes and both boundaries.
const styles = [
  { mask: 1, kind: 'added', suffix: '' }, { mask: 2, kind: 'modified', suffix: '' },
  ...[4, 8, 12].flatMap(boundary => [0, 1, 2].map(source => ({ mask: boundary | source, kind: 'deleted',
    suffix: (boundary === 4 ? '' : boundary === 8 ? '-after' : '-both') + (source === 1 ? '-added' : source === 2 ? '-modified' : '') }))),
];
export class Renderer implements vscode.Disposable {
  submissions = 0;
  diagnostics() { return { decorationSubmissions: this.submissions, rendered: [...this.applied.keys()].map(editor => editor.document.uri.toString()) }; }
  private types: vscode.TextEditorDecorationType[] = [];
  private dirty = new WeakMap<vscode.TextEditor, Set<number>>();
  private readonly applied = new Map<vscode.TextEditor, { diff: LineDiff; version: number; types: Set<number> }>();
  constructor(private readonly extensionUri: vscode.Uri) { this.rebuild(); }
  rebuild(): void {
    this.dispose();
    const theme = vscode.window.activeColorTheme.kind;
    const palette = theme === vscode.ColorThemeKind.HighContrastLight ? 'contrast-light' : theme === vscode.ColorThemeKind.HighContrast
      ? 'contrast' : theme === vscode.ColorThemeKind.Light ? 'light' : 'dark';
    this.types = styles.map(style => vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(this.extensionUri, 'media', `${style.kind}-${palette}${style.suffix}.svg`),
      gutterIconSize: '100% 100%',
      overviewRulerColor: new vscode.ThemeColor(`editorGutter.${style.kind}Background`),
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    }));
  }
  apply(results: ReadonlyMap<string, CellSnapshot>): void {
    const visible = new Set(vscode.window.visibleTextEditors);
    for (const editor of this.applied.keys()) if (!visible.has(editor)) this.applied.delete(editor);
    for (const editor of visible) {
      const result = results.get(editor.document.uri.toString());
      const diff = result?.version === editor.document.version && result.analysis.diff.state === 'ready' ? result.analysis.diff : undefined;
      const previous = this.applied.get(editor);
      if (!diff && !previous && !this.dirty.has(editor)) continue;
      if (diff && previous?.diff === diff && previous.version === editor.document.version) continue;
      const marks = new Map<number, number>();
      for (const change of diff?.changes ?? []) {
        const first = change.kind === 'deleted' ? change.anchor : change.current.start;
        const last = change.kind === 'deleted' ? first + 1 : change.current.end;
        const mask = change.kind === 'added' ? 1 : change.kind === 'modified' ? 2 : change.anchorSide === 'after' ? 8 : 4;
        for (let line = Math.max(0, first); line < last && line < editor.document.lineCount; line++) marks.set(line, (marks.get(line) ?? 0) | mask);
      }
      const previousTypes = previous?.types ?? this.dirty.get(editor);
      const active = new Set<number>();
      this.types.forEach((type, index) => {
        const options: vscode.DecorationOptions[] = [];
        for (const [line, mask] of marks) if (mask === styles[index]!.mask) options.push({ range: editor.document.lineAt(line).range });
        if (options.length || previousTypes?.has(index)) { editor.setDecorations(type, options); this.submissions++; }
        if (options.length) active.add(index);
      });
      if (diff) { this.applied.set(editor, { diff, version: editor.document.version, types: active }); this.dirty.set(editor, active); }
      else { this.applied.delete(editor); this.dirty.delete(editor); }
    }
  }
  clear(): void {
    const visible = new Set(vscode.window.visibleTextEditors);
    for (const [editor, state] of this.applied) if (visible.has(editor)) for (const index of state.types) editor.setDecorations(this.types[index]!, []);
    this.applied.clear();
  }
  dispose(): void {
    this.clear();
    for (const type of this.types) type.dispose();
    this.types = []; this.dirty = new WeakMap();
  }
}
