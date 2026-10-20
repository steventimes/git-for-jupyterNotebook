const { runTests, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');
const { root, runtime, fixture, withDisplay } = require('./test-runtime.cjs');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function driveUI(finished, port, repo) {
  try {
    for (let i = 0; i < 120; i++) {
      if (finished()) throw new Error('VS Code exited before the UI driver started');
      if (fs.existsSync(path.join(root, '.tmp/ui-ready.json'))) {
        await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [path.join(root, 'scripts/ui-driver.cjs')], { cwd: root, stdio: 'inherit',
            env: { ...process.env, NGG_UI_PORT: String(port), NGG_UI_WORKSPACE: path.basename(repo) } });
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
    const port = mode === 'ui' ? await freePort() : undefined;
    let developmentPath = root;
    let artifact;
    if (mode === 'vsix') {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const vsix = path.resolve(process.argv[3] || path.join(root, `${manifest.name}-${manifest.version}.vsix`));
      artifact = { file: path.basename(vsix), path: vsix, sha256: createHash('sha256').update(fs.readFileSync(vsix)).digest('hex') };
      const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
      const windows = process.platform === 'win32';
      execFileSync(windows ? executable : cli, [...(windows ? [path.join(path.dirname(executable), 'resources/app/out/cli.js')] : cliArgs),
        '--no-sandbox', '--user-data-dir=' + data.profile, '--extensions-dir=' + path.join(data.profile, 'extensions'), '--install-extension', vsix, '--force'],
      { stdio: 'inherit', timeout: 30_000, env: windows ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env });
      developmentPath = path.join(data.profile, 'harness'); fs.mkdirSync(developmentPath);
      fs.writeFileSync(path.join(developmentPath, 'package.json'), JSON.stringify({ name: 'ngg-test-harness', publisher: manifest.publisher,
        version: '0.0.1', engines: { vscode: manifest.engines.vscode }, main: 'harness.js' }));
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
        ...(mode === 'ui' ? [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'] : []),
        '--user-data-dir=' + data.profile, '--extensions-dir=' + path.join(data.profile, 'extensions')],
    });
    if (mode !== 'ui') {
      await tests;
      if (artifact) {
        const after = createHash('sha256').update(fs.readFileSync(artifact.path)).digest('hex');
        if (after !== artifact.sha256) throw new Error('VSIX changed during installation tests');
        const results = JSON.parse(fs.readFileSync(path.join(root, '.tmp/vsix-host-results.json'), 'utf8'));
        fs.mkdirSync(path.join(root, 'output'), { recursive: true });
        fs.writeFileSync(path.join(root, 'output/release.json'), JSON.stringify({
          file: artifact.file, sha256: after, bytes: fs.statSync(artifact.path).size,
          sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
          workingTreeDirty: Boolean(execFileSync('git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
          sourceFiles: Object.fromEntries(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
            .split('\0').filter(file => file && file !== 'VERIFICATION.md' && fs.existsSync(path.join(root, file)))
            .sort().map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])),
          vscode: results.diagnostics.vscode, extension: results.diagnostics.extension, passed: results.passed,
        }, null, 2) + '\n');
      }
    }
    else {
      let finished = false;
      const results = await Promise.allSettled([tests.finally(() => { finished = true; }), driveUI(() => finished, port, data.repo)]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    }
  } finally { data.clean(); }
}
if (!withDisplay(__filename)) main().catch(error => { console.error(error); process.exitCode = 1; });
