import assert from 'node:assert/strict';
import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createApp } from '../apps/api/src/app';
import { loadLocalEnvironment } from '../apps/api/src/config';
import { Database } from '../apps/api/src/database';
import { percentile } from '../packages/domain/src/analytics';

async function main() {
  loadLocalEnvironment();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Local database configuration missing');
  const url = new URL(databaseUrl);
  url.pathname = '/career_test';
  process.env.DATABASE_URL = url.toString();
  process.env.APP_ENV = 'test';
  const app = await createApp({ startWorkers: false });
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl(),
      db = app.get(Database);
    const measurements = [];
    for (const path of [
      '/api/v1/scenes?pageSize=100',
      '/api/v1/admin/analytics?environment=test',
    ]) {
      const samples: number[] = [];
      for (let i = 0; i < 21; i++) {
        const start = performance.now();
        const response = await fetch(origin + path, {
          headers: { 'X-Admin-Local': '1' },
        });
        assert.equal(response.status, 200);
        await response.json();
        if (i > 0) samples.push(performance.now() - start);
      }
      measurements.push({
        path,
        requests: samples.length,
        concurrency: 1,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
      });
    }
    console.log(
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          node: process.versions.node,
          platform: process.platform,
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          memoryGiB: totalmem() / 1024 ** 3,
          dataset: {
            scenes: await db.scene.count(),
            courses: await db.course.count(),
            events: await db.behaviorEvent.count(),
            aggregates: await db.dailyAggregate.count(),
          },
          measurements,
          limitation:
            '本机单并发基线，不作为生产容量或SLA承诺；预热首请求不计入样本。',
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error('Local performance baseline failed');
  process.exitCode = 1;
});
