const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const types = JSON.parse(fs.readFileSync(path.join(root, 'types/VERSION.json'), 'utf8'));
if (lock.version !== manifest.version || lock.packages[''].version !== manifest.version ||
  lock.packages[''].engines.vscode !== manifest.engines.vscode || manifest.engines.vscode !== `^${types.vscode}`) {
  throw new Error('Manifest, lockfile and stable API snapshot must agree on release and minimum VS Code versions');
}
const typesHash = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, 'types/vscode.d.ts'))).digest('hex');
if (typesHash !== types.vscodeTypesSha256) throw new Error('The stable API snapshot hash does not match types/VERSION.json');
const bytes = fs.statSync(path.resolve(root, manifest.icon)).size;
if (bytes > 1024 * 1024) {
  throw new Error(`Marketplace icon exceeds 1024 KB: ${manifest.icon} is ${bytes} bytes`);
}
console.log(`Marketplace icon size OK: ${bytes} bytes`);
