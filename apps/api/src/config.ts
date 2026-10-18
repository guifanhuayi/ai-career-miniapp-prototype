import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadLocalEnvironment() {
  let directory = __dirname;
  while (true) {
    const manifest = resolve(directory, 'package.json');
    if (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, 'utf8')).name === 'ai-career-miniapp'
    )
      break;
    const parent = resolve(directory, '..');
    if (parent === directory) throw new Error('Workspace root not found');
    directory = parent;
  }
  const file = resolve(directory, 'infra/runtime/local.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match?.[1] && process.env[match[1]] === undefined)
      process.env[match[1]] = match[2];
  }
}
export function localConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = env.API_HOST ?? '127.0.0.1';
  const environment = env.APP_ENV ?? 'local';
  const port = Number(env.API_PORT ?? 3100);
  if (!['127.0.0.1', '::1'].includes(host))
    throw new Error('Local unauthenticated admin requires loopback API_HOST');
  if (!['local', 'test', 'demo'].includes(environment))
    throw new Error(
      'Public deployment requires a separate approved identity configuration',
    );
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid API_PORT');
  return { host, port, environment };
}
