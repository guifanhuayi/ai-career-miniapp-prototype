import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import test, { after, before, mock } from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createApp, createDocument } from '../../apps/api/src/app';
import { loadLocalEnvironment } from '../../apps/api/src/config';
import { Database } from '../../apps/api/src/database';

let app: Awaited<ReturnType<typeof createApp>>;
let db: Database;
let base: string;
let credential: string;
let visitorId: string;
loadLocalEnvironment();
const url = new URL(process.env.DATABASE_URL!);
url.pathname = '/career_test';
process.env.DATABASE_URL = url.toString();
process.env.APP_ENV = 'test';

before(async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/career_test');
  execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      'infra/prisma/schema.prisma',
    ],
    { env: process.env, stdio: 'pipe' },
  );
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  db = app.get(Database);
});
after(async () => {
  if (app) await app.close();
});
const body = (data: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

test('M2-001 DB-001: migration applies to isolated real MySQL8.4', async () => {
  const version = await db.$queryRaw<
    { version: string }[]
  >`SELECT VERSION() AS version`;
  assert.match(version[0]!.version, /^8\.4\./);
  const migrations = await db.$queryRaw<
    { count: bigint }[]
  >`SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  assert.ok(Number(migrations[0]!.count) > 0);
  assert.equal(
    (await (await fetch(`${base}/health`)).json()).database,
    'mysql',
  );
});
test('M2-002 GUEST-001 AUTH-002 MT-017/128: anonymous issuance stores only unpredictable credential digest', async () => {
  const response = await fetch(`${base}/visitor-sessions`, body({}));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('location'), '/api/v1/me');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const session = await response.json();
  credential = session.credential;
  visitorId = session.visitorId;
  assert.match(credential, /^[a-f0-9]{64}$/);
  assert.match(session.storageNotice, /换设备/);
  const stored = await db.visitorCredential.findFirstOrThrow({
    where: { visitorId },
  });
  assert.notEqual(stored.tokenHash, credential);
  const second = await (
    await fetch(`${base}/visitor-sessions`, body({}))
  ).json();
  assert.notEqual(second.visitorId, visitorId);
  assert.notEqual(second.credential, credential);
});
test('M2-003 API-003: reject unknown owner/environment fields and malformed body', async () => {
  for (const value of [
    { ownerId: visitorId },
    { environment: 'production' },
    [],
    null,
    'text',
  ]) {
    const response = await fetch(`${base}/visitor-sessions`, body(value));
    assert.equal(response.status, 400);
    const error = await response.json();
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(typeof error.requestId, 'string');
    assert.equal('stack' in error, false);
  }
  const malformed = await fetch(`${base}/visitor-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
});
test('M2-004 AUTH-002: missing/forged credential rejected; valid me is read-only', async () => {
  for (const authorization of [
    '',
    'Bearer forged',
    `Bearer ${'0'.repeat(64)}`,
  ]) {
    const response = await fetch(`${base}/me`, { headers: { authorization } });
    assert.equal(response.status, 401);
  }
  const before = await db.visitor.count();
  for (let index = 0; index < 2; index++) {
    const response = await fetch(`${base}/me`, {
      headers: { authorization: `Bearer ${credential}` },
    });
    assert.equal(response.status, 200);
    const me = await response.json();
    assert.equal(me.visitorId, visitorId);
    assert.equal('credential' in me, false);
  }
  assert.equal(await db.visitor.count(), before);
});
test('M2-005 LOCAL-ADMIN-001: local admin rejects absent header and foreign Origin/Host', async () => {
  assert.equal((await fetch(`${base}/admin/system`)).status, 403);
  assert.equal(
    (
      await fetch(`${base}/admin/system`, {
        headers: { 'X-Admin-Local': '1', Origin: 'https://foreign.example' },
      })
    ).status,
    403,
  );
  // Node fetch normalizes Host. A raw HTTP request is required to actually exercise rebinding protection.
  const foreignHostStatus = await new Promise<number>((resolve, reject) => {
    const request = httpRequest(
      `${base}/admin/system`,
      { headers: { 'X-Admin-Local': '1', Host: 'foreign.example' } },
      (response) => {
        response.resume();
        resolve(response.statusCode!);
      },
    );
    request.on('error', reject);
    request.end();
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal(
    (
      await fetch(`${base}/admin/system`, {
        headers: { 'X-Admin-Local': '1', Origin: 'http://127.0.0.1:8000' },
      })
    ).status,
    200,
  );
});
test('M2-006 API-003: oversized JSON rejected with safe413 response', async () => {
  const response = await fetch(
    `${base}/visitor-sessions`,
    body({ text: 'x'.repeat(140000) }),
  );
  assert.equal(response.status, 413);
  const error = await response.json();
  assert.equal(error.code, 'PAYLOAD_TOO_LARGE');
  assert.ok(error.requestId);
});
test('M2-007 API-001 MT-125: every implemented operation has success/security/error schemas', async () => {
  const document = createDocument(app);
  const operations = Object.values(document.paths)
    .flatMap((path) => Object.values(path ?? {}))
    .filter(
      (operation) =>
        operation && typeof operation === 'object' && 'responses' in operation,
    );
  assert.equal(operations.length, 4);
  for (const operation of operations) {
    assert.ok(operation.operationId);
    assert.ok(operation.summary);
    const status =
      operation.operationId === 'createVisitorSession' ? '201' : '200';
    assert.ok(
      operation.responses[status]?.content?.['application/json']?.schema,
    );
    assert.ok(
      operation.responses['400']?.content?.['application/json']?.schema,
    );
    assert.ok(operation.responses['500']);
  }
  assert.deepEqual(document.paths['/api/v1/me']?.get?.security, [
    { visitorBearer: [] },
  ]);
  assert.deepEqual(document.paths['/api/v1/admin/system']?.get?.security, [
    { localAdmin: [] },
  ]);
  assert.equal(
    (await fetch(`${await app.getUrl()}/api/openapi.json`)).status,
    200,
  );
  assert.equal((await fetch(`${await app.getUrl()}/api/docs/`)).status, 200);
});
test('M2-008 EVT-004 MT-129: request metrics redact body, tokens, query and invalid correlation IDs', async () => {
  const marker = 'SENSITIVE_JD_DO_NOT_LOG';
  const response = await fetch(`${base}/me?jd=${marker}`, {
    headers: {
      authorization: `Bearer ${credential}`,
      'X-Request-Id': 'bad/long/id',
      'X-Retry-Count': '2',
    },
  });
  assert.equal(response.status, 400);
  const requestId = response.headers.get('x-request-id')!;
  assert.match(requestId, /^[a-f0-9-]{36}$/);
  // Finish listener writes asynchronously; await persistence with a bounded poll.
  let metric: Awaited<ReturnType<Database['apiRequestMetric']['findFirst']>> =
    null;
  for (let n = 0; n < 50; n++) {
    metric = await db.apiRequestMetric.findFirst({ where: { requestId } });
    if (metric) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(metric);
  assert.equal(metric.retryCount, 2);
  assert.equal(metric.route, '/api/v1/me');
  const serialized = JSON.stringify(metric);
  for (const forbidden of [
    credential,
    marker,
    'authorization',
    'password',
    'ownerId',
  ])
    assert.equal(serialized.includes(forbidden), false);
});
test('M2-009 DB-002: nested credential uniqueness failure rolls back visitor creation', async () => {
  const hash = (
    await db.visitorCredential.findFirstOrThrow({ where: { visitorId } })
  ).tokenHash;
  const before = await db.visitor.count();
  await assert.rejects(
    db.visitor.create({
      data: {
        environment: 'test',
        credentials: { create: { tokenHash: hash } },
      },
    }),
  );
  assert.equal(await db.visitor.count(), before);
});
test('M2-010 PLAN-001: closing/recreating API preserves visitor in MySQL', async () => {
  await app.close();
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  db = app.get(Database);
  const response = await fetch(`${base}/me`, {
    headers: { authorization: `Bearer ${credential}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).visitorId, visitorId);
});
test('M2-016 DB-001: repeated seed preserves editorial changes and visitor records', async () => {
  const seed = () =>
    execFileSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        '--tsconfig',
        'apps/api/tsconfig.json',
        'infra/seed.ts',
      ],
      { env: process.env, stdio: 'pipe' },
    );
  seed();
  const scene = await db.scene.findUniqueOrThrow({ where: { id: 'ppt' } });
  const beforeVisitors = await db.visitor.count();
  await db.scene.update({
    where: { id: 'ppt' },
    data: { name: '测试：运营修改保留' },
  });
  try {
    seed();
    assert.equal(
      (await db.scene.findUniqueOrThrow({ where: { id: 'ppt' } })).name,
      '测试：运营修改保留',
    );
    assert.equal(await db.scene.count(), 17);
    assert.equal(await db.task.count(), 36);
    assert.equal(
      await db.questionSet.count({
        where: { version: 'mock-question-set-v1' },
      }),
      17,
    );
    assert.equal(await db.visitor.count(), beforeVisitors);
  } finally {
    await db.scene.update({ where: { id: 'ppt' }, data: { name: scene.name } });
  }
});
test('M2-017 API-003: valid non-UUID correlation ID is preserved consistently with Swagger', async () => {
  const response = await fetch(`${base}/me`, {
    headers: { 'X-Request-Id': 'test_corr_001' },
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).requestId, 'test_corr_001');
  const schema = createDocument(app).components!.schemas!.ErrorResponse as {
    properties: Record<string, { format?: string; pattern?: string }>;
  };
  assert.equal(schema.properties.requestId!.format, undefined);
  assert.ok(
    new RegExp(schema.properties.requestId!.pattern!).test('test_corr_001'),
  );
});
test('M2-018 API-003: visitor creation throttles burst with429 and Retry-After', async () => {
  process.env.APP_ENV = 'demo';
  const throttled = await createApp();
  process.env.APP_ENV = 'test';
  await throttled.listen(0, '127.0.0.1');
  const endpoint = `${await throttled.getUrl()}/api/v1/visitor-sessions`;
  try {
    for (let n = 0; n < 20; n++)
      assert.equal((await fetch(endpoint, body({}))).status, 201);
    const blocked = await fetch(endpoint, body({}));
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '60');
    assert.equal((await blocked.json()).code, 'RATE_LIMITED');
  } finally {
    await throttled.close();
  }
});
test('M2-019 API-001: actual success/error responses validate against every current OpenAPI operation', async () => {
  const document = createDocument(app);
  const validator = new Ajv({ strict: false, allErrors: true });
  addFormats(validator);
  const cases = [
    ['/health', 'get', 200, {}],
    ['/health?unknown=1', 'get', 400, {}],
    ['/me', 'get', 200, { headers: { authorization: `Bearer ${credential}` } }],
    ['/me', 'get', 401, {}],
    ['/admin/system', 'get', 200, { headers: { 'X-Admin-Local': '1' } }],
    ['/admin/system', 'get', 403, {}],
    ['/visitor-sessions', 'post', 201, body({})],
    ['/visitor-sessions', 'post', 400, body({ ownerId: 'forged' })],
  ] as const;
  for (const [path, method, status, options] of cases) {
    const response = await fetch(base + path, options);
    assert.equal(response.status, status);
    const operation = document.paths[`/api/v1${path.split('?')[0]}`]![method]!;
    const definition = operation.responses[String(status)] as {
      content: Record<string, { schema: object }>;
    };
    const validate = validator.compile({
      components: document.components,
      ...definition.content['application/json']!.schema,
    });
    assert.equal(
      validate(await response.json()),
      true,
      JSON.stringify(validate.errors),
    );
  }
});
test('M2-020 API-003 EVT-004: injected database failure returns safe500 without internal diagnostic data', async () => {
  // Prisma returns a Proxy instance. Patch our real prototype seam, not a virtual delegate.
  const failed = mock.method(
    Database.prototype,
    'verifyConnection',
    async () => {
      throw new Error('PRIVATE_INTERNAL_FIXTURE');
    },
  );
  try {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 500);
    const result = await response.json();
    assert.equal(result.code, 'INTERNAL_ERROR');
    assert.equal(
      JSON.stringify(result).includes('PRIVATE_INTERNAL_FIXTURE'),
      false,
    );
    assert.equal('stack' in result, false);
  } finally {
    failed.mock.restore();
  }
  assert.equal((await fetch(`${base}/health`)).status, 200);
});
