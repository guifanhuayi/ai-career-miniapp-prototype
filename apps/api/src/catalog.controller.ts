import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  type Type,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AdminQuery,
  CourseCreate,
  CoursePage,
  CourseQuery,
  CourseResponse,
  CourseUpdate,
  categories,
  contentStatuses,
  MediaResponse,
  PageQuery,
  QuestionSetCreate,
  QuestionSetPage,
  QuestionSetResponse,
  QuestionSetUpdate,
  ReleaseCreate,
  ReleasePage,
  ReleaseResponse,
  ScenePage,
  SceneQuery,
  SceneResponse,
  SceneUpdate,
  TaskPage,
  TaskResponse,
  TaskUpdate,
} from './catalog.dto';
import { CatalogService, mapCourse } from './catalog.service';
import {
  type CareerRequest,
  DtoPipe,
  EmptyObjectPipe,
  ErrorResponse,
  LocalAdminGuard,
} from './http';
import { MediaVerifier } from './media';

const Operation = (operationId: string, summary: string, description: string) =>
  ApiOperation({ operationId, summary, description });
const Path = (name: string) => ApiParam({ name, type: String });
const Ok = (type: Type<unknown>) => ApiOkResponse({ type });
const Input = (type: Type<unknown>) => ApiBody({ type });
// Explicit named query parameters retain enum constraints in Swagger 12.
const Paging = () =>
  applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({ name: 'search', required: false, type: String, maxLength: 100 }),
  );
const AdminFilters = () =>
  applyDecorators(
    Paging(),
    ApiQuery({ name: 'status', required: false, enum: [...contentStatuses] }),
  );

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get('scenes')
  @Paging()
  @ApiQuery({ name: 'category', required: false, enum: [...categories] })
  @Ok(ScenePage)
  @Operation(
    'listScenes',
    '已发布场景目录',
    '中文名、场景描述、英文ID及已发布任务名搜索，忽略首尾空白/英文大小写；分类取交集。按position,id升序，越界空items。',
  )
  scenes(@Query(new DtoPipe(SceneQuery)) query: SceneQuery) {
    return this.catalog.scenes(query);
  }
  @Get('scenes/:sceneId')
  @Path('sceneId')
  @Ok(SceneResponse)
  @Operation(
    'getScene',
    '已发布场景与三级知识点',
    '不返回题库答案。草稿/下架返回404。',
  )
  scene(
    @Param('sceneId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.catalog.scene(id);
  }
  @Get('scenes/:sceneId/tasks')
  @Path('sceneId')
  @Paging()
  @Ok(TaskPage)
  @Operation(
    'listSceneTasks',
    '已发布场景的任务',
    '场景任务均需发布；按position,id升序分页。',
  )
  tasks(
    @Param('sceneId') id: string,
    @Query(new DtoPipe(PageQuery)) query: PageQuery,
  ) {
    return this.catalog.tasks(id, query);
  }
  @Get('courses')
  @Paging()
  @ApiQuery({ name: 'taskId', required: true, type: String, maxLength: 64 })
  @ApiQuery({
    name: 'level',
    required: true,
    enum: ['beginner', 'intermediate', 'advanced'],
  })
  @Ok(CoursePage)
  @Operation(
    'listCourses',
    '按任务和等级读取有效课程',
    '统一0<实际总时长<=2100秒；不接受时长/类型筛选或放宽参数。仅发布且关联可用任务/场景/受控媒体的课程，按id稳定排序。',
  )
  courses(@Query(new DtoPipe(CourseQuery)) query: CourseQuery) {
    return this.catalog.courses(query);
  }
  @Get('courses/:courseId')
  @Path('courseId')
  @Ok(CourseResponse)
  @Operation(
    'getCourse',
    '课程详情',
    '直接ID同样执行发布、任务关联及0<总时长<=2100规则。章节独立于知识点，isTest明确标记。',
  )
  async course(
    @Param('courseId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return mapCourse(await this.catalog.course(id));
  }
  @Get('media/:assetId')
  @Path('assetId')
  @Operation(
    'getCourseMedia',
    '受控课程媒体',
    '只服务关联有效发布课程、文件校验通过的自有媒体。支持Range；不代理任意URL，不公开JD图片。',
  )
  @ApiResponse({
    status: 200,
    description: 'MP4完整内容',
    content: { 'video/mp4': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({
    status: 206,
    description: 'MP4范围内容',
    content: { 'video/mp4': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({
    status: 416,
    description: '无效媒体Range',
    type: ErrorResponse,
  })
  async media(
    @Param('assetId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
    @Req() request: CareerRequest,
    @Res() response: Response,
  ) {
    const asset = await this.catalog.mediaAsset(id);
    response.sendFile(
      asset.path,
      { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' } },
      (error) => {
        if (error && !response.headersSent) {
          const status =
            (error as { status?: number }).status === 416 ? 416 : 404;
          request.errorCode =
            status === 416 ? 'INVALID_MEDIA_RANGE' : 'RESOURCE_NOT_FOUND';
          response.status(status).json({
            code: request.errorCode,
            message: '媒体范围无效或资源不可用',
            details: [],
            requestId: request.requestId,
          });
        }
      },
    );
  }
}
@ApiTags('content-admin')
@ApiSecurity('localAdmin')
@UseGuards(LocalAdminGuard)
@Controller('admin')
export class ContentAdminController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get('scenes')
  @AdminFilters()
  @Ok(ScenePage)
  @Operation(
    'listAdminScenes',
    '维护场景目录',
    '包含草稿/发布/下架；分页与前台统一，仅限本地管理。',
  )
  scenes(@Query(new DtoPipe(AdminQuery)) query: AdminQuery) {
    return this.catalog.scenes(query, true);
  }
  @Patch('scenes/:sceneId')
  @Path('sceneId')
  @Input(SceneUpdate)
  @Ok(SceneResponse)
  @Operation(
    'updateScene',
    '保存场景编辑表单',
    '提交全部声明表单字段和当前version；乐观锁409；状态通过content-releases改变，审计快照同事务。',
  )
  updateScene(
    @Param('sceneId') id: string,
    @Body(new DtoPipe(SceneUpdate)) input: SceneUpdate,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.catalog.updateScene(id, input);
  }
  @Get('scenes/:sceneId/tasks')
  @Path('sceneId')
  @Paging()
  @Ok(TaskPage)
  @Operation(
    'listAdminTasks',
    '维护场景下的任务',
    '包含未发布任务；稳定ID不随编辑改变，按position,id升序。',
  )
  tasks(
    @Param('sceneId') id: string,
    @Query(new DtoPipe(PageQuery)) query: PageQuery,
  ) {
    return this.catalog.tasks(id, query, true);
  }
  @Patch('tasks/:taskId')
  @Path('taskId')
  @Input(TaskUpdate)
  @Ok(TaskResponse)
  @Operation(
    'updateTask',
    '保存任务名称及排序',
    'version乐观锁409；归属不接受任意变更，不删除历史。',
  )
  updateTask(
    @Param('taskId') id: string,
    @Body(new DtoPipe(TaskUpdate)) input: TaskUpdate,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.catalog.updateTask(id, input);
  }
  @Get('courses')
  @AdminFilters()
  @Ok(CoursePage)
  @Operation(
    'listAdminCourses',
    '维护课程草稿与发布',
    '未知/无效/超35分钟可存草稿，发布前实际校验。媒体和来源网页分开。',
  )
  courses(@Query(new DtoPipe(AdminQuery)) query: AdminQuery) {
    return this.catalog.courses(query, true);
  }
  @Post('courses')
  @Input(CourseCreate)
  @ApiCreatedResponse({ type: CourseResponse })
  @Operation(
    'createCourse',
    '创建课程草稿',
    '同幂等键同载荷重读同资源；不同载荷409。未知时长可存草稿但不可发布。201+Location。',
  )
  async createCourse(
    @Body(new DtoPipe(CourseCreate)) input: CourseCreate,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.catalog.createCourse(input);
    response.setHeader('Location', `/api/v1/admin/courses/${result.id}`);
    return result;
  }
  @Get('courses/:courseId')
  @Path('courseId')
  @Ok(CourseResponse)
  @Operation(
    'getAdminCourse',
    '读取课程编辑数据',
    '管理端可读草稿，前台详情仍执行发布/时长限制。',
  )
  async course(
    @Param('courseId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return mapCourse(await this.catalog.course(id, true));
  }
  @Patch('courses/:courseId')
  @Path('courseId')
  @Input(CourseUpdate)
  @Ok(CourseResponse)
  @Operation(
    'updateCourse',
    '保存课程完整编辑表单',
    '当前version+声明的完整表单字段；已发布内容编辑也须校验实际媒体/时长/章节/关联；旧版本409，不静默覆盖。',
  )
  updateCourse(
    @Param('courseId') id: string,
    @Body(new DtoPipe(CourseUpdate)) input: CourseUpdate,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.catalog.updateCourse(id, input);
  }
  @Get('media-assets')
  @ApiOkResponse({ type: MediaResponse, isArray: true })
  @Operation(
    'listMediaAssets',
    '选择已核验受控媒体',
    '首期项目自制测试资源，无任意URL抓取或用户私人视频上传。',
  )
  mediaAssets(@Query(new EmptyObjectPipe()) _query: object) {
    return this.catalog.mediaAssets();
  }
  @Get('question-sets')
  @AdminFilters()
  @Ok(QuestionSetPage)
  @Operation(
    'listQuestionSets',
    '维护模拟题库版本',
    '答案只在受本机约束的管理接口返回；前台测验另用脱敏快照。',
  )
  questionSets(@Query(new DtoPipe(AdminQuery)) query: AdminQuery) {
    return this.catalog.questionSets(query);
  }
  @Post('question-sets')
  @Input(QuestionSetCreate)
  @ApiCreatedResponse({ type: QuestionSetResponse })
  @Operation(
    'createQuestionSet',
    '创建四题模拟题库草稿',
    '版本号在场景内唯一；幂等键同载荷重读/不同载荷409。首期isMock须true，正式内容及规则后续确认。',
  )
  async createQuestionSet(
    @Body(new DtoPipe(QuestionSetCreate)) input: QuestionSetCreate,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.catalog.createQuestionSet(input);
    response.setHeader('Location', `/api/v1/admin/question-sets/${result.id}`);
    return result;
  }
  @Patch('question-sets/:questionSetId')
  @Path('questionSetId')
  @Input(QuestionSetUpdate)
  @Ok(QuestionSetResponse)
  @Operation(
    'updateQuestionSet',
    '编辑未发布题库草稿',
    'revision乐观锁；已发布或下架版本不可改题，应创建新版本，历史不改写。',
  )
  updateQuestionSet(
    @Param('questionSetId') id: string,
    @Body(new DtoPipe(QuestionSetUpdate)) input: QuestionSetUpdate,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.catalog.updateQuestionSet(id, input);
  }
  @Get('question-sets/:questionSetId')
  @Path('questionSetId')
  @Ok(QuestionSetResponse)
  @Operation(
    'getQuestionSet',
    '读取模拟题库版本',
    '仅管理接口返回答案；创建结果Location指向此资源，草稿/历史版本均保留。',
  )
  questionSet(
    @Param('questionSetId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.catalog.questionSet(id);
  }
  @Post('content-releases')
  @Input(ReleaseCreate)
  @ApiCreatedResponse({ type: ReleaseResponse })
  @Operation(
    'createContentRelease',
    '审核发布或下架',
    '校验、version与审计同事务；课程须授权/受控实际媒体/章节/关联且0<实际总秒数<=2100。同幂等键同载荷重读，冲突409。',
  )
  async release(
    @Body(new DtoPipe(ReleaseCreate)) input: ReleaseCreate,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.catalog.release(input);
    response.setHeader(
      'Location',
      `/api/v1/admin/content-releases/${result.id}`,
    );
    return result;
  }
  @Get('content-releases')
  @Paging()
  @Ok(ReleasePage)
  @Operation(
    'listContentReleases',
    '发布与下架审计',
    '只读，createdAt,id倒序，版本和时间来自实际事务；内容快照持久保存，不套用埋点保留期。',
  )
  releases(@Query(new DtoPipe(PageQuery)) query: PageQuery) {
    return this.catalog.releases(query);
  }
  @Get('content-releases/:releaseId')
  @Path('releaseId')
  @Ok(ReleaseResponse)
  @Operation(
    'getContentRelease',
    '读取发布审计记录',
    '发布/下架创建结果的Location；只读，不回传完整业务快照或敏感内容。',
  )
  contentRelease(
    @Param('releaseId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.catalog.contentRelease(id);
  }
  @Get('content-audits')
  @Paging()
  @Ok(ReleasePage)
  @Operation(
    'listContentAudits',
    '内容操作审计',
    '创建、编辑、发布及下架记录；只读分页，初始fromVersion=0，不回传完整内容快照。按resource/resourceId搜索。',
  )
  audits(@Query(new DtoPipe(PageQuery)) query: PageQuery) {
    return this.catalog.audits(query);
  }
}
@Module({
  controllers: [CatalogController, ContentAdminController],
  providers: [CatalogService, MediaVerifier],
})
export class CatalogModule {}
