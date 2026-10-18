import { PrismaClient } from '@prisma/client';
import { loadLocalEnvironment, localConfig } from '../apps/api/src/config';
import data from '../packages/domain/fixtures/prototype-content.json';

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
  console.log(
    'Seed ready:17 scenes/36 tasks/17 mock sets; no visitor records or fabricated course media.',
  );
}
main()
  .catch(() => {
    console.error('Seed failed; check local database configuration.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
