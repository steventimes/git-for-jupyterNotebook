import { alignCells, Alignment, CellPair } from './alignment';
import { Baseline } from './gitReader';
import { lineDiff, LineDiff } from './lineDiff';
import { SourceCell } from './normalize';

export interface CellAnalysis { current: number; base?: number; evidence?: CellPair['reason']; status: 'added' | 'modified' | 'unchanged' | 'uncertain'; moved: boolean; diff: LineDiff }
export interface CellSnapshot {
  uri: string; version: number; generation: number; baseline: string; analysis: CellAnalysis;
}
export interface Analysis {
  state: 'ready' | 'incomplete' | 'error'; reason?: string;
  alignment?: Alignment; cells: CellAnalysis[]; computed: number; elapsedMs: number;
}
interface CachedDiff { before: string; after: string; diff: LineDiff }
export class Analyzer {
  private revision?: string;
  private baselineCells?: readonly SourceCell[];
  private sessions = new Map<string, number>();
  private diffs = new Map<string, CachedDiff>();
  async analyze(baseline: Baseline, current: SourceCell[], valid = () => true): Promise<Analysis | undefined> {
    const start = performance.now();
    if (baseline.kind === 'error') return { state: 'error', reason: baseline.code, cells: [], computed: 0, elapsedMs: 0 };
    const revision = baseline.revision;
    const base = baseline.kind === 'ready' ? baseline.cells : [];
    // A new commit with the same normalized cells does not invalidate a session's source identity.
    const unchangedBaseline = this.baselineCells?.length === base.length && base.every((cell, i) => {
      const old = this.baselineCells?.[i];
      return old?.kind === cell.kind && old.id === cell.id && old.source === cell.source;
    });
    const previous = revision === this.revision || unchangedBaseline ? this.sessions : new Map<string, number>();
    const alignment = alignCells(base, current, previous);
    const pairs = new Map(alignment.pairs.map(pair => [pair.current, pair]));
    const added = new Set(alignment.added);
    const cells: CellAnalysis[] = [];
    const nextDiffs = new Map<string, CachedDiff>(); const nextSessions = new Map<string, number>();
    let computed = 0;
    for (let i = 0; i < current.length; i++) {
      if (!valid()) return undefined;
      const cell = current[i]!; const pair = pairs.get(i);
      const before = pair ? base[pair.base]!.source : '';
      const key = cell.session ?? String(i);
      const cached = this.diffs.get(key);
      let diff: LineDiff;
      if (cell.limited) diff = { state: 'incomplete', changes: [], reason: 'Cell size limit' };
      else if (cell.kind === 'raw') diff = { state: 'incomplete', changes: [], reason: 'Raw cell source is not analysed' };
      else if (!pair && !added.has(i)) diff = { state: 'incomplete', changes: [], reason: 'Ambiguous cell alignment' };
      else if (cached?.before === before && cached.after === cell.source) diff = cached.diff;
      else if (performance.now() - start > 150) diff = { state: 'incomplete', changes: [], reason: 'Notebook computation limit' };
      else { diff = lineDiff(before, cell.source); computed++; }
      // Do not permanently cache a time-budget failure; Refresh may finish it.
      if (diff.state === 'ready') nextDiffs.set(key, { before, after: cell.source, diff });
      if (pair && cell.session) nextSessions.set(cell.session, pair.base);
      cells.push({ current: i, base: pair?.base, evidence: pair?.reason, moved: pair?.moved ?? false, diff,
        status: diff.state === 'incomplete' ? 'uncertain' : added.has(i) ? 'added' : diff.changes.length ? 'modified' : 'unchanged' });
      if (i % 10 === 9) await new Promise<void>(resolve => setImmediate(resolve));
    }
    if (!valid()) return undefined;
    this.revision = revision; this.baselineCells = base; this.sessions = nextSessions; this.diffs = nextDiffs;
    return { state: alignment.complete && cells.every(cell => cell.diff.state === 'ready') ? 'ready' : 'incomplete',
      reason: alignment.reason ?? (baseline.kind === 'missing' ? baseline.reason : undefined), alignment, cells, computed, elapsedMs: performance.now() - start };
  }
}
