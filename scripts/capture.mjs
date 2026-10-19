import { spawnSync } from 'node:child_process';
import path from 'node:path';
import electronPath from 'electron';

function runNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The capture routine drives the real app, so always build first.
runNode([path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build']);
runNode([
  path.join('node_modules', 'typescript', 'bin', 'tsc'),
  '-p',
  'tsconfig.electron.json',
]);

const result = spawnSync(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    KRYVEX_CAPTURE: '1',
    KRYVEX_CAPTURE_DIR: path.resolve('screenshots'),
  },
});

process.exit(result.status ?? 1);
