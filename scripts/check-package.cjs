const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bytes = fs.statSync(path.resolve(root, manifest.icon)).size;
if (bytes > 1024 * 1024) {
  throw new Error(`Marketplace icon exceeds 1024 KB: ${manifest.icon} is ${bytes} bytes`);
}
console.log(`Marketplace icon size OK: ${bytes} bytes`);
