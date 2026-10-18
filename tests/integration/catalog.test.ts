import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import type { MediaAsset, Scene, Task } from '@prisma/client';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createApp, createDocument } from '../../apps/api/src/app';
import { loadLocalEnvironment } from '../../apps/api/src/config';
import { Database } from '../../apps/api/src/database';
import { mediaDirectory } from '../../apps/api/src/media';
import data from '../../packages/domain/fixtures/prototype-content.json';

loadLocalEnvironment();
const database = new URL(process.env.DATABASE_URL!);
database.pathname = '/career_test';
process.env.DATABASE_URL = database.toString();
process.env.APP_ENV = 'test';
const namespace = `m3-${randomUUID()}`;
let app: Awaited<ReturnType<typeof createApp>>;
let db: Database;
let base: string;
let scenes: Scene[];
let tasks: Task[];
const createdCourses: string[] = [];
let document: ReturnType<typeof createDocument>;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const key = () => `${namespace}-${Math.random().toString(36).slice(2, 9)}`;
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
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  db = app.get(Database);
  document = createDocument(app);
  scenes = await db.scene.findMany({ where: { id: 'prompt' } });
  tasks = await db.task.findMany({ where: { sceneId: 'prompt' } });
});
after(async () => {
  if (!db) return;
  // Only this batch's fixtures and the exact edited catalog records, never career_local.
  for (const scene of scenes ?? []) {
    const { id, syllabus, ...fields } = scene;
    await db.scene.update({
      where: { id },
      data: { ...fields, syllabus: syllabus! },
    });
  }
  for (const task of tasks ?? []) {
    const { id, ...fields } = task;
    await db.task.update({ where: { id }, data: fields });
  }
  await db.courseMapping.deleteMany({
    where: { courseId: { in: createdCourses } },
  });
  await db.course.deleteMany({ where: { id: { in: createdCourses } } });
  await db.questionSet.deleteMany({
    where: { version: { startsWith: `mock-${namespace}` } },
  });
  await db.idempotencyRecord.deleteMany({
    where: { key: { startsWith: namespace } },
  });
  await db.mediaAsset.deleteMany({ where: { id: { startsWith: namespace } } });
  await app.close();
});
async function call(
  path: string,
  status = 200,
  method = 'GET',
  payload?: unknown,
  admin = path.startsWith('/admin/'),
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { 'X-Admin-Local': '1' } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const body = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(body)}`,
  );
  if (status === 201 && method === 'POST')
    assert.equal(response.headers.get('location'), `/api/v1${path}/${body.id}`);
  const definition = Object.entries(document.paths).find(([pattern]) =>
    new RegExp(`^${pattern.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(
      `/api/v1${path.split('?')[0]}`,
    ),
  );
  assert.ok(definition, path);
  const operation =
    definition[1]![method.toLowerCase() as 'get' | 'post' | 'patch']!;
  const result = operation.responses[String(status)] as {
    content: Record<string, { schema: object }>;
  };
  assert.ok(
    result?.content?.['application/json']?.schema,
    `${operation.operationId}:${status}`,
  );
  const validate = ajv.compile({
    components: document.components,
    ...result.content['application/json']!.schema,
  });
  assert.equal(validate(body), true, JSON.stringify(validate.errors));
  return body;
}
const fields = (changes = {}) => ({
  title: `课程-${namespace}`,
  author: '自制测试',
  durationSeconds: 3,
  mediaAssetId: 'local-test-video-v1',
  sourceUrl: null,
  authorization: '本项目自制测试，无教学内容',
  isTest: true,
  chapters: [{ title: '测试章节', durationSeconds: 3 }],
  mappings: [{ taskId: 'prompt-1', level: 'beginner' }],
  ...changes,
});
async function create(changes = {}, idempotencyKey = key()) {
  const result = await call('/admin/courses', 201, 'POST', {
    ...fields(changes),
    idempotencyKey,
  });
  if (!createdCourses.includes(result.id)) createdCourses.push(result.id);
  return result;
}
async function release(
  resource: string,
  resourceId: string,
  version: number,
  status = 'published',
  expected = 201,
  idempotencyKey = key(),
) {
  return call('/admin/content-releases', expected, 'POST', {
    resource,
    resourceId,
    version,
    status,
    idempotencyKey,
  });
}

test('M3-001 CAT-001: all17 scenes/36 stable tasks/168 topics match preserved prototype; public payloads contain no answers', async () => {
  const result = await call('/scenes?pageSize=100');
  assert.equal(result.total, 17);
  let taskCount = 0;
  let topics = 0;
  for (const fixture of data) {
    const scene = await call(`/scenes/${fixture.id}`);
    assert.equal(scene.name, fixture.name);
    assert.equal(scene.category, fixture.category);
    assert.equal(scene.description, fixture.description);
    assert.equal(scene.output, fixture.output);
    assert.equal(scene.icon, fixture.icon);
    assert.deepEqual(scene.syllabus, fixture.syllabus);
    const list = await call(`/scenes/${fixture.id}/tasks`);
    assert.deepEqual(
      list.items.map((item: { name: string }) => item.name),
      fixture.tasks.map((item) => item.name),
    );
    assert.ok(
      list.items.every(
        (item: { output: string }) => item.output === fixture.output,
      ),
    );
    assert.deepEqual(
      list.items.map((item: { id: string }) => item.id),
      fixture.tasks.map((item) => item.id),
    );
    taskCount += list.total;
    topics += Object.values(scene.syllabus as Record<string, string[]>).flat()
      .length;
    assert.doesNotMatch(
      JSON.stringify([scene, list]),
      /"correct"|"questions"|"explanation"/,
    );
  }
  assert.equal(taskCount, 36);
  assert.equal(topics, 168);
});
test('M3-002 CAT-001/002 MT-053/054: search task/id/case/trim and category intersection with real empty states', async () => {
  assert.equal(
    (await call(`/scenes?search=${encodeURIComponent('让结果更可用')}`))
      .items[0].id,
    'prompt',
  );
  assert.equal((await call('/scenes?search=%20API%20')).items[0].id, 'api');
  assert.equal(
    (await call(`/scenes?search=${encodeURIComponent('岗位专属提示词模板')}`))
      .items[0].id,
    'prompt',
  );
  assert.equal(
    (
      await call(
        `/scenes?search=PPT&category=${encodeURIComponent('求职准备')}`,
      )
    ).total,
    0,
  );
  const subset = await call(
    `/scenes?category=${encodeURIComponent('办公表达')}`,
  );
  assert.equal(subset.total, 2);
  assert.deepEqual((await call('/scenes?page=999')).items, []);
  await call('/scenes/not-existing', 404);
  await call('/scenes/not-existing/tasks', 404);
});
test('M3-003 API-003: invalid pagination/filter/unknown bypass params fail400 and query enums are documented', async () => {
  for (const query of [
    'page=0',
    'page=1.5',
    'pageSize=101',
    'pageSize=no',
    'category=unknown',
    'search=' + 'x'.repeat(101),
    'duration=long',
    'category=AI基础&category=工具连接',
  ])
    await call(`/scenes?${query}`, 400);
  for (const query of [
    '',
    '?taskId=prompt-1',
    '?taskId=prompt-1&level=unknown',
    '?taskId=prompt-1&level=beginner&maxDuration=9999',
  ])
    await call(`/courses${query}`, 400);
  const params = document.paths['/api/v1/scenes']!.get!.parameters as {
    name: string;
    schema: { enum?: string[] };
  }[];
  assert.deepEqual(
    new Set(params.find((param) => param.name === 'category')!.schema.enum),
    new Set(data.map((scene) => scene.category)),
  );
});
test('M3-004 AUTH-002: every admin route is guarded; origin cannot bypass content writes', async () => {
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.includes('/admin/')) continue;
    for (const [method, operation] of Object.entries(item!)) {
      assert.deepEqual(operation.security, [{ localAdmin: [] }]);
      const response = await fetch(
        base + path.replace('/api/v1', '').replace(/\{[^}]+\}/g, 'unknown'),
        {
          method: method.toUpperCase(),
          ...(method === 'get'
            ? {}
            : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
        },
      );
      assert.equal(response.status, 403);
    }
  }
  assert.equal(
    (
      await fetch(base + '/admin/courses', {
        headers: { 'X-Admin-Local': '1', Origin: 'https://foreign.invalid' },
      })
    ).status,
    403,
  );
});
test('M3-005 ADM-003: optimistic scene/task editing, stale409 and atomic audit snapshot', async () => {
  const scene = await call('/scenes/prompt');
  const payload = {
    version: scene.version,
    name: scene.name,
    category: scene.category,
    description: scene.description,
    output: scene.output,
    syllabus: scene.syllabus,
    position: scene.position,
  };
  const saved = await call('/admin/scenes/prompt', 200, 'PATCH', payload);
  assert.equal(saved.version, scene.version + 1);
  const audit = await db.adminAudit.findFirstOrThrow({
    where: {
      resource: 'scene',
      resourceId: 'prompt',
      action: 'update',
      toVersion: saved.version,
    },
  });
  assert.equal((audit.snapshot as { name: string }).name, scene.name);
  const count = await db.adminAudit.count();
  await call('/admin/scenes/prompt', 409, 'PATCH', {
    ...payload,
    name: '不应覆盖',
  });
  assert.equal(await db.adminAudit.count(), count);
  const task = (await call('/admin/scenes/prompt/tasks')).items[0];
  await call(`/admin/tasks/${task.id}`, 200, 'PATCH', {
    version: task.version,
    name: task.name,
    position: task.position,
  });
  await call(`/admin/tasks/${task.id}`, 409, 'PATCH', {
    version: task.version,
    name: '不应覆盖',
    position: 0,
  });
});
test('M3-006 API-003: missing nested syllabus/unknown state/prototype keys never silently pass or500', async () => {
  const scene = await call('/scenes/prompt');
  const base = {
    version: scene.version,
    name: scene.name,
    category: scene.category,
    description: scene.description,
    output: scene.output,
    position: scene.position,
  };
  await call('/admin/scenes/prompt', 400, 'PATCH', base);
  await call('/admin/scenes/prompt', 400, 'PATCH', {
    ...base,
    syllabus: scene.syllabus,
    status: 'archived',
  });
  await call(
    '/admin/courses',
    400,
    'POST',
    JSON.parse(`{"__proto__":{"polluted":true},"title":"bad"}`),
  );
  await call('/admin/courses', 400, 'POST', {
    ...fields(),
    idempotencyKey: key(),
    chapters: [{ title: 'bad', durationSeconds: 1, correct: 0 }],
  });
});
test('M3-007 ADM-002: draft creation is idempotent across concurrent requests, conflicts409 without duplicate course/audit', async () => {
  const token = key();
  const payload = { ...fields(), idempotencyKey: token };
  const [first, second] = await Promise.all([
    call('/admin/courses', 201, 'POST', payload),
    call('/admin/courses', 201, 'POST', payload),
  ]);
  createdCourses.push(first.id);
  assert.deepEqual(second, first);
  assert.equal(
    await db.adminAudit.count({
      where: { resourceId: first.id, action: 'create' },
    }),
    1,
  );
  await call('/admin/courses', 409, 'POST', { ...payload, title: '不同内容' });
  await call(`/courses/${first.id}`, 404);
});
test('M3-008 ADM-002 COURSE-002: publish verifies actual3s file; same release retry returns same audit; archive closes detail', async () => {
  const course = await create();
  const token = key();
  const first = await release('course', course.id, 1, 'published', 201, token);
  assert.deepEqual(
    await release('course', course.id, 1, 'published', 201, token),
    first,
  );
  assert.deepEqual(await call(`/admin/content-releases/${first.id}`), first);
  assert.equal((await call(`/courses/${course.id}`)).version, 2);
  assert.ok(
    (await call('/courses?taskId=prompt-1&level=beginner')).items.some(
      (item: { id: string }) => item.id === course.id,
    ),
  );
  await release('course', course.id, 1, 'archived', 409);
  await release('course', course.id, 2, 'archived');
  await call(`/courses/${course.id}`, 404);
  const list = await call(`/admin/content-releases?search=${course.id}`);
  assert.equal(list.total, 2);
});
test('M3-009 ADM-002 MT-117: unknown/zero/negative/over35/fractional-over durations can stay draft but never publish or bypass detail', async () => {
  for (const durationSeconds of [null, 0, -1, 2100.1, 2101]) {
    const course = await create({ durationSeconds });
    await release('course', course.id, 1, 'published', 422);
    await call(`/courses/${course.id}`, 404);
    assert.equal((await call(`/admin/courses/${course.id}`)).status, 'draft');
  }
});
test('M3-010 COURSE-002: authorization/media/test-marker/chapter/mapping rules reject incomplete publications and invalid links', async () => {
  for (const invalid of [
    { authorization: ' ' },
    { mediaAssetId: null },
    { isTest: false },
    { chapters: [] },
    { chapters: [{ title: '测试', durationSeconds: 2 }] },
    { mappings: [] },
    { durationSeconds: 2 },
  ]) {
    const course = await create(invalid);
    await release('course', course.id, 1, 'published', 422);
  }
  for (const invalid of [
    { sourceUrl: 'javascript:alert(1)' },
    { sourceUrl: 'https://user:secret@example.invalid' },
    { mappings: [{ taskId: 'missing', level: 'beginner' }] },
    {
      mappings: [
        { taskId: 'prompt-1', level: 'beginner' },
        { taskId: 'prompt-1', level: 'beginner' },
      ],
    },
  ])
    await call('/admin/courses', 422, 'POST', {
      ...fields(invalid),
      idempotencyKey: key(),
    });
});
test('M3-011 ADM-002: editing a published course cannot relax actual media policy and stale edits never overwrite', async () => {
  const course = await create();
  await release('course', course.id, 1);
  await call(`/admin/courses/${course.id}`, 422, 'PATCH', {
    ...fields({ durationSeconds: 2101 }),
    version: 2,
  });
  const saved = await call(`/admin/courses/${course.id}`, 200, 'PATCH', {
    ...fields({ title: '合法改名' }),
    version: 2,
  });
  assert.equal(saved.version, 3);
  await call(`/admin/courses/${course.id}`, 409, 'PATCH', {
    ...fields({ title: '旧内容' }),
    version: 2,
  });
  assert.equal((await call(`/courses/${course.id}`)).title, '合法改名');
});
test('M3-012 CAT-001 COURSE-002: unpublishing parent scene/task blocks public catalog, course and media mappings', async () => {
  const task = await db.task.findUniqueOrThrow({ where: { id: 'prompt-1' } });
  await release('task', task.id, task.version, 'archived');
  await call('/courses?taskId=prompt-1&level=beginner', 404);
  await release('task', task.id, task.version + 1);
  const scene = await call('/scenes/prompt');
  await release('scene', scene.id, scene.version, 'archived');
  await call('/scenes/prompt', 404);
  await call('/scenes/prompt/tasks', 404);
  await call('/courses/test-prompt-beginner-v1', 404);
  await release('task', task.id, task.version + 2, 'published', 422);
  await release('scene', scene.id, scene.version + 1);
});
test('M3-013 MEDIA-001: controlled native MP4 serves valid Range206, safe416 and no arbitrary paths', async () => {
  const response = await fetch(base + '/media/local-test-video-v1', {
    headers: { Range: 'bytes=0-31' },
  });
  assert.equal(response.status, 206);
  assert.match(response.headers.get('content-type')!, /video\/mp4/);
  assert.equal((await response.arrayBuffer()).byteLength, 32);
  assert.match(response.headers.get('content-range')!, /^bytes 0-31\//);
  const invalid = await fetch(base + '/media/local-test-video-v1', {
    headers: { Range: 'bytes=999999999-' },
  });
  assert.equal(invalid.status, 416);
  assert.equal((await invalid.json()).code, 'INVALID_MEDIA_RANGE');
  await call('/media/not-existing', 404);
  await call('/media/local-test-video-v1?url=https://example.invalid', 400);
  assert.ok(
    (await call('/admin/media-assets')).every(
      (item: { authorization: string }) => !('relativePath' in item),
    ),
  );
});
test('M3-014 MEDIA-001: file integrity/hash/path/actual duration mismatch fails publication without reading external paths', async () => {
  const original = await db.mediaAsset.findUniqueOrThrow({
    where: { id: 'local-test-video-v1' },
  });
  for (const invalid of [
    { sha256: '0'.repeat(64) },
    { relativePath: '../private.mp4' },
    { durationSeconds: 2 },
  ]) {
    const { verifiedAt: _time, ...fields } = original;
    const asset = await db.mediaAsset.create({
      data: { ...fields, ...invalid, id: key() },
    });
    const course = await create({ mediaAssetId: asset.id });
    await release('course', course.id, 1, 'published', 422);
  }
});
test('M3-015 ADM-002: mock question versions immutable after publication, retries stable, no overwrite of old version', async () => {
  const input = {
    sceneId: 'prompt',
    version: `mock-${namespace}`,
    isMock: true,
    questions: data[0]!.questions,
    idempotencyKey: key(),
  };
  const set = await call('/admin/question-sets', 201, 'POST', input);
  assert.deepEqual(await call(`/admin/question-sets/${set.id}`), set);
  assert.deepEqual(await call('/admin/question-sets', 201, 'POST', input), set);
  const edited = await call(`/admin/question-sets/${set.id}`, 200, 'PATCH', {
    revision: 1,
    questions: input.questions,
  });
  assert.equal(edited.revision, 2);
  await call(`/admin/question-sets/${set.id}`, 409, 'PATCH', {
    revision: 1,
    questions: input.questions,
  });
  await release('question-set', set.id, 2);
  await call(`/admin/question-sets/${set.id}`, 409, 'PATCH', {
    revision: 3,
    questions: input.questions,
  });
  await call('/admin/question-sets', 409, 'POST', {
    ...input,
    idempotencyKey: key(),
  });
  assert.equal(
    (
      await call(
        '/admin/question-sets?status=published&search=mock-question-set-v1',
      )
    ).total,
    17,
  );
});
test('M3-016 ADM-002: malformed mock content and unapproved real question set rejected', async () => {
  const input = {
    sceneId: 'prompt',
    version: `mock-${namespace}-invalid`,
    isMock: true,
    questions: data[0]!.questions,
    idempotencyKey: key(),
  };
  await call('/admin/question-sets', 400, 'POST', { ...input, isMock: false });
  await call('/admin/question-sets', 400, 'POST', {
    ...input,
    questions: input.questions.slice(0, 3),
  });
  await call('/admin/question-sets', 422, 'POST', {
    ...input,
    questions: input.questions.map((item) => ({ ...item, id: 'duplicate' })),
  });
  await call('/admin/question-sets', 400, 'POST', {
    ...input,
    questions: input.questions.map((item) => ({ ...item, correct: 3 })),
  });
});
test('M3-017 COURSE-006: real2099/2100 accepted and2100.1/2101 rejected', {
  skip:
    !existsSync(resolve(mediaDirectory(), 'boundary-2101.json')) &&
    '边界视频生成命令未获执行许可；不能用声明时长冒充实播测试',
}, async () => {
  for (const [id, expected] of [
    ['boundary-2099', 201],
    ['boundary-2100', 201],
    ['boundary-2100-1', 422],
    ['boundary-2101', 422],
  ] as const) {
    const fixture = JSON.parse(
      readFileSync(resolve(mediaDirectory(), `${id}.json`), 'utf8'),
    ) as Omit<MediaAsset, 'verifiedAt'>;
    const asset = await db.mediaAsset.create({
      data: { ...fixture, id: `${namespace}-${id}` },
    });
    const course = await create({
      mediaAssetId: asset.id,
      durationSeconds: asset.durationSeconds,
      chapters: [
        { title: '实际全长测试', durationSeconds: asset.durationSeconds },
      ],
    });
    await release('course', course.id, 1, 'published', expected);
    await call(`/courses/${course.id}`, expected === 201 ? 200 : 404);
  }
});

test('M3-018 API-001/003: remaining admin list schemas, documented filters, canonical missing resources and safe nested errors', async () => {
  await call('/admin/content-audits?pageSize=2');
  const scenes = await call('/admin/scenes?status=published&pageSize=100');
  assert.equal(scenes.total, 17);
  const courses = await call('/admin/courses?status=draft&pageSize=2');
  assert.ok(courses.items.length <= 2);
  await call('/admin/courses?status=not-a-status', 400);
  await call('/admin/question-sets?extra=1', 400);
  await call('/admin/question-sets/missing', 404);
  await call('/admin/content-releases/missing', 404);
  await call('/admin/courses/missing', 404);
  const error = await call('/admin/courses', 400, 'POST', {
    ...fields(),
    idempotencyKey: key(),
    chapters: [{ title: '测试', durationSeconds: 'not-a-number' }],
  });
  assert.ok(
    error.details.some((detail: string) =>
      detail.startsWith('chapters.0.durationSeconds:'),
    ),
  );
});
