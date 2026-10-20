import { Analyzer } from '../src/analysis';
import { Baseline } from '../src/gitReader';
import { SourceCell } from '../src/normalize';
import { cpus, platform, arch } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

async function main() {
  const samples: { scenario: string; ms: number; recomputed: number; hashedChars: number; state: string }[] = [];
  const cells: SourceCell[] = Array.from({ length: 300 }, (_, i) => ({ kind: 'code', id: `cell-${i}`, session: `uri-${i}`,
    source: Array.from({ length: 40 }, (_, j) => `value_${i}_${j} = ${j}  # sample source`).join('\n') }));
  const base: Baseline = { kind: 'ready', revision: 'benchmark', path: 'generated.ipynb', cells };
  const analyzer = new Analyzer();
  const measure = async (scenario: string, input: SourceCell[], baseline = base, engine = analyzer) => {
    const start = performance.now(); const result = await engine.analyze(baseline, input);
    assert.ok(result); assert.equal(result.state, 'ready');
    samples.push({ scenario, ms: performance.now() - start, recomputed: result.computed, hashedChars: result.alignment?.hashedChars ?? 0, state: result.state });
  };
  await measure('300 cells x 40 lines, cold', cells);
  const edited = cells.map((c, i) => i === 150 ? { ...c, source: c.source.replace('= 0', '= 999') } : c);
  await measure('one edit in 300 cells', edited);
  for (let i = 0; i < 30; i++) {
    edited[150] = { ...edited[150]!, source: cells[150]!.source + `\nrapid = ${i}` };
    await measure(`rapid edit ${i + 1}`, edited);
  }
  await measure('insert at start of 300 cells', [{ kind: 'code', id: 'inserted', session: 'inserted', source: 'new = True' }, ...edited]);
  const long: SourceCell = { kind: 'code', id: 'long', session: 'long', source: Array.from({ length: 5000 }, (_, i) => `value_${i} = ${i}`).join('\n') };
  await measure('one 5000-line cell', [{ ...long, source: long.source.replace('value_2500 = 2500', 'value_2500 = 9999') }],
    { kind: 'ready', revision: 'long', path: 'long.ipynb', cells: [long] }, new Analyzer());
  const report = { environment: { node: process.version, os: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length },
    methodology: 'One measured cold pass, 30 sequential hot edits; analysis only, excluding Git I/O, UI paint and configured 200 ms debounce.', samples };
  await mkdir('output', { recursive: true }); await writeFile('output/performance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
