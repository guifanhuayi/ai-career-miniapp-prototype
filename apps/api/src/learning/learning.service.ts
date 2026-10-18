import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AssessmentAttempt, Prisma } from '@prisma/client';
import {
  type Question,
  SCORING_RULE_VERSION,
  scoreLevel,
} from '../../../../packages/domain/src';
import { recordServerEvent } from '../business-events';
import { availableCourse, mapCourse } from '../catalog.service';
import { Database } from '../database';
import { idempotent, jsonSnapshot } from '../idempotency';
import { MediaVerifier } from '../media';
import type { PageQuery } from '../pagination';
import type {
  AnswerUpdate,
  AttemptCreate,
  KeyInput,
  LevelUpdate,
  PlanCreate,
  ProgressUpdate,
} from './learning.dto';

type Snapshot = { isMock: boolean; questions: Question[] };
const attemptView = (a: AssessmentAttempt) => {
  const snapshot = a.snapshot as unknown as Snapshot;
  const answers = a.answers as Record<string, number>;
  return {
    id: a.id,
    planId: a.planId,
    sequence: a.sequence,
    revision: a.revision,
    status: a.status,
    questionVersion: a.questionVersion,
    scoringVersion: a.scoringVersion,
    isMock: snapshot.isMock,
    questions: snapshot.questions.map((q) => ({
      id: q.id,
      title: q.title,
      options: q.options,
      answer: answers[q.id] ?? null,
      ...(a.status === 'submitted'
        ? { correct: q.correct, explanation: q.explanation }
        : {}),
    })),
    score: a.score,
    recommendedLevel: a.recommendedLevel,
    createdAt: a.createdAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
  };
};
@Injectable()
export class LearningService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(MediaVerifier) private readonly media: MediaVerifier,
  ) {}
  private async lock(tx: Prisma.TransactionClient, visitorId: string) {
    await tx.$queryRaw`SELECT id FROM Visitor WHERE id = ${visitorId} FOR UPDATE`;
  }
  private async ownedPlan(
    tx: Prisma.TransactionClient,
    visitorId: string,
    id: string,
    available = false,
  ) {
    const p = await tx.learningPlan.findFirst({
      where: { id, visitorId },
      include: { scene: true, task: true },
    });
    if (!p) throw new NotFoundException('学习计划不存在');
    if (
      available &&
      (p.scene.status !== 'published' || p.task.status !== 'published')
    )
      throw new UnprocessableEntityException('任务已下架，历史记录仍保留');
    return p;
  }
  private async planView(
    tx: Prisma.TransactionClient,
    visitorId: string,
    id: string,
  ) {
    const p = await this.ownedPlan(tx, visitorId, id);
    const [latest, source, courses, last] = await Promise.all([
      tx.assessmentAttempt.findFirst({
        where: { planId: id },
        orderBy: { sequence: 'desc' },
      }),
      p.sourceAnalysisId
        ? tx.analysisJob.findFirst({
            where: { id: p.sourceAnalysisId, visitorId },
            include: { jobDescription: true },
          })
        : null,
      p.selectedLevel
        ? tx.course.findMany({
            where: {
              ...availableCourse,
              mappings: {
                some: {
                  taskId: p.taskId,
                  level: p.selectedLevel,
                  task: { status: 'published', scene: { status: 'published' } },
                },
              },
            },
            select: {
              id: true,
              marks: { where: { visitorId }, select: { courseId: true } },
            },
          })
        : [],
      tx.courseProgress.findFirst({
        where: {
          planId: id,
          course: {
            ...availableCourse,
            mappings: { some: { taskId: p.taskId } },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { courseId: 'asc' }],
      }),
    ]);
    return {
      id: p.id,
      sceneId: p.sceneId,
      sceneName: p.scene.name,
      taskId: p.taskId,
      taskName: p.task.name,
      output: p.scene.output,
      syllabus: p.scene.syllabus,
      available:
        p.scene.status === 'published' && p.task.status === 'published',
      flowId: p.flowId,
      sourceAnalysisId: p.sourceAnalysisId,
      sourceTitle: source
        ? source.jobDescription.title || '未命名岗位'
        : '自主选择的学习任务',
      recommendedLevel: p.recommendedLevel,
      selectedLevel: p.selectedLevel,
      revision: p.revision,
      latestAttemptId: latest?.id ?? null,
      latestAttemptStatus: latest?.status ?? null,
      lastCourseId: last?.courseId ?? null,
      courseCount: courses.length,
      markedCount: courses.filter((c) => c.marks.length > 0).length,
      updatedAt: p.updatedAt.toISOString(),
    };
  }
  async plan(visitorId: string, id: string) {
    return this.db.$transaction((tx) => this.planView(tx, visitorId, id));
  }
  async plans(visitorId: string, q: PageQuery) {
    return this.db.$transaction(
      async (tx) => {
        const where = {
          visitorId,
          ...(q.search?.trim()
            ? {
                OR: [
                  { scene: { name: { contains: q.search.trim() } } },
                  { task: { name: { contains: q.search.trim() } } },
                ],
              }
            : {}),
        };
        const rows = await tx.learningPlan.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        });
        const items = [];
        for (const row of rows)
          items.push(await this.planView(tx, visitorId, row.id));
        return {
          items,
          total: await tx.learningPlan.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { timeout: 15000 },
    );
  }
  async createPlan(visitorId: string, environment: string, input: PlanCreate) {
    return idempotent(
      this.db,
      'plan.create',
      visitorId,
      input.idempotencyKey,
      input,
      async (tx) => {
        await this.lock(tx, visitorId);
        const task = await tx.task.findFirst({
          where: {
            id: input.taskId,
            sceneId: input.sceneId,
            status: 'published',
            scene: { status: 'published' },
          },
        });
        if (!task) throw new NotFoundException('任务不可用或不属于该方向');
        let flowId: string = randomUUID();
        if (input.sourceAnalysisId) {
          const source = await tx.analysisJob.findFirst({
            where: {
              id: input.sourceAnalysisId,
              visitorId,
              status: 'succeeded',
            },
          });
          if (
            !source ||
            !Array.isArray(source.selectedScenes) ||
            !source.selectedScenes.includes(input.sceneId)
          )
            throw new NotFoundException('本次分析未选择该方向');
          flowId = source.flowId;
        }
        let p = await tx.learningPlan.findUnique({
          where: {
            visitorId_sceneId_taskId: {
              visitorId,
              sceneId: input.sceneId,
              taskId: input.taskId,
            },
          },
        });
        if (!p) {
          p = await tx.learningPlan.create({
            data: {
              visitorId,
              sceneId: input.sceneId,
              taskId: input.taskId,
              sourceAnalysisId: input.sourceAnalysisId,
              flowId,
            },
          });
          await recordServerEvent(tx, {
            id: randomUUID(),
            visitorId,
            environment,
            name: 'task_selected',
            flowId,
            taskId: p.taskId,
          });
        }
        return this.planView(tx, visitorId, p.id);
      },
    );
  }
  async level(
    visitorId: string,
    environment: string,
    id: string,
    input: LevelUpdate,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, visitorId);
      const p = await this.ownedPlan(tx, visitorId, id, true);
      if (!p.recommendedLevel)
        throw new UnprocessableEntityException('请先完成测验');
      if (p.selectedLevel === input.selectedLevel)
        return this.planView(tx, visitorId, id);
      if (p.revision !== input.revision)
        throw new ConflictException('学习计划已更新，请刷新');
      await tx.learningPlan.update({
        where: { id },
        data: {
          selectedLevel: input.selectedLevel,
          revision: { increment: 1 },
        },
      });
      await recordServerEvent(tx, {
        id: randomUUID(),
        visitorId,
        environment,
        name: 'level_changed',
        flowId: p.flowId,
        taskId: p.taskId,
      });
      return this.planView(tx, visitorId, id);
    });
  }
  async attempt(visitorId: string, id: string) {
    const a = await this.db.assessmentAttempt.findFirst({
      where: { id, visitorId },
    });
    if (!a) throw new NotFoundException('测验不存在');
    return attemptView(a);
  }
  async createAttempt(
    visitorId: string,
    environment: string,
    input: AttemptCreate,
  ) {
    return idempotent(
      this.db,
      'attempt.create',
      visitorId,
      input.idempotencyKey,
      input,
      async (tx) => {
        await this.lock(tx, visitorId);
        const p = await this.ownedPlan(tx, visitorId, input.planId, true);
        const latest = await tx.assessmentAttempt.findFirst({
          where: { planId: p.id },
          orderBy: { sequence: 'desc' },
        });
        if (latest?.status === 'draft') return attemptView(latest);
        const set = await tx.questionSet.findFirst({
          where: { sceneId: p.sceneId, status: 'published' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        if (!set)
          throw new UnprocessableEntityException('暂无已发布题库，请稍后重试');
        const questions = set.questions as unknown as Question[];
        if (questions.length !== 4)
          throw new UnprocessableEntityException('题库配置无效');
        const a = await tx.assessmentAttempt.create({
          data: {
            visitorId,
            planId: p.id,
            idempotencyKey: input.idempotencyKey,
            sequence: (latest?.sequence ?? 0) + 1,
            questionVersion: set.version,
            scoringVersion: SCORING_RULE_VERSION,
            snapshot: jsonSnapshot({ isMock: set.isMock, questions }),
            answers: {},
          },
        });
        await tx.learningPlan.update({
          where: { id: p.id },
          data: { revision: { increment: 1 } },
        });
        await recordServerEvent(tx, {
          id: randomUUID(),
          visitorId,
          environment,
          name: 'assessment_started',
          flowId: p.flowId,
          taskId: p.taskId,
        });
        return attemptView(a);
      },
    );
  }
  async answer(
    visitorId: string,
    id: string,
    questionId: string,
    input: AnswerUpdate,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, visitorId);
      const a = await tx.assessmentAttempt.findFirst({
        where: { id, visitorId },
      });
      if (!a) throw new NotFoundException('测验不存在');
      if (a.status !== 'draft')
        throw new ConflictException('已提交的测验不可修改');
      const q = (a.snapshot as unknown as Snapshot).questions.find(
        (q) => q.id === questionId,
      );
      if (!q) throw new NotFoundException('题目不属于该测验');
      if (input.option >= q.options.length)
        throw new UnprocessableEntityException('选项无效');
      const answers = a.answers as Record<string, number>;
      if (answers[questionId] === input.option) return attemptView(a);
      if (a.revision !== input.revision)
        throw new ConflictException('答案已更新，请重新读取');
      return attemptView(
        await tx.assessmentAttempt.update({
          where: { id },
          data: {
            answers: { ...answers, [questionId]: input.option },
            revision: { increment: 1 },
          },
        }),
      );
    });
  }
  async submit(
    visitorId: string,
    environment: string,
    id: string,
    input: KeyInput,
  ) {
    return idempotent(
      this.db,
      'attempt.submit',
      visitorId,
      input.idempotencyKey,
      { id },
      async (tx) => {
        await this.lock(tx, visitorId);
        const a = await tx.assessmentAttempt.findFirst({
          where: { id, visitorId },
        });
        if (!a) throw new NotFoundException('测验不存在');
        if (a.status === 'submitted') return attemptView(a);
        const p = await this.ownedPlan(tx, visitorId, a.planId, true);
        const questions = (a.snapshot as unknown as Snapshot).questions;
        const answers = a.answers as Record<string, number>;
        if (
          questions.some(
            (q) =>
              !Number.isInteger(answers[q.id]) ||
              answers[q.id]! < 0 ||
              answers[q.id]! >= q.options.length,
          )
        )
          throw new UnprocessableEntityException('请完成全部四道题');
        const score = questions.filter(
          (q) => answers[q.id] === q.correct,
        ).length;
        const recommendedLevel = scoreLevel(score);
        const result = await tx.assessmentAttempt.update({
          where: { id },
          data: {
            status: 'submitted',
            score,
            recommendedLevel,
            submittedAt: new Date(),
            revision: { increment: 1 },
          },
        });
        await tx.learningPlan.update({
          where: { id: p.id },
          data: {
            recommendedLevel,
            selectedLevel: p.selectedLevel ?? recommendedLevel,
            revision: { increment: 1 },
          },
        });
        await recordServerEvent(tx, {
          id: randomUUID(),
          visitorId,
          environment,
          name: 'assessment_submitted',
          flowId: p.flowId,
          taskId: p.taskId,
        });
        return attemptView(result);
      },
    );
  }
  private async course(
    tx: Prisma.TransactionClient,
    visitorId: string,
    planId: string,
    courseId: string,
  ) {
    const p = await this.ownedPlan(tx, visitorId, planId, true);
    const c = await tx.course.findFirst({
      where: {
        ...availableCourse,
        id: courseId,
        mappings: { some: { taskId: p.taskId } },
      },
      include: { mappings: true, mediaAsset: true },
    });
    if (!c?.mediaAsset) throw new NotFoundException('课程不可用或不属于该任务');
    return c;
  }
  async learningCourse(visitorId: string, planId: string, courseId: string) {
    return this.db.$transaction(async (tx) => {
      const c = await this.course(tx, visitorId, planId, courseId);
      const [progress, mark] = await Promise.all([
        tx.visitorCourseProgress.findUnique({
          where: { visitorId_courseId: { visitorId, courseId } },
        }),
        tx.courseMark.findUnique({
          where: { visitorId_courseId: { visitorId, courseId } },
        }),
      ]);
      const valid = progress?.mediaVersion === c.mediaAsset!.sha256;
      return {
        course: mapCourse(c),
        marked: !!mark,
        progress: {
          revision: progress?.revision ?? 0,
          position: valid ? Math.min(progress.position, c.durationSeconds!) : 0,
          clientEnded: valid && progress.clientEnded,
          mediaVersion: c.mediaAsset!.sha256,
        },
      };
    });
  }
  async progress(
    visitorId: string,
    planId: string,
    courseId: string,
    input: ProgressUpdate,
  ) {
    return idempotent(
      this.db,
      'course.progress',
      visitorId,
      input.idempotencyKey,
      { planId, courseId, ...input },
      async (tx) => {
        await this.lock(tx, visitorId);
        const c = await this.course(tx, visitorId, planId, courseId);
        if (input.mediaVersion !== c.mediaAsset!.sha256)
          throw new ConflictException('课程媒体已更新，请刷新');
        if (input.position > c.durationSeconds!)
          throw new UnprocessableEntityException('位置超过实际时长');
        const existing = await tx.visitorCourseProgress.findUnique({
          where: { visitorId_courseId: { visitorId, courseId } },
        });
        if ((existing?.revision ?? 0) !== input.revision)
          throw new ConflictException('播放位置已更新，请刷新');
        const data = {
          position: input.position,
          clientEnded: input.clientEnded,
          mediaVersion: input.mediaVersion,
        };
        const progress = await tx.visitorCourseProgress.upsert({
          where: { visitorId_courseId: { visitorId, courseId } },
          create: { visitorId, courseId, ...data },
          update: { ...data, revision: { increment: 1 } },
        });
        // This row is the task's last visited course, not the authoritative shared seconds.
        await tx.courseProgress.upsert({
          where: { planId_courseId: { planId, courseId } },
          create: { planId, courseId, ...data },
          update: { ...data, revision: { increment: 1 } },
        });
        await tx.learningPlan.update({
          where: { id: planId },
          data: { updatedAt: new Date() },
        });
        return {
          revision: progress.revision,
          position: progress.position,
          clientEnded: progress.clientEnded,
          mediaVersion: progress.mediaVersion,
        };
      },
    );
  }
  async mark(
    visitorId: string,
    environment: string,
    courseId: string,
    marked: boolean,
  ) {
    let verifiedSha: string | undefined;
    if (marked) {
      const c = await this.db.course.findFirst({
        where: { ...availableCourse, id: courseId },
        include: { mediaAsset: true },
      });
      if (!c?.mediaAsset) throw new NotFoundException('课程不可用');
      await this.media.verify(c.mediaAsset);
      verifiedSha = c.mediaAsset.sha256;
    }
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, visitorId);
      const course = await tx.course.findFirst({
        where: { ...availableCourse, id: courseId },
        include: { mediaAsset: true },
      });
      if (!course) throw new NotFoundException('课程不可用');
      if (marked && course.mediaAsset?.sha256 !== verifiedSha)
        throw new ConflictException('媒体已变化，请刷新后重试');
      const where = { visitorId_courseId: { visitorId, courseId } };
      const previous = await tx.courseMark.findUnique({ where });
      if (!!previous === marked) return { courseId, marked };
      if (marked) await tx.courseMark.create({ data: { visitorId, courseId } });
      else await tx.courseMark.delete({ where });
      await recordServerEvent(tx, {
        id: randomUUID(),
        visitorId,
        environment,
        name: 'course_mark_changed',
        flowId: randomUUID(),
        courseId,
      });
      return { courseId, marked };
    });
  }
}
