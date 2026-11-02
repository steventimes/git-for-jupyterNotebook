const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest = readJson('package.json');
function run(entry, args) {
  const result = spawnSync(process.execPath, [require.resolve(entry), ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv.length === 3 && process.argv[2] === '--package') {
  const packages = path.join(root, 'output/packages');
  fs.mkdirSync(packages, { recursive: true });
  const file = path.join(packages, `${manifest.name}-${manifest.version}.vsix`);
  // vsce runs vscode:prepublish, which compiles and validates this same tree.
  run('@vscode/vsce/vsce', ['package', '--githubBranch', 'main', '--out', file]);
  const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(file + '.sha256', `${digest}  ${path.basename(file)}\n`);
  console.log(`SHA-256: ${digest}`);
} else {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/build.cjs [--package]');
  const lock = readJson('package-lock.json');
  const types = readJson('types/VERSION.json');
  if (lock.version !== manifest.version || lock.packages[''].version !== manifest.version ||
    lock.packages[''].engines.vscode !== manifest.engines.vscode || manifest.engines.vscode !== `^${types.vscode}`) {
    throw new Error('Manifest, lockfile and stable API snapshot must agree on release and minimum VS Code versions');
  }
  const typesHash = createHash('sha256').update(fs.readFileSync(path.join(root, 'types/vscode.d.ts'))).digest('hex');
  if (typesHash !== types.vscodeTypesSha256) throw new Error('The stable API snapshot hash does not match types/VERSION.json');
  const bytes = fs.statSync(path.resolve(root, manifest.icon)).size;
  if (bytes > 1024 * 1024) throw new Error(`Marketplace icon exceeds 1024 KB: ${manifest.icon} is ${bytes} bytes`);
  fs.rmSync(path.join(root, 'out'), { recursive: true, force: true });
  run('typescript/bin/tsc', ['-p', '.']);
  const { gutterStyles, gutterPalettes, gutterFileName, gutterSvg } = require('../out/src/ui/gutter.js');
  for (const palette of Object.keys(gutterPalettes)) {
    const directory = path.join(root, 'out/media/gutter', palette);
    fs.mkdirSync(directory, { recursive: true });
    for (const style of gutterStyles) fs.writeFileSync(path.join(directory, gutterFileName(palette, style)), gutterSvg(palette, style));
  }
  console.log(`Compiled extension and generated gutter icons; Marketplace icon ${bytes} bytes.`);
}
