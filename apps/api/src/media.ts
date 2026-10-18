import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { MediaAsset } from '@prisma/client';

export function mediaDirectory() {
  let directory = __dirname;
  while (!existsSync(resolve(directory, 'infra', 'prisma', 'schema.prisma'))) {
    const parent = resolve(directory, '..');
    if (parent === directory) throw new Error('Workspace root unavailable');
    directory = parent;
  }
  return resolve(directory, 'infra/runtime/media');
}
@Injectable()
export class MediaVerifier {
  private pending = new Map<
    string,
    Promise<{ path: string; durationSeconds: number }>
  >();
  async verify(asset: MediaAsset) {
    // Deduplicate concurrent probes, never cache past the in-flight request.
    const key = asset.id + asset.sha256;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const result = this.inspect(asset);
    this.pending.set(key, result);
    try {
      return await result;
    } finally {
      this.pending.delete(key);
    }
  }
  private async inspect(asset: MediaAsset) {
    const directory = mediaDirectory();
    const path = resolve(directory, asset.relativePath);
    if (!path.startsWith(directory + sep) || !path.endsWith('.mp4'))
      throw new UnprocessableEntityException('受控媒体路径无效');
    let buffer: Buffer;
    try {
      buffer = await readFile(path);
    } catch {
      throw new UnprocessableEntityException('媒体文件不可用，请核对资源');
    }
    if (
      buffer.length !== asset.size ||
      createHash('sha256').update(buffer).digest('hex') !== asset.sha256
    )
      throw new UnprocessableEntityException('媒体内容已变化，需要重新核对');
    const executable = (require('ffprobe-static') as { path: string }).path;
    const output = await new Promise<string>((resolveOutput, reject) => {
      const process = spawn(
        executable,
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'json',
          path,
        ],
        { windowsHide: true },
      );
      let value = '';
      const timeout = setTimeout(() => {
        process.kill();
        reject(new UnprocessableEntityException('媒体核对超时'));
      }, 10000);
      process.stdout.on('data', (data) => {
        value += data;
        if (value.length > 10000) process.kill();
      });
      process.on('error', () => {
        clearTimeout(timeout);
        reject(new UnprocessableEntityException('媒体核对工具不可用'));
      });
      process.on('close', (code) => {
        clearTimeout(timeout);
        code === 0
          ? resolveOutput(value)
          : reject(new UnprocessableEntityException('无法核对媒体时长'));
      });
    });
    let durationSeconds: number;
    try {
      durationSeconds = Number(JSON.parse(output).format.duration);
    } catch {
      throw new UnprocessableEntityException('媒体时长无效');
    }
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      Math.abs(durationSeconds - asset.durationSeconds) > 0.001
    )
      throw new UnprocessableEntityException('媒体实际时长与资源记录不一致');
    return { path, durationSeconds };
  }
}
