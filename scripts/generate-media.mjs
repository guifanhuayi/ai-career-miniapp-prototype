import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

const directory = fileURLToPath(
  new URL('../infra/runtime/media/', import.meta.url),
);
mkdirSync(directory, { recursive: true });
const fixtures = process.argv.includes('--boundaries')
  ? [
      ['local-test-video-v1', 3],
      ['boundary-2099', 2099],
      ['boundary-2100', 2100],
      ['boundary-2100-1', 2100.1],
      ['boundary-2101', 2101],
    ]
  : [['local-test-video-v1', 3]];
for (const [id, duration] of fixtures) {
  const target = resolve(directory, `${id}.mp4`);
  const manifest = resolve(directory, `${id}.json`);
  if (existsSync(target) && existsSync(manifest)) {
    const expected = JSON.parse(readFileSync(manifest, 'utf8'));
    const actual = createHash('sha256')
      .update(readFileSync(target))
      .digest('hex');
    if (actual !== expected.sha256)
      throw new Error(
        'Existing test media changed; do not overwrite it silently',
      );
    console.log(`Preserved self-made test media ${id}`);
    continue;
  }
  if (existsSync(target))
    throw new Error('Existing media has no manifest; refusing to overwrite');
  const temporary = resolve(directory, `${id}-${process.pid}.building.mp4`);
  try {
    const result = spawnSync(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-n',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x176b4b:s=160x90:r=10',
        '-t',
        String(duration),
        '-vf',
        'drawbox=x=12:y=65:w=136:h=6:color=white:t=fill',
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        '-movflags',
        '+faststart',
        temporary,
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error('Unable to generate local test video');
    const checked = spawnSync(
      ffprobe.path,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        temporary,
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    if (checked.status !== 0)
      throw new Error('Unable to verify generated video');
    const actualDuration = Number(JSON.parse(checked.stdout).format.duration);
    const buffer = readFileSync(temporary);
    const asset = {
      id,
      relativePath: `${id}.mp4`,
      durationSeconds: actualDuration,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length,
      authorization:
        '本项目自制纯色测试片，仅用于本地播放器与时长规则验证；无教学内容。',
      isTest: true,
    };
    renameSync(temporary, target);
    writeFileSync(manifest, JSON.stringify(asset, null, 2) + '\n');
    console.log(
      `Generated self-made TEST media ${id}; verified ${actualDuration}s`,
    );
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
