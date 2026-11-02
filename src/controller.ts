import * as vscode from 'vscode';
import { Analyzer, Analysis, CellSnapshot, Generation } from './notebook/analysis';
import { ChangeDetails } from './ui/details';
import { GitBaselines } from './git/baselines';
import { Baseline, BaselineMode } from './git/reader';
import { MAX_CELL_CHARS, MAX_CELL_LINES } from './notebook/lineDiff';
import { cellId, MAX_NOTEBOOK_CELLS, MAX_NOTEBOOK_CHARS, normalizeText, record, SourceCell } from './notebook/normalize';
import { Renderer } from './ui/renderer';

interface Config { enabled: boolean; baseline: BaselineMode; debounceMs: number; showCellSummary: boolean }
function config(uri?: vscode.Uri): Config {
  const values = vscode.workspace.getConfiguration('notebookGitGutter', uri);
  const delay = values.get<number>('debounceMs', 200);
  return { enabled: values.get<boolean>('enabled', true), baseline: values.get<string>('baseline', 'HEAD') === 'index' ? 'index' : 'HEAD',
    debounceMs: Number.isFinite(delay) ? Math.min(2000, Math.max(0, delay)) : 200,
    showCellSummary: values.get<boolean>('showCellSummary', true) };
}

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
  'rename-unresolved': 'rename source is unavailable in the selected baseline',
};
const incompleteLabels: Readonly<Record<string, string>> = {
  'Notebook size limit': 'Notebook limit: 2000 cells and 16,000,000 combined source characters.',
  'Cell size limit': 'Cell limit: 512,000 combined source characters and 20,000 combined lines.',
  'Diff computation limit': 'A cell diff exceeded its computation budget.',
  'Notebook computation limit': 'Notebook analysis exceeded its computation budget.',
  'Cell alignment computation limit': 'Cell matching exceeded its computation budget.',
  'Ambiguous cell alignment': 'Some cells could not be matched reliably to the baseline.',
  'Raw cell source is not analysed': 'Raw cells are not analysed.',
};
function incompleteExplanation(analysis: Analysis): string {
  const reasons = new Set([analysis.reason, ...analysis.cells.map(cell => cell.diff.reason)]);
  const descriptions = [...reasons].filter((reason): reason is string => reason !== undefined && reason in incompleteLabels)
    .map(reason => incompleteLabels[reason]);
  const uncertain = analysis.alignment?.uncertainBase.length ?? 0;
  if (uncertain) descriptions.push(`${uncertain} baseline cells could not be matched reliably; they are not counted as deleted.`);
  descriptions.push('Unanalysed cells have no line marks. Use Refresh to retry; ambiguous matches may remain unresolved.');
  return descriptions.join('\n');
}
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
    this.status.name = 'Jupyter Notebook Git Marks';
    const details = new ChangeDetails(uri => this.owners.get(uri)?.results.get(uri), uri =>
      this.owners.get(uri)?.notebook.getCells().find(cell => cell.document.uri.toString() === uri), () => this.logError('change-preview-unavailable'));
    this.status.command = 'notebookGitGutter.showDiagnostics';
    this.subscriptions.push(
      details,
      vscode.languages.registerHoverProvider({ scheme: 'vscode-notebook-cell' }, details),
      vscode.commands.registerCommand('notebookGitGutter.showChange', (context: unknown) => details.show(context)),
      vscode.commands.registerCommand('notebookGitGutter.nextChangeCell', () => this.navigateChange(1)),
      vscode.commands.registerCommand('notebookGitGutter.previousChangeCell', () => this.navigateChange(-1)),
      vscode.workspace.onDidOpenNotebookDocument(notebook => this.open(notebook)),
      vscode.workspace.onDidCloseNotebookDocument(notebook => this.close(notebook)),
      vscode.workspace.onDidChangeTextDocument(event => this.textChanged(event)),
      vscode.workspace.onDidOpenTextDocument(document => this.textOpened(document)),
      vscode.workspace.onDidChangeNotebookDocument(event => this.notebookChanged(event)),
      vscode.workspace.onDidSaveNotebookDocument(notebook => {
        const session = this.sessions.get(notebook.uri.toString());
        if (session) this.queue(session);
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.requestRender()),
      vscode.window.onDidChangeActiveTextEditor(() => this.requestRender()),
      vscode.window.onDidChangeNotebookEditorSelection(() => this.requestRender()),
      vscode.window.onDidChangeNotebookEditorVisibleRanges(() => this.requestRender()),
      vscode.window.onDidChangeVisibleNotebookEditors(editors => {
        for (const editor of editors) this.open(editor.notebook);
        this.requestRender();
      }),
      vscode.window.tabGroups.onDidChangeTabs(event => this.closeTabs(event.closed)),
      vscode.window.tabGroups.onDidChangeTabGroups(event => {
        for (const group of event.closed) this.closeTabs(group.tabs);
      }),
      vscode.window.onDidChangeActiveNotebookEditor(() => this.requestRender()),
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.renderer.rebuild();
        this.requestRender();
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('notebookGitGutter')) {
          this.git.refresh();
          this.cellSummaryChanged.fire();
        }
      }),
      this.git.onDidChange(root => this.baselineChanged(root)),
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
        this.output.clear();
        this.output.appendLine(JSON.stringify(this.snapshot(), null, 2));
        this.output.show(true);
      }),
    );
    for (const notebook of vscode.workspace.notebookDocuments) this.open(notebook);
  }
  private textChanged(event: vscode.TextDocumentChangeEvent): void {
    if (!event.contentChanges.length) return;
    const uri = event.document.uri.toString();
    const owner = this.owners.get(uri);
    if (owner) {
      owner.results.delete(uri);
      this.queue(owner);
    }
  }
  private textOpened(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    const owner = this.owners.get(uri);
    const previous = owner?.sources.get(uri);
    if (owner && previous && (document.languageId === 'raw') !== (previous.cell.kind === 'raw') && previous.cell.kind !== 'markdown') {
      this.queue(owner, undefined, true);
    }
  }
  private notebookChanged(event: vscode.NotebookDocumentChangeEvent): void {
    const session = this.sessions.get(event.notebook.uri.toString());
    if (!session) return;
    if (event.contentChanges.length) {
      this.mapCells(session);
      this.queue(session, undefined, true);
      return;
    }
    const identityChanged = event.cellChanges.some(change => {
      const previous = session.sources.get(change.cell.document.uri.toString())?.cell;
      return previous && ((change.metadata !== undefined && cellId(change.cell.metadata.id) !== previous.id) || sourceKind(change.cell) !== previous.kind);
    });
    if (identityChanged) this.queue(session, undefined, true);
  }
  private baselineChanged(root: string | undefined): void {
    for (const session of this.sessions.values()) {
      if (this.git.affects(session.notebook.uri, root)) this.queue(session, 0, true);
    }
  }
  private closeTabs(tabs: readonly vscode.Tab[]): void {
    for (const tab of tabs) {
      for (const uri of tabUris(tab)) this.closeLastTab(uri);
    }
  }
  private open(notebook: vscode.NotebookDocument): void {
    const key = notebook.uri.toString();
    if (notebook.notebookType !== 'jupyter-notebook' || this.sessions.has(key) || this.disposed) return;
    const session: Session = { notebook, generation: new Generation(), analyzer: new Analyzer(), pending: false,
      runs: 0, computedTotal: 0, sources: new Map(), results: new Map() };
    this.sessions.set(key, session);
    this.mapCells(session);
    this.queue(session, 0);
  }
  private navigateChange(direction: 1 | -1): void {
    const editor = vscode.window.activeNotebookEditor;
    const session = editor && this.sessions.get(editor.notebook.uri.toString());
    if (!editor || !session) {
      void vscode.window.showInformationMessage('Open a Jupyter Notebook to navigate changes.');
      return;
    }
    const settings = config(editor.notebook.uri);
    if (!settings.enabled) {
      void vscode.window.showInformationMessage('Jupyter Notebook Git Marks is disabled.');
      return;
    }
    if (session.pending || !session.analysis) {
      void vscode.window.showInformationMessage('Notebook Git analysis is not ready yet.');
      return;
    }
    if (session.analysis.state === 'error') {
      void vscode.window.showInformationMessage('Notebook Git comparison is unavailable. See diagnostics.');
      return;
    }
    const changed = editor.notebook.getCells().filter(cell => {
      const result = session.results.get(cell.document.uri.toString());
      return result?.version === cell.document.version && result.baselineMode === settings.baseline &&
        result.analysis.status !== 'uncertain' &&
        (result.analysis.status === 'added' || result.analysis.status === 'modified' || result.analysis.moved);
    });
    if (!changed.length) {
      void vscode.window.showInformationMessage(session.analysis.state === 'incomplete'
        ? 'No confirmed changed cells. Notebook Git analysis is incomplete.' : 'No changed cells in the selected baseline.');
      return;
    }
    const current = editor.selection.start;
    const target = direction === 1 ? changed.find(cell => cell.index > current) ?? changed[0]!
      : [...changed].reverse().find(cell => cell.index < current) ?? changed[changed.length - 1]!;
    const range = new vscode.NotebookRange(target.index, target.index + 1);
    editor.selection = range;
    editor.revealRange(range, vscode.NotebookEditorRevealType.InCenterIfOutsideViewport);
  }
  private mapCells(session: Session): void {
    const uris = new Set(session.notebook.getCells().map(cell => cell.document.uri.toString()));
    for (const [uri, owner] of this.owners) {
      if (owner === session && !uris.has(uri)) {
        this.owners.delete(uri);
        session.sources.delete(uri);
        session.results.delete(uri);
      }
    }
    for (const uri of uris) this.owners.set(uri, session);
  }
  private queue(session: Session, delay = config(session.notebook.uri).debounceMs, clear = false): void {
    const generation = session.generation.next();
    if (session.timer) clearTimeout(session.timer);
    if (clear) {
      session.results.clear();
      session.analysis = undefined;
    }
    if (!config(session.notebook.uri).enabled) {
      this.git.release(session.notebook.uri);
      session.pending = false;
      session.analysis = undefined;
      session.results.clear();
      this.requestRender();
      this.cellSummaryChanged.fire();
      return;
    }
    session.pending = true;
    this.cellSummaryChanged.fire();
    session.timer = setTimeout(() => {
      session.timer = undefined;
      void this.analyze(session, generation);
    }, delay);
    this.requestRender();
  }
  private async analyze(session: Session, generation: number): Promise<void> {
    const valid = () => !this.disposed && session.generation.current(generation) && !session.notebook.isClosed;
    try {
      const baselineMode = config(session.notebook.uri).baseline;
      const oversized = session.notebook.cellCount > MAX_NOTEBOOK_CELLS;
      const baseline = oversized ? undefined : await this.git.get(session.notebook.uri, baselineMode);
      if (!valid()) return;
      const sources: SourceCell[] = [];
      const sizeLimit = (): Analysis => ({ state: 'incomplete', reason: 'Notebook size limit', cells: [], computed: 0, elapsedMs: 0 });
      let analysis: Analysis | undefined;
      if (oversized) analysis = sizeLimit();
      else if (baseline?.kind === 'error') analysis = await session.analyzer.analyze(baseline, [], valid);
      else if (baseline) {
        const cells = session.notebook.getCells();
        const limits = cells.map(cell => ({ chars: cell.document.offsetAt(new vscode.Position(cell.document.lineCount, 0)),
          limited: cell.document.lineCount > MAX_CELL_LINES }));
        let chars = baseline.kind === 'ready' ? baseline.cells.reduce((sum, cell) => sum + cell.source.length, 0) : 0;
        for (const limit of limits) {
          limit.limited ||= limit.chars > MAX_CELL_CHARS;
          if (!limit.limited) chars += limit.chars;
        }
        // Check metadata and aggregate size before copying any source strings.
        if (chars > MAX_NOTEBOOK_CHARS) analysis = sizeLimit();
        else for (let i = 0; i < cells.length; i++) {
          if (i % 10 === 9) {
            await new Promise<void>(resolve => setImmediate(resolve));
            if (!valid()) return;
          }
          const cell = cells[i]!;
          const uri = cell.document.uri.toString();
          const id = cellId(cell.metadata.id);
          const kind = sourceKind(cell);
          const previous = session.sources.get(uri);
          if (previous?.version === cell.document.version && previous.cell.id === id && previous.cell.kind === kind) sources.push(previous.cell);
          else {
            const limited = limits[i]!.limited;
            const source: SourceCell = { kind, id, source: limited ? '' : normalizeText(cell.document.getText()), session: uri, limited };
            session.sources.set(uri, { version: cell.document.version, cell: source });
            sources.push(source);
          }
        }
      }
      if (!analysis && baseline) analysis = await session.analyzer.analyze(baseline, sources, valid);
      if (!sources.length) session.sources.clear();
      const versions = new Map([...session.sources].map(([uri, value]) => [uri, value.version]));
      if (!analysis || !valid()) return;
      session.baseline = baseline;
      session.analysis = analysis;
      session.pending = false;
      session.runs++;
      session.computedTotal += analysis.computed;
      session.results.clear();
      for (const cell of analysis.cells) {
        const uri = sources[cell.current]?.session;
        if (uri && baseline) session.results.set(uri, { uri, version: versions.get(uri)!, generation, baseline: baseline.kind === 'error' ? baseline.code : baseline.revision, baselineMode, analysis: cell });
      }
      if (analysis.state === 'error') this.logError(analysis.reason ?? 'analysis-error');
      this.requestRender();
      this.cellSummaryChanged.fire();
    } catch {
      if (!valid()) return;
      session.results.clear();
      session.pending = false;
      session.analysis = { state: 'error', reason: 'analysis-failed', cells: [], computed: 0, elapsedMs: 0 };
      this.logError('analysis-failed');
      this.requestRender();
      this.cellSummaryChanged.fire();
    }
  }
  private logError(code: string): void {
    const now = Date.now();
    if (now - (this.errors.get(code) ?? 0) < 60_000) return;
    this.errors.set(code, now);
    this.output.appendLine(`${new Date(now).toISOString()} ${code}. Use Refresh to retry.`);
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
    if (!session) {
      this.status.hide();
      return;
    }
    const settings = config(session.notebook.uri);
    const analysis = session.analysis;
    const added = analysis?.alignment?.added.length ?? 0;
    const deleted = analysis?.alignment?.deleted.length ?? 0;
    const modified = analysis?.cells.filter(cell => cell.status === 'modified').length ?? 0;
    const moved = analysis?.alignment?.pairs.filter(pair => pair.moved).length ?? 0;
    let label: string;
    let icon: string;
    if (!settings.enabled) {
      label = 'disabled';
      icon = 'circle-slash';
    } else if (session.pending) {
      label = 'analysing…';
      icon = 'sync~spin';
    } else if (analysis?.state === 'error') {
      label = errorLabels[analysis.reason ?? ''] ?? 'comparison unavailable; see diagnostics';
      icon = 'warning';
    } else if (analysis?.state === 'incomplete') {
      label = 'analysis incomplete';
      icon = 'warning';
    } else {
      label = `+${added} ~${modified} −${deleted} cells${moved ? ` ↔${moved}` : ''}`;
      icon = 'git-compare';
    }
    if (!session.pending && analysis?.reason === 'path-absent') label += ' (new / unresolved rename)';
    if (!session.pending && analysis?.reason === 'intent-to-add') label += ' (intent to add)';
    if (!session.pending && analysis?.reason === 'unborn') label += ' (no HEAD)';
    this.status.text = `$(${icon}) JGM ${settings.baseline}: ${label}`;
    this.status.accessibilityInformation = { label: `Jupyter Notebook Git Marks, ${settings.baseline}: ${label}`, role: 'status' };
    const tooltip = ['Jupyter Notebook Git Marks',
      `Baseline: ${settings.baseline}; current source: working copy, including unsaved edits.`];
    if (session.pending) tooltip.push('Analysing current source. Edited cells are temporarily unmarked.');
    else {
      tooltip.push(`Added cells: ${added}; modified cells: ${modified}; deleted cells: ${deleted}; moved cells: ${moved}.`);
      if (analysis?.state === 'incomplete') tooltip.push(incompleteExplanation(analysis));
      if (analysis?.state === 'error') {
        const sizeNote = analysis.reason === 'baseline-too-large' ? 'The size includes outputs and metadata. ' : '';
        tooltip.push(`${errorLabels[analysis.reason ?? ''] ?? 'Comparison unavailable'}. ${sizeNote}Use Refresh to retry after resolving the cause.`);
      }
    }
    tooltip.push('Deleted whole cells appear only in this summary. Click for diagnostics.');
    this.status.tooltip = tooltip.join('\n');
    this.status.show();
  }
  provideCellStatusBarItems(cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem[] {
    const settings = config(cell.notebook.uri);
    if (!settings.enabled || !settings.showCellSummary) return [];
    const session = this.sessions.get(cell.notebook.uri.toString());
    const result = session?.results.get(cell.document.uri.toString());
    const analysis = result?.version === cell.document.version ? result.analysis : undefined;
    if (!analysis || (analysis.status === 'unchanged' && !analysis.moved)) return [];
    const label = analysis.status === 'uncertain' ? 'Git: analysis incomplete' : `Git: ${analysis.status}${analysis.moved ? ', moved' : ''}`;
    const item = new vscode.NotebookCellStatusBarItem(label, vscode.NotebookCellStatusBarAlignment.Left);
    item.tooltip = `Working copy compared with ${result!.baselineMode}. ` +
      (analysis.diff.reason ? incompleteLabels[analysis.diff.reason] ?? analysis.diff.reason : 'Source changes include unsaved edits.');
    return [item];
  }
  snapshot() {
    return { vscode: vscode.version, extension: this.version, remote: vscode.env.remoteName ?? 'local', trusted: vscode.workspace.isTrusted,
      ...this.git.diagnostics(), ...this.renderer.diagnostics(),
      status: { text: this.status.text, tooltip: this.status.tooltip, accessibility: this.status.accessibilityInformation?.label },
      visibleCellEditors: vscode.window.visibleTextEditors.filter(editor => this.owners.has(editor.document.uri.toString())).length,
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
    const key = notebook.uri.toString();
    const session = this.sessions.get(key);
    if (!session) return;
    session.generation.dispose();
    if (session.timer) clearTimeout(session.timer);
    for (const [uri, owner] of this.owners) if (owner === session) this.owners.delete(uri);
    session.results.clear();
    session.sources.clear();
    this.sessions.delete(key);
    this.git.release(notebook.uri);
    this.requestRender();
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
    this.git.dispose();
    this.renderer.dispose();
    this.output.dispose();
    this.status.dispose();
    this.cellSummaryChanged.dispose();
  }
}
