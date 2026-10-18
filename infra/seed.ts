import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type MediaAsset, PrismaClient } from '@prisma/client';
import { loadLocalEnvironment, localConfig } from '../apps/api/src/config';
import { MediaVerifier, mediaDirectory } from '../apps/api/src/media';
import data from '../packages/domain/fixtures/prototype-content.json';
import { eligibleDuration, levelNames, levels } from '../packages/domain/src';

loadLocalEnvironment();
localConfig();
const db = new PrismaClient();
async function main() {
  // Create only. Re-running fixtures must not overwrite editorial changes or visitor data.
  await db.$transaction(
    async (tx) => {
      for (const [position, scene] of data.entries()) {
        await tx.scene.upsert({
          where: { id: scene.id },
          update: {},
          create: {
            id: scene.id,
            name: scene.name,
            category: scene.category,
            icon: scene.icon,
            description: scene.description,
            output: scene.output,
            syllabus: scene.syllabus,
            position,
            status: 'published',
          },
        });
        for (const [taskPosition, task] of scene.tasks.entries())
          await tx.task.upsert({
            where: { id: task.id },
            update: {},
            create: {
              id: task.id,
              sceneId: scene.id,
              name: task.name,
              status: 'published',
              position: taskPosition,
            },
          });
        await tx.questionSet.upsert({
          where: {
            sceneId_version: {
              sceneId: scene.id,
              version: 'mock-question-set-v1',
            },
          },
          update: {},
          create: {
            sceneId: scene.id,
            version: 'mock-question-set-v1',
            questions: scene.questions,
            isMock: true,
            status: 'published',
          },
        });
      }
    },
    { timeout: 30000 },
  );
  const manifest = resolve(mediaDirectory(), 'local-test-video-v1.json');
  if (existsSync(manifest)) {
    const fixture = JSON.parse(readFileSync(manifest, 'utf8')) as Omit<
      MediaAsset,
      'verifiedAt'
    >;
    if (
      fixture.id !== 'local-test-video-v1' ||
      fixture.isTest !== true ||
      !eligibleDuration(fixture.durationSeconds)
    )
      throw new Error('Invalid local test-media manifest');
    const asset = await db.mediaAsset.upsert({
      where: { id: fixture.id },
      update: {},
      create: fixture,
    });
    await new MediaVerifier().verify(asset);
    await db.$transaction(
      async (tx) => {
        for (const scene of data) {
          const currentScene = await tx.scene.findUniqueOrThrow({
            where: { id: scene.id },
          });
          const currentTasks = await tx.task.findMany({
            where: { id: { in: scene.tasks.map((task) => task.id) } },
          });
          const publishable =
            currentScene.status === 'published' &&
            currentTasks.every((task) => task.status === 'published');
          for (const level of levels) {
            const count = scene.syllabus[level].length;
            await tx.course.upsert({
              where: { id: `test-${scene.id}-${level}-v1` },
              update: {},
              create: {
                id: `test-${scene.id}-${level}-v1`,
                title: `${scene.name} · ${levelNames[level]} · 模拟播放测试课`,
                author: '本项目自制测试素材',
                durationSeconds: asset.durationSeconds,
                mediaAssetId: asset.id,
                authorization: asset.authorization,
                isTest: true,
                chapters: Array.from({ length: count }, (_, index) => ({
                  title: `播放器测试片段 ${index + 1}（非教学内容）`,
                  durationSeconds: asset.durationSeconds / count,
                })),
                status: publishable ? 'published' : 'draft',
                publishedAt: publishable ? new Date() : null,
                mappings: {
                  create: scene.tasks.map((task) => ({
                    taskId: task.id,
                    level,
                  })),
                },
              },
            });
          }
        }
      },
      { timeout: 30000 },
    );
  }
  console.log(
    'Seed ready:17 scenes/36 tasks/17 mock sets; controlled media available =>51 clearly marked test courses. No visitor grades/plans.',
  );
}
main()
  .catch(() => {
    console.error('Seed failed; check local database configuration.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
