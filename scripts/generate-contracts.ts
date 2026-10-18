import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import { createApp, createDocument } from '../apps/api/src/app';

async function main() {
  const app = await createApp({ startWorkers: false });
  try {
    const document = createDocument(app);
    const schema = `${JSON.stringify(document, null, 2)}\n`;
    const types = astToString(
      await openapiTS(document as Parameters<typeof openapiTS>[0]),
    );
    const routes: Record<string, object> = {};
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(methods ?? {})) {
        if (
          !operation ||
          typeof operation !== 'object' ||
          !('operationId' in operation) ||
          typeof operation.operationId !== 'string'
        )
          continue;
        const successStatus = Number(
          Object.keys(operation.responses).find((status) =>
            /^2\d\d$/.test(status),
          ),
        );
        routes[operation.operationId] = {
          path,
          method: method.toUpperCase(),
          successStatus,
        };
      }
    }
    const client = readFileSync(
      resolve('scripts/templates/client.ts.template'),
      'utf8',
    )
      .replace(/\r\n/g, '\n')
      .replace('/* GENERATED_ROUTES */', JSON.stringify(routes, null, 2));
    const target = resolve('packages/contracts');
    mkdirSync(target, { recursive: true });
    for (const [name, content] of [
      ['openapi.json', schema],
      ['schema.d.ts', types],
      ['client.ts', client],
    ] as const) {
      const path = resolve(target, name);
      if (process.argv.includes('--check')) {
        if (readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== content)
          throw new Error(`Contract drift: ${name}`);
      } else writeFileSync(path, content);
    }
    console.log(
      process.argv.includes('--check')
        ? 'OpenAPI and generated types match.'
        : 'OpenAPI and types generated.',
    );
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error(
    'Contract generation failed; verify MySQL and contract output.',
  );
  process.exitCode = 1;
});
