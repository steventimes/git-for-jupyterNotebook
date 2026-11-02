const { spawn } = require('node:child_process');
// The built-in Git extension deliberately defers filesystem refresh while unfocused.
// A window manager gives the isolated Xvfb window genuine desktop focus.
const manager = spawn('openbox', [], { stdio: 'ignore' });
manager.unref();
manager.on('error', error => console.warn(`Window manager unavailable: ${error.message}`));
process.on('exit', () => manager.kill());
const script = process.argv[2];
process.argv.splice(1, 1);
setTimeout(() => require(script), 300);
