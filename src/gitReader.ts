import { execFile } from 'node:child_process';
import path from 'node:path';
import { NotebookFormatError, NotebookLimitError, parseNotebook, SourceCell } from './normalize';

export type BaselineMode = 'HEAD' | 'index';
export type Baseline =
  | { kind: 'ready'; cells: SourceCell[]; revision: string; path: string }
  | { kind: 'missing'; reason: 'unborn' | 'path-absent'; revision: string }
  | { kind: 'error'; code: string };
const MAX_BYTES = 8 * 1024 * 1024;
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
  constructor(private readonly executable: string) {}
  private run(root: string, args: string[]): Promise<string> {
    this.calls++;
    return new Promise((resolve, reject) => {
      execFile(this.executable, ['--no-pager', '--literal-pathspecs', '-c', 'core.fsmonitor=false', ...args], {
        cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: MAX_BYTES, windowsHide: true,
        env: gitEnvironment(),
      }, (error, stdout) => {
        if (error) reject(new GitFailure(error.code ?? (error.killed ? 'timeout' : 'unknown'), args[0] ?? 'unknown'));
        else resolve(stdout);
      });
    });
  }
  async rootFor(file: string): Promise<string> {
    return (await this.run(path.dirname(file), ['rev-parse', '--show-toplevel'])).replace(process.platform === 'win32' ? /\r?\n$/ : /\n$/, '');
  }
  private relative(root: string, file: string): string {
    const relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Path is outside the repository');
    }
    return relative.split(path.sep).join('/');
  }
  private async head(root: string): Promise<string | undefined> {
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
  async read(root: string, file: string, mode: BaselineMode, renamedFrom?: string): Promise<Baseline> {
    try {
      let relative = this.relative(root, file);
      const unmerged = await this.run(root, ['ls-files', '--unmerged', '-z', '--', relative]);
      if (unmerged) return { kind: 'error', code: 'merge-conflict' };
      const revision = mode === 'HEAD' ? await this.head(root) : 'index';
      if (revision === undefined) return { kind: 'missing', reason: 'unborn', revision: 'unborn' };
      const entry = async (filePath: string) => this.run(root, mode === 'HEAD'
        ? ['ls-tree', '-z', revision, '--', filePath]
        : ['ls-files', '--stage', '-z', '--', filePath]);
      let record = await entry(relative);
      if (!record && renamedFrom && renamedFrom !== file) {
        relative = this.relative(root, renamedFrom);
        record = await entry(relative);
      }
      if (!record) return { kind: 'missing', reason: 'path-absent', revision };
      const records = record.split('\0').filter(Boolean);
      if (records.length !== 1) return { kind: 'error', code: 'ambiguous-git-entry' };
      const fields = records[0]!.slice(0, records[0]!.indexOf('\t')).split(' ');
      const object = fields[mode === 'HEAD' ? 2 : 1];
      if (!object || !/^[a-f0-9]{40,64}$/.test(object) || !['100644', '100755'].includes(fields[0] ?? '') ||
        (mode === 'index' && fields[2] !== '0')) return { kind: 'error', code: 'unsupported-git-entry' };
      const size = Number((await this.run(root, ['cat-file', '-s', object])).trim());
      if (!Number.isSafeInteger(size) || size < 0) return { kind: 'error', code: 'invalid-object-size' };
      if (size > MAX_BYTES) return { kind: 'error', code: 'baseline-too-large' };
      const content = await this.run(root, ['cat-file', 'blob', object]);
      const cells = parseNotebook(content);
      return { kind: 'ready', cells, revision: `${revision}:${object}`, path: relative };
    } catch (error) {
      if (error instanceof SyntaxError) return { kind: 'error', code: 'invalid-json' };
      if (error instanceof NotebookLimitError) return { kind: 'error', code: 'too-many-cells' };
      if (error instanceof NotebookFormatError) return { kind: 'error', code: 'invalid-notebook' };
      return { kind: 'error', code: error instanceof GitFailure && error.code === 'ENOENT' ? 'git-unavailable' : 'git-read-failed' };
    }
  }
}
