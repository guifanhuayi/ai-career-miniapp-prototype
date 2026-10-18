import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../apps/api/src/app';
import { loadLocalEnvironment } from '../../apps/api/src/config';
import { Database } from '../../apps/api/src/database';
import type { Question } from '../../packages/domain/src';

loadLocalEnvironment();
const database = new URL(process.env.DATABASE_URL!);
database.pathname = '/career_test';
process.env.DATABASE_URL = database.toString();
process.env.APP_ENV = 'test';
const compose = [
  'compose',
  '--env-file',
  'infra/runtime/local.env',
  '-f',
  'infra/compose.yaml',
];
function docker(args: string[], input?: Buffer) {
  return execFileSync('docker', [...compose, ...args], {
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60_000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}
function rootSql(sql: string, schema?: string) {
  return docker(
    [
      'exec',
      '-T',
      'mysql',
      'sh',
      '-c',
      `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root${schema ? ` -D ${schema}` : ''}`,
    ],
    Buffer.from(sql),
  );
}
const migrate = (url: string, schema = 'infra/prisma/schema.prisma') =>
  execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      schema,
    ],
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
      timeout: 60_000,
      windowsHide: true,
    },
  );
test('M8-I01 DB-001: full learning survives API/MySQL restart, backup restore and clean/upgrade migrations', {
  timeout: 180_000,
}, async () => {
  assert.equal(database.pathname, '/career_test');
  migrate(database.toString());
  let app = await createApp({ startWorkers: false });
  await app.listen(0, '127.0.0.1');
  let base = `${await app.getUrl()}/api/v1`,
    db = app.get(Database);
  let credential = '',
    visitorId = '';
  const createdSchemas: string[] = [];
  async function call(
    path: string,
    method = 'GET',
    body?: unknown,
    status = 200,
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await r.json();
    assert.equal(r.status, status, `${path}: ${value.code ?? ''}`);
    return value;
  }
  const schemaUrl = (name: string) => {
    const url = new URL(database);
    url.pathname = `/${name}`;
    return url.toString();
  };
  const createSchema = (kind: string) => {
    const name = `career_${kind}_${Date.now()}`;
    assert.match(name, /^career_(restore|upgrade)_\d+$/);
    rootSql(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4; GRANT ALL PRIVILEGES ON \`${name}\`.* TO 'career'@'%';`,
    );
    createdSchemas.push(name);
    return name;
  };
  try {
    const visitor = await call('/visitor-sessions', 'POST', {}, 201);
    credential = visitor.credential;
    visitorId = visitor.visitorId;
    const task = await db.task.findFirstOrThrow({
      where: { sceneId: 'ppt', status: 'published' },
    });
    const plan = await call(
      '/learning-plans',
      'POST',
      { sceneId: 'ppt', taskId: task.id, idempotencyKey: randomUUID() },
      201,
    );
    let attempt = await call(
      '/assessment-attempts',
      'POST',
      { planId: plan.id, idempotencyKey: randomUUID() },
      201,
    );
    const raw = await db.assessmentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    const questions = (raw.snapshot as unknown as { questions: Question[] })
      .questions;
    for (const q of questions)
      attempt = await call(
        `/assessment-attempts/${attempt.id}/answers/${q.id}`,
        'PUT',
        { option: q.correct, revision: attempt.revision },
      );
    attempt = await call(
      `/assessment-attempts/${attempt.id}/submissions`,
      'POST',
      { idempotencyKey: randomUUID() },
      201,
    );
    const course = await db.course.findFirstOrThrow({
      where: { status: 'published', mappings: { some: { taskId: task.id } } },
    });
    const path = `/learning-plans/${plan.id}/courses/${course.id}`;
    const learning = await call(path);
    await call(`${path}/progress`, 'PUT', {
      position: 1,
      clientEnded: false,
      revision: 0,
      mediaVersion: learning.progress.mediaVersion,
      idempotencyKey: randomUUID(),
    });
    await call(`/me/course-marks/${course.id}`, 'PUT', {});
    const expected = await call(`/learning-plans/${plan.id}`);
    await app.close();
    docker(['restart', 'mysql']);
    docker(['up', '-d', '--wait']);
    app = await createApp({ startWorkers: false });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
    db = app.get(Database);
    assert.deepEqual(await call(`/learning-plans/${plan.id}`), expected);
    assert.deepEqual(await call(`/assessment-attempts/${attempt.id}`), attempt);
    const resumed = await call(path);
    assert.equal(resumed.progress.position, 1);
    assert.equal(resumed.marked, true);
    // Dump only the isolated test database. The dump stays in memory and is never logged or committed.
    const backup = docker([
      'exec',
      '-T',
      'mysql',
      'sh',
      '-c',
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -u root --single-transaction --no-tablespaces career_test',
    ]);
    const restoredName = createSchema('restore');
    docker(
      [
        'exec',
        '-T',
        'mysql',
        'sh',
        '-c',
        `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root -D ${restoredName}`,
      ],
      backup,
    );
    migrate(schemaUrl(restoredName));
    const restored = new PrismaClient({
      datasourceUrl: schemaUrl(restoredName),
    });
    try {
      assert.deepEqual(
        await restored.assessmentAttempt.findUnique({
          where: { id: attempt.id },
        }),
        await db.assessmentAttempt.findUnique({ where: { id: attempt.id } }),
      );
      assert.equal(
        (
          await restored.visitorCourseProgress.findUniqueOrThrow({
            where: { visitorId_courseId: { visitorId, courseId: course.id } },
          })
        ).position,
        1,
      );
      assert.equal(
        await restored.courseMark.count({ where: { visitorId } }),
        1,
      );
    } finally {
      await restored.$disconnect();
    }
    // Reproduce the previous five migrations in a brand-new disposable schema, insert legacy facts, then upgrade.
    const upgradeName = createSchema('upgrade'),
      temporary = resolve('infra/runtime', upgradeName);
    mkdirSync(resolve(temporary, 'migrations'), { recursive: true });
    cpSync('infra/prisma/schema.prisma', resolve(temporary, 'schema.prisma'));
    for (const name of readdirSync('infra/prisma/migrations'))
      if (name !== '202610180006_analytics')
        cpSync(
          resolve('infra/prisma/migrations', name),
          resolve(temporary, 'migrations', name),
          { recursive: true },
        );
    migrate(schemaUrl(upgradeName), resolve(temporary, 'schema.prisma'));
    const legacyVisitor = randomUUID(),
      legacyEvent = randomUUID();
    rootSql(
      `INSERT INTO Visitor (id, environment) VALUES ('${legacyVisitor}', 'test'); INSERT INTO BehaviorEvent (id,visitorId,name,source,sessionId,environment,occurredAt,effectiveAt) VALUES ('${legacyEvent}','${legacyVisitor}','task_selected','server','legacy','test','2026-10-01','2026-10-01');`,
      upgradeName,
    );
    migrate(schemaUrl(upgradeName));
    const upgraded = new PrismaClient({
      datasourceUrl: schemaUrl(upgradeName),
    });
    try {
      assert.equal(
        (
          await upgraded.visitor.findUniqueOrThrow({
            where: { id: legacyVisitor },
          })
        ).firstLearningAt?.toISOString(),
        '2026-10-01T00:00:00.000Z',
      );
      assert.equal(await upgraded.behaviorEvent.count(), 1);
    } finally {
      await upgraded.$disconnect();
    }
  } finally {
    for (const name of createdSchemas) {
      assert.match(name, /^career_(restore|upgrade)_\d+$/);
      rootSql(`DROP DATABASE \`${name}\`;`);
    }
    if (visitorId) {
      const plans = await db.learningPlan.findMany({
        where: { visitorId },
        select: { id: true },
      });
      await db.courseProgress.deleteMany({
        where: { planId: { in: plans.map((p) => p.id) } },
      });
      await db.visitorCourseProgress.deleteMany({ where: { visitorId } });
      await db.courseMark.deleteMany({ where: { visitorId } });
      await db.assessmentAttempt.deleteMany({ where: { visitorId } });
      await db.learningPlan.deleteMany({ where: { visitorId } });
      await db.behaviorEvent.deleteMany({ where: { visitorId } });
      await db.idempotencyRecord.deleteMany({ where: { actor: visitorId } });
      await db.visitorCredential.deleteMany({ where: { visitorId } });
      await db.visitor.deleteMany({ where: { id: visitorId } });
    }
    await app.close();
  }
});
