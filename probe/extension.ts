import * as vscode from 'vscode';

// Deliberately independent of Git and the product implementation.
export function activate(context: vscode.ExtensionContext) {
  let applications = 0;
  let textEvents = 0;
  let visibleEvents = 0;
  const decorations = ['added', 'modified', 'deleted'].map(kind =>
    vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(context.extensionUri, '..', 'media', `${kind}-dark.svg`),
      gutterIconSize: 'contain',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    }),
  );
  function apply() {
    const cells = new Set(vscode.workspace.notebookDocuments.flatMap(notebook =>
      notebook.getCells().map(cell => cell.document.uri.toString())));
    for (const editor of vscode.window.visibleTextEditors) {
      if (!cells.has(editor.document.uri.toString())) continue;
      decorations.forEach((decoration, line) => {
        editor.setDecorations(decoration, [{
          range: editor.document.lineAt(Math.min(line, editor.document.lineCount - 1)).range,
          hoverMessage: `Probe ${line + 1}: ${editor.document.version}`,
        }]);
      });
      applications++;
    }
  }
  context.subscriptions.push(...decorations,
    vscode.window.onDidChangeVisibleTextEditors(() => { visibleEvents++; apply(); }),
    vscode.window.onDidChangeActiveTextEditor(apply),
    vscode.window.onDidChangeNotebookEditorSelection(apply),
    vscode.window.onDidChangeNotebookEditorVisibleRanges(apply),
    vscode.workspace.onDidChangeTextDocument(() => { textEvents++; apply(); }),
    vscode.workspace.onDidOpenNotebookDocument(apply),
    vscode.workspace.onDidChangeNotebookDocument(apply),
  );
  apply();
  return { snapshot: () => ({
    vscode: vscode.version, applications, textEvents, visibleEvents,
    notebooks: vscode.window.visibleNotebookEditors.length,
    cells: vscode.workspace.notebookDocuments.flatMap(n => n.getCells().map(c => ({
      uri: c.document.uri.toString(), metadataId: typeof c.metadata.id === 'string' ? c.metadata.id : undefined,
    }))),
    editors: vscode.window.visibleTextEditors.map(e => ({ uri: e.document.uri.toString(), version: e.document.version })),
  }) };
}
