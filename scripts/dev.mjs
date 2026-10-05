import './setup.mjs';
import { config } from 'dotenv';
import { spawn } from 'node:child_process';
config({ quiet: true });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  }
  process.exitCode = code;
}
for (const args of [ ['run', 'start:dev', '--workspace', 'apps/api'], ['run', 'dev', '--workspace', 'apps/web', '--', '--port', process.env.WEB_PORT ?? '4000'] ]) {
  const child = spawn(npm, args, { stdio: 'inherit', detached: process.platform !== 'win32' });
  children.push(child);
  child.on('error', () => stop(1));
  child.on('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
