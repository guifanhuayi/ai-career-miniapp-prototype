import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AnalysisJob, JobDescription, Prisma } from '@prisma/client';
import { characterCount, validJd } from '../../../../packages/domain/src';
import { Database } from '../database';
import { idempotent, jsonSnapshot } from '../idempotency';
import type {
  AnalysisCreate,
  AnalysisQuery,
  DirectionSelection,
  EvidenceResponse,
  JobDescriptionCreate,
  JobDescriptionResponse,
} from './jobs.dto';

export const mapInput = (item: JobDescription): JobDescriptionResponse => ({
  id: item.id,
  title: item.title,
  text: item.text,
  source: item.source,
  uploadId: item.uploadId,
  version: item.version,
  createdAt: item.createdAt.toISOString(),
});
export const mapAnalysis = (job: AnalysisJob) => ({
  id: job.id,
  jobDescriptionId: job.jobDescriptionId,
  flowId: job.flowId,
  status: job.status,
  revision: job.revision,
  attempts: job.attempts,
  provider: 'local-rules',
  rulesVersion: 'jd-rules-v1',
  input: job.inputSnapshot as unknown as JobDescriptionResponse,
  items: (job.result as { items?: EvidenceResponse[] } | null)?.items ?? [],
  selectedScenes: (job.selectedScenes as string[] | null) ?? [],
  errorCode: job.errorCode,
  deadline: job.deadline.toISOString(),
  createdAt: job.createdAt.toISOString(),
  completedAt: job.completedAt?.toISOString() ?? null,
});
@Injectable()
export class JobsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async createInput(visitorId: string, input: JobDescriptionCreate) {
    const { idempotencyKey, ...fields } = input;
    if (!validJd(fields.text) || characterCount(fields.title) > 100)
      throw new UnprocessableEntityException(
        '岗位名称不超过100字，JD须非空白且不超过8000字；不截断原文',
      );
    return idempotent(
      this.db,
      'job-description',
      visitorId,
      idempotencyKey,
      fields,
      async (tx) => {
        const imageSource = ['image-manual', 'fixture-confirmed'].includes(
          fields.source,
        );
        if (imageSource !== !!fields.uploadId)
          throw new UnprocessableEntityException(
            '图片核对来源必须关联有效本人图片；文字/示例文本不能混入图片来源',
          );
        if (fields.uploadId) {
          const upload = await tx.upload.findFirst({
            where: {
              id: fields.uploadId,
              visitorId,
              expiresAt: { gt: new Date() },
              purgedAt: null,
            },
            include: { jobs: true },
          });
          if (!upload) throw new NotFoundException('图片不可用或已过期');
          if (
            fields.source === 'fixture-confirmed' &&
            !upload.jobs.some(
              (job) =>
                job.status === 'succeeded' && job.provider === 'local-fixture',
            )
          )
            throw new UnprocessableEntityException(
              '当前图片没有模拟识别结果，请使用手工补录来源',
            );
        }
        const job = await tx.jobDescription.create({
          data: { ...fields, visitorId },
        });
        return mapInput(job);
      },
    );
  }
  async input(visitorId: string, id: string) {
    const item = await this.db.jobDescription.findFirst({
      where: { id, visitorId },
    });
    if (!item) throw new NotFoundException('岗位记录不可用');
    return mapInput(item);
  }
  async createAnalysis(visitorId: string, input: AnalysisCreate) {
    const { idempotencyKey, ...fields } = input;
    return idempotent(
      this.db,
      'analysis-job',
      visitorId,
      idempotencyKey,
      fields,
      async (tx) => {
        const original = await tx.jobDescription.findFirst({
          where: { id: input.jobDescriptionId, visitorId },
        });
        if (!original) throw new NotFoundException('岗位记录不可用');
        const job = await tx.analysisJob.create({
          data: {
            ...fields,
            visitorId,
            inputSnapshot: jsonSnapshot(mapInput(original)),
            idempotencyKey,
            deadline: new Date(Date.now() + 60_000),
          },
        });
        return mapAnalysis(job);
      },
    );
  }
  async owned(visitorId: string, id: string) {
    const item = await this.db.analysisJob.findFirst({
      where: { id, visitorId },
    });
    if (!item) throw new NotFoundException('分析任务不可用');
    return item;
  }
  async analysis(visitorId: string, id: string) {
    return mapAnalysis(await this.owned(visitorId, id));
  }
  async analyses(visitorId: string, query: AnalysisQuery) {
    const where: Prisma.AnalysisJobWhereInput = {
      visitorId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim()
        ? { jobDescription: { title: { contains: query.search.trim() } } }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.analysisJob.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.analysisJob.count({ where }),
    ]);
    return {
      items: items.map(mapAnalysis),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async cancel(visitorId: string, id: string) {
    await this.owned(visitorId, id);
    return this.db.$transaction(async (tx) => {
      await tx.analysisJob.updateMany({
        where: { id, visitorId, status: { in: ['queued', 'running'] } },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          leaseId: null,
          leaseUntil: null,
          revision: { increment: 1 },
        },
      });
      const result = await tx.analysisJob.findUniqueOrThrow({ where: { id } });
      if (result.status !== 'cancelled')
        throw new ConflictException('任务已结束，不能取消');
      return mapAnalysis(result);
    });
  }
  async select(visitorId: string, id: string, input: DirectionSelection) {
    await this.owned(visitorId, id);
    return this.db.$transaction(async (tx) => {
      const job = await tx.analysisJob.findUniqueOrThrow({ where: { id } });
      if (job.status !== 'succeeded')
        throw new ConflictException('只能选择已完成分析的方向');
      const allowed = new Set(
        (
          (job.result as { items?: EvidenceResponse[] } | null)?.items ?? []
        ).map((item) => item.sceneId),
      );
      if (
        input.sceneIds.some((sceneId) => !allowed.has(sceneId)) ||
        (await tx.scene.count({
          where: { id: { in: input.sceneIds }, status: 'published' },
        })) !== input.sceneIds.length
      )
        throw new UnprocessableEntityException(
          '所选方向不属于本次分析或已下架',
        );
      if (JSON.stringify(job.selectedScenes) === JSON.stringify(input.sceneIds))
        return mapAnalysis(job);
      const updated = await tx.analysisJob.updateMany({
        where: { id, visitorId, revision: input.revision, status: 'succeeded' },
        data: { selectedScenes: input.sceneIds, revision: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException('方向选择已变化，请刷新后重试');
      return mapAnalysis(
        await tx.analysisJob.findUniqueOrThrow({ where: { id } }),
      );
    });
  }
}
