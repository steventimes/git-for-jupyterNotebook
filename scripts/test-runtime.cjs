const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
async function runtime() {
  if (process.env.VSCODE_EXECUTABLE) return process.env.VSCODE_EXECUTABLE;
  const version = process.env.VSCODE_VERSION || manifest.engines.vscode.replace(/^\^/, '');
  const cached = path.join(root, '.tmp/vscode', process.platform === 'win32' ? 'Code.exe' : 'code');
  try {
    const info = JSON.parse(fs.readFileSync(path.join(path.dirname(cached), 'resources/app/package.json'), 'utf8'));
    if (fs.existsSync(cached) && info.version === version) return cached;
  } catch { /* Download the requested version instead of trusting an unrelated cache. */ }
  return downloadAndUnzipVSCode(version);
}
function fixture(multiRoot = false) {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  const { git } = require(path.join(root, 'out/tests/gitFixture.js'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-host-'));
  const data = JSON.parse(fs.readFileSync(path.join(root, 'demo/demo.ipynb'), 'utf8'));
  data.cells = Array.from({ length: 40 }, (_, i) => ({ cell_type: 'code', id: `fixture-${i}`, metadata: {},
    source: [`name = "Notebook ${i}"\n`, 'count = 3\n', 'print(name, count)\n'], execution_count: 1,
    outputs: [{ output_type: 'stream', name: 'stdout', text: [`Notebook ${i} 3\n`] }] }));
  data.cells.splice(1, 0, { cell_type: 'markdown', id: 'markdown', metadata: {}, source: '# Native Notebook\nMarkdown source is compared too.' });
  fs.writeFileSync(path.join(repo, 'demo.ipynb'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(repo, 'quick-diff-probe.py'), data.cells[0].source.join(''));
  for (const args of [['init', '-b', 'main'], ['add', '.'], ['-c', 'user.name=Notebook Test', '-c', 'user.email=test@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture']]) {
    git(repo, ...args);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-profile-'));
  fs.mkdirSync(path.join(profile, 'User'));
  fs.writeFileSync(path.join(profile, 'User/settings.json'), JSON.stringify({ 'chat.disableAIFeatures': true,
    'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'none', 'workbench.colorTheme': 'Default Dark Modern',
    'workbench.secondarySideBar.defaultVisibility': 'hidden', 'extensions.autoUpdate': false, 'update.mode': 'none' }));
  // The Jupyter extension normally contributes this language. Register only the
  // language in our isolated fixture so raw/code API events need no kernel.
  const languageFixture = path.join(profile, 'extensions', 'ngg-test-languages');
  fs.mkdirSync(languageFixture, { recursive: true });
  fs.writeFileSync(path.join(languageFixture, 'package.json'), JSON.stringify({ name: 'ngg-test-languages', publisher: 'fixture',
    version: '0.0.1', engines: { vscode: manifest.engines.vscode }, contributes: { languages: [{ id: 'raw' }] } }));
  let secondRepo;
  let workspace;
  if (multiRoot) {
    secondRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-second-'));
    fs.writeFileSync(path.join(secondRepo, 'demo.ipynb'), JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {},
      cells: [{ cell_type: 'code', id: 'second', metadata: {}, source: 'second baseline', outputs: [], execution_count: null }] }));
    for (const args of [['init', '-b', 'main'], ['add', '.'], ['-c', 'user.name=Notebook Test', '-c', 'user.email=test@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture']]) {
      git(secondRepo, ...args);
    }
    workspace = path.join(profile, 'test.code-workspace');
    fs.writeFileSync(workspace, JSON.stringify({ folders: [{ path: repo }, { path: secondRepo }] }));
  }
  return { repo, profile, secondRepo, workspace, clean: () => {
    for (const folder of [repo, profile, secondRepo].filter(Boolean)) fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } };
}
function withDisplay(script) {
  if (process.platform !== 'linux' || process.env.DISPLAY || process.env.NGG_XVFB) return false;
  const processHandle = spawn('xvfb-run', ['-a', '-s', '-screen 0 1440x1000x24', process.execPath, path.join(root, 'scripts/display-entry.cjs'), script, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, NGG_XVFB: '1' },
  });
  processHandle.on('error', error => { console.error('Xvfb unavailable:', error.message); process.exitCode = 1; });
  processHandle.on('exit', code => { process.exitCode = code ?? 1; });
  return true;
}
module.exports = { root, runtime, fixture, withDisplay };
