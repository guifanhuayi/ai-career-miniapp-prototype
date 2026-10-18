import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Course, CourseMapping, MediaAsset, Prisma } from '@prisma/client';
import {
  eligibleDuration,
  type Level,
  levels,
} from '../../../packages/domain/src';
import type {
  AdminQuery,
  CourseCreate,
  CourseFields,
  CourseQuery,
  CourseUpdate,
  PageQuery,
  QuestionDto,
  QuestionSetCreate,
  QuestionSetUpdate,
  ReleaseCreate,
  SceneQuery,
  SceneUpdate,
  TaskUpdate,
} from './catalog.dto';
import { Database } from './database';
import { idempotent, jsonSnapshot } from './idempotency';
import { MediaVerifier } from './media';

const windowOf = (query: PageQuery) => ({
  skip: (query.page - 1) * query.pageSize,
  take: query.pageSize,
});
const pageOf = <T>(items: T[], total: number, query: PageQuery) => ({
  items,
  total,
  page: query.page,
  pageSize: query.pageSize,
});
type CourseRelations = Course & {
  mappings: CourseMapping[];
  mediaAsset: MediaAsset | null;
};
const availableMapping = {
  task: { status: 'published', scene: { status: 'published' } },
};
const availableCourse: Prisma.CourseWhereInput = {
  status: 'published',
  durationSeconds: { gt: 0, lte: 2100 },
  mediaAsset: { durationSeconds: { gt: 0, lte: 2100 } },
  mappings: { some: availableMapping },
};
export const mapCourse = (course: CourseRelations) => ({
  id: course.id,
  title: course.title,
  author: course.author,
  durationSeconds: course.durationSeconds,
  sourceUrl: course.sourceUrl,
  mediaAssetId: course.mediaAssetId,
  authorization: course.authorization,
  isTest: course.isTest,
  chapters: course.chapters as unknown as CourseFields['chapters'],
  mappings: course.mappings.map(({ taskId, level }) => ({ taskId, level })),
  status: course.status,
  version: course.version,
  updatedAt: course.updatedAt.toISOString(),
  publishedAt: course.publishedAt?.toISOString() ?? null,
  mediaPath: course.mediaAssetId
    ? `/api/v1/media/${course.mediaAssetId}`
    : null,
});

@Injectable()
export class CatalogService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(MediaVerifier) private readonly media: MediaVerifier,
  ) {}
  async scenes(query: SceneQuery | AdminQuery, admin = false) {
    const search = query.search?.trim();
    const where: Prisma.SceneWhereInput = {
      ...(admin
        ? (query as AdminQuery).status
          ? { status: (query as AdminQuery).status }
          : {}
        : { status: 'published' }),
      ...('category' in query && query.category
        ? { category: query.category }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { id: { contains: search } },
              { description: { contains: search } },
              {
                tasks: {
                  some: {
                    name: { contains: search },
                    ...(admin ? {} : { status: 'published' }),
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.scene.findMany({
        where,
        ...windowOf(query),
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        include: {
          _count: {
            select: { tasks: { where: admin ? {} : { status: 'published' } } },
          },
        },
      }),
      this.db.scene.count({ where }),
    ]);
    return pageOf(
      items.map(({ _count, updatedAt, syllabus, ...item }) => ({
        ...item,
        syllabus: syllabus as unknown as SceneUpdate['syllabus'],
        updatedAt: updatedAt.toISOString(),
        taskCount: _count.tasks,
      })),
      total,
      query,
    );
  }
  async scene(id: string, admin = false) {
    const item = await this.db.scene.findFirst({
      where: { id, ...(admin ? {} : { status: 'published' }) },
      include: {
        _count: {
          select: { tasks: { where: admin ? {} : { status: 'published' } } },
        },
      },
    });
    if (!item) throw new NotFoundException('学习场景不可用');
    const { _count, syllabus, updatedAt, ...rest } = item;
    return {
      ...rest,
      syllabus: syllabus as unknown as SceneUpdate['syllabus'],
      updatedAt: updatedAt.toISOString(),
      taskCount: _count.tasks,
    };
  }
  async tasks(sceneId: string, query: PageQuery, admin = false) {
    await this.scene(sceneId, admin);
    const where: Prisma.TaskWhereInput = {
      sceneId,
      ...(admin ? {} : { status: 'published' }),
      ...(query.search?.trim()
        ? {
            OR: [
              { name: { contains: query.search.trim() } },
              { id: { contains: query.search.trim() } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.task.findMany({
        where,
        ...windowOf(query),
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        include: { scene: true },
      }),
      this.db.task.count({ where }),
    ]);
    return pageOf(
      items.map(({ scene, updatedAt: _time, ...task }) => ({
        ...task,
        output: scene.output,
      })),
      total,
      query,
    );
  }
  async updateScene(id: string, input: SceneUpdate) {
    this.nonblank(
      input.name,
      input.description,
      input.output,
      ...levels.flatMap((level) => input.syllabus[level]),
    );
    await this.db.$transaction(async (tx) => {
      if (!(await tx.scene.findUnique({ where: { id } })))
        throw new NotFoundException();
      const { version, ...changes } = input;
      const result = await tx.scene.updateMany({
        where: { id, version },
        data: {
          ...changes,
          syllabus: jsonSnapshot(changes.syllabus),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException('场景版本已变化，请刷新后重试');
      const snapshot = await tx.scene.findUniqueOrThrow({ where: { id } });
      await tx.adminAudit.create({
        data: {
          resource: 'scene',
          resourceId: id,
          action: 'update',
          fromVersion: version,
          toVersion: version + 1,
          snapshot: jsonSnapshot(snapshot),
        },
      });
    });
    return this.scene(id, true);
  }
  async updateTask(id: string, input: TaskUpdate) {
    this.nonblank(input.name);
    const task = await this.db.$transaction(async (tx) => {
      if (!(await tx.task.findUnique({ where: { id } })))
        throw new NotFoundException();
      const { version, ...changes } = input;
      const result = await tx.task.updateMany({
        where: { id, version },
        data: { ...changes, version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException('任务版本已变化，请刷新后重试');
      const snapshot = await tx.task.findUniqueOrThrow({
        where: { id },
        include: { scene: true },
      });
      await tx.adminAudit.create({
        data: {
          resource: 'task',
          resourceId: id,
          action: 'update',
          fromVersion: version,
          toVersion: version + 1,
          snapshot: jsonSnapshot(snapshot),
        },
      });
      return snapshot;
    });
    const { scene, updatedAt: _time, ...rest } = task;
    return { ...rest, output: scene.output };
  }
  async courses(query: CourseQuery | AdminQuery, admin = false) {
    const where: Prisma.CourseWhereInput = admin
      ? {
          ...((query as AdminQuery).status
            ? { status: (query as AdminQuery).status }
            : {}),
          ...(query.search?.trim()
            ? { title: { contains: query.search.trim() } }
            : {}),
        }
      : {
          ...availableCourse,
          mappings: {
            some: {
              ...availableMapping,
              taskId: (query as CourseQuery).taskId,
              level: (query as CourseQuery).level,
            },
          },
        };
    if (query.search?.trim()) where.title = { contains: query.search.trim() };
    if (
      !admin &&
      !(await this.db.task.findFirst({
        where: {
          id: (query as CourseQuery).taskId,
          status: 'published',
          scene: { status: 'published' },
        },
      }))
    )
      throw new NotFoundException('学习任务不可用');
    const [items, total] = await this.db.$transaction([
      this.db.course.findMany({
        where,
        ...windowOf(query),
        orderBy: [{ id: 'asc' }],
        include: { mappings: true, mediaAsset: true },
      }),
      this.db.course.count({ where }),
    ]);
    return pageOf(items.map(mapCourse), total, query);
  }
  async course(id: string, admin = false) {
    const course = await this.db.course.findFirst({
      where: { id, ...(admin ? {} : availableCourse) },
      include: { mappings: true, mediaAsset: true },
    });
    if (!course) throw new NotFoundException('课程未发布或暂不可用');
    return course;
  }
  async createCourse(input: CourseCreate) {
    const { idempotencyKey, ...fields } = input;
    this.nonblank(fields.title, fields.author);
    await this.validateMappings(fields);
    return idempotent(
      this.db,
      'create-course',
      'local-admin',
      idempotencyKey,
      fields,
      async (tx) => {
        const { mappings, ...data } = fields;
        const course = await tx.course.create({
          data: {
            ...data,
            chapters: jsonSnapshot(data.chapters),
            mappings: { create: mappings },
          },
          include: { mappings: true, mediaAsset: true },
        });
        await tx.adminAudit.create({
          data: {
            resource: 'course',
            resourceId: course.id,
            action: 'create',
            toVersion: 1,
            snapshot: jsonSnapshot(course),
          },
        });
        return mapCourse(course);
      },
    );
  }
  async updateCourse(id: string, input: CourseUpdate) {
    const old = await this.course(id, true);
    if (old.version !== input.version)
      throw new ConflictException('课程版本已变化，请刷新后重试');
    if (old.status === 'published')
      await this.validatePublication({
        ...old,
        ...input,
        mediaAsset: input.mediaAssetId
          ? await this.db.mediaAsset.findUnique({
              where: { id: input.mediaAssetId },
            })
          : null,
      });
    this.nonblank(input.title, input.author);
    await this.validateMappings(input);
    return this.db.$transaction(async (tx) => {
      const { version, mappings, ...data } = input;
      const update = await tx.course.updateMany({
        where: { id, version },
        data: {
          ...data,
          chapters: jsonSnapshot(data.chapters),
          version: { increment: 1 },
        },
      });
      if (update.count !== 1)
        throw new ConflictException('课程版本已变化，请刷新后重试');
      await tx.courseMapping.deleteMany({ where: { courseId: id } });
      await tx.courseMapping.createMany({
        data: mappings.map((mapping) => ({ ...mapping, courseId: id })),
      });
      const course = await tx.course.findUniqueOrThrow({
        where: { id },
        include: { mappings: true, mediaAsset: true },
      });
      await tx.adminAudit.create({
        data: {
          resource: 'course',
          resourceId: id,
          action: 'update',
          fromVersion: version,
          toVersion: version + 1,
          snapshot: jsonSnapshot(course),
        },
      });
      return mapCourse(course);
    });
  }
  private nonblank(...values: string[]) {
    if (values.some((value) => !value.trim()))
      throw new UnprocessableEntityException('名称、正文和知识点不能仅为空白');
  }
  private async validateMappings(fields: CourseFields) {
    const unique = new Set(
      fields.mappings.map((mapping) => `${mapping.taskId}:${mapping.level}`),
    );
    if (unique.size !== fields.mappings.length)
      throw new UnprocessableEntityException('课程任务关联重复');
    if (fields.mappings.length) {
      const ids = [
        ...new Set(fields.mappings.map((mapping) => mapping.taskId)),
      ];
      if (
        (await this.db.task.count({ where: { id: { in: ids } } })) !==
        ids.length
      )
        throw new UnprocessableEntityException('关联任务不存在');
    }
    if (
      fields.mediaAssetId &&
      !(await this.db.mediaAsset.findUnique({
        where: { id: fields.mediaAssetId },
      }))
    )
      throw new UnprocessableEntityException('受控媒体不存在');
    if (fields.sourceUrl) {
      let source: URL;
      try {
        source = new URL(fields.sourceUrl);
      } catch {
        throw new UnprocessableEntityException('来源参考地址格式无效');
      }
      if (source.protocol !== 'https:' || source.username || source.password)
        throw new UnprocessableEntityException('来源参考须为无凭据的HTTPS网页');
    }
  }
  private async validatePublication(
    course: Pick<
      Course,
      'title' | 'author' | 'authorization' | 'isTest' | 'durationSeconds'
    > & {
      chapters: unknown;
      mappings: { taskId: string; level: string }[];
      mediaAsset: MediaAsset | null;
    },
  ) {
    this.nonblank(course.title, course.author, course.authorization ?? '');
    if (!eligibleDuration(course.durationSeconds))
      throw new UnprocessableEntityException(
        '仅可发布实际总时长大于0且不超过35分钟的课程',
      );
    if (!course.mediaAsset || course.isTest !== course.mediaAsset.isTest)
      throw new UnprocessableEntityException('媒体待配置或测试资源标记不一致');
    const actual = await this.media.verify(course.mediaAsset);
    if (
      !eligibleDuration(actual.durationSeconds) ||
      Math.abs(actual.durationSeconds - course.durationSeconds) > 0.001
    )
      throw new UnprocessableEntityException(
        '课程时长必须与实际媒体一致且不超过35分钟',
      );
    const chapters = course.chapters as {
      title: string;
      durationSeconds: number;
    }[];
    if (
      !chapters.length ||
      chapters.some(
        (chapter) =>
          !chapter.title.trim() || !eligibleDuration(chapter.durationSeconds),
      ) ||
      Math.abs(
        chapters.reduce((sum, item) => sum + item.durationSeconds, 0) -
          actual.durationSeconds,
      ) > 0.001
    )
      throw new UnprocessableEntityException(
        '章节标题、时长及总和必须与课程实际时长一致',
      );
    const ids = [...new Set(course.mappings.map((item) => item.taskId))];
    if (
      !ids.length ||
      course.mappings.some((item) => !levels.includes(item.level as Level)) ||
      (await this.db.task.count({
        where: {
          id: { in: ids },
          status: 'published',
          scene: { status: 'published' },
        },
      })) !== ids.length
    )
      throw new UnprocessableEntityException(
        '发布课程必须关联有效场景任务和等级',
      );
  }
  async release(input: ReleaseCreate) {
    const { idempotencyKey, ...payload } = input;
    return idempotent(
      this.db,
      'content-release',
      'local-admin',
      idempotencyKey,
      payload,
      async (tx) => {
        const { resourceId: id, version, status, resource } = input;
        if (resource === 'course' && status === 'published') {
          const course = await this.course(id, true);
          if (course.version !== version)
            throw new ConflictException('课程版本已变化，请刷新后重试');
          await this.validatePublication(course);
        }
        let snapshot: unknown;
        let count = 0;
        if (resource === 'scene') {
          if (!(await tx.scene.findUnique({ where: { id } })))
            throw new NotFoundException();
          count = (
            await tx.scene.updateMany({
              where: { id, version },
              data: { status, version: { increment: 1 } },
            })
          ).count;
          snapshot = await tx.scene.findUnique({ where: { id } });
        } else if (resource === 'task') {
          const task = await tx.task.findUnique({
            where: { id },
            include: { scene: true },
          });
          if (!task) throw new NotFoundException();
          if (status === 'published' && task.scene.status !== 'published')
            throw new UnprocessableEntityException('所属场景未发布');
          count = (
            await tx.task.updateMany({
              where: { id, version },
              data: { status, version: { increment: 1 } },
            })
          ).count;
          snapshot = await tx.task.findUnique({ where: { id } });
        } else if (resource === 'course') {
          count = (
            await tx.course.updateMany({
              where: { id, version },
              data: {
                status,
                version: { increment: 1 },
                ...(status === 'published' ? { publishedAt: new Date() } : {}),
              },
            })
          ).count;
          snapshot = await tx.course.findUnique({
            where: { id },
            include: { mappings: true, mediaAsset: true },
          });
        } else {
          const set = await tx.questionSet.findUnique({ where: { id } });
          if (!set) throw new NotFoundException();
          if (status === 'published') {
            if (!set.isMock)
              throw new UnprocessableEntityException('首期仅发布模拟题库');
            this.validateQuestions(set.questions as unknown as QuestionDto[]);
            if (
              !(await tx.scene.findFirst({
                where: { id: set.sceneId, status: 'published' },
              }))
            )
              throw new UnprocessableEntityException('所属场景未发布');
          }
          count = (
            await tx.questionSet.updateMany({
              where: { id, revision: version },
              data: { status, revision: { increment: 1 } },
            })
          ).count;
          snapshot = await tx.questionSet.findUnique({ where: { id } });
        }
        if (count !== 1)
          throw new ConflictException('内容版本已变化，请刷新后重试');
        const audit = await tx.adminAudit.create({
          data: {
            resource,
            resourceId: id,
            action: status === 'published' ? 'publish' : 'archive',
            fromVersion: version,
            toVersion: version + 1,
            snapshot: jsonSnapshot(snapshot),
          },
        });
        return {
          id: audit.id,
          resource,
          resourceId: id,
          action: audit.action,
          fromVersion: version,
          toVersion: version + 1,
          createdAt: audit.createdAt.toISOString(),
        };
      },
    );
  }
  async releases(query: PageQuery) {
    return this.audits(query, true);
  }
  async audits(query: PageQuery, releasesOnly = false) {
    const where: Prisma.AdminAuditWhereInput = {
      ...(releasesOnly ? { action: { in: ['publish', 'archive'] } } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { resourceId: { contains: query.search.trim() } },
              { resource: { contains: query.search.trim() } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.adminAudit.findMany({
        where,
        ...windowOf(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.adminAudit.count({ where }),
    ]);
    return pageOf(
      items.map(({ snapshot: _snapshot, createdAt, fromVersion, ...item }) => ({
        ...item,
        fromVersion: fromVersion ?? 0,
        createdAt: createdAt.toISOString(),
      })),
      total,
      query,
    );
  }
  async mediaAsset(id: string) {
    const asset = await this.db.mediaAsset.findFirst({
      where: {
        id,
        durationSeconds: { gt: 0, lte: 2100 },
        courses: { some: availableCourse },
      },
    });
    if (!asset) throw new NotFoundException('媒体未关联有效发布课程');
    return this.media.verify(asset);
  }
  async contentRelease(id: string) {
    const item = await this.db.adminAudit.findFirst({
      where: { id, action: { in: ['publish', 'archive'] } },
    });
    if (!item) throw new NotFoundException('发布记录不存在');
    const { snapshot: _snapshot, createdAt, fromVersion, ...rest } = item;
    return {
      ...rest,
      fromVersion: fromVersion ?? 0,
      createdAt: createdAt.toISOString(),
    };
  }
  async mediaAssets() {
    return this.db.mediaAsset.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        durationSeconds: true,
        isTest: true,
        authorization: true,
      },
    });
  }
  private validateQuestions(questions: QuestionDto[]) {
    if (
      !Array.isArray(questions) ||
      questions.length !== 4 ||
      new Set(questions.map((item) => item.id)).size !== 4 ||
      questions.some(
        (item) =>
          !item.id ||
          !item.title?.trim() ||
          !Array.isArray(item.options) ||
          item.options.length !== 3 ||
          item.options.some(
            (option) => typeof option !== 'string' || !option.trim(),
          ) ||
          !Number.isInteger(item.correct) ||
          item.correct < 0 ||
          item.correct > 2 ||
          !item.explanation?.trim(),
      )
    )
      throw new UnprocessableEntityException(
        '模拟题库须四道有效单选题，题目ID不重复',
      );
  }
  async questionSets(query: AdminQuery) {
    const where: Prisma.QuestionSetWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { version: { contains: query.search.trim() } },
              { scene: { name: { contains: query.search.trim() } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.questionSet.findMany({
        where,
        ...windowOf(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.questionSet.count({ where }),
    ]);
    return pageOf(
      items.map((item) => ({
        ...item,
        questions: item.questions as unknown as QuestionDto[],
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }
  async createQuestionSet(input: QuestionSetCreate) {
    const { idempotencyKey, ...fields } = input;
    this.validateQuestions(fields.questions);
    if (!(await this.db.scene.findUnique({ where: { id: fields.sceneId } })))
      throw new UnprocessableEntityException('场景不存在');
    return idempotent(
      this.db,
      'create-question-set',
      'local-admin',
      idempotencyKey,
      fields,
      async (tx) => {
        const item = await tx.questionSet.create({
          data: { ...fields, questions: jsonSnapshot(fields.questions) },
        });
        await tx.adminAudit.create({
          data: {
            resource: 'question-set',
            resourceId: item.id,
            action: 'create',
            toVersion: 1,
            snapshot: jsonSnapshot(item),
          },
        });
        return {
          ...item,
          questions: fields.questions,
          createdAt: item.createdAt.toISOString(),
        };
      },
    );
  }
  async questionSet(id: string) {
    const item = await this.db.questionSet.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('模拟题库不存在');
    return {
      ...item,
      questions: item.questions as unknown as QuestionDto[],
      createdAt: item.createdAt.toISOString(),
    };
  }
  async updateQuestionSet(id: string, input: QuestionSetUpdate) {
    this.validateQuestions(input.questions);
    return this.db.$transaction(async (tx) => {
      const old = await tx.questionSet.findUnique({ where: { id } });
      if (!old) throw new NotFoundException();
      if (old.status !== 'draft')
        throw new ConflictException(
          '已发布题库不可改题，请建立新版本；历史记录保留',
        );
      const updated = await tx.questionSet.updateMany({
        where: { id, revision: input.revision, status: 'draft' },
        data: {
          questions: jsonSnapshot(input.questions),
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('题库修订号已变化，请刷新后重试');
      const item = await tx.questionSet.findUniqueOrThrow({ where: { id } });
      await tx.adminAudit.create({
        data: {
          resource: 'question-set',
          resourceId: id,
          action: 'update',
          fromVersion: input.revision,
          toVersion: item.revision,
          snapshot: jsonSnapshot(item),
        },
      });
      return {
        ...item,
        questions: input.questions,
        createdAt: item.createdAt.toISOString(),
      };
    });
  }
}
