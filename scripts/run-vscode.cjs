const { runTests, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { root, runtime, fixture, withDisplay } = require('./test-runtime.cjs');

async function driveUI(finished) {
  try {
    for (let i = 0; i < 120; i++) {
      if (finished()) throw new Error('VS Code exited before the UI driver started');
      if (fs.existsSync(path.join(root, '.tmp/ui-ready.json'))) {
        await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [path.join(root, 'scripts/ui-driver.cjs')], { cwd: root, stdio: 'inherit' });
          child.once('error', reject);
          child.once('exit', code => code === 0 ? resolve() : reject(new Error(`UI driver failed (${code})`)));
        });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('UI host did not become ready');
  } catch (error) {
    // Let the fixture host exit before deleting its profile, even if CDP could not connect.
    fs.writeFileSync(path.join(root, '.tmp/ui-request.json'), JSON.stringify({ id: Number.MAX_SAFE_INTEGER, action: 'finish' }));
    throw error;
  }
}

async function main() {
  const mode = process.argv[2] ?? 'host';
  if (!['host', 'ui', 'vsix'].includes(mode)) throw new Error('Usage: run-vscode.cjs [host|ui|vsix] [vsix-path]');
  const data = fixture(mode !== 'ui');
  try {
    const executable = await runtime();
    let developmentPath = root;
    if (mode === 'vsix') {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const vsix = path.resolve(process.argv[3] || path.join(root, `${manifest.name}-${manifest.version}.vsix`));
      const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
      const windows = process.platform === 'win32';
      execFileSync(windows ? executable : cli, [...(windows ? [path.join(path.dirname(executable), 'resources/app/out/cli.js')] : cliArgs),
        '--no-sandbox', '--user-data-dir=' + data.profile, '--extensions-dir=' + path.join(data.profile, 'extensions'), '--install-extension', vsix, '--force'],
      { stdio: 'inherit', timeout: 30_000, env: windows ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env });
      developmentPath = path.join(data.profile, 'harness'); fs.mkdirSync(developmentPath);
      fs.writeFileSync(path.join(developmentPath, 'package.json'), JSON.stringify({ name: 'ngg-test-harness', publisher: manifest.publisher,
        version: '0.0.1', engines: { vscode: '^1.141.0' }, main: 'harness.js' }));
      fs.writeFileSync(path.join(developmentPath, 'harness.js'), 'exports.activate = () => {};\n');
    }
    if (mode === 'ui') for (const name of ['ready', 'live', 'request', 'response']) {
      fs.rmSync(path.join(root, `.tmp/ui-${name}.json`), { force: true });
    }
    const tests = runTests({ vscodeExecutablePath: executable, extensionDevelopmentPath: developmentPath,
      extensionTestsPath: path.join(root, `out/tests/vscode/${mode === 'ui' ? 'ui' : 'host'}.js`),
      extensionTestsEnv: { NGG_ROOT: root, NGG_REPO: data.repo, NGG_SECOND_REPO: data.secondRepo,
        NGG_HOST_RESULTS: mode === 'vsix' ? 'vsix-host-results.json' : 'host-results.json' },
      launchArgs: [data.workspace ?? data.repo, '--disable-gpu',
        ...(mode === 'ui' ? ['--remote-debugging-port=9335'] : []),
        '--user-data-dir=' + data.profile, '--extensions-dir=' + path.join(data.profile, 'extensions')],
    });
    if (mode !== 'ui') await tests;
    else {
      let finished = false;
      const results = await Promise.allSettled([tests.finally(() => { finished = true; }), driveUI(() => finished)]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    }
  } finally { data.clean(); }
}
if (!withDisplay(__filename)) main().catch(error => { console.error(error); process.exitCode = 1; });
