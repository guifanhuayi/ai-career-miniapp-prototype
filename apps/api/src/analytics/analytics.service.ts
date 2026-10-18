import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  addDays,
  DAY_MS,
  validDay,
} from '../../../../packages/domain/src/analytics';
import {
  chinaDay,
  learningEvents,
} from '../../../../packages/domain/src/event-policy';
import { availableCourse } from '../catalog.service';
import { Database } from '../database';
import type { ClientEvent, EventBatch, ReportQuery } from './analytics.dto';

@Injectable()
export class AnalyticsService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async collect(visitorId: string, environment: string, batch: EventBatch) {
    return this.db
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM Visitor WHERE id = ${visitorId} FOR UPDATE`;
          let accepted = 0,
            duplicates = 0,
            throttled = 0;
          for (const event of batch.events) {
            const hash = createHash('sha256')
              .update(
                JSON.stringify(
                  Object.fromEntries(
                    Object.entries(event).sort(([a], [b]) =>
                      a.localeCompare(b),
                    ),
                  ),
                ),
              )
              .digest('hex');
            const previous = await tx.behaviorEvent.findUnique({
              where: { id: event.eventId },
            });
            if (previous) {
              if (
                previous.visitorId !== visitorId ||
                previous.payloadHash !== hash
              )
                throw new ConflictException('事件标识已使用且内容不同');
              duplicates++;
              continue;
            }
            const context = await this.context(tx, visitorId, event);
            const now = new Date();
            const occurredAt = new Date(event.occurredAt);
            const clockAnomaly =
              Math.abs(occurredAt.getTime() - now.getTime()) > DAY_MS;
            const effectiveAt = clockAnomaly ? now : occurredAt;
            if (event.name === 'video_progress') {
              const last = await tx.behaviorEvent.findFirst({
                where: {
                  visitorId,
                  name: event.name,
                  courseId: event.courseId,
                },
                orderBy: { receivedAt: 'desc' },
              });
              if (last && now.getTime() - last.receivedAt.getTime() < 15_000) {
                // Persist the deduplication identity, without treating a throttled report as a fact.
                await tx.behaviorEvent.create({
                  data: {
                    id: event.eventId,
                    visitorId,
                    environment,
                    name: event.name,
                    source: 'throttled',
                    sessionId: last.sessionId,
                    occurredAt,
                    effectiveAt,
                    receivedAt: now,
                    payloadHash: hash,
                  },
                });
                throttled++;
                continue;
              }
            }
            const last = await tx.behaviorEvent.findFirst({
              where: { visitorId, source: { not: 'throttled' } },
              orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
            });
            const sessionId =
              last && now.getTime() - last.receivedAt.getTime() < 30 * 60_000
                ? last.sessionId
                : randomUUID();
            let positionAnomaly = false;
            if (event.position !== undefined) {
              const prior = await tx.behaviorEvent.findFirst({
                where: {
                  visitorId,
                  courseId: event.courseId,
                  source: 'client',
                  position: { not: null },
                },
                orderBy: { receivedAt: 'desc' },
              });
              const elapsed = prior
                ? (now.getTime() - prior.receivedAt.getTime()) / 1000
                : 0;
              positionAnomaly =
                event.position > (prior?.position ?? 0) + elapsed * 2 + 5;
            }
            await tx.behaviorEvent.create({
              data: {
                id: event.eventId,
                visitorId,
                environment,
                source: 'client',
                sessionId,
                name: event.name,
                occurredAt,
                receivedAt: now,
                effectiveAt,
                clockAnomaly,
                schemaVersion: event.schemaVersion,
                appVersion: event.appVersion,
                ...context,
                position: event.position,
                positionAnomaly,
                payloadHash: hash,
              },
            });
            if (learningEvents.has(event.name))
              await tx.visitor.updateMany({
                where: {
                  id: visitorId,
                  OR: [
                    { firstLearningAt: null },
                    { firstLearningAt: { gt: effectiveAt } },
                  ],
                },
                data: { firstLearningAt: effectiveAt },
              });
            accepted++;
          }
          return { accepted, duplicates, throttled };
        },
        { timeout: 20_000 },
      )
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P2002'
        )
          throw new ConflictException('事件标识已使用');
        throw error;
      });
  }

  private async context(
    tx: Prisma.TransactionClient,
    visitorId: string,
    e: ClientEvent,
  ) {
    let flowId = e.flowId,
      sceneId = e.sceneId;
    let taskId: string | undefined;
    if (e.planId) {
      const p = await tx.learningPlan.findFirst({
        where: { id: e.planId, visitorId },
        include: { scene: true, task: true },
      });
      if (!p) throw new NotFoundException('学习计划不存在');
      if (p.scene.status !== 'published' || p.task.status !== 'published')
        throw new UnprocessableEntityException('任务不可用');
      if (
        (flowId && flowId !== p.flowId) ||
        (sceneId && sceneId !== p.sceneId) ||
        e.analysisJobId
      )
        throw new BadRequestException('事件上下文不一致');
      flowId = p.flowId;
      sceneId = p.sceneId;
      taskId = p.taskId;
      if (e.name === 'recommendation_viewed' && !p.selectedLevel)
        throw new UnprocessableEntityException('尚未生成学习路径');
    }
    if (e.analysisJobId) {
      const job = await tx.analysisJob.findFirst({
        where: { id: e.analysisJobId, visitorId },
        include: { jobDescription: true },
      });
      if (!job) throw new NotFoundException('分析任务不存在');
      if (flowId && flowId !== job.flowId)
        throw new BadRequestException('流程不一致');
      if (e.name === 'ocr_result_confirmed' && !job.jobDescription.uploadId)
        throw new BadRequestException('没有截图核对输入');
      flowId = job.flowId;
    }
    if (
      sceneId &&
      !(await tx.scene.findFirst({
        where: { id: sceneId, status: 'published' },
      }))
    )
      throw new NotFoundException('方向不可用');
    if (e.courseId) {
      if (!taskId) throw new BadRequestException('课程行为需要本人任务');
      const course = await tx.course.findFirst({
        where: {
          ...availableCourse,
          id: e.courseId,
          status: 'published',
          durationSeconds: { gt: 0, lte: 2100 },
          mappings: { some: { taskId } },
        },
      });
      if (!course) throw new NotFoundException('课程不可用');
      if (
        e.position !== undefined &&
        e.position > (course.durationSeconds ?? 0)
      )
        throw new BadRequestException('位置超过课程时长');
    }
    if (
      e.name.startsWith('video_') &&
      (e.position === undefined || !e.courseId)
    )
      throw new BadRequestException('视频行为需要课程和位置');
    if (!e.name.startsWith('video_') && e.position !== undefined)
      throw new BadRequestException('此事件不接受位置');
    if (
      ['course_detail_viewed', 'course_open_attempted'].includes(e.name) &&
      !e.courseId
    )
      throw new BadRequestException('需要课程');
    if (
      ['recommendation_viewed', 'learning_plan_resumed'].includes(e.name) &&
      !e.planId
    )
      throw new BadRequestException('需要本人任务');
    if (
      ['jd_submit', 'ocr_result_confirmed'].includes(e.name) &&
      !e.analysisJobId
    )
      throw new BadRequestException('需要本人岗位流程');
    if (e.name === 'scene_selected' && !sceneId)
      throw new BadRequestException('需要方向');
    return { flowId, sceneId, taskId, courseId: e.courseId };
  }

  range(query: ReportQuery, now = new Date()) {
    const today = chinaDay(now);
    const startDay = query.startDay ?? addDays(today, -6),
      endDay = query.endDay ?? today;
    if (
      !validDay(startDay) ||
      !validDay(endDay) ||
      startDay > endDay ||
      endDay > today ||
      startDay < addDays(today, -364)
    )
      throw new BadRequestException('日期范围须位于最近365个北京时间自然日');
    return { startDay, endDay, environment: query.environment };
  }
}
