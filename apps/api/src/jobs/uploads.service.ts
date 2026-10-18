import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { OcrJob, Upload } from '@prisma/client';
import fixture from '../../../../packages/domain/fixtures/ocr/mock-jd-v1.json';
import { Database } from '../database';
import { idempotent } from '../idempotency';
import { mediaDirectory } from '../media';
import type { OcrCreate, UploadFields } from './uploads.dto';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export interface UploadedImage {
  buffer: Buffer;
  size: number;
  mimetype: string;
}
export const privateImages = () =>
  resolve(mediaDirectory(), '../private-images');
export function privateImagePath(name: string) {
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(name))
    throw new UnprocessableEntityException('图片存储路径无效');
  return resolve(privateImages(), name);
}
const digest = (buffer: Buffer) =>
  createHash('sha256').update(buffer).digest('hex');
const mapUpload = (item: Upload) => ({
  id: item.id,
  mediaType: item.mediaType,
  size: item.size,
  createdAt: item.createdAt.toISOString(),
  expiresAt: item.expiresAt.toISOString(),
  contentPath: `/api/v1/uploads/${item.id}/content`,
});
const mapOcr = (item: OcrJob) => ({
  id: item.id,
  uploadId: item.uploadId,
  status: item.status,
  provider: item.provider,
  text: item.text,
  errorCode: item.errorCode,
  createdAt: item.createdAt.toISOString(),
});
async function removeOwnFile(path: string) {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
async function run(executable: string, args: string[]) {
  return new Promise<string>((resolveOutput, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let value = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new UnsupportedMediaTypeException('图片核验超时，请选择有效截图'));
    }, 5000);
    child.stdout.on('data', (bytes) => {
      value += bytes;
      if (value.length > 20000) child.kill();
    });
    child.stderr.resume();
    child.on('error', () => {
      clearTimeout(timer);
      reject(new UnprocessableEntityException('图片校验工具不可用'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveOutput(value);
      else reject(new UnsupportedMediaTypeException('图片损坏或无法解码'));
    });
  });
}
@Injectable()
export class UploadsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async create(visitorId: string, fields: UploadFields, file?: UploadedImage) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择非空图片');
    if (file.buffer.length > MAX_IMAGE_BYTES)
      throw new PayloadTooLargeException('图片不得超过10MiB');
    const bytes = file.buffer;
    const extension = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? 'jpg'
        : bytes.subarray(0, 4).toString() === 'RIFF' &&
            bytes.subarray(8, 12).toString() === 'WEBP'
          ? 'webp'
          : undefined;
    if (!extension)
      throw new UnsupportedMediaTypeException('只接受实际JPG、PNG或WEBP截图');
    const mediaType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    if (![mediaType, 'application/octet-stream'].includes(file.mimetype))
      throw new UnsupportedMediaTypeException('声明的图片类型与实际文件不符');
    const id = randomUUID();
    const name = `${id}.${extension}`;
    const path = privateImagePath(name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
    try {
      const probe = JSON.parse(
        await run((require('ffprobe-static') as { path: string }).path, [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name,width,height',
          '-of',
          'json',
          path,
        ]),
      );
      const stream = probe.streams?.[0];
      if (
        !stream ||
        stream.codec_name !==
          { png: 'png', jpg: 'mjpeg', webp: 'webp' }[extension] ||
        !Number.isInteger(stream.width) ||
        !Number.isInteger(stream.height) ||
        stream.width <= 0 ||
        stream.height <= 0 ||
        stream.width * stream.height > 100_000_000
      )
        throw new UnsupportedMediaTypeException(
          '图片解码格式无效或超过1亿像素安全上限',
        );
      await run(require('ffmpeg-static') as string, [
        '-nostdin',
        '-v',
        'error',
        '-xerror',
        '-err_detect',
        'explode',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        path,
        '-frames:v',
        '1',
        '-f',
        'null',
        '-',
      ]);
      const sha256 = digest(bytes);
      const result = await idempotent(
        this.db,
        'private-upload',
        visitorId,
        fields.idempotencyKey,
        { sha256, mediaType },
        async (tx) =>
          mapUpload(
            await tx.upload.create({
              data: {
                id,
                visitorId,
                path: name,
                mediaType,
                size: bytes.length,
                sha256,
                expiresAt: new Date(Date.now() + 24 * 3600_000),
              },
            }),
          ),
      );
      if (result.id !== id) await removeOwnFile(path);
      return result;
    } catch (error) {
      await removeOwnFile(path);
      throw error;
    }
  }
  async owned(visitorId: string, id: string) {
    const item = await this.db.upload.findFirst({
      where: { id, visitorId, purgedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!item) throw new NotFoundException('图片不可用或已过期');
    return item;
  }
  async upload(visitorId: string, id: string) {
    return mapUpload(await this.owned(visitorId, id));
  }
  async content(visitorId: string, id: string) {
    const item = await this.owned(visitorId, id);
    const path = privateImagePath(item.path);
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      throw new NotFoundException('图片已不可用');
    }
    if (bytes.length !== item.size || digest(bytes) !== item.sha256)
      throw new UnprocessableEntityException('图片内容校验失败');
    return { bytes, mediaType: item.mediaType };
  }
  async createOcr(visitorId: string, input: OcrCreate) {
    const upload = await this.owned(visitorId, input.uploadId);
    const { bytes } = await this.content(visitorId, upload.id);
    return idempotent(
      this.db,
      'ocr-job',
      visitorId,
      input.idempotencyKey,
      { uploadId: input.uploadId },
      async (tx) => {
        const matched = digest(bytes) === fixture.sha256;
        const job = await tx.ocrJob.upsert({
          where: { uploadId: upload.id },
          update: {},
          create: {
            uploadId: upload.id,
            status: matched ? 'succeeded' : 'failed',
            provider: matched ? 'local-fixture' : 'local-manual',
            text: matched ? fixture.text : null,
            errorCode: matched ? null : 'OCR_NOT_CONNECTED_MANUAL_REQUIRED',
          },
        });
        return mapOcr(job);
      },
    );
  }
  async ocr(visitorId: string, id: string) {
    const job = await this.db.ocrJob.findFirst({
      where: {
        id,
        upload: { visitorId, purgedAt: null, expiresAt: { gt: new Date() } },
      },
    });
    if (!job) throw new NotFoundException('识别记录不可用或图片已过期');
    return mapOcr(job);
  }
  async cleanupExpired(now = new Date()) {
    const items = await this.db.upload.findMany({
      where: { expiresAt: { lte: now }, purgedAt: null },
      take: 100,
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });
    let count = 0;
    for (const item of items) {
      await removeOwnFile(privateImagePath(item.path));
      await this.db.upload.updateMany({
        where: { id: item.id, purgedAt: null },
        data: { purgedAt: now },
      });
      count++;
    }
    return count;
  }
}
