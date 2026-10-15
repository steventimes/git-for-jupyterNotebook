import * as vscode from 'vscode';
import path from 'node:path';
import type { API, GitExtension, Repository } from '../types/git-api';
import { Status } from '../types/git-api';
import { Baseline, BaselineMode, GitReader } from './gitReader';
import { BaselineCache } from './cache';

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
  return normalize(left) === normalize(right);
}

export class GitBaselines implements vscode.Disposable {
  private api?: API;
  private reader?: GitReader;
  private connecting?: Promise<void>;
  private extension?: GitExtension;
  private readonly subscriptions: vscode.Disposable[] = [];
  // Git API getters return new wrapper objects. Repository identity is its root URI.
  private readonly repositories = new Map<string, { serial: number; subscription: vscode.Disposable }>();
  private readonly tickets = new Map<string, object>();
  private readonly notebookRoots = new Map<string, string>();
  private readonly apiSubscriptions: vscode.Disposable[] = [];
  private disposed = false;
  private readonly roots = new Map<string, Promise<string>>();
  private readonly cache = new BaselineCache<Baseline>();
  private readonly keys = new Map<string, string>();
  private readonly changed = new vscode.EventEmitter<string | undefined>();
  readonly onDidChange = this.changed.event;
  constructor() {
    this.subscriptions.push(vscode.extensions.onDidChange(() => { if (!this.api) { this.connecting = undefined; this.changed.fire(undefined); } }));
  }
  private async connect(): Promise<void> {
    if (!vscode.workspace.isTrusted || this.disposed) return;
    if (this.api) return;
    if (!this.connecting) this.connecting = (async () => {
      const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!extension) return;
      const git = await extension.activate();
      if (this.disposed || this.api) return;
      if (this.extension !== git) {
        this.extension = git;
        this.subscriptions.push(git.onDidChangeEnablement(() => {
          this.api = undefined; this.connecting = undefined; this.roots.clear(); this.cache.invalidate(); this.tickets.clear();
          for (const subscription of this.apiSubscriptions.splice(0)) subscription.dispose();
          for (const state of this.repositories.values()) state.subscription.dispose();
          this.repositories.clear(); this.changed.fire(undefined);
        }));
      }
      if (!git.enabled) return;
      const api = git.getAPI(1);
      this.api = api; this.reader = new GitReader(api.git.path);
      this.apiSubscriptions.push(api.onDidOpenRepository(() => { this.roots.clear(); this.changed.fire(undefined); }),
        api.onDidCloseRepository(repository => {
          const key = repository.rootUri.toString();
          this.repositories.get(key)?.subscription.dispose(); this.repositories.delete(key);
          this.roots.clear(); this.cache.invalidate(); this.changed.fire(repository.rootUri.fsPath);
        }), api.onDidChangeState(() => this.changed.fire(undefined)));
    })().catch(() => { this.api = undefined; });
    await this.connecting;
  }
  private watch(repository: Repository): void {
    const key = repository.rootUri.toString();
    if (this.repositories.has(key)) return;
    const state = { serial: 0, subscription: repository.state.onDidChange(() => {
      state.serial++; this.changed.fire(repository.rootUri.fsPath);
    }) };
    this.repositories.set(key, state);
  }
  async get(uri: vscode.Uri, mode: BaselineMode): Promise<Baseline> {
    if (!vscode.workspace.isTrusted) return { kind: 'error', code: 'workspace-untrusted' };
    if (!['file', 'vscode-remote'].includes(uri.scheme)) return { kind: 'error', code: 'unsupported-uri' };
    const notebookKey = uri.toString();
    const ticket = this.tickets.get(notebookKey) ?? {};
    this.tickets.set(notebookKey, ticket);
    const valid = () => !this.disposed && this.tickets.get(notebookKey) === ticket;
    await this.connect();
    if (!valid()) return { kind: 'error', code: 'request-cancelled' };
    const api = this.api; const reader = this.reader;
    if (!api || !reader || !this.extension?.enabled) return { kind: 'error', code: 'git-extension-unavailable' };
    if (api.state !== 'initialized') return { kind: 'error', code: 'git-not-ready' };
    try {
      let rootTask = this.roots.get(notebookKey);
      if (!rootTask) { rootTask = reader.rootFor(uri.fsPath); this.roots.set(notebookKey, rootTask); }
      const root = await rootTask;
      if (!valid()) return { kind: 'error', code: 'request-cancelled' };
      // Resolve the actual root once, so an undiscovered nested repository cannot use its parent baseline.
      const repository = api.repositories.find(repo => samePath(repo.rootUri.fsPath, root)) ?? await api.openRepository(vscode.Uri.file(root));
      if (!valid()) return { kind: 'error', code: 'request-cancelled' };
      if (!repository) return { kind: 'error', code: 'repository-unavailable' };
      this.notebookRoots.set(notebookKey, repository.rootUri.toString());
      this.watch(repository);
      const changes = [...repository.state.indexChanges, ...repository.state.workingTreeChanges];
      const rename = changes.find(change => (change.status === Status.INDEX_RENAMED || change.status === Status.INTENT_TO_RENAME) &&
        change.renameUri?.fsPath === uri.fsPath && change.originalUri.fsPath !== uri.fsPath);
      const conflict = repository.state.mergeChanges.some(change => samePath(change.uri.fsPath, uri.fsPath));
      if (conflict) return { kind: 'error', code: 'merge-conflict' };
      const version = mode === 'HEAD' ? repository.state.HEAD?.commit ?? 'unborn' : String(this.repositories.get(repository.rootUri.toString())?.serial ?? 0);
      const key = JSON.stringify([root, notebookKey, mode, version, rename?.originalUri.fsPath]);
      const previous = this.keys.get(notebookKey);
      if (previous && previous !== key) this.cache.invalidate(previous);
      this.keys.set(notebookKey, key);
      return await this.cache.get(key, () => reader.read(root, uri.fsPath, mode, rename?.originalUri.fsPath));
    } catch { this.roots.delete(notebookKey); return { kind: 'error', code: 'repository-read-failed' }; }
  }
  refresh(): void {
    if (!this.api) this.connecting = undefined;
    this.cache.invalidate(); this.roots.clear(); this.tickets.clear(); this.changed.fire(undefined);
  }
  affects(uri: vscode.Uri, root?: string): boolean {
    const repository = this.api?.getRepository(uri);
    return !root || !repository || samePath(repository.rootUri.fsPath, root);
  }
  release(uri: vscode.Uri): void {
    const key = uri.toString(); const cacheKey = this.keys.get(key);
    this.tickets.delete(key);
    const root = this.notebookRoots.get(key);
    this.notebookRoots.delete(key);
    if (root && ![...this.notebookRoots.values()].includes(root)) {
      this.repositories.get(root)?.subscription.dispose();
      this.repositories.delete(root);
    }
    if (cacheKey) this.cache.invalidate(cacheKey);
    this.keys.delete(key); this.roots.delete(key);
  }
  diagnostics() { return { apiState: this.api?.state ?? 'unavailable', gitEnabled: this.extension?.enabled ?? false,
    repositories: this.repositories.size, repositoryEvents: [...this.repositories.values()].map(state => state.serial),
    cachedBaselines: this.cache.size, gitCalls: this.reader?.calls ?? 0 }; }
  dispose(): void {
    this.disposed = true; this.tickets.clear(); this.notebookRoots.clear();
    this.cache.invalidate(); this.roots.clear(); this.keys.clear();
    for (const state of this.repositories.values()) state.subscription.dispose();
    for (const subscription of this.subscriptions) subscription.dispose();
    for (const subscription of this.apiSubscriptions) subscription.dispose();
    this.repositories.clear(); this.changed.dispose();
  }
}
