import { createHash } from 'node:crypto';
import { diffArrays, diffChars } from 'diff';
import { cellId, MAX_NOTEBOOK_CELLS, MAX_NOTEBOOK_CHARS, SourceCell } from './normalize';

export interface CellPair { current: number; base: number; reason: 'id' | 'session' | 'exact' | 'sequence' | 'similarity'; moved: boolean }
export interface Alignment {
  pairs: CellPair[]; added: number[]; deleted: number[];
  uncertainCurrent: number[]; uncertainBase: number[]; complete: boolean;
  reason?: string;
  hashedChars?: number;
}
const hashes = new WeakMap<SourceCell, { source: string; kind: SourceCell['kind']; key: string }>();
function groups(keys: readonly (string | undefined)[]): Map<string, number[]> {
  const result = new Map<string, number[]>();
  keys.forEach((key, i) => { if (key !== undefined) { const list = result.get(key) ?? []; list.push(i); result.set(key, list); } });
  return result;
}
// Stable increasing anchors distinguish an insertion from an actual reorder.
function orderedAnchors(pairs: readonly CellPair[]): CellPair[] {
  const tails: number[] = [];
  const previous = new Map<number, number>();
  pairs.forEach((pair, i) => {
    let low = 0; let high = tails.length;
    while (low < high) { const middle = (low + high) >>> 1; if (pairs[tails[middle]!]!.base < pair.base) low = middle + 1; else high = middle; }
    if (low) previous.set(i, tails[low - 1]!);
    tails[low] = i;
  });
  const result: CellPair[] = [];
  let cursor: number | undefined = tails.at(-1);
  while (cursor !== undefined) { result.push(pairs[cursor]!); cursor = previous.get(cursor); }
  return result.reverse();
}
export function alignCells(base: readonly SourceCell[], current: readonly SourceCell[], sessions = new Map<string, number>()): Alignment {
  const deadline = performance.now() + 50;
  let budgetExceeded = false;
  if (base.length > MAX_NOTEBOOK_CELLS || current.length > MAX_NOTEBOOK_CELLS ||
    [...base, ...current].reduce((n, c) => n + c.source.length, 0) > MAX_NOTEBOOK_CHARS) {
    return { pairs: [], added: [], deleted: [], uncertainCurrent: current.map((_, i) => i), uncertainBase: base.map((_, i) => i), complete: false, reason: 'Notebook size limit' };
  }
  const pairs: CellPair[] = [];
  const usedBase = new Set<number>(); const usedCurrent = new Set<number>();
  const bi = groups(base.map(c => cellId(c.id))); const ci = groups(current.map(c => cellId(c.id)));
  const trustworthy = (id: string | undefined) => id !== undefined && cellId(id) !== undefined && (bi.get(id)?.length ?? 0) <= 1 && (ci.get(id)?.length ?? 0) <= 1;
  const compatible = (b: number, c: number) => base[b]!.kind === current[c]!.kind &&
    !(trustworthy(base[b]!.id) && trustworthy(current[c]!.id) && base[b]!.id !== current[c]!.id);
  const match = (b: number, c: number, reason: CellPair['reason']) => {
    if (usedBase.has(b) || usedCurrent.has(c) || !base[b] || !current[c] || !compatible(b, c)) return;
    pairs.push({ base: b, current: c, reason, moved: false }); usedBase.add(b); usedCurrent.add(c);
  };
  for (const [id, indices] of bi) {
    const other = ci.get(id);
    if (indices.length === 1 && other?.length === 1) match(indices[0]!, other[0]!, 'id');
  }
  current.forEach((cell, i) => { const b = cell.session ? sessions.get(cell.session) : undefined; if (b !== undefined) match(b, i, 'session'); });
  let hashedChars = 0;
  const key = (cell: SourceCell, used: boolean): string | undefined => {
    if (used || cell.limited) return undefined;
    const cached = hashes.get(cell);
    if (cached?.source === cell.source && cached.kind === cell.kind) return cached.key;
    hashedChars += cell.source.length;
    const key = `${cell.kind}:${createHash('sha256').update(cell.source).digest('hex')}`;
    hashes.set(cell, { source: cell.source, kind: cell.kind, key });
    return key;
  };
  const bk = base.map((cell, i) => key(cell, usedBase.has(i)));
  const ck = current.map((cell, i) => key(cell, usedCurrent.has(i)));
  const bg = groups(bk); const cg = groups(ck);
  for (const [hash, indices] of bg) {
    const other = cg.get(hash);
    if (indices.length === 1 && other?.length === 1 && base[indices[0]!]!.source === current[other[0]!]!.source) match(indices[0]!, other[0]!, 'exact');
  }
  const anchors = orderedAnchors(pairs.sort((a, b) => a.current - b.current));
  const boundaries = [{ base: -1, current: -1 }, ...anchors, { base: base.length, current: current.length }];
  for (let k = 1; k < boundaries.length; k++) {
    const left = boundaries[k - 1]!; const right = boundaries[k]!;
    const bs: number[] = []; const cs: number[] = [];
    for (let i = left.base + 1; i < right.base; i++) if (!usedBase.has(i)) bs.push(i);
    for (let i = left.current + 1; i < right.current; i++) if (!usedCurrent.has(i)) cs.push(i);
    if (!bs.length || !cs.length) continue;
    if (performance.now() > deadline) { budgetExceeded = true; break; }
    const bcounts = groups(bs.map(i => bk[i])); const ccounts = groups(cs.map(i => ck[i]));
    // A repeated source with unequal multiplicity is ambiguous without session/ID evidence.
    const bkeys = bs.map(i => bcounts.get(bk[i]!)?.length === ccounts.get(bk[i]!)?.length ? bk[i]! : `base:${i}`);
    const ckeys = cs.map(i => bcounts.get(ck[i]!)?.length === ccounts.get(ck[i]!)?.length ? ck[i]! : `current:${i}`);
    const sequence = diffArrays(bkeys, ckeys, { timeout: Math.max(1, Math.min(15, deadline - performance.now())), maxEditLength: 2000 });
    if (!sequence) budgetExceeded = true;
    let b = 0; let c = 0;
    for (const chunk of sequence ?? []) {
      if (chunk.added) c += chunk.count;
      else if (chunk.removed) b += chunk.count;
      else for (let j = 0; j < chunk.count; j++) {
        const baseIndex = bs[b++]!; const currentIndex = cs[c++]!;
        if (base[baseIndex]!.source === current[currentIndex]!.source) match(baseIndex, currentIndex, 'sequence');
      }
    }
  }
  // Compare only bounded residual regions between reliable order anchors. A region
  // must finish all compatible comparisons before any similarity pair is trusted.
  const similarityDeadline = Math.min(deadline, performance.now() + 30);
  const residualAnchors = orderedAnchors(pairs.sort((a, b) => a.current - b.current));
  const residualBounds = [{ base: -1, current: -1 }, ...residualAnchors, { base: base.length, current: current.length }];
  for (let k = 1; k < residualBounds.length; k++) {
    const left = residualBounds[k - 1]!; const right = residualBounds[k]!;
    const bs: number[] = []; const cs: number[] = [];
    for (let i = left.base + 1; i < right.base; i++) if (!usedBase.has(i)) bs.push(i);
    for (let i = left.current + 1; i < right.current; i++) if (!usedCurrent.has(i)) cs.push(i);
    if (!bs.length || !cs.length || bs.length > 12 || cs.length > 12) continue;
    const scores: { b: number; c: number; score: number }[] = [];
    let evaluated = true;
    for (const b of bs) for (const c of cs) {
      if (!compatible(b, c)) continue;
      if (performance.now() > similarityDeadline) { budgetExceeded = true; evaluated = false; break; }
      const before = base[b]!.source; const after = current[c]!.source;
      if (!before || !after) { scores.push({ b, c, score: 0 }); continue; }
      if (before.length + after.length > 8000) { evaluated = false; continue; }
      const changes = diffChars(before, after, { timeout: 2, maxEditLength: 1000 });
      if (!changes) { evaluated = false; budgetExceeded = true; continue; }
      const equal = changes.filter(change => !change.added && !change.removed).reduce((sum, change) => sum + change.count, 0);
      scores.push({ b, c, score: 2 * equal / (Array.from(before).length + Array.from(after).length) });
    }
    if (!evaluated) continue;
    for (const candidate of scores.sort((a, b) => b.score - a.score || a.c - b.c || a.b - b.b)) {
      if (candidate.score < 0.6) continue;
      const rivals = scores.filter(s => s !== candidate && (s.b === candidate.b || s.c === candidate.c));
      if (rivals.some(s => s.score > candidate.score - 0.15)) continue;
      match(candidate.b, candidate.c, 'similarity');
    }
  }
  pairs.sort((a, b) => a.current - b.current);
  const stationary = new Set(orderedAnchors(pairs));
  for (const pair of pairs) pair.moved = !stationary.has(pair);
  const added: number[] = []; const deleted: number[] = [];
  const uncertainCurrent: number[] = []; const uncertainBase: number[] = [];
  const unmatchedB = base.map((_, i) => i).filter(i => !usedBase.has(i));
  const unmatchedC = current.map((_, i) => i).filter(i => !usedCurrent.has(i));
  const candidatesByKind = (indices: number[], cells: readonly SourceCell[]) => {
    const result = new Map<SourceCell['kind'], { untrusted: boolean; ids: Set<string> }>();
    for (const index of indices) {
      const cell = cells[index]!;
      const group = result.get(cell.kind) ?? { untrusted: false, ids: new Set<string>() };
      if (trustworthy(cell.id)) group.ids.add(cell.id!); else group.untrusted = true;
      result.set(cell.kind, group);
    }
    return result;
  };
  const baseCandidates = candidatesByKind(unmatchedB, base); const currentCandidates = candidatesByKind(unmatchedC, current);
  const hasCandidate = (cell: SourceCell, candidates: ReturnType<typeof candidatesByKind>) => {
    const group = candidates.get(cell.kind);
    return group !== undefined && (!trustworthy(cell.id) || group.untrusted || group.ids.has(cell.id!));
  };
  for (const c of unmatchedC) {
    (hasCandidate(current[c]!, baseCandidates) ? uncertainCurrent : added).push(c);
  }
  for (const b of unmatchedB) {
    (hasCandidate(base[b]!, currentCandidates) ? uncertainBase : deleted).push(b);
  }
  return { pairs, added, deleted, uncertainCurrent, uncertainBase, hashedChars, complete: !budgetExceeded && !uncertainCurrent.length && !uncertainBase.length,
    reason: budgetExceeded ? 'Cell alignment computation limit' : undefined };
}
