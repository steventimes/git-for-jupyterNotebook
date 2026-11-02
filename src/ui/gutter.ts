// The renderer and build share the same masks and names. SVGs stay file-backed
// for the stable decoration API; generated files are not maintained by hand.
type ChangeKind = 'added' | 'modified' | 'deleted';
interface GutterStyle { mask: number; kind: ChangeKind; suffix: string }
export const gutterStyles: readonly GutterStyle[] = [
  { mask: 1, kind: 'added', suffix: '' }, { mask: 2, kind: 'modified', suffix: '' },
  ...[4, 8, 12].flatMap(boundary => [0, 1, 2].map(source => ({
    mask: boundary | source, kind: 'deleted' as const,
    suffix: (boundary === 4 ? '' : boundary === 8 ? '-after' : '-both') +
      (source === 1 ? '-added' : source === 2 ? '-modified' : ''),
  }))),
];
export const gutterPalettes = {
  dark: { added: '#73c991', modified: '#75beff', deleted: '#f48771' },
  light: { added: '#247b35', modified: '#0969da', deleted: '#c42b1c' },
  contrast: { added: '#3cff82', modified: '#45c5ff', deleted: '#ff6b6b' },
  'contrast-light': { added: '#005a21', modified: '#004ccc', deleted: '#b30000' },
};
type Palette = keyof typeof gutterPalettes;
export function gutterFileName(palette: Palette, style: GutterStyle): string {
  return `${style.kind}-${palette}${style.suffix}.svg`;
}
export function gutterSvg(palette: Palette, style: GutterStyle): string {
  const group = (kind: ChangeKind, shape: string) => {
    const color = gutterPalettes[palette][kind];
    const stroke = palette === 'dark' ? '' : ` stroke="${palette === 'light' ? color : '#000000'}" stroke-width="0.5"`;
    return `<g fill="${color}"${stroke}>${shape}</g>`;
  };
  const paths: string[] = [];
  if (style.mask & 4) paths.push('M1 0.75 L5 3.5 L1 6.25 Z');
  if (style.mask & 8) paths.push('M1 9.75 L5 12.5 L1 15.25 Z');
  const deletion = paths.length ? group('deleted', `<path d="${paths.join(' ')}"/>`) : '';
  const bar = style.mask & 3 ? group(style.mask & 1 ? 'added' : 'modified', '<rect x="6" y="0" width="3" height="16"/>') : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" preserveAspectRatio="none">' + deletion + bar + '</svg>\n';
}
