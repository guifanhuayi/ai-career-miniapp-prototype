import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  analyzeJd,
  type Evidence,
  validateEvidence,
} from '../../../../packages/domain/src';
import { recordServerEvent } from '../business-events';
import { Database } from '../database';
import { jsonSnapshot } from '../idempotency';
import type { JobDescriptionResponse } from './jobs.dto';

class InvalidOutput extends Error {}
@Injectable()
export class RuleAnalyzer {
  async analyze(text: string, known: string[]): Promise<Evidence[]> {
    return analyzeJd(text, known);
  }
}
@Injectable()
export class AnalysisRunner implements OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(RuleAnalyzer) private readonly analyzer: RuleAnalyzer,
  ) {}
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch(() =>
        process.stderr.write('analysis_worker_poll_failed\n'),
      );
    }, 250);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
  async runOnce() {
    if (this.pending) return this.pending;
    this.pending = this.work();
    try {
      await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  private async work() {
    const now = new Date();
    await this.db.analysisJob.updateMany({
      where: { status: { in: ['queued', 'running'] }, deadline: { lte: now } },
      data: {
        status: 'failed',
        errorCode: 'ANALYSIS_TIMEOUT',
        completedAt: now,
        leaseId: null,
        leaseUntil: null,
        revision: { increment: 1 },
      },
    });
    await this.db.analysisJob.updateMany({
      where: {
        status: 'running',
        attempts: { gte: 2 },
        leaseUntil: { lte: now },
      },
      data: {
        status: 'failed',
        errorCode: 'ANALYSIS_UNAVAILABLE',
        completedAt: now,
        leaseId: null,
        leaseUntil: null,
        revision: { increment: 1 },
      },
    });
    const job = await this.db.analysisJob.findFirst({
      where: {
        deadline: { gt: now },
        attempts: { lt: 2 },
        OR: [
          { status: 'queued' },
          { status: 'running', leaseUntil: { lte: now } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { visitor: true },
    });
    if (!job) return;
    const leaseId = randomUUID();
    const claimed = await this.db.analysisJob.updateMany({
      where: { id: job.id, revision: job.revision, status: job.status },
      data: {
        status: 'running',
        attempts: { increment: 1 },
        revision: { increment: 1 },
        leaseId,
        leaseUntil: new Date(Date.now() + 10_000),
      },
    });
    if (claimed.count !== 1) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const input = job.inputSnapshot as unknown as JobDescriptionResponse;
      const scenes = await this.db.scene.findMany({
        where: { status: 'published' },
        select: { id: true, name: true },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      const known = scenes.map((scene) => scene.id);
      const items = await Promise.race([
        this.analyzer.analyze(input.text, known),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Adapter unavailable')),
            5000,
          );
        }),
      ]);
      if (!validateEvidence(input.text, items, known))
        throw new InvalidOutput();
      const snapshot = {
        rulesVersion: 'jd-rules-v1',
        items: items.map((item) => ({
          ...item,
          sceneName:
            scenes.find((scene) => scene.id === item.sceneId)?.name ?? '',
        })),
      };
      await this.db.$transaction(async (tx) => {
        const completed = await tx.analysisJob.updateMany({
          where: {
            id: job.id,
            status: 'running',
            leaseId,
            deadline: { gt: new Date() },
          },
          data: {
            status: 'succeeded',
            result: jsonSnapshot(snapshot),
            completedAt: new Date(),
            leaseId: null,
            leaseUntil: null,
            errorCode: null,
            revision: { increment: 1 },
          },
        });
        if (completed.count)
          await recordServerEvent(tx, {
            id: `analysis-${job.id}`,
            visitorId: job.visitorId,
            environment: job.visitor.environment,
            name: 'analysis_completed',
            flowId: job.flowId,
          });
      });
    } catch (error) {
      const retry =
        !(error instanceof InvalidOutput) &&
        job.attempts + 1 < 2 &&
        job.deadline.getTime() > Date.now();
      await this.db.analysisJob.updateMany({
        where: { id: job.id, status: 'running', leaseId },
        data: {
          status: retry ? 'queued' : 'failed',
          errorCode:
            error instanceof InvalidOutput
              ? 'ANALYSIS_OUTPUT_INVALID'
              : 'ANALYSIS_UNAVAILABLE',
          completedAt: retry ? null : new Date(),
          leaseId: null,
          leaseUntil: null,
          revision: { increment: 1 },
        },
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
