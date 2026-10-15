import * as vscode from 'vscode';
import { Analyzer, Analysis } from './analysis';
import { config } from './config';
import { Generation } from './generation';
import { GitBaselines } from './git';
import { Baseline } from './gitReader';
import { LineDiff, MAX_CELL_CHARS } from './lineDiff';
import { cellId, normalizeText, record, SourceCell } from './normalize';
import { Renderer } from './renderer';

interface Session {
  notebook: vscode.NotebookDocument; generation: Generation; analyzer: Analyzer;
  timer?: ReturnType<typeof setTimeout>; pending: boolean; runs: number;
  computedTotal: number;
  baseline?: Baseline; analysis?: Analysis;
  sources: Map<string, { version: number; cell: SourceCell }>;
  results: Map<string, LineDiff>;
}
export class Controller implements vscode.Disposable, vscode.NotebookCellStatusBarItemProvider {
  private readonly sessions = new Map<string, Session>();
  private readonly owners = new Map<string, Session>();
  private readonly git = new GitBaselines();
  private readonly renderer: Renderer;
  private readonly version: string;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  private readonly output = vscode.window.createOutputChannel('Notebook Git Gutter');
  private readonly errors = new Map<string, number>();
  private readonly cellSummaryChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeCellStatusBarItems = this.cellSummaryChanged.event;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(context: vscode.ExtensionContext) {
    const manifest: unknown = context.extension.packageJSON;
    this.version = record(manifest) && typeof manifest.version === 'string' ? manifest.version : 'unknown';
    this.renderer = new Renderer(context.extensionUri);
    this.status.command = 'notebookGitGutter.showDiagnostics';
    this.subscriptions.push(
      vscode.workspace.onDidOpenNotebookDocument(notebook => this.open(notebook)),
      vscode.workspace.onDidCloseNotebookDocument(notebook => this.close(notebook)),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.contentChanges.length) { const owner = this.owners.get(event.document.uri.toString()); if (owner) this.queue(owner); }
      }),
      vscode.workspace.onDidChangeNotebookDocument(event => {
        const session = this.sessions.get(event.notebook.uri.toString());
        if (!session) return;
        if (event.contentChanges.length) { this.mapCells(session); this.queue(session); this.requestRender(); }
        else if (event.cellChanges.some(change => change.metadata !== undefined &&
          cellId(change.cell.metadata.id) !== session.sources.get(change.cell.document.uri.toString())?.cell.id)) this.queue(session);
      }),
      vscode.workspace.onDidSaveNotebookDocument(notebook => { const session = this.sessions.get(notebook.uri.toString()); if (session) this.queue(session); }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.requestRender()),
      vscode.window.onDidChangeActiveTextEditor(() => this.requestRender()),
      vscode.window.onDidChangeNotebookEditorSelection(() => this.requestRender()),
      vscode.window.onDidChangeNotebookEditorVisibleRanges(() => this.requestRender()),
      vscode.window.onDidChangeVisibleNotebookEditors(editors => { for (const editor of editors) this.open(editor.notebook); this.requestRender(); }),
      vscode.window.tabGroups.onDidChangeTabs(event => {
        for (const tab of event.closed) if (tab.input instanceof vscode.TabInputNotebook) this.closeLastTab(tab.input.uri);
      }),
      vscode.window.tabGroups.onDidChangeTabGroups(event => {
        for (const group of event.closed) for (const tab of group.tabs) if (tab.input instanceof vscode.TabInputNotebook) this.closeLastTab(tab.input.uri);
      }),
      vscode.window.onDidChangeActiveNotebookEditor(() => this.requestRender()),
      vscode.window.onDidChangeActiveColorTheme(() => { this.renderer.rebuild(); this.requestRender(); }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('notebookGitGutter')) { this.git.refresh(); this.cellSummaryChanged.fire(); }
      }),
      this.git.onDidChange(root => { for (const session of this.sessions.values()) if (this.git.affects(session.notebook.uri, root)) this.queue(session, 0, true); }),
      vscode.notebooks.registerNotebookCellStatusBarItemProvider('jupyter-notebook', this),
      vscode.commands.registerCommand('notebookGitGutter.toggle', async () => {
        const uri = vscode.window.activeNotebookEditor?.notebook.uri;
        const values = vscode.workspace.getConfiguration('notebookGitGutter', uri);
        const target = values.inspect<boolean>('enabled')?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
          : vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
        await values.update('enabled', !config(uri).enabled, target);
      }),
      vscode.commands.registerCommand('notebookGitGutter.refresh', () => this.git.refresh()),
      vscode.commands.registerCommand('notebookGitGutter.showDiagnostics', () => {
        this.output.clear(); this.output.appendLine(JSON.stringify(this.snapshot(), null, 2)); this.output.show(true);
      }),
    );
    for (const notebook of vscode.workspace.notebookDocuments) this.open(notebook);
  }
  private open(notebook: vscode.NotebookDocument): void {
    const key = notebook.uri.toString();
    if (notebook.notebookType !== 'jupyter-notebook' || this.sessions.has(key) || this.disposed) return;
    const session: Session = { notebook, generation: new Generation(), analyzer: new Analyzer(), pending: false,
      runs: 0, computedTotal: 0, sources: new Map(), results: new Map() };
    this.sessions.set(key, session); this.mapCells(session); this.queue(session, 0);
  }
  private mapCells(session: Session): void {
    const uris = new Set(session.notebook.getCells().map(cell => cell.document.uri.toString()));
    for (const [uri, owner] of this.owners) if (owner === session && !uris.has(uri)) {
      this.owners.delete(uri); session.sources.delete(uri); session.results.delete(uri);
    }
    for (const uri of uris) this.owners.set(uri, session);
  }
  private queue(session: Session, delay = config(session.notebook.uri).debounceMs, clear = false): void {
    const generation = session.generation.next();
    if (session.timer) clearTimeout(session.timer);
    if (clear) session.results.clear();
    if (!config(session.notebook.uri).enabled) {
      this.git.release(session.notebook.uri);
      session.pending = false; session.analysis = undefined; session.results.clear(); this.requestRender(); this.cellSummaryChanged.fire(); return;
    }
    session.pending = true;
    session.timer = setTimeout(() => { session.timer = undefined; void this.analyze(session, generation); }, delay);
    this.requestRender();
  }
  private async analyze(session: Session, generation: number): Promise<void> {
    const valid = () => !this.disposed && session.generation.current(generation) && !session.notebook.isClosed;
    try {
      const baseline = await this.git.get(session.notebook.uri, config(session.notebook.uri).baseline);
      if (!valid()) return;
      const sources = session.notebook.getCells().map(cell => {
        const uri = cell.document.uri.toString(); const id = cellId(cell.metadata.id);
        const kind = cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : cell.document.languageId === 'raw' ? 'raw' : 'code';
        const previous = session.sources.get(uri);
        if (previous?.version === cell.document.version && previous.cell.id === id && previous.cell.kind === kind) return previous.cell;
        const limited = cell.document.lineCount > 20_000 || cell.document.offsetAt(new vscode.Position(cell.document.lineCount, 0)) > MAX_CELL_CHARS;
        const source: SourceCell = { kind, id, source: limited ? '' : normalizeText(cell.document.getText()), session: uri, limited };
        session.sources.set(uri, { version: cell.document.version, cell: source }); return source;
      });
      const analysis = await session.analyzer.analyze(baseline, sources, valid);
      if (!analysis || !valid()) return;
      session.baseline = baseline; session.analysis = analysis; session.pending = false; session.runs++;
      session.computedTotal += analysis.computed;
      session.results.clear();
      for (const cell of analysis.cells) {
        const uri = sources[cell.current]?.session;
        if (uri && cell.diff.state === 'ready') session.results.set(uri, cell.diff);
      }
      if (analysis.state === 'error') this.logError(analysis.reason ?? 'analysis-error');
      this.requestRender(); this.cellSummaryChanged.fire();
    } catch {
      if (!valid()) return;
      session.results.clear(); session.pending = false;
      session.analysis = { state: 'error', reason: 'analysis-failed', cells: [], computed: 0, elapsedMs: 0 };
      this.logError('analysis-failed'); this.requestRender(); this.cellSummaryChanged.fire();
    }
  }
  private logError(code: string): void {
    const now = Date.now();
    if (now - (this.errors.get(code) ?? 0) < 60_000) return;
    this.errors.set(code, now); this.output.appendLine(`${new Date(now).toISOString()} ${code}. Use Refresh to retry.`);
  }
  private requestRender(): void {
    if (this.disposed || this.renderTimer) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.renderer.apply(new Map([...this.sessions.values()].flatMap(session => [...session.results])), new Set(this.owners.keys()));
      this.updateStatus();
    }, 0);
  }
  private updateStatus(): void {
    const notebook = vscode.window.activeNotebookEditor?.notebook;
    const session = notebook && this.sessions.get(notebook.uri.toString());
    if (!session) { this.status.hide(); return; }
    const settings = config(session.notebook.uri); const analysis = session.analysis;
    const added = analysis?.alignment?.added.length ?? 0; const deleted = analysis?.alignment?.deleted.length ?? 0;
    const modified = analysis?.cells.filter(cell => cell.status === 'modified').length ?? 0;
    const moved = analysis?.alignment?.pairs.filter(pair => pair.moved).length ?? 0;
    let label = !settings.enabled ? 'disabled' : session.pending ? 'analysing…' : analysis?.state === 'error' ? analysis.reason :
      analysis?.state === 'incomplete' ? '暂未完成分析' : `+${added} ~${modified} −${deleted} cells${moved ? ` ↔${moved}` : ''}`;
    if (!session.pending && analysis?.reason === 'path-absent') label += ' (new / unresolved rename)';
    if (!session.pending && analysis?.reason === 'unborn') label += ' (no HEAD)';
    this.status.text = `NGG ${settings.baseline}: ${label}`;
    this.status.tooltip = `Notebook Git Gutter\nAdded cells: ${added}; modified cells: ${modified}; deleted cells: ${deleted}; moved cells: ${moved}.\n` +
      'Deleted whole cells appear only in this summary. Click for diagnostics.';
    this.status.show();
  }
  provideCellStatusBarItems(cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem[] {
    if (!config(cell.notebook.uri).enabled || !config(cell.notebook.uri).showCellSummary) return [];
    const session = this.sessions.get(cell.notebook.uri.toString());
    const analysis = session?.analysis?.cells[cell.index];
    if (!analysis || (analysis.status === 'unchanged' && !analysis.moved)) return [];
    const label = analysis.status === 'uncertain' ? 'Git: 暂未完成分析' : `Git: ${analysis.status}${analysis.moved ? ', moved' : ''}`;
    const item = new vscode.NotebookCellStatusBarItem(label, vscode.NotebookCellStatusBarAlignment.Left);
    item.tooltip = analysis.diff.reason ?? 'Source changes relative to the selected Git baseline.';
    return [item];
  }
  snapshot() {
    return { vscode: vscode.version, extension: this.version, remote: vscode.env.remoteName ?? 'local', trusted: vscode.workspace.isTrusted,
      ...this.git.diagnostics(), visibleCellEditors: vscode.window.visibleTextEditors.filter(editor => this.owners.has(editor.document.uri.toString())).length,
      notebooks: [...this.sessions.values()].map(session => ({
        name: session.notebook.uri.path.split('/').at(-1), enabled: config(session.notebook.uri).enabled,
        workspaceFolder: vscode.workspace.getWorkspaceFolder(session.notebook.uri)?.name ?? 'outside workspace',
        baseline: config(session.notebook.uri).baseline, baselineState: session.baseline?.kind,
        revision: session.baseline && 'revision' in session.baseline ? session.baseline.revision : undefined,
        pending: session.pending, runs: session.runs, state: session.analysis?.state, reason: session.analysis?.reason,
        computed: session.analysis?.computed, computedTotal: session.computedTotal, elapsedMs: session.analysis?.elapsedMs,
        matched: session.analysis?.alignment?.pairs.length, deletedCells: session.analysis?.alignment?.deleted.length,
        uncertainCells: session.analysis?.alignment?.uncertainCurrent.length,
        cells: session.analysis?.cells.map(cell => ({ index: cell.current, base: cell.base, status: cell.status, moved: cell.moved, reason: cell.diff.reason,
          changes: cell.diff.changes.map(({ kind, base, current, anchor }) => ({ kind, base, current, anchor })) })),
      })) };
  }
  private close(notebook: vscode.NotebookDocument): void {
    const key = notebook.uri.toString(); const session = this.sessions.get(key);
    if (!session) return;
    session.generation.dispose(); if (session.timer) clearTimeout(session.timer);
    for (const [uri, owner] of this.owners) if (owner === session) this.owners.delete(uri);
    session.results.clear(); session.sources.clear(); this.sessions.delete(key); this.git.release(notebook.uri); this.requestRender();
  }
  private closeLastTab(uri: vscode.Uri): void {
    const key = uri.toString();
    const stillOpen = vscode.window.tabGroups.all.some(group => group.tabs.some(tab =>
      tab.input instanceof vscode.TabInputNotebook && tab.input.uri.toString() === key));
    const session = this.sessions.get(key);
    // VS Code may retain NotebookDocument for undo after the final tab closes.
    if (!stillOpen && session) this.close(session.notebook);
  }
  dispose(): void {
    this.disposed = true;
    if (this.renderTimer) clearTimeout(this.renderTimer);
    for (const session of this.sessions.values()) this.close(session.notebook);
    for (const subscription of this.subscriptions) subscription.dispose();
    this.git.dispose(); this.renderer.dispose(); this.output.dispose(); this.status.dispose(); this.cellSummaryChanged.dispose();
  }
}
