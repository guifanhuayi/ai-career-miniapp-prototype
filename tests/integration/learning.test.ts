import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createApp, createDocument } from '../../apps/api/src/app';
import { loadLocalEnvironment } from '../../apps/api/src/config';
import { Database } from '../../apps/api/src/database';
import { jsonSnapshot } from '../../apps/api/src/idempotency';
import { AnalysisRunner } from '../../apps/api/src/jobs/analysis.runner';
import type { Question } from '../../packages/domain/src';

loadLocalEnvironment();
const database = new URL(process.env.DATABASE_URL!);
database.pathname = '/career_test';
process.env.DATABASE_URL = database.toString();
process.env.APP_ENV = 'test';
let app: Awaited<ReturnType<typeof createApp>>;
let db: Database;
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
    const r = await fetch(base + '/visitor-sessions', {
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
    const plans = await db.learningPlan.findMany({
      where: { visitorId },
      select: { id: true },
    });
    await db.courseProgress.deleteMany({
      where: { planId: { in: plans.map((p) => p.id) } },
    });
    await db.assessmentAttempt.deleteMany({ where: { visitorId } });
    await db.learningPlan.deleteMany({ where: { visitorId } });
    await db.courseMark.deleteMany({ where: { visitorId } });
    await db.visitorCourseProgress.deleteMany({ where: { visitorId } });
    await db.behaviorEvent.deleteMany({ where: { visitorId } });
    await db.analysisJob.deleteMany({ where: { visitorId } });
    await db.jobDescription.deleteMany({ where: { visitorId } });
    await db.idempotencyRecord.deleteMany({ where: { actor: visitorId } });
    await db.visitorCredential.deleteMany({ where: { visitorId } });
    await db.visitor.deleteMany({ where: { id: visitorId } });
  } finally {
    await app.close();
  }
});
async function call(
  path: string,
  status = 200,
  method = 'GET',
  payload?: unknown,
  guest = 0,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(guest < 0
        ? {}
        : { Authorization: `Bearer ${guests[guest]!.credential}` }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const body = await r.json();
  assert.equal(
    r.status,
    status,
    `${method} ${path}: ${body.code ?? 'unexpected status'}`,
  );
  const definition = Object.entries(document.paths).find(([pattern]) =>
    new RegExp(`^${pattern.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(
      `/api/v1${path.split('?')[0]}`,
    ),
  );
  assert.ok(definition);
  const operation =
    definition[1]![
      method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
    ]!;
  const response = operation.responses[String(status)] as {
    content: Record<string, { schema: object }>;
  };
  const validate = ajv.compile({
    components: document.components,
    ...response.content['application/json']!.schema,
  });
  assert.equal(validate(body), true, JSON.stringify(validate.errors));
  if (status === 201)
    assert.equal(
      r.headers.get('location'),
      `/api/v1${path.endsWith('/submissions') ? `/assessment-attempts/${body.id}` : `${path}/${body.id}`}`,
    );
  return body;
}
const plan = async (task = 0) => {
  const tasks = await db.task.findMany({
    where: { sceneId: 'ppt', status: 'published' },
    orderBy: { position: 'asc' },
  });
  return call('/learning-plans', 201, 'POST', {
    sceneId: 'ppt',
    taskId: tasks[task]!.id,
    idempotencyKey: key(),
  });
};
const attempt = (planId: string) =>
  call('/assessment-attempts', 201, 'POST', { planId, idempotencyKey: key() });
async function answerAll(id: string, score = 4) {
  const raw = await db.assessmentAttempt.findUniqueOrThrow({ where: { id } });
  const qs = (raw.snapshot as unknown as { questions: Question[] }).questions;
  let a = await call(`/assessment-attempts/${id}`);
  for (const [i, q] of qs.entries())
    a = await call(`/assessment-attempts/${id}/answers/${q.id}`, 200, 'PUT', {
      revision: a.revision,
      option: i < score ? q.correct : (q.correct + 1) % 3,
    });
  return a;
}
test('M5-001 MT059-064: all 36 tasks valid, unique plans, independent tasks, bad source and scene rejected', async () => {
  const tasks = await db.task.findMany({
    where: { status: 'published', scene: { status: 'published' } },
    include: { scene: true },
  });
  assert.equal(tasks.length, 36);
  for (const t of tasks) {
    const p = await call('/learning-plans', 201, 'POST', {
      sceneId: t.sceneId,
      taskId: t.id,
      idempotencyKey: key(),
    });
    assert.equal(p.taskName, t.name);
    assert.equal(p.output, t.scene.output);
  }
  const first = await plan();
  const second = await plan(1);
  assert.notEqual(first.id, second.id);
  const repeated = await Promise.all(Array.from({ length: 4 }, () => plan()));
  assert.ok(repeated.every((p) => p.id === first.id));
  assert.equal(
    await db.behaviorEvent.count({
      where: { visitorId: guests[0]!.visitorId, name: 'task_selected' },
    }),
    36,
  );
  await call('/learning-plans', 404, 'POST', {
    sceneId: 'data',
    taskId: first.taskId,
    idempotencyKey: key(),
  });
  await call('/learning-plans', 404, 'POST', {
    sceneId: 'ppt',
    taskId: first.taskId,
    sourceAnalysisId: key(),
    idempotencyKey: key(),
  });
  await call(`/learning-plans/${first.id}`, 404, 'GET', undefined, 1);
  await call('/learning-plans', 401, 'GET', undefined, -1);
});
test('M5-002 MT065-071: 4 private questions, one concurrent draft, missing/forged/foreign answers rejected, optimistic conflict', async () => {
  const p = await plan();
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () => attempt(p.id)),
  );
  assert.ok(attempts.every((a) => a.id === attempts[0].id));
  const a = attempts[0];
  assert.equal(a.questions.length, 4);
  assert.equal(a.isMock, true);
  assert.ok(
    a.questions.every(
      (q: object) => !('correct' in q) && !('explanation' in q),
    ),
  );
  await call(`/assessment-attempts/${a.id}/submissions`, 422, 'POST', {
    idempotencyKey: key(),
  });
  await call(
    `/assessment-attempts/${a.id}/answers/${a.questions[0].id}`,
    400,
    'PUT',
    { revision: 1, option: 0, score: 4 },
  );
  await call(`/assessment-attempts/${a.id}/answers/foreign`, 404, 'PUT', {
    revision: 1,
    option: 0,
  });
  const saved = await call(
    `/assessment-attempts/${a.id}/answers/${a.questions[0].id}`,
    200,
    'PUT',
    { revision: 1, option: 0 },
  );
  await call(
    `/assessment-attempts/${a.id}/answers/${a.questions[0].id}`,
    409,
    'PUT',
    { revision: 1, option: 1 },
  );
  assert.equal(
    (await call(`/assessment-attempts/${a.id}`)).revision,
    saved.revision,
  );
  await call(`/assessment-attempts/${a.id}`, 404, 'GET', undefined, 1);
});
test('M5-003 MT072-078: scores 0..4, one success event under concurrent submit, immutable old result and selected level', async () => {
  const p = await plan();
  let oldId = '';
  for (let score = 0; score <= 4; score++) {
    const a = await attempt(p.id);
    await answerAll(a.id, score);
    const submitKey = key();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        call(`/assessment-attempts/${a.id}/submissions`, 201, 'POST', {
          idempotencyKey: submitKey,
        }),
      ),
    );
    assert.ok(results.every((r) => r.score === score));
    assert.equal(
      results[0].recommendedLevel,
      score < 2 ? 'beginner' : score < 4 ? 'intermediate' : 'advanced',
    );
    assert.ok(
      results[0].questions.every(
        (q: object) => 'correct' in q && 'explanation' in q,
      ),
    );
    if (score === 0) {
      oldId = a.id;
      const current = await call(`/learning-plans/${p.id}`);
      assert.equal(current.selectedLevel, 'beginner');
      await call(`/learning-plans/${p.id}`, 200, 'PATCH', {
        revision: current.revision,
        selectedLevel: 'advanced',
      });
    }
    await call(
      `/assessment-attempts/${a.id}/answers/${results[0].questions[0].id}`,
      409,
      'PUT',
      { revision: results[0].revision, option: 0 },
    );
  }
  assert.equal((await call(`/assessment-attempts/${oldId}`)).score, 0);
  const current = await call(`/learning-plans/${p.id}`);
  assert.equal(current.selectedLevel, 'advanced');
  assert.equal(current.recommendedLevel, 'advanced');
  assert.equal(
    await db.behaviorEvent.count({
      where: {
        visitorId: guests[0]!.visitorId,
        taskId: p.taskId,
        name: 'assessment_submitted',
      },
    }),
    5,
  );
  await call(`/learning-plans/${p.id}`, 409, 'PATCH', {
    revision: 1,
    selectedLevel: 'beginner',
  });
});
test('M5-004 MT075-077: published question change preserves draft snapshot and old answer review', async () => {
  const p = await plan(1);
  const a = await attempt(p.id);
  const row = await db.assessmentAttempt.findUniqueOrThrow({
    where: { id: a.id },
  });
  const original = await db.questionSet.findFirstOrThrow({
    where: { sceneId: 'ppt', status: 'published' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const replacement = await db.questionSet.create({
    data: {
      sceneId: 'ppt',
      version: `test-${key()}`,
      status: 'published',
      questions: jsonSnapshot(
        (row.snapshot as unknown as { questions: Question[] }).questions.map(
          (q) => ({
            ...q,
            title: `新版-${q.title}`,
            correct: (q.correct + 1) % 3,
          }),
        ),
      ),
    },
  });
  try {
    assert.deepEqual(
      (await call(`/assessment-attempts/${a.id}`)).questions,
      a.questions,
    );
    assert.equal(
      (await call(`/assessment-attempts/${a.id}`)).questionVersion,
      original.version,
    );
    await answerAll(a.id);
    await call(`/assessment-attempts/${a.id}/submissions`, 201, 'POST', {
      idempotencyKey: key(),
    });
    const next = await attempt(p.id);
    assert.equal(next.questionVersion, replacement.version);
    assert.ok(
      next.questions.every((q: { title: string }) =>
        q.title.startsWith('新版-'),
      ),
    );
  } finally {
    await db.questionSet.delete({ where: { id: replacement.id } });
  }
});
test('M5-005 MT079-088/104-109: shared course seconds/marks and independent task cursor, no implicit completion', async () => {
  const p = await plan();
  const p2 = await plan(1);
  const course = await db.course.findFirstOrThrow({
    where: {
      status: 'published',
      mappings: { some: { taskId: p.taskId, level: p.selectedLevel } },
    },
    include: { mediaAsset: true },
  });
  const path = `/learning-plans/${p.id}/courses/${course.id}`;
  const first = await call(path);
  assert.equal(first.progress.position, 0);
  assert.equal(first.marked, false);
  const body = {
    revision: 0,
    position: 1,
    clientEnded: false,
    mediaVersion: first.progress.mediaVersion,
    idempotencyKey: key(),
  };
  const saved = await call(path + '/progress', 200, 'PUT', body);
  assert.equal(saved.revision, 1);
  assert.deepEqual(await call(path + '/progress', 200, 'PUT', body), saved);
  await call(path + '/progress', 409, 'PUT', {
    ...body,
    idempotencyKey: key(),
  });
  await call(path + '/progress', 422, 'PUT', {
    ...body,
    revision: 1,
    position: course.durationSeconds! + 1,
    idempotencyKey: key(),
  });
  assert.equal((await call(path)).marked, false);
  await call(`/me/course-marks/${course.id}`, 200, 'PUT', {});
  await call(`/me/course-marks/${course.id}`, 200, 'PUT', {});
  assert.equal((await call(path)).marked, true);
  assert.equal(
    (await call(`/learning-plans/${p2.id}/courses/${course.id}`)).progress
      .position,
    1,
  );
  assert.equal((await call(`/learning-plans/${p2.id}`)).lastCourseId, null);
  assert.equal((await call(`/learning-plans/${p.id}`)).lastCourseId, course.id);
  assert.equal(
    (await call(`/learning-plans/${p2.id}/courses/${course.id}`)).marked,
    true,
  );
  await call(
    path + '/progress',
    404,
    'PUT',
    { ...body, idempotencyKey: key() },
    1,
  );
  await call(`/me/course-marks/${course.id}`, 200, 'DELETE', {});
  assert.equal((await call(path)).progress.position, 1);
  const oldStatus = course.status;
  await db.course.update({
    where: { id: course.id },
    data: { status: 'archived' },
  });
  try {
    await call(path, 404);
    await call(`/me/course-marks/${course.id}`, 404, 'PUT', {});
  } finally {
    await db.course.update({
      where: { id: course.id },
      data: { status: oldStatus },
    });
  }
});
test('M5-006 MT070/103/114: real API restart retains draft, grades, positions; downlisted history remains', async () => {
  const p = await plan(1);
  const a = await call(`/assessment-attempts/${p.latestAttemptId}`);
  await call(
    `/assessment-attempts/${a.id}/answers/${a.questions[0].id}`,
    200,
    'PUT',
    { revision: a.revision, option: 1 },
  );
  await app.close();
  await start();
  assert.equal(
    (await call(`/assessment-attempts/${a.id}`)).questions[0].answer,
    1,
  );
  assert.equal((await call('/learning-plans?pageSize=100')).total, 36);
  const task = await db.task.update({
    where: { id: p.taskId },
    data: { status: 'archived' },
  });
  try {
    assert.equal((await call(`/learning-plans/${p.id}`)).available, false);
    await call('/assessment-attempts', 422, 'POST', {
      planId: p.id,
      idempotencyKey: key(),
    });
  } finally {
    await db.task.update({
      where: { id: task.id },
      data: { status: 'published' },
    });
  }
});

test('M5-007 MT095-100: backward seeks, ended report, media revision invalidates old position without marking', async () => {
  const p = await plan();
  const c = await db.course.findFirstOrThrow({
    where: { status: 'published', mappings: { some: { taskId: p.taskId } } },
  });
  const path = `/learning-plans/${p.id}/courses/${c.id}`;
  let state = await call(path);
  for (const position of [2, 1]) {
    const result = await call(path + '/progress', 200, 'PUT', {
      ...state.progress,
      position,
      clientEnded: false,
      idempotencyKey: key(),
    });
    state = { ...state, progress: result };
    assert.equal(result.position, position);
  }
  await call(path + '/progress', 200, 'PUT', {
    ...state.progress,
    position: c.durationSeconds,
    clientEnded: true,
    idempotencyKey: key(),
  });
  assert.equal((await call(path)).marked, false);
  const asset = await db.mediaAsset.findUniqueOrThrow({
    where: { id: c.mediaAssetId! },
  });
  await db.mediaAsset.update({
    where: { id: asset.id },
    data: { sha256: 'a'.repeat(64) },
  });
  try {
    const changed = await call(path);
    assert.equal(changed.progress.position, 0);
    assert.equal(changed.progress.clientEnded, false);
    await call(path + '/progress', 409, 'PUT', {
      ...state.progress,
      idempotencyKey: key(),
    });
  } finally {
    await db.mediaAsset.update({
      where: { id: asset.id },
      data: { sha256: asset.sha256 },
    });
  }
  await call(`/me/course-marks/${c.id}`, 200, 'PUT');
  await call(`/me/course-marks/${c.id}`, 200, 'DELETE');
  await db.mediaAsset.update({
    where: { id: asset.id },
    data: { relativePath: 'missing-learning-test.mp4' },
  });
  try {
    await call(`/me/course-marks/${c.id}`, 422, 'PUT');
    assert.equal((await call(path)).marked, false);
  } finally {
    await db.mediaAsset.update({
      where: { id: asset.id },
      data: { relativePath: asset.relativePath },
    });
  }
  await call(`/me/course-marks/${c.id}`, 400, 'PUT', {
    visitorId: guests[1]!.visitorId,
  });
});
test('M5-008 MT064/078/081/107: all grade mappings and every personal mutation reject other visitors/forged owners', async () => {
  const p = await plan();
  const a = await attempt(p.id);
  await call(
    '/assessment-attempts',
    404,
    'POST',
    { planId: p.id, idempotencyKey: key() },
    1,
  );
  await call(
    `/assessment-attempts/${a.id}/answers/${a.questions[0].id}`,
    404,
    'PUT',
    { revision: a.revision, option: 0 },
    1,
  );
  await call(
    `/assessment-attempts/${a.id}/submissions`,
    404,
    'POST',
    { idempotencyKey: key() },
    1,
  );
  await call(
    `/learning-plans/${p.id}`,
    404,
    'PATCH',
    { revision: p.revision, selectedLevel: 'beginner' },
    1,
  );
  await call('/learning-plans', 400, 'POST', {
    sceneId: 'ppt',
    taskId: p.taskId,
    visitorId: guests[1]!.visitorId,
    idempotencyKey: key(),
  });
  for (const task of await db.task.findMany({
    where: { status: 'published', scene: { status: 'published' } },
  })) {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
      const list = await call(
        `/courses?taskId=${task.id}&level=${level}&pageSize=100`,
      );
      assert.ok(list.items.length > 0);
      assert.ok(
        list.items.every(
          (c: {
            durationSeconds: number;
            mappings: { taskId: string; level: string }[];
          }) =>
            c.durationSeconds > 0 &&
            c.durationSeconds <= 2100 &&
            c.mappings.some((m) => m.taskId === task.id && m.level === level),
        ),
      );
    }
  }
});
test('M6-001 MT108-113: task source is immutable across new analysis, foreign sources rejected and pending directions do not create plans', async () => {
  async function source(title: string) {
    const input = await call(
      '/job-descriptions',
      201,
      'POST',
      { title, text: '制作PPT汇报', source: 'text', idempotencyKey: key() },
      1,
    );
    const a = await call(
      '/analysis-jobs',
      201,
      'POST',
      { jobDescriptionId: input.id, flowId: key(), idempotencyKey: key() },
      1,
    );
    await app.get(AnalysisRunner).runOnce();
    const ready = await call(
      `/analysis-jobs/${a.id}`,
      200,
      'GET',
      undefined,
      1,
    );
    assert.equal(ready.status, 'succeeded');
    return call(
      `/analysis-jobs/${a.id}/selection`,
      200,
      'PUT',
      { revision: ready.revision, sceneIds: ['ppt'] },
      1,
    );
  }
  const tasks = await db.task.findMany({
    where: { sceneId: 'ppt', status: 'published' },
    orderBy: { position: 'asc' },
  });
  const first = await source('首次岗位');
  assert.equal(
    (await call('/learning-plans', 200, 'GET', undefined, 1)).total,
    0,
  );
  const body = {
    sceneId: 'ppt',
    taskId: tasks[0]!.id,
    sourceAnalysisId: first.id,
    idempotencyKey: key(),
  };
  const p = await call('/learning-plans', 201, 'POST', body, 1);
  assert.equal(p.sourceTitle, '首次岗位');
  assert.equal(p.flowId, first.flowId);
  const second = await source('第二岗位');
  const same = await call(
    '/learning-plans',
    201,
    'POST',
    { ...body, sourceAnalysisId: second.id, idempotencyKey: key() },
    1,
  );
  assert.equal(same.id, p.id);
  assert.equal(same.sourceTitle, '首次岗位');
  assert.equal(same.sourceAnalysisId, first.id);
  await call('/learning-plans', 404, 'POST', {
    ...body,
    idempotencyKey: key(),
  });
  const invalid = await call(
    '/learning-plans',
    201,
    'POST',
    { sceneId: 'ppt', taskId: tasks[1]!.id, idempotencyKey: key() },
    1,
  );
  await call(
    `/learning-plans/${invalid.id}`,
    422,
    'PATCH',
    { revision: invalid.revision, selectedLevel: 'advanced' },
    1,
  );
});
