import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { crc32 } from 'node:zlib';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createApp, createDocument } from '../../apps/api/src/app';
import { loadLocalEnvironment } from '../../apps/api/src/config';
import { Database } from '../../apps/api/src/database';
import {
  MAX_IMAGE_BYTES,
  privateImagePath,
  privateImages,
  UploadsService,
} from '../../apps/api/src/jobs/uploads.service';
import fixture from '../../packages/domain/fixtures/ocr/mock-jd-v1.json';

loadLocalEnvironment();
const database = new URL(process.env.DATABASE_URL!);
database.pathname = '/career_test';
process.env.DATABASE_URL = database.toString();
process.env.APP_ENV = 'test';
let app: Awaited<ReturnType<typeof createApp>>;
let db: Database;
let base: string;
let document: ReturnType<typeof createDocument>;
const guests: { visitorId: string; credential: string }[] = [];
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const key = () => randomUUID();
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
  app = await createApp({ startWorkers: false });
  await app.listen(0, '127.0.0.1');
  db = app.get(Database);
  base = `${await app.getUrl()}/api/v1`;
  document = createDocument(app);
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
    const uploads = await db.upload.findMany({ where: { visitorId } });
    for (const upload of uploads) {
      try {
        await unlink(privateImagePath(upload.path));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    await db.analysisJob.deleteMany({ where: { visitorId } });
    await db.jobDescription.deleteMany({ where: { visitorId } });
    await db.ocrJob.deleteMany({
      where: { uploadId: { in: uploads.map((upload) => upload.id) } },
    });
    await db.upload.deleteMany({ where: { visitorId } });
    await db.idempotencyRecord.deleteMany({
      where: { actor: { in: visitorId.in } },
    });
    await db.visitorCredential.deleteMany({ where: { visitorId } });
    await db.visitor.deleteMany({ where: { id: visitorId } });
  } finally {
    await app.close();
  }
});
function validateResponse(
  path: string,
  method: 'get' | 'post',
  status: number,
  body: unknown,
) {
  const definition = Object.entries(document.paths).find(([pattern]) =>
    new RegExp(`^${pattern.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(
      `/api/v1${path.split('?')[0]}`,
    ),
  );
  assert.ok(definition);
  const response = definition[1]![method]!.responses[String(status)] as {
    content: Record<string, { schema: object }>;
  };
  const validate = ajv.compile({
    components: document.components,
    ...response.content['application/json']!.schema,
  });
  assert.equal(validate(body), true, JSON.stringify(validate.errors));
}
async function json(path: string, status = 200, payload?: unknown, guest = 0) {
  const method = payload === undefined ? 'GET' : 'POST';
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
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${body.code ?? 'unexpected status'}`,
  );
  validateResponse(path, method.toLowerCase() as 'get' | 'post', status, body);
  if (status === 201)
    assert.equal(response.headers.get('location'), `/api/v1${path}/${body.id}`);
  return body;
}
async function upload(
  bytes: Buffer,
  mime = 'image/png',
  status = 201,
  idempotencyKey = key(),
  guest = 0,
  extra?: string,
) {
  const form = new FormData();
  form.set('idempotencyKey', idempotencyKey);
  form.set(
    'file',
    new Blob([new Uint8Array(bytes)], { type: mime }),
    'private-test.png',
  );
  if (extra) form.set(extra, 'forged');
  const response = await fetch(base + '/uploads', {
    method: 'POST',
    headers:
      guest < 0 ? {} : { authorization: `Bearer ${guests[guest]!.credential}` },
    body: form,
  });
  const body = await response.json();
  assert.equal(
    response.status,
    status,
    `upload: ${body.code ?? 'unexpected status'}`,
  );
  validateResponse('/uploads', 'post', status, body);
  if (status === 201)
    assert.equal(
      response.headers.get('location'),
      `/api/v1/uploads/${body.id}`,
    );
  return body;
}
function image(codec = 'png') {
  const command = spawnSync(
    require('ffmpeg-static') as string,
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=32x32',
      '-frames:v',
      '1',
      '-vcodec',
      codec,
      '-f',
      'image2pipe',
      'pipe:1',
    ],
    { windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  assert.equal(
    command.status,
    0,
    'Unable to create deterministic codec test image',
  );
  return command.stdout;
}
const example = () => readFileSync('apps/miniapp/src/assets/jd-example.png');

test('M4-011 OCR-001/002 MT-026/028: actual PNG/JPEG/WEBP fully decode; metadata is private and filenames never persisted', async () => {
  for (const [codec, mime] of [
    ['png', 'image/png'],
    ['mjpeg', 'image/jpeg'],
    ['libwebp', 'image/webp'],
  ] as const) {
    const result = await upload(image(codec), mime);
    assert.equal(result.mediaType, mime);
    assert.ok(result.size > 0);
    assert.equal('path' in result, false);
    assert.equal('sha256' in result, false);
    const stored = await db.upload.findUniqueOrThrow({
      where: { id: result.id },
    });
    assert.doesNotMatch(stored.path, /private-test/);
    assert.match(stored.path, /^[a-f0-9-]{36}\.(png|jpg|webp)$/);
    assert.deepEqual(await json(`/uploads/${result.id}`), result);
  }
});
test('M4-012 OCR-001 MT-027: exact10MiB accepted, one-byte-over413, zero-byte400; server does not rely on client size hints', async () => {
  const bytes = image();
  // A valid private ancillary PNG chunk, not junk appended after IEND.
  assert.equal(bytes.subarray(-8, -4).toString(), 'IEND');
  const padding = Buffer.alloc(MAX_IMAGE_BYTES - bytes.length);
  padding.writeUInt32BE(padding.length - 12, 0);
  padding.write('npAd', 4);
  padding.writeUInt32BE(crc32(padding.subarray(4, -4)), padding.length - 4);
  const atLimit = Buffer.concat([
    bytes.subarray(0, -12),
    padding,
    bytes.subarray(-12),
  ]);
  const result = await upload(atLimit);
  assert.equal(result.size, MAX_IMAGE_BYTES);
  await upload(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png', 413);
  await upload(Buffer.alloc(0), 'image/png', 400);
});
test('M4-013 OCR-002 MT-028/030: renamed script, truncated image, MIME mismatch and extra multipart field fail without leaving files', async () => {
  const before = new Set(await readdir(privateImages()));
  await upload(Buffer.from('<script>bad()</script>'), 'image/png', 415);
  await upload(image().subarray(0, 20), 'image/png', 415);
  await upload(image(), 'image/jpeg', 415);
  await upload(image(), 'image/png', 400, key(), 0, 'visitorId');
  assert.deepEqual(new Set(await readdir(privateImages())), before);
  await json('/uploads', 415, { idempotencyKey: key() });
});
test('M4-014 OCR-001 API-003: repeated/concurrent upload key returns one persistent file, altered image409 and no orphan temporary file', async () => {
  const bytes = example();
  const token = key();
  const [first, second] = await Promise.all([
    upload(bytes, 'image/png', 201, token),
    upload(bytes, 'image/png', 201, token),
  ]);
  assert.deepEqual(second, first);
  const files = new Set(await readdir(privateImages()));
  await upload(image(), 'image/png', 409, token);
  assert.deepEqual(new Set(await readdir(privateImages())), files);
  assert.equal(await db.upload.count({ where: { id: first.id } }), 1);
});
test('M4-015 PLAN-002 MT-128: content needs owner Bearer, rejects URL credentials and foreign resources, returns private no-store bytes', async () => {
  const bytes = example();
  const saved = await upload(bytes);
  await json(`/uploads/${saved.id}`, 401, undefined, -1);
  await json(`/uploads/${saved.id}`, 404, undefined, 1);
  await json(`/uploads/${saved.id}/content`, 401, undefined, -1);
  await json(`/uploads/${saved.id}/content`, 404, undefined, 1);
  await json(`/uploads/${saved.id}/content?token=forged`, 400);
  const response = await fetch(new URL(saved.contentPath, base), {
    headers: { authorization: `Bearer ${guests[0]!.credential}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('content-type')!, /image\/png/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});
test('M4-016 OCR-003 MT-033–037: only exact fixture hash yields marked simulated text; arbitrary valid image requires manual entry', async () => {
  const saved = await upload(example());
  const payload = { uploadId: saved.id, idempotencyKey: key() };
  const ocr = await json('/ocr-jobs', 201, payload);
  assert.equal(ocr.provider, 'local-fixture');
  assert.equal(ocr.status, 'succeeded');
  assert.equal(ocr.text, fixture.text);
  assert.deepEqual(await json('/ocr-jobs', 201, payload), ocr);
  assert.deepEqual(await json(`/ocr-jobs/${ocr.id}`), ocr);
  await json(`/ocr-jobs/${ocr.id}`, 404, undefined, 1);
  const arbitrary = await upload(image());
  const manual = await json('/ocr-jobs', 201, {
    uploadId: arbitrary.id,
    idempotencyKey: key(),
  });
  assert.equal(manual.provider, 'local-manual');
  assert.equal(manual.status, 'failed');
  assert.equal(manual.text, null);
  assert.equal(manual.errorCode, 'OCR_NOT_CONNECTED_MANUAL_REQUIRED');
  await json('/job-descriptions', 422, {
    text: '人工输入但不能伪称识别',
    source: 'fixture-confirmed',
    uploadId: arbitrary.id,
    idempotencyKey: key(),
  });
  const confirmed = await json('/job-descriptions', 201, {
    text: '经用户核对，负责PPT汇报',
    source: 'fixture-confirmed',
    uploadId: saved.id,
    idempotencyKey: key(),
  });
  assert.equal(confirmed.text, '经用户核对，负责PPT汇报');
  const typed = await json('/job-descriptions', 201, {
    text: '用户手工补录，不是OCR结果',
    source: 'image-manual',
    uploadId: arbitrary.id,
    idempotencyKey: key(),
  });
  assert.equal(typed.source, 'image-manual');
});
test('M4-017 RETENTION-001 MT-138: expired originals are inaccessible and purged; metadata/confirmed text survive, valid originals untouched', async () => {
  const saved = await upload(example());
  const keep = await upload(image());
  const ocr = await json('/ocr-jobs', 201, {
    uploadId: saved.id,
    idempotencyKey: key(),
  });
  const confirmed = await json('/job-descriptions', 201, {
    text: '已确认的业务文字',
    source: 'fixture-confirmed',
    uploadId: saved.id,
    idempotencyKey: key(),
  });
  const original = await db.upload.update({
    where: { id: saved.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  const retained = await db.upload.findUniqueOrThrow({
    where: { id: keep.id },
  });
  await json(`/uploads/${saved.id}`, 404);
  await json(`/uploads/${saved.id}/content`, 404);
  await json(`/ocr-jobs/${ocr.id}`, 404);
  await app.get(UploadsService).cleanupExpired();
  assert.equal(existsSync(privateImagePath(original.path)), false);
  assert.equal(existsSync(privateImagePath(retained.path)), true);
  assert.ok(
    (await db.upload.findUniqueOrThrow({ where: { id: saved.id } })).purgedAt,
  );
  assert.equal(
    (await json(`/job-descriptions/${confirmed.id}`)).text,
    '已确认的业务文字',
  );
});
