import { diffLines } from 'diff';
import { normalizeText } from './normalize';

export interface LineRange { start: number; end: number }
export interface LineChange {
  kind: 'added' | 'modified' | 'deleted';
  base: LineRange;
  current: LineRange;
  anchor: number;
  removed: string;
}
export interface LineDiff {
  state: 'ready' | 'incomplete';
  changes: LineChange[];
  reason?: string;
}
export const MAX_CELL_CHARS = 512_000;
export function lineDiff(before: string, after: string): LineDiff {
  before = normalizeText(before);
  after = normalizeText(after);
  if (before === after) return { state: 'ready', changes: [] };
  if (before.length + after.length > MAX_CELL_CHARS || before.split('\n').length + after.split('\n').length > 20_000) {
    return { state: 'incomplete', changes: [], reason: 'Cell size limit' };
  }
  const chunks = diffLines(before, after, { timeout: 20, maxEditLength: 2000 });
  if (!chunks) return { state: 'incomplete', changes: [], reason: 'Diff computation limit' };
  const changes: LineChange[] = [];
  let base = 0;
  let current = 0;
  const lastLine = after.split('\n').length - 1;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (!chunk.added && !chunk.removed) { base += chunk.count; current += chunk.count; continue; }
    let removed = chunk.removed ? chunk : undefined;
    let added = chunk.added ? chunk : undefined;
    const next = chunks[i + 1];
    if (next && ((chunk.removed && next.added) || (chunk.added && next.removed))) {
      removed ??= next;
      added ??= next;
      i++;
    }
    const n = removed?.count ?? 0;
    const m = added?.count ?? 0;
    const paired = Math.min(n, m);
    const removedLines = removed?.value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    const push = (kind: LineChange['kind'], b: number, bn: number, c: number, cn: number, text: string) => {
      changes.push({ kind, base: { start: b, end: b + bn }, current: { start: c, end: c + cn },
        anchor: Math.max(0, Math.min(lastLine, c)), removed: text });
    };
    if (paired) push('modified', base, paired, current, paired, removedLines.slice(0, paired).join(''));
    if (m > paired) push('added', base + paired, 0, current + paired, m - paired, '');
    if (n > paired) push('deleted', base + paired, n - paired, current + paired, 0, removedLines.slice(paired).join(''));
    base += n;
    current += m;
  }
  return { state: 'ready', changes };
}
