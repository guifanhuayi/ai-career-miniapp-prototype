import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = { ...process.env };
for (const line of readFileSync(
  new URL('../infra/runtime/local.env', import.meta.url),
  'utf8',
).split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (match && environment[match[1]] === undefined)
    environment[match[1]] = match[2];
}
if (process.argv.includes('--test')) {
  const database = new URL(environment.DATABASE_URL);
  database.pathname = '/career_test';
  environment.DATABASE_URL = database.toString();
  environment.APP_ENV = 'test';
}
const commands = ['apps/api/dist/apps/api/src/main.js', 'scripts/preview.mjs'];
const children = commands.map((file) =>
  spawn(process.execPath, [file], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children)
    if (child.exitCode === null) child.kill('SIGTERM');
}
for (const child of children)
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
