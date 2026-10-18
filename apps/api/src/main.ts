import { createApp } from './app';
import { localConfig } from './config';

async function main() {
  const app = await createApp();
  const config = localConfig();
  await app.listen(config.port, config.host);
  process.stdout.write(
    `API http://${config.host}:${config.port}/api/v1; Swagger /api/docs; external-services=local-simulated\n`,
  );
}
main().catch(() => {
  process.stderr.write(
    'API startup failed; verify local environment and MySQL connection.\n',
  );
  process.exitCode = 1;
});
