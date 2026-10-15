export type CellKind = 'code' | 'markdown' | 'raw';
export interface SourceCell { kind: CellKind; source: string; id?: string; session?: string; limited?: boolean }
export const normalizeText = (text: string): string => text.replace(/\r\n/g, '\n');
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function cellId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : undefined;
}
export class NotebookFormatError extends Error {}
export class NotebookLimitError extends NotebookFormatError {}
export function parseNotebook(text: string): SourceCell[] {
  const data: unknown = JSON.parse(text);
  if (!record(data) || data.nbformat !== 4 || !Array.isArray(data.cells)) {
    throw new NotebookFormatError('Expected nbformat 4 with a cells array');
  }
  // Reject oversized cell lists before allocating normalized source records for each cell.
  if (data.cells.length > 2000) throw new NotebookLimitError('Notebook cell count limit (2000)');
  return data.cells.map((value: unknown) => {
    if (!record(value) || typeof value.cell_type !== 'string' || !['code', 'markdown', 'raw'].includes(value.cell_type)) {
      throw new NotebookFormatError('Unsupported cell type');
    }
    const source: unknown = value.source;
    if (!(typeof source === 'string' || (Array.isArray(source) && source.every(s => typeof s === 'string')))) {
      throw new NotebookFormatError('Cell source must be a string or string array');
    }
    return { kind: value.cell_type as CellKind, source: normalizeText(typeof source === 'string' ? source : source.join('')), id: cellId(value.id) };
  });
}
