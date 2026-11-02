import { diffArrays, diffLines } from 'diff';
import { normalizeText } from './normalize';

export interface LineRange { start: number; end: number }
export interface LineChange {
  kind: 'added' | 'modified' | 'deleted';
  base: LineRange;
  current: LineRange;
  anchor: number;
  anchorSide?: 'before' | 'after';
  removed: string;
}
export interface LineDiff {
  state: 'ready' | 'incomplete';
  changes: LineChange[];
  reason?: string;
}
export const MAX_CELL_CHARS = 512_000;
export const MAX_CELL_LINES = 20_000;
export function lineDiff(before: string, after: string): LineDiff {
  before = normalizeText(before);
  after = normalizeText(after);
  if (before === after) return { state: 'ready', changes: [] };
  if (before.length + after.length > MAX_CELL_CHARS || before.split('\n').length + after.split('\n').length > MAX_CELL_LINES) {
    return { state: 'incomplete', changes: [], reason: 'Cell size limit' };
  }
  if (!before || !after) {
    const lines = (text: string) => text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
    return { state: 'ready', changes: [{ kind: before ? 'deleted' : 'added',
      base: { start: 0, end: lines(before) }, current: { start: 0, end: lines(after) }, anchor: 0, anchorSide: before ? 'before' : undefined, removed: before }] };
  }
  const chunks = diffLines(before, after, { timeout: 20, maxEditLength: 2000, ignoreNewlineAtEof: true });
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
    const push = (kind: LineChange['kind'], b: number, bn: number, c: number, cn: number, text: string) => {
      changes.push({ kind, base: { start: b, end: b + bn }, current: { start: c, end: c + cn },
        anchor: Math.max(0, Math.min(lastLine, c)), anchorSide: kind === 'deleted' ? (c > lastLine ? 'after' : 'before') : undefined, removed: text });
    };
    // Like VS Code's Git gutter, classify the entire replacement hunk as
    // modified. Line counts do not establish a correspondence between statements.
    if (n && m) push('modified', base, n, current, m, removed!.value);
    else if (m) push('added', base, 0, current, m, '');
    else if (n) push('deleted', base, n, current, 0, removed!.value);
    base += n;
    current += m;
  }
  // Match the final content line independently of its terminator, then retain
  // a real EOF-newline change when that final line is otherwise unchanged.
  const last = chunks.at(-1);
  if (before.endsWith('\n') !== after.endsWith('\n') && last && !last.added && !last.removed) {
    changes.push({ kind: 'modified', base: { start: base - 1, end: base }, current: { start: current - 1, end: current },
      anchor: current - 1, removed: before.match(/[^\n]*\n|[^\n]+$/g)!.at(-1)! });
  }
  return { state: 'ready', changes };
}

// Word boundaries keep unrelated identifiers readable; trimming each edit to
// graphemes exposes changes inside a word without splitting emoji or accents.
export const MAX_TEXT_PREVIEW = 64_000;
export interface TextChange { before: string; after: string; beforeOffset: number; afterOffset: number }
export function changedText(before: string, after: string): TextChange[] | undefined {
  before = normalizeText(before); after = normalizeText(after);
  if (before.length + after.length > MAX_TEXT_PREVIEW) return undefined;
  const words = new Intl.Segmenter('en', { granularity: 'word' });
  const tokenize = (text: string) => Array.from(words.segment(text), part => part.segment);
  const parts = diffArrays(tokenize(before), tokenize(after), { timeout: 10, maxEditLength: 200 });
  if (!parts) return undefined;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const changes: TextChange[] = [];
  let removed = ''; let added = '';
  let beforeOffset = 0; let afterOffset = 0;
  const flush = () => {
    if (!removed && !added) return;
    const old = Array.from(segmenter.segment(removed), part => part.segment);
    const next = Array.from(segmenter.segment(added), part => part.segment);
    let start = 0; let oldEnd = old.length; let newEnd = next.length;
    while (start < oldEnd && start < newEnd && old[start] === next[start]) start++;
    while (oldEnd > start && newEnd > start && old[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
    if (oldEnd > start || newEnd > start) changes.push({ before: old.slice(start, oldEnd).join(''), after: next.slice(start, newEnd).join(''),
      beforeOffset: beforeOffset - removed.length + old.slice(0, start).join('').length,
      afterOffset: afterOffset - added.length + next.slice(0, start).join('').length });
    removed = ''; added = '';
  };
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const value = part.value.join('');
    if (part.removed) removed += value;
    else if (part.added) added += value;
    else if ((removed || added) && /^[ \t]{1,8}$/.test(value) && (parts[i + 1]?.added || parts[i + 1]?.removed)) {
      removed += value; added += value;
    } else flush();
    if (!part.added) beforeOffset += value.length;
    if (!part.removed) afterOffset += value.length;
  }
  flush();
  return changes.length <= 8 && changes.reduce((sum, change) => sum + change.before.length + change.after.length, 0) <= 600 ? changes : undefined;
}

export interface TextExcerpt { start: number; end: number; parts: { text: string; changed: boolean }[] }
// Both sides use the same groups of edits. Offsets identify repeated words;
// grapheme boundaries keep the abbreviated context readable in any script.
export function textContexts(before: string, after: string, edits: TextChange[], contextGraphemes = 24): { before: TextExcerpt; after: TextExcerpt }[] {
  before = normalizeText(before); after = normalizeText(after);
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const boundaries = (text: string) => [...Array.from(segmenter.segment(text), part => part.index), text.length];
  const oldBounds = boundaries(before); const newBounds = boundaries(after);
  const window = (bounds: number[], offset: number, length: number) => {
    const start = bounds.indexOf(offset); const end = bounds.indexOf(offset + length);
    return { start: bounds[Math.max(0, start - contextGraphemes)]!, end: bounds[Math.min(bounds.length - 1, end + contextGraphemes)]! };
  };
  const groups: { old: { start: number; end: number }; next: { start: number; end: number }; edits: TextChange[] }[] = [];
  for (const edit of edits) {
    const old = window(oldBounds, edit.beforeOffset, edit.before.length);
    const next = window(newBounds, edit.afterOffset, edit.after.length);
    const previous = groups.at(-1);
    if (previous && (old.start <= previous.old.end || next.start <= previous.next.end)) {
      previous.old.end = old.end; previous.next.end = next.end; previous.edits.push(edit);
    } else groups.push({ old, next, edits: [edit] });
  }
  const excerpt = (text: string, range: { start: number; end: number }, changes: { offset: number; text: string }[]): TextExcerpt => {
    const parts: TextExcerpt['parts'] = []; let cursor = range.start;
    for (const change of changes) {
      if (change.offset > cursor) parts.push({ text: text.slice(cursor, change.offset), changed: false });
      parts.push({ text: change.text, changed: true }); cursor = change.offset + change.text.length;
    }
    if (cursor < range.end) parts.push({ text: text.slice(cursor, range.end), changed: false });
    return { ...range, parts };
  };
  return groups.map(group => ({
    before: excerpt(before, group.old, group.edits.map(edit => ({ offset: edit.beforeOffset, text: edit.before }))),
    after: excerpt(after, group.next, group.edits.map(edit => ({ offset: edit.afterOffset, text: edit.after }))),
  }));
}
