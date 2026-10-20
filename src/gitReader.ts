import { execFile } from 'node:child_process';
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { NotebookFormatError, NotebookLimitError, parseNotebook, SourceCell } from './normalize';

export type BaselineMode = 'HEAD' | 'index';
export type Baseline =
  | { kind: 'ready'; cells: SourceCell[]; revision: string; path: string }
  | { kind: 'missing'; reason: 'unborn' | 'path-absent' | 'intent-to-add'; revision: string }
  | { kind: 'error'; code: string };
const MAX_BYTES = 8 * 1024 * 1024;
export class BaselineReadError extends Error { constructor(readonly code: string) { super(code); } }
class GitFailure extends Error {
  constructor(readonly code: number | string, readonly command: string) { super(`Git ${command} failed (${code})`); }
}

export function gitEnvironment(): NodeJS.ProcessEnv {
  // Do not inherit another repository's context, injected config or trace destinations.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  return { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', LC_ALL: 'C',
    // Older Git versions ignore NO_LAZY_FETCH; an empty protocol allowlist also blocks their transports/helpers.
    GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_PROTOCOL_FROM_USER: '0' };
}

export class GitReader {
  calls = 0;
  blobReads = 0;
  blobHits = 0;
  private readonly blobs = new Map<string, SourceCell[]>();
  private readonly loading = new Map<string, Promise<SourceCell[]>>();
  private blobChars = 0;
  private generation = 0;
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  peakActive = 0;
  get activeCalls(): number { return this.active; }
  get queuedCalls(): number { return this.waiting.length; }
  clear(root?: string): void {
    this.generation++;
    for (const [key, cells] of this.blobs) if (!root || key.startsWith(root + '\0')) {
      this.blobs.delete(key); this.blobChars -= cells.reduce((n, cell) => n + cell.source.length, 0);
    }
    this.loading.clear();
  }
  private blob(root: string, object: string): Promise<SourceCell[]> {
    const key = root + '\0' + object;
    const cached = this.blobs.get(key);
    if (cached) { this.blobHits++; return Promise.resolve(cached); }
    const pending = this.loading.get(key); if (pending) return pending;
    const generation = this.generation;
    const task = (async () => {
      const size = Number((await this.run(root, ['cat-file', '-s', object])).trim());
      if (!Number.isSafeInteger(size) || size < 0) throw new BaselineReadError('invalid-object-size');
      if (size > MAX_BYTES) throw new BaselineReadError('baseline-too-large');
      this.blobReads++;
      const cells = parseNotebook(await this.run(root, ['cat-file', 'blob', object]));
      const chars = cells.reduce((n, cell) => n + cell.source.length, 0);
      if (generation === this.generation && chars <= 8_000_000) {
        while (this.blobs.size && (this.blobs.size >= 32 || this.blobChars + chars > 8_000_000)) {
          const oldest = this.blobs.entries().next().value!;
          this.blobs.delete(oldest[0]); this.blobChars -= oldest[1].reduce((n, cell) => n + cell.source.length, 0);
        }
        this.blobs.set(key, cells); this.blobChars += chars;
      }
      return cells;
    })();
    this.loading.set(key, task);
    void task.finally(() => { if (this.loading.get(key) === task) this.loading.delete(key); }).catch(() => {});
    return task;
  }
  constructor(private readonly executable: string) {}
  private async run(root: string, args: string[]): Promise<string> {
    // Bound actual subprocesses across all notebooks, including object reads.
    if (this.waiting.length >= 128) throw new BaselineReadError('git-busy');
    if (this.active >= 4) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.active++;
    this.peakActive = Math.max(this.peakActive, this.active); this.calls++;
    try { return await new Promise<string>((resolve, reject) => {
      execFile(this.executable, ['--no-pager', '--literal-pathspecs', '-c', 'core.fsmonitor=false', ...args], {
        cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: MAX_BYTES, windowsHide: true,
        env: gitEnvironment(),
      }, (error, stdout) => {
        if (error) reject(new GitFailure(error.code ?? (error.killed ? 'timeout' : 'unknown'), args[0] ?? 'unknown'));
        else resolve(stdout);
      });
    }); } finally {
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }
  async rootFor(file: string): Promise<string> {
    return (await this.run(path.dirname(file), ['rev-parse', '--show-toplevel'])).replace(process.platform === 'win32' ? /\r?\n$/ : /\n$/, '');
  }
  private async relative(root: string, file: string): Promise<string> {
    // Canonicalize directories, never a tracked file symlink or its target.
    let directory = path.dirname(file); let suffix = path.basename(file); let physicalFile: string;
    for (;;) {
      try { physicalFile = path.join(await realpath(directory), suffix); break; }
      catch (error) {
        const parent = path.dirname(directory);
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || parent === directory) throw error;
        // A reliable rename can point into a directory that no longer exists.
        // Resolve its nearest existing ancestor and preserve the missing suffix.
        suffix = path.join(path.basename(directory), suffix); directory = parent;
      }
    }
    const relative = path.relative(await realpath(root), physicalFile);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Path is outside the repository');
    }
    return relative.split(path.sep).join('/');
  }
  async resolveHead(root: string): Promise<string | undefined> {
    try { return (await this.run(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'])).trim(); }
    catch (error) {
      if (!(error instanceof GitFailure) || error.code !== 1) throw error;
      // An absent ref on a symbolic HEAD is unborn. A corrupt/unreadable HEAD is an error.
      const ref = (await this.run(root, ['symbolic-ref', '-q', 'HEAD'])).trim();
      try { await this.run(root, ['show-ref', '--verify', '--quiet', ref]); }
      catch (refError) { if (refError instanceof GitFailure && refError.code === 1) return undefined; throw refError; }
      throw error;
    }
  }
  async read(root: string, file: string, mode: BaselineMode, renamedFrom?: string,
    pinnedHead?: { revision: string | undefined }): Promise<Baseline> {
    try {
      let relative = await this.relative(root, file);
      const unmerged = await this.run(root, ['ls-files', '--unmerged', '-z', '--', relative]);
      if (unmerged) return { kind: 'error', code: 'merge-conflict' };
      // A pinned commit must be the same identity used by the caller's cache key.
      const revision = mode === 'HEAD' ? (pinnedHead ? pinnedHead.revision : await this.resolveHead(root)) : 'index';
      if (revision === undefined) return { kind: 'missing', reason: 'unborn', revision: 'unborn' };
      const entry = async (filePath: string) => this.run(root, mode === 'HEAD'
        ? ['ls-tree', '-z', revision, '--', filePath]
        : ['ls-files', '--stage', '-z', '--', filePath]);
      let record = await entry(relative);
      if (!record && renamedFrom && renamedFrom !== file) {
        relative = await this.relative(root, renamedFrom);
        record = await entry(relative);
      }
      if (!record) return { kind: 'missing', reason: 'path-absent', revision };
      const records = record.split('\0').filter(Boolean);
      if (records.length !== 1) return { kind: 'error', code: 'ambiguous-git-entry' };
      const fields = records[0]!.slice(0, records[0]!.indexOf('\t')).split(' ');
      const object = fields[mode === 'HEAD' ? 2 : 1];
      if (!object || !/^[a-f0-9]{40,64}$/.test(object) || !['100644', '100755'].includes(fields[0] ?? '') ||
        (mode === 'index' && fields[2] !== '0')) return { kind: 'error', code: 'unsupported-git-entry' };
      if (mode === 'index') {
        // --debug reads index flags without invoking clean filters or worktree diff.
        // Git documents its format as unstable: recognize it strictly and fail closed.
        const debug = await this.run(root, ['ls-files', '--debug', '-z', '--', relative]);
        const flags = /\bflags: ([a-f0-9]+)\r?\n$/.exec(debug.slice(debug.indexOf('\0') + 1));
        if (!flags) return { kind: 'error', code: 'unsupported-index-flags' };
        if ((Number.parseInt(flags[1]!, 16) & 0x20000000) !== 0) {
          return { kind: 'missing', reason: 'intent-to-add', revision: 'index:intent-to-add' };
        }
      }
      const cells = await this.blob(root, object);
      return { kind: 'ready', cells, revision: `${revision}:${object}`, path: relative };
    } catch (error) {
      if (error instanceof BaselineReadError) return { kind: 'error', code: error.code };
      if (error instanceof SyntaxError) return { kind: 'error', code: 'invalid-json' };
      if (error instanceof NotebookLimitError) return { kind: 'error', code: 'too-many-cells' };
      if (error instanceof NotebookFormatError) return { kind: 'error', code: 'invalid-notebook' };
      return { kind: 'error', code: error instanceof GitFailure && error.code === 'ENOENT' ? 'git-unavailable' : 'git-read-failed' };
    }
  }
}
