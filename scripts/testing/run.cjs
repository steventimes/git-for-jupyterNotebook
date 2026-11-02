const { runTests, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');
const { root, runtime, fixture, withDisplay } = require('./runtime.cjs');

const hashFile = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function sourceFiles() {
  return Object.fromEntries(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(file => file && file !== 'docs/verification.md' && fs.existsSync(path.join(root, file)))
    .sort().map(file => [file, hashFile(path.join(root, file))]));
}
function runtimeFiles(directory) {
  const files = {};
  const visit = relative => {
    const absolute = path.join(directory, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) {
      files[relative.split(path.sep).join('/')] = hashFile(absolute);
    } else throw new Error(`Unexpected runtime file type: ${relative}`);
  };
  for (const relative of ['out/src', 'out/media', 'media', 'node_modules/diff/libcjs', 'node_modules/diff/package.json']) visit(relative);
  return files;
}
function verifyInstalled(extensions, manifest) {
  const candidates = fs.readdirSync(extensions, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => path.join(extensions, entry.name)).filter(directory => {
      const file = path.join(directory, 'package.json');
      if (!fs.existsSync(file)) return false;
      const installed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return installed.name === manifest.name && installed.publisher?.toLowerCase() === manifest.publisher.toLowerCase() && installed.version === manifest.version;
    });
  if (candidates.length !== 1) throw new Error('Expected exactly one installed extension matching the release manifest');
  const expected = runtimeFiles(root); const actual = runtimeFiles(candidates[0]);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Installed VSIX runtime differs from the current build; rebuild the package before testing');
  const dependency = JSON.parse(fs.readFileSync(path.join(candidates[0], 'node_modules/diff/package.json'), 'utf8'));
  if (dependency.version !== manifest.dependencies.diff) throw new Error('Installed diff dependency does not match the pinned version');
  console.log(`Verified ${Object.keys(actual).length} installed runtime/dependency files against the current build.`);
  return actual;
}

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
          const child = spawn(process.execPath, [path.join(root, 'scripts/testing/ui.cjs')], { cwd: root, stdio: 'inherit',
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
  if (!['host', 'ui', 'vsix'].includes(mode)) throw new Error('Usage: node scripts/testing/run.cjs [host|ui|vsix] [vsix-path]');
  // A failed current run must not leave the previous run's success summary.
  if (mode !== 'ui') fs.rmSync(path.join(root, `.tmp/${mode === 'vsix' ? 'vsix-' : ''}host-results.json`), { force: true });
  const installedPackage = mode === 'vsix' || (mode === 'ui' && Boolean(process.argv[3]));
  const releaseFile = mode === 'ui' ? 'ui-release.json' : 'release.json';
  if (installedPackage) fs.rmSync(path.join(root, 'output', releaseFile), { force: true });
  if (mode === 'ui' && process.platform === 'linux') {
    for (const codepoint of ['4e2d', '1f468']) {
      const fonts = execFileSync('fc-list', ['-f', '%{family}\n', `:charset=${codepoint}`], { encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
      if (!fonts.trim()) throw new Error('UI screenshots require CJK and emoji fonts. Install fonts-noto-cjk and fonts-noto-color-emoji, or supply an isolated FONTCONFIG_FILE.');
    }
  }
  const data = fixture(mode !== 'ui');
  try {
    const executable = await runtime();
    const port = mode === 'ui' ? await freePort() : undefined;
    let developmentPath = root;
    let artifact;
    if (installedPackage) {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const vsix = path.resolve(process.argv[3] || path.join(root, 'output/packages', `${manifest.name}-${manifest.version}.vsix`));
      artifact = { file: path.basename(vsix), path: vsix, sha256: hashFile(vsix) };
      artifact.checksumVerified = fs.existsSync(vsix + '.sha256');
      if (artifact.checksumVerified && fs.readFileSync(vsix + '.sha256', 'utf8').trim() !== `${artifact.sha256}  ${artifact.file}`) {
        throw new Error('VSIX checksum does not match the package checksum file');
      }
      const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
      const windows = process.platform === 'win32';
      execFileSync(windows ? executable : cli, [...(windows ? [path.join(path.dirname(executable), 'resources/app/out/cli.js')] : cliArgs),
        '--no-sandbox', '--user-data-dir=' + data.profile, '--extensions-dir=' + path.join(data.profile, 'extensions'), '--install-extension', vsix, '--force'],
      { stdio: 'inherit', timeout: 30_000, env: windows ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env });
      artifact.runtimeFiles = verifyInstalled(path.join(data.profile, 'extensions'), manifest);
      artifact.sourceFiles = sourceFiles();
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
    }
    else {
      let finished = false;
      const results = await Promise.allSettled([tests.finally(() => { finished = true; }), driveUI(() => finished, port, data.repo)]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    }
    if (artifact) {
      const after = hashFile(artifact.path);
      if (after !== artifact.sha256) throw new Error('VSIX changed during installation tests');
      if (JSON.stringify(sourceFiles()) !== JSON.stringify(artifact.sourceFiles)) throw new Error('Source changed during installation tests; results cannot describe the current tree');
      const results = JSON.parse(fs.readFileSync(path.join(root, mode === 'ui' ? '.tmp/ui-live.json' : '.tmp/vsix-host-results.json'), 'utf8'));
      fs.mkdirSync(path.join(root, 'output'), { recursive: true });
      fs.writeFileSync(path.join(root, 'output', releaseFile), JSON.stringify({
        file: artifact.file, sha256: after, bytes: fs.statSync(artifact.path).size,
        installedRuntimeFiles: artifact.runtimeFiles,
        checksumVerified: artifact.checksumVerified,
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        workingTreeDirty: Boolean(execFileSync('git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
        sourceFiles: artifact.sourceFiles,
        vscode: results.diagnostics.vscode, extension: results.diagnostics.extension,
        passed: mode === 'ui' ? ['UI driver exited with code 0', 'UI extension host exited with code 0'] : results.passed,
      }, null, 2) + '\n');
    }
  } finally { data.clean(); }
}
if (!withDisplay(__filename)) main().catch(error => { console.error(error); process.exitCode = 1; });
