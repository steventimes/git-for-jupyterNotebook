import * as vscode from 'vscode';
import { Analyzer, Analysis, CellSnapshot } from './analysis';
import { config } from './config';
import { ChangeDetails } from './details';
import { Generation } from './generation';
import { GitBaselines } from './git';
import { Baseline } from './gitReader';
import { MAX_CELL_CHARS } from './lineDiff';
import { cellId, MAX_NOTEBOOK_CELLS, MAX_NOTEBOOK_CHARS, normalizeText, record, SourceCell } from './normalize';
import { Renderer } from './renderer';

function sourceKind(cell: vscode.NotebookCell): SourceCell['kind'] {
  return cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : cell.document.languageId === 'raw' ? 'raw' : 'code';
}
function tabUris(tab: vscode.Tab): vscode.Uri[] {
  return tab.input instanceof vscode.TabInputNotebook ? [tab.input.uri] :
    tab.input instanceof vscode.TabInputNotebookDiff ? [tab.input.original, tab.input.modified] : [];
}
const errorLabels: Readonly<Record<string, string>> = {
  'baseline-too-large': 'baseline exceeds 8 MiB', 'too-many-cells': 'baseline exceeds 2000 cells',
  'merge-conflict': 'comparison paused by merge conflict', 'invalid-json': 'baseline contains invalid JSON',
  'invalid-notebook': 'baseline is not a supported notebook', 'git-not-ready': 'waiting for Git',
  'git-extension-unavailable': 'enable the built-in Git extension', 'git-unavailable': 'Git is unavailable',
  'workspace-untrusted': 'workspace trust required', 'unsupported-uri': 'local or remote workspace required',
  'git-busy': 'Git read queue is full; use Refresh to retry',
};
interface Session {
  notebook: vscode.NotebookDocument; generation: Generation; analyzer: Analyzer;
  timer?: ReturnType<typeof setTimeout>; pending: boolean; runs: number;
  computedTotal: number;
  baseline?: Baseline; analysis?: Analysis;
  sources: Map<string, { version: number; cell: SourceCell }>;
  results: Map<string, CellSnapshot>;
}
export class Controller implements vscode.Disposable, vscode.NotebookCellStatusBarItemProvider {
  private readonly sessions = new Map<string, Session>();
  private readonly owners = new Map<string, Session>();
  private readonly git = new GitBaselines();
  private readonly renderer: Renderer;
  private readonly version: string;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  private readonly output = vscode.window.createOutputChannel('Jupyter Notebook Git Marks');
  private readonly errors = new Map<string, number>();
  private readonly cellSummaryChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeCellStatusBarItems = this.cellSummaryChanged.event;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(context: vscode.ExtensionContext) {
    const manifest: unknown = context.extension.packageJSON;
    this.version = record(manifest) && typeof manifest.version === 'string' ? manifest.version : 'unknown';
    this.renderer = new Renderer(context.extensionUri);
    const details = new ChangeDetails(uri => this.owners.get(uri)?.results.get(uri), uri =>
      this.owners.get(uri)?.notebook.getCells().find(cell => cell.document.uri.toString() === uri), () => this.logError('change-preview-unavailable'));
    this.status.command = 'notebookGitGutter.showDiagnostics';
    this.subscriptions.push(
      details,
      vscode.languages.registerHoverProvider({ scheme: 'vscode-notebook-cell' }, details),
      vscode.commands.registerCommand('notebookGitGutter.showChange', (context: unknown) => details.show(context)),
      vscode.workspace.onDidOpenNotebookDocument(notebook => this.open(notebook)),
      vscode.workspace.onDidCloseNotebookDocument(notebook => this.close(notebook)),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.contentChanges.length) {
          const uri = event.document.uri.toString(); const owner = this.owners.get(uri);
          if (owner) { owner.results.delete(uri); this.queue(owner); }
        }
      }),
      vscode.workspace.onDidOpenTextDocument(document => {
        const uri = document.uri.toString(); const owner = this.owners.get(uri);
        const previous = owner?.sources.get(uri);
        if (owner && previous && (document.languageId === 'raw') !== (previous.cell.kind === 'raw') && previous.cell.kind !== 'markdown') {
          this.queue(owner, undefined, true);
        }
      }),
      vscode.workspace.onDidChangeNotebookDocument(event => {
        const session = this.sessions.get(event.notebook.uri.toString());
        if (!session) return;
        if (event.contentChanges.length) { this.mapCells(session); this.queue(session, undefined, true); }
        else if (event.cellChanges.some(change => {
          const previous = session.sources.get(change.cell.document.uri.toString())?.cell;
          return previous && ((change.metadata !== undefined && cellId(change.cell.metadata.id) !== previous.id) || sourceKind(change.cell) !== previous.kind);
        })) this.queue(session, undefined, true);
      }),
      vscode.workspace.onDidSaveNotebookDocument(notebook => { const session = this.sessions.get(notebook.uri.toString()); if (session) this.queue(session); }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.requestRender()),
      vscode.window.onDidChangeActiveTextEditor(() => this.requestRender()),
      vscode.window.onDidChangeNotebookEditorSelection(() => this.requestRender()),
      vscode.window.onDidChangeNotebookEditorVisibleRanges(() => this.requestRender()),
      vscode.window.onDidChangeVisibleNotebookEditors(editors => { for (const editor of editors) this.open(editor.notebook); this.requestRender(); }),
      vscode.window.tabGroups.onDidChangeTabs(event => {
        for (const tab of event.closed) for (const uri of tabUris(tab)) this.closeLastTab(uri);
      }),
      vscode.window.tabGroups.onDidChangeTabGroups(event => {
        for (const group of event.closed) for (const tab of group.tabs) for (const uri of tabUris(tab)) this.closeLastTab(uri);
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
    if (clear) { session.results.clear(); session.analysis = undefined; }
    if (!config(session.notebook.uri).enabled) {
      this.git.release(session.notebook.uri);
      session.pending = false; session.analysis = undefined; session.results.clear(); this.requestRender(); this.cellSummaryChanged.fire(); return;
    }
    session.pending = true;
    this.cellSummaryChanged.fire();
    session.timer = setTimeout(() => { session.timer = undefined; void this.analyze(session, generation); }, delay);
    this.requestRender();
  }
  private async analyze(session: Session, generation: number): Promise<void> {
    const valid = () => !this.disposed && session.generation.current(generation) && !session.notebook.isClosed;
    try {
      const oversized = session.notebook.cellCount > MAX_NOTEBOOK_CELLS;
      const baseline = oversized ? undefined : await this.git.get(session.notebook.uri, config(session.notebook.uri).baseline);
      if (!valid()) return;
      const sources: SourceCell[] = [];
      const sizeLimit = (): Analysis => ({ state: 'incomplete', reason: 'Notebook size limit', cells: [], computed: 0, elapsedMs: 0 });
      let analysis: Analysis | undefined;
      if (oversized) analysis = sizeLimit();
      else if (baseline?.kind === 'error') analysis = await session.analyzer.analyze(baseline, [], valid);
      else if (baseline) {
        const cells = session.notebook.getCells();
        const limits = cells.map(cell => ({ chars: cell.document.offsetAt(new vscode.Position(cell.document.lineCount, 0)),
          limited: cell.document.lineCount > 20_000 }));
        let chars = baseline.kind === 'ready' ? baseline.cells.reduce((sum, cell) => sum + cell.source.length, 0) : 0;
        for (const limit of limits) {
          limit.limited ||= limit.chars > MAX_CELL_CHARS;
          if (!limit.limited) chars += limit.chars;
        }
        // Check metadata and aggregate size before copying any source strings.
        if (chars > MAX_NOTEBOOK_CHARS) analysis = sizeLimit();
        else for (let i = 0; i < cells.length; i++) {
          if (i % 10 === 9) { await new Promise<void>(resolve => setImmediate(resolve)); if (!valid()) return; }
          const cell = cells[i]!;
          const uri = cell.document.uri.toString(); const id = cellId(cell.metadata.id);
          const kind = sourceKind(cell);
          const previous = session.sources.get(uri);
          if (previous?.version === cell.document.version && previous.cell.id === id && previous.cell.kind === kind) sources.push(previous.cell);
          else {
            const limited = limits[i]!.limited;
            const source: SourceCell = { kind, id, source: limited ? '' : normalizeText(cell.document.getText()), session: uri, limited };
            session.sources.set(uri, { version: cell.document.version, cell: source }); sources.push(source);
          }
        }
      }
      if (!analysis && baseline) analysis = await session.analyzer.analyze(baseline, sources, valid);
      if (!sources.length) session.sources.clear();
      const versions = new Map([...session.sources].map(([uri, value]) => [uri, value.version]));
      if (!analysis || !valid()) return;
      session.baseline = baseline; session.analysis = analysis; session.pending = false; session.runs++;
      session.computedTotal += analysis.computed;
      session.results.clear();
      for (const cell of analysis.cells) {
        const uri = sources[cell.current]?.session;
        if (uri && baseline) session.results.set(uri, { uri, version: versions.get(uri)!, generation, baseline: baseline.kind === 'error' ? baseline.code : baseline.revision, analysis: cell });
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
      this.renderer.apply(new Map([...this.sessions.values()].flatMap(session => [...session.results])));
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
    let label = !settings.enabled ? 'disabled' : session.pending ? 'analysing…' : analysis?.state === 'error' ? (errorLabels[analysis.reason ?? ''] ?? 'comparison unavailable; see diagnostics') :
      analysis?.state === 'incomplete' ? 'analysis incomplete' : `+${added} ~${modified} −${deleted} cells${moved ? ` ↔${moved}` : ''}`;
    if (!session.pending && analysis?.reason === 'path-absent') label += ' (new / unresolved rename)';
    if (!session.pending && analysis?.reason === 'intent-to-add') label += ' (intent to add)';
    if (!session.pending && analysis?.reason === 'unborn') label += ' (no HEAD)';
    this.status.text = `JGM ${settings.baseline}: ${label}`;
    this.status.accessibilityInformation = { label: `Jupyter Notebook Git Marks, ${settings.baseline}: ${label}`, role: 'status' };
    this.status.tooltip = `Jupyter Notebook Git Marks\nAdded cells: ${added}; modified cells: ${modified}; deleted cells: ${deleted}; moved cells: ${moved}.\n` +
      (analysis?.state === 'incomplete' ? `${analysis.reason === 'Notebook size limit' ? 'Limit: 2000 cells and 16,000,000 combined source characters.' : 'Some cell sources could not be reliably analysed.'}\n` : '') +
      'Deleted whole cells appear only in this summary. Click for diagnostics.';
    this.status.show();
  }
  provideCellStatusBarItems(cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem[] {
    if (!config(cell.notebook.uri).enabled || !config(cell.notebook.uri).showCellSummary) return [];
    const session = this.sessions.get(cell.notebook.uri.toString());
    const result = session?.results.get(cell.document.uri.toString());
    const analysis = result?.version === cell.document.version ? result.analysis : undefined;
    if (!analysis || (analysis.status === 'unchanged' && !analysis.moved)) return [];
    const label = analysis.status === 'uncertain' ? 'Git: analysis incomplete' : `Git: ${analysis.status}${analysis.moved ? ', moved' : ''}`;
    const item = new vscode.NotebookCellStatusBarItem(label, vscode.NotebookCellStatusBarAlignment.Left);
    item.tooltip = analysis.diff.reason ?? 'Source changes relative to the selected Git baseline.';
    return [item];
  }
  snapshot() {
    return { vscode: vscode.version, extension: this.version, remote: vscode.env.remoteName ?? 'local', trusted: vscode.workspace.isTrusted,
      ...this.git.diagnostics(), ...this.renderer.diagnostics(), visibleCellEditors: vscode.window.visibleTextEditors.filter(editor => this.owners.has(editor.document.uri.toString())).length,
      notebooks: [...this.sessions.values()].map(session => ({
        name: session.notebook.uri.path.split('/').at(-1), enabled: config(session.notebook.uri).enabled,
        workspaceFolder: vscode.workspace.getWorkspaceFolder(session.notebook.uri)?.name ?? 'outside workspace',
        baseline: config(session.notebook.uri).baseline, baselineState: session.baseline?.kind,
        revision: session.baseline && 'revision' in session.baseline ? session.baseline.revision : undefined,
        summaries: session.notebook.getCells().map(cell => ({ index: cell.index,
          items: this.provideCellStatusBarItems(cell).map(item => item.text) })),
        pending: session.pending, runs: session.runs, cachedSources: session.sources.size, state: session.analysis?.state, reason: session.analysis?.reason,
        hashedChars: session.analysis?.alignment?.hashedChars, computed: session.analysis?.computed, computedTotal: session.computedTotal, elapsedMs: session.analysis?.elapsedMs,
        matched: session.analysis?.alignment?.pairs.length, deletedCells: session.analysis?.alignment?.deleted.length,
        uncertainCells: session.analysis?.alignment?.uncertainCurrent.length,
        cells: session.analysis ? [...session.results.values()].map(result => ({
          uri: result.uri, version: result.version, generation: result.generation, evidence: result.analysis.evidence,
          index: result.analysis.current, base: result.analysis.base, status: result.analysis.status, moved: result.analysis.moved, reason: result.analysis.diff.reason,
          changes: result.analysis.diff.changes.map(({ kind, base, current, anchor, anchorSide }) => ({ kind, base, current, anchor, anchorSide })) })) : undefined,
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
      tabUris(tab).some(candidate => candidate.toString() === key)));
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
