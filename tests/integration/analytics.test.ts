import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { AnalyticsReportService } from '../../apps/api/src/analytics/analytics-report.service';
import { createApp, createDocument } from '../../apps/api/src/app';
import { loadLocalEnvironment } from '../../apps/api/src/config';
import { Database } from '../../apps/api/src/database';
import { jsonSnapshot } from '../../apps/api/src/idempotency';
import { addDays, DAY_MS, dayStart } from '../../packages/domain/src/analytics';
import { chinaDay } from '../../packages/domain/src/event-policy';

loadLocalEnvironment();
const database = new URL(process.env.DATABASE_URL!);
database.pathname = '/career_test';
process.env.DATABASE_URL = database.toString();
process.env.APP_ENV = 'test';
let app: Awaited<ReturnType<typeof createApp>>, db: Database, base: string;
const guests: { visitorId: string; credential: string }[] = [];
const today = chinaDay(new Date());
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
let document: ReturnType<typeof createDocument>;
const event = (name = 'page_view', extra = {}) => ({
  eventId: randomUUID(),
  name,
  schemaVersion: 1,
  occurredAt: new Date().toISOString(),
  appVersion: '0.1.0',
  ...extra,
});
before(async () => {
  assert.equal(database.pathname, '/career_test');
  for (const args of [
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      'infra/prisma/schema.prisma',
    ],
    [
      'node_modules/tsx/dist/cli.mjs',
      '--tsconfig',
      'apps/api/tsconfig.json',
      'infra/seed.ts',
    ],
  ])
    execFileSync(process.execPath, args, { env: process.env, stdio: 'pipe' });
  app = await createApp({ startWorkers: false });
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  db = app.get(Database);
  document = createDocument(app);
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${base}/visitor-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    guests.push(await r.json());
  }
});
after(async () => {
  if (!db) return;
  try {
    const visitorId = { in: guests.map((g) => g.visitorId) };
    await db.assessmentAttempt.deleteMany({ where: { visitorId } });
    await db.learningPlan.deleteMany({ where: { visitorId } });
    await db.behaviorEvent.deleteMany({ where: { visitorId } });
    await db.idempotencyRecord.deleteMany({ where: { actor: visitorId } });
    await db.visitorCredential.deleteMany({ where: { visitorId } });
    await db.visitor.deleteMany({ where: { id: visitorId } });
  } finally {
    await app.close();
  }
});
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  status = 200,
  guest = 0,
  admin = false,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(guest >= 0
        ? { Authorization: `Bearer ${guests[guest]!.credential}` }
        : {}),
      ...(admin ? { 'X-Admin-Local': '1' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`);
  const operation = Object.entries(document.paths).find(([pattern]) =>
    new RegExp(`^${pattern.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(
      `/api/v1${path.split('?')[0]}`,
    ),
  )?.[1]?.[method.toLowerCase() as 'get' | 'post'];
  const schema = (
    operation?.responses[String(status)] as {
      content?: { 'application/json'?: { schema: object } };
    }
  )?.content?.['application/json']?.schema;
  assert.ok(schema);
  const validate = ajv.compile({ components: document.components, ...schema });
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
  return result;
}
const collect = (events: unknown[], status = 200, guest = 0) =>
  request('/events', 'POST', { events }, status, guest);
const report = (startDay = today, endDay = startDay, environment = 'test') =>
  request(
    `/admin/analytics?environment=${environment}&startDay=${startDay}&endDay=${endDay}`,
    'GET',
    undefined,
    200,
    -1,
    true,
  );
async function plan(task = 0, guest = 0) {
  const tasks = await db.task.findMany({
    where: { sceneId: 'ppt', status: 'published' },
    orderBy: { position: 'asc' },
  });
  return request(
    '/learning-plans',
    'POST',
    { sceneId: 'ppt', taskId: tasks[task]!.id, idempotencyKey: randomUUID() },
    201,
    guest,
  );
}

test('M7-I01 MT125/128/130: strict batch schema, no client success/PII/identity/environment forgery', async () => {
  await request('/events', 'POST', { events: [event()] }, 401, -1);
  for (const invalid of [
    { events: [] },
    { events: Array.from({ length: 51 }, () => event()) },
    { events: [event('assessment_submitted')] },
    { events: [event('page_view', { visitorId: guests[1]!.visitorId })] },
    { events: [event('page_view', { properties: { text: 'private JD' } })] },
    { events: [event('page_view', { environment: 'production' })] },
    { events: [event('page_view', { schemaVersion: 2 })] },
    { events: [event('page_view', { planId: null })] },
    { events: [event('video_progress')] },
    { events: [event('page_view', { occurredAt: today })] },
  ])
    await request('/events', 'POST', invalid, 400);
  await request('/admin/analytics', 'GET', undefined, 403, -1);
  await request(
    '/admin/analytics?environment=other',
    'GET',
    undefined,
    400,
    -1,
    true,
  );
  await request(
    '/admin/analytics?startDay=2026-02-30',
    'GET',
    undefined,
    400,
    -1,
    true,
  );
  await request(
    `/admin/analytics?startDay=${today}&endDay=${addDays(today, -1)}`,
    'GET',
    undefined,
    400,
    -1,
    true,
  );
});

test('M7-I02 MT131: duplicate and concurrent batches idempotent, changed/foreign IDs409, atomic rollback', async () => {
  const e = event();
  const receipts = await Promise.all([collect([e]), collect([e])]);
  assert.equal(
    receipts.reduce((sum, r) => sum + r.accepted, 0),
    1,
  );
  assert.equal(
    receipts.reduce((sum, r) => sum + r.duplicates, 0),
    1,
  );
  await collect([{ ...e, appVersion: '0.1.1' }], 409);
  await collect([e], 409, 1);
  const rollback = event();
  await collect([rollback, { ...e, appVersion: 'changed' }], 409);
  assert.equal(
    await db.behaviorEvent.count({ where: { id: rollback.eventId } }),
    0,
  );
  const row = await db.behaviorEvent.findUniqueOrThrow({
    where: { id: e.eventId },
  });
  assert.equal(row.environment, 'test');
  assert.equal(row.source, 'client');
  assert.equal(JSON.stringify(row).includes(guests[0]!.credential), false);
});

test('M7-I03 MT132/135: abnormal clocks use received time, page views not active, session inactivity rolls', async () => {
  const e = event('page_view', { occurredAt: '2000-01-01T00:00:00Z' });
  await collect([e], 200, 1);
  let row = await db.behaviorEvent.findUniqueOrThrow({
    where: { id: e.eventId },
  });
  assert.equal(row.clockAnomaly, true);
  assert.equal(row.effectiveAt.getTime(), row.receivedAt.getTime());
  assert.equal(
    (
      await db.visitor.findUniqueOrThrow({
        where: { id: guests[1]!.visitorId },
      })
    ).firstLearningAt,
    null,
  );
  await db.behaviorEvent.update({
    where: { id: e.eventId },
    data: { receivedAt: new Date(Date.now() - 31 * 60_000) },
  });
  const next = event();
  await collect([next], 200, 1);
  const newer = await db.behaviorEvent.findUniqueOrThrow({
    where: { id: next.eventId },
  });
  assert.notEqual(newer.sessionId, row.sessionId);
  const same = event();
  await collect([same], 200, 1);
  row = await db.behaviorEvent.findUniqueOrThrow({
    where: { id: same.eventId },
  });
  assert.equal(row.sessionId, newer.sessionId);
});

test('M7-I04 MT128/137: context ownership, course mapping, progress throttling, end/pause separate', async () => {
  const p = await plan();
  const other = await plan(1, 1);
  await collect([event('learning_plan_resumed', { planId: other.id })], 404);
  await collect(
    [event('learning_plan_resumed', { planId: p.id, flowId: 'forged-flow' })],
    400,
  );
  const course = await db.course.findFirstOrThrow({
    where: { status: 'published', mappings: { some: { taskId: p.taskId } } },
  });
  await collect(
    [
      event('video_progress', {
        planId: p.id,
        courseId: course.id,
        position: 4,
      }),
    ],
    400,
  );
  const context = { planId: p.id, courseId: course.id, position: 1 };
  const first = event('video_progress', context);
  await collect([first]);
  const throttled = event('video_progress', context);
  const receipt = await collect([throttled]);
  assert.equal(receipt.throttled, 1);
  assert.equal((await collect([throttled])).duplicates, 1);
  await collect([
    event('video_paused', context),
    event('video_ended', { ...context, position: 3 }),
  ]);
  assert.equal(
    await db.courseMark.count({
      where: { visitorId: guests[0]!.visitorId, courseId: course.id },
    }),
    0,
  );
  assert.ok(
    (
      await db.visitor.findUniqueOrThrow({
        where: { id: guests[0]!.visitorId },
      })
    ).firstLearningAt !== null,
  ); // The server-confirmed task choice is learning activity; video reports cannot erase it.
});

async function seedFact(
  name: string,
  time: Date,
  flowId: string,
  taskId: string | null = null,
  visitor = 2,
) {
  const server = [
    'task_selected',
    'assessment_submitted',
    'assessment_started',
    'analysis_completed',
  ].includes(name);
  return db.behaviorEvent.create({
    data: {
      id: randomUUID(),
      name,
      source: server ? 'server' : 'client',
      visitorId: guests[visitor]!.visitorId,
      environment: 'test',
      sessionId: 'fixed-session',
      flowId,
      taskId,
      occurredAt: time,
      receivedAt: time,
      effectiveAt: time,
    },
  });
}
test('M7-I05 MT123/134/135/136: two-task cross-midnight funnel, no mixed-task success, distinct DAU/retention', async () => {
  const day = addDays(today, -30),
    second = addDays(day, 1),
    flow = randomUUID();
  const initial = await report(day, second);
  const time = new Date(dayStart(second).getTime() - 1000);
  for (const [i, name] of [
    'jd_submit',
    'analysis_completed',
    'task_selected',
    'assessment_submitted',
    'recommendation_viewed',
    'course_open_attempted',
  ].entries())
    await seedFact(
      name,
      new Date(time.getTime() + i * 1000),
      flow,
      i < 2 ? null : 'ppt-0',
    );
  await seedFact(
    'task_selected',
    new Date(time.getTime() + 2100),
    flow,
    'ppt-1',
  );
  await seedFact(
    'course_open_attempted',
    new Date(time.getTime() + 3100),
    flow,
    'ppt-1',
  );
  await db.visitor.update({
    where: { id: guests[2]!.visitorId },
    data: { firstLearningAt: new Date(time.getTime() + 2000) },
  });
  await seedFact(
    'learning_plan_resumed',
    dayStart(addDays(second, 1)),
    randomUUID(),
  );
  await seedFact(
    'learning_plan_resumed',
    dayStart(addDays(second, 7)),
    randomUUID(),
  );
  const result = await report(day, second);
  assert.equal(result.jobFunnel[0].chains - initial.jobFunnel[0].chains, 2);
  assert.equal(result.jobFunnel[5].chains - initial.jobFunnel[5].chains, 1);
  assert.equal(result.activeVisitors - initial.activeVisitors, 1);
  assert.equal(result.activity[0].dau - initial.activity[0].dau, 0);
  assert.equal(result.activity[1].dau - initial.activity[1].dau, 1);
  const cohort = result.retention.find(
    (r: { day: string }) => r.day === second,
  );
  assert.equal(cohort.d1.returned, 1);
  assert.equal(cohort.d7.returned, 1);
  const pending = await report(today);
  assert.equal(pending.retention[0].d7.pending, true);
  assert.equal(pending.retention[0].d7.rate, null);
  const formal = await request(
    '/admin/analytics',
    'GET',
    undefined,
    200,
    -1,
    true,
  );
  assert.equal(formal.environment, 'production');
  assert.equal(formal.activeVisitors, 0);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(guests[2]!.visitorId), false);
  assert.equal(serialized.includes(flow), false);
});

test('M7-I06 MT138: 90/14/365 boundaries, archive before deletion, repeated cleanup retains counts and business', async () => {
  const now = new Date();
  const archives = await db.dailyAggregate.findMany();
  const old = new Date(now.getTime() - 90 * DAY_MS - 1),
    retained = new Date(now.getTime() - 90 * DAY_MS);
  const flow = randomUUID();
  const expired = await seedFact('task_selected', old, flow, 'ppt-0');
  const kept = await seedFact('task_selected', retained, randomUUID(), 'ppt-0');
  const metric = await db.apiRequestMetric.create({
    data: {
      requestId: randomUUID(),
      route: '/api/v1/fixture',
      method: 'GET',
      status: 500,
      errorCode: 'FIXTURE_ERROR',
      durationMs: 123,
      retryCount: 1,
      environment: 'test',
      createdAt: new Date(now.getTime() - 14 * DAY_MS - 1),
    },
  });
  const expiredDay = addDays(today, -365);
  await db.dailyAggregate.upsert({
    where: { day_environment: { day: expiredDay, environment: 'test' } },
    create: { day: expiredDay, environment: 'test', metrics: {} },
    update: { metrics: {} },
  });
  const before = await report(chinaDay(old));
  const plansBefore = await db.learningPlan.count({
    where: { visitorId: guests[0]!.visitorId },
  });
  try {
    const worker = app.get(AnalyticsReportService);
    await worker.runOnce(now);
    assert.equal(
      await db.behaviorEvent.count({ where: { id: expired.id } }),
      0,
    );
    assert.equal(await db.behaviorEvent.count({ where: { id: kept.id } }), 1);
    assert.equal(
      await db.apiRequestMetric.count({ where: { id: metric.id } }),
      0,
    );
    assert.equal(
      await db.dailyAggregate.count({
        where: { day: expiredDay, environment: 'test' },
      }),
      0,
    );
    const first = await report(chinaDay(old));
    assert.deepEqual(first.jobFunnel, before.jobFunnel);
    assert.equal(first.activeVisitors, before.activeVisitors);
    await worker.runOnce(new Date(now.getTime() + 2000));
    const second = await report(chinaDay(old));
    assert.deepEqual(second.events, first.events);
    assert.equal(second.activeVisitors, first.activeVisitors);
    assert.equal(
      await db.learningPlan.count({
        where: { visitorId: guests[0]!.visitorId },
      }),
      plansBefore,
    );
    const requests = await report(chinaDay(metric.createdAt));
    assert.ok(
      requests.requests.errors.some(
        (r: { name: string }) => r.name === 'FIXTURE_ERROR',
      ),
    );
    assert.equal(requests.requests.percentileSamples, 0);
  } finally {
    await db.dailyAggregate.deleteMany();
    if (archives.length)
      await db.dailyAggregate.createMany({
        data: archives.map((a) => ({ ...a, metrics: jsonSnapshot(a.metrics) })),
      });
    await db.behaviorEvent.deleteMany({
      where: { id: { in: [expired.id, kept.id] } },
    });
    await db.apiRequestMetric.deleteMany({ where: { id: metric.id } });
  }
});
