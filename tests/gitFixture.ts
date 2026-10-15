import { execFileSync } from 'node:child_process';
import { devNull } from 'node:os';
import { gitEnvironment } from '../src/gitReader';

// Fixture writes must stay in their own repository even when the parent process was launched by Git.
export function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Notebook Test', '-c', 'user.email=test@example.invalid', '-c', `core.hooksPath=${devNull}`, ...args],
    { cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...gitEnvironment(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull } }).trim();
}
