import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test, { after, before, mock } from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createApp, createDocument } from '../../apps/api/src/app';
import { loadLocalEnvironment } from '../../apps/api/src/config';
import { Database } from '../../apps/api/src/database';
import {
  AnalysisRunner,
  RuleAnalyzer,
} from '../../apps/api/src/jobs/analysis.runner';

loadLocalEnvironment();
const database = new URL(process.env.DATABASE_URL!);
database.pathname = '/career_test';
process.env.DATABASE_URL = database.toString();
process.env.APP_ENV = 'test';
let app: Awaited<ReturnType<typeof createApp>>;
let db: Database;
let runner: AnalysisRunner;
let base: string;
let document: ReturnType<typeof createDocument>;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const guests: { visitorId: string; credential: string }[] = [];
const key = () => randomUUID();
async function start() {
  app = await createApp({ startWorkers: false });
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  db = app.get(Database);
  runner = app.get(AnalysisRunner);
  document = createDocument(app);
}
before(async () => {
  assert.equal(database.pathname, '/career_test');
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
  await start();
  for (let i = 0; i < 2; i++) {
    const response = await fetch(base + '/visitor-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 201);
    guests.push(await response.json());
  }
});
after(async () => {
  if (!db) return;
  try {
    const visitorId = { in: guests.map((guest) => guest.visitorId) };
    await db.behaviorEvent.deleteMany({ where: { visitorId } });
    await db.analysisJob.deleteMany({ where: { visitorId } });
    await db.jobDescription.deleteMany({ where: { visitorId } });
    await db.idempotencyRecord.deleteMany({
      where: { actor: { in: visitorId.in } },
    });
    await db.visitorCredential.deleteMany({ where: { visitorId } });
    await db.visitor.deleteMany({ where: { id: visitorId } });
  } finally {
    await app.close();
  }
});
async function call(
  path: string,
  expected = 200,
  method = 'GET',
  payload?: unknown,
  guest = 0,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(guest < 0
        ? {}
        : { authorization: `Bearer ${guests[guest]!.credential}` }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const body = await response.json();
  // Never print credentials or private JD bodies even on assertion failure.
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${body.code ?? 'unexpected status'}`,
  );
  const definition = Object.entries(document.paths).find(([pattern]) =>
    new RegExp(`^${pattern.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(
      `/api/v1${path.split('?')[0]}`,
    ),
  );
  assert.ok(definition);
  const operation =
    definition[1]![method.toLowerCase() as 'get' | 'post' | 'patch' | 'put']!;
  const result = operation.responses[String(expected)] as {
    content: Record<string, { schema: object }>;
  };
  const validate = ajv.compile({
    components: document.components,
    ...result.content['application/json']!.schema,
  });
  assert.equal(validate(body), true, JSON.stringify(validate.errors));
  if (expected === 201 && method === 'POST')
    assert.equal(response.headers.get('location'), `/api/v1${path}/${body.id}`);
  return body;
}
const inputFields = (changes = {}) => ({
  title: '运营实习',
  text: '😀需要Excel分析和PPT汇报。撰写文案，不负责视频生成。',
  source: 'text',
  idempotencyKey: key(),
  ...changes,
});
const createInput = (changes = {}, guest = 0) =>
  call('/job-descriptions', 201, 'POST', inputFields(changes), guest);
async function createAnalysis(text?: string) {
  const input = await createInput(text === undefined ? {} : { text });
  return call('/analysis-jobs', 201, 'POST', {
    jobDescriptionId: input.id,
    flowId: key(),
    idempotencyKey: key(),
  });
}

test('M4-001 JD-001/002 MT-019/021/023: blank/Unicode bounds/title defaults rejected or preserved without truncation', async () => {
  const before = await db.jobDescription.count({
    where: { visitorId: guests[0]!.visitorId },
  });
  for (const text of ['', ' \n\t ', '😀'.repeat(8001)])
    await call('/job-descriptions', 400, 'POST', inputFields({ text }));
  await call(
    '/job-descriptions',
    400,
    'POST',
    inputFields({ title: '😀'.repeat(101) }),
  );
  assert.equal(
    await db.jobDescription.count({
      where: { visitorId: guests[0]!.visitorId },
    }),
    before,
  );
  const accepted = await createInput({
    title: '😀'.repeat(100),
    text: '😀'.repeat(8000),
  });
  assert.equal(Array.from(accepted.text).length, 8000);
  assert.equal(Array.from(accepted.title).length, 100);
  const basic = await call('/job-descriptions', 201, 'POST', {
    text: '普通岗位说明',
    source: 'text',
    idempotencyKey: key(),
  });
  assert.equal(basic.title, '');
});
test('M4-002 JD-003 MT-020/042: immutable confirmed input preserves raw text and UTF16 evidence offsets, without executing instructions', async () => {
  const text =
    '😀负责Excel数据分析\n并制作PPT。<script>globalThis.compromised=true</script>';
  const job = await createAnalysis(text);
  assert.equal(job.input.text, text);
  assert.equal(job.status, 'queued');
  await runner.runOnce();
  const result = await call(`/analysis-jobs/${job.id}`);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.provider, 'local-rules');
  assert.deepEqual(
    result.items.map((item: { sceneId: string }) => item.sceneId).sort(),
    ['data', 'ppt'],
  );
  for (const item of result.items)
    assert.equal(result.input.text.slice(item.start, item.end), item.quote);
  const replacement = await createInput({ text: '另一个不同岗位要求编程' });
  assert.notEqual(replacement.id, result.input.id);
  assert.equal((await call(`/analysis-jobs/${job.id}`)).input.text, text);
  assert.equal('compromised' in globalThis, false);
});
test('M4-003 ANA-004 MT-031/126: concurrent same-key input/analysis creates one resource; changed payload409; success event exactly once', async () => {
  const payload = inputFields();
  const [first, second] = await Promise.all([
    call('/job-descriptions', 201, 'POST', payload),
    call('/job-descriptions', 201, 'POST', payload),
  ]);
  assert.deepEqual(second, first);
  await call('/job-descriptions', 409, 'POST', {
    ...payload,
    text: '不同正文',
  });
  const analysis = {
    jobDescriptionId: first.id,
    flowId: key(),
    idempotencyKey: key(),
  };
  const [a, b] = await Promise.all([
    call('/analysis-jobs', 201, 'POST', analysis),
    call('/analysis-jobs', 201, 'POST', analysis),
  ]);
  assert.deepEqual(a, b);
  await call('/analysis-jobs', 409, 'POST', { ...analysis, flowId: key() });
  await Promise.all([
    runner.runOnce(),
    new AnalysisRunner(db, new RuleAnalyzer()).runOnce(),
  ]);
  await runner.runOnce();
  const result = await call(`/analysis-jobs/${a.id}`);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.attempts, 1);
  assert.equal(
    await db.behaviorEvent.count({ where: { id: `analysis-${a.id}` } }),
    1,
  );
  assert.deepEqual(await call('/analysis-jobs', 201, 'POST', analysis), a); // Resource creation replay, GET supplies current status.
});
test('M4-004 PLAN-002/AUTH-002 MT-128: every JD/analysis resource is visitor-owned; unknown owner/score fields cannot forge success', async () => {
  const job = await createAnalysis();
  await runner.runOnce();
  for (const [path, method, payload] of [
    [`/job-descriptions/${job.input.id}`, 'GET', undefined],
    [`/analysis-jobs/${job.id}`, 'GET', undefined],
    [`/analysis-jobs/${job.id}`, 'PATCH', { status: 'cancelled' }],
    [
      `/analysis-jobs/${job.id}/selection`,
      'PUT',
      { revision: 3, sceneIds: ['ppt'] },
    ],
  ] as const) {
    await call(path, 401, method, payload, -1);
    await call(path, 404, method, payload, 1);
  }
  await call(
    '/analysis-jobs',
    404,
    'POST',
    { jobDescriptionId: job.input.id, flowId: key(), idempotencyKey: key() },
    1,
  );
  assert.equal(
    (await call('/analysis-jobs', 200, 'GET', undefined, 1)).total,
    0,
  );
  await call('/job-descriptions', 400, 'POST', {
    ...inputFields(),
    visitorId: guests[1]!.visitorId,
  });
  await call('/analysis-jobs', 400, 'POST', {
    jobDescriptionId: job.input.id,
    flowId: key(),
    idempotencyKey: key(),
    status: 'succeeded',
    score: 4,
  });
  await call('/analysis-jobs?visitorId=forged', 400);
  await call('/analysis-jobs?status=unknown', 400);
});
test('M4-005 ANA-002/007 MT-043–045: unmatched and negated requirements remain honest extension suggestions', async () => {
  for (const text of [
    '普通行政岗位，无明确AI要求',
    '无需PPT经验，不要求编程',
    '撰写短视频脚本，不负责视频生成',
  ]) {
    const job = await createAnalysis(text);
    await runner.runOnce();
    const result = await call(`/analysis-jobs/${job.id}`);
    assert.equal(result.status, 'succeeded');
    assert.equal(
      result.items.some(
        (item: { sceneId: string }) => item.sceneId === 'media',
      ),
      false,
    );
    if (text.startsWith('无需'))
      assert.ok(
        result.items.every(
          (item: { kind: string }) => item.kind === 'extension',
        ),
      );
    for (const item of result.items)
      if (item.kind === 'extension') {
        assert.equal(item.quote, '');
        assert.equal(item.start, 0);
        assert.equal(item.end, 0);
      }
  }
});
test('M4-006 ANA-003 MT-046: invalid structured result/unknown IDs/fabricated evidence/out-of-bounds/duplicate scenes fail closed', async () => {
  const badResults = [
    null,
    [{ sceneId: 'unknown', kind: 'direct', quote: 'PPT', start: 0, end: 3 }],
    [{ sceneId: 'ppt', kind: 'evil', quote: 'PPT', start: 0, end: 3 }],
    [{ sceneId: 'ppt', kind: 'direct', quote: 'PPT', start: 0, end: 4 }],
    [{ sceneId: 'ppt', kind: 'direct', quote: '伪造', start: 0, end: 2 }],
    [
      { sceneId: 'ppt', kind: 'extension', quote: '', start: 0, end: 0 },
      { sceneId: 'ppt', kind: 'extension', quote: '', start: 0, end: 0 },
    ],
  ];
  for (const bad of badResults) {
    const patched = mock.method(RuleAnalyzer.prototype, 'analyze', async () =>
      JSON.parse(JSON.stringify(bad)),
    );
    try {
      const job = await createAnalysis('PPT');
      await runner.runOnce();
      const result = await call(`/analysis-jobs/${job.id}`);
      assert.equal(result.status, 'failed');
      assert.equal(result.errorCode, 'ANALYSIS_OUTPUT_INVALID');
      assert.equal(
        await db.behaviorEvent.count({ where: { id: `analysis-${job.id}` } }),
        0,
      );
    } finally {
      patched.mock.restore();
    }
  }
});
test('M4-007 ANA-005 MT-039/040: cancel invalidates a live lease; late output cannot revive terminal state or success event', async () => {
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const patched = mock.method(RuleAnalyzer.prototype, 'analyze', async () => {
    await blocked;
    return [
      {
        sceneId: 'ppt',
        kind: 'direct' as const,
        quote: 'PPT',
        start: 0,
        end: 3,
      },
    ];
  });
  const job = await createAnalysis('PPT');
  const running = runner.runOnce();
  try {
    let status = 'queued';
    for (let n = 0; n < 100; n++) {
      status = (await call(`/analysis-jobs/${job.id}`)).status;
      if (status === 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(status, 'running');
    const cancelled = await call(`/analysis-jobs/${job.id}`, 200, 'PATCH', {
      status: 'cancelled',
    });
    assert.deepEqual(
      await call(`/analysis-jobs/${job.id}`, 200, 'PATCH', {
        status: 'cancelled',
      }),
      cancelled,
    );
  } finally {
    release!();
    await running;
    patched.mock.restore();
  }
  assert.equal((await call(`/analysis-jobs/${job.id}`)).status, 'cancelled');
  assert.equal(
    await db.behaviorEvent.count({ where: { id: `analysis-${job.id}` } }),
    0,
  );
});
test('M4-008 ANA-005 MT-039/040: deadline terminates queued work, transient failure bounded to2 attempts and restart recovers expired lease', async () => {
  const expired = await createAnalysis();
  await db.analysisJob.update({
    where: { id: expired.id },
    data: { deadline: new Date(Date.now() - 1) },
  });
  await runner.runOnce();
  assert.equal(
    (await call(`/analysis-jobs/${expired.id}`)).errorCode,
    'ANALYSIS_TIMEOUT',
  );
  const patched = mock.method(RuleAnalyzer.prototype, 'analyze', async () => {
    throw new Error('PRIVATE_ADAPTER_DIAGNOSTIC');
  });
  try {
    const failed = await createAnalysis();
    await runner.runOnce();
    assert.equal((await call(`/analysis-jobs/${failed.id}`)).status, 'queued');
    await runner.runOnce();
    const result = await call(`/analysis-jobs/${failed.id}`);
    assert.equal(result.status, 'failed');
    assert.equal(result.attempts, 2);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ADAPTER_DIAGNOSTIC/);
  } finally {
    patched.mock.restore();
  }
  const recovery = await createAnalysis();
  await db.analysisJob.update({
    where: { id: recovery.id },
    data: {
      status: 'running',
      attempts: 1,
      revision: 2,
      leaseId: key(),
      leaseUntil: new Date(Date.now() - 1),
    },
  });
  await app.close();
  await start();
  await runner.runOnce();
  const result = await call(`/analysis-jobs/${recovery.id}`);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.attempts, 2);
});
test('M4-009 ANA-006 MT-047–050: candidate selection is validated/versioned/idempotent and never creates default learning tasks', async () => {
  const job = await createAnalysis('Excel分析和PPT汇报');
  await runner.runOnce();
  const done = await call(`/analysis-jobs/${job.id}`);
  const before = await db.learningPlan.count({
    where: { visitorId: guests[0]!.visitorId },
  });
  const path = `/analysis-jobs/${job.id}/selection`;
  await call(path, 400, 'PUT', { revision: done.revision, sceneIds: [] });
  await call(path, 400, 'PUT', {
    revision: done.revision,
    sceneIds: ['ppt', 'ppt'],
  });
  await call(path, 422, 'PUT', {
    revision: done.revision,
    sceneIds: ['coding'],
  });
  const selected = await call(path, 200, 'PUT', {
    revision: done.revision,
    sceneIds: ['ppt', 'data'],
  });
  assert.deepEqual(selected.selectedScenes, ['ppt', 'data']);
  assert.deepEqual(
    await call(path, 200, 'PUT', {
      revision: done.revision,
      sceneIds: ['ppt', 'data'],
    }),
    selected,
  );
  await call(path, 409, 'PUT', { revision: done.revision, sceneIds: ['ppt'] });
  assert.equal(
    await db.learningPlan.count({ where: { visitorId: guests[0]!.visitorId } }),
    before,
  );
  await call(`/analysis-jobs/${job.id}`, 409, 'PATCH', { status: 'cancelled' });
  const list = await call(
    '/analysis-jobs?status=succeeded&search=' + encodeURIComponent('运营'),
  );
  assert.ok(list.items.length > 0);
  assert.ok(
    list.items.every((item: { status: string }) => item.status === 'succeeded'),
  );
  assert.deepEqual((await call('/analysis-jobs?page=999')).items, []);
});
test('M4-010 EVT-001/004 MT-129/131: authoritative success events share30min visitor session and contain no raw input', async () => {
  const events = await db.behaviorEvent.findMany({
    where: { visitorId: guests[0]!.visitorId },
  });
  assert.ok(events.length >= 2);
  assert.equal(new Set(events.map((event) => event.sessionId)).size, 1);
  for (const event of events) {
    assert.equal(event.source, 'server');
    assert.equal(event.name, 'analysis_completed');
    assert.equal(event.environment, 'test');
    assert.doesNotMatch(
      JSON.stringify(event),
      /需要Excel|PRIVATE_ADAPTER|credential|<script>/,
    );
  }
});
