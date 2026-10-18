import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  type CareerRequest,
  DtoPipe,
  EmptyObjectPipe,
  OptionalEmptyBodyPipe,
  VisitorGuard,
} from '../http';
import { MediaVerifier } from '../media';
import { ApiPaging, PageQuery } from '../pagination';
import {
  AnswerUpdate,
  AttemptCreate,
  AttemptResponse,
  KeyInput,
  LearningCourseResponse,
  LevelUpdate,
  MarkResponse,
  PlanCreate,
  PlanPage,
  PlanResponse,
  ProgressResponse,
  ProgressUpdate,
} from './learning.dto';
import { LearningService } from './learning.service';

@ApiTags('learning')
@ApiSecurity('visitorBearer')
@UseGuards(VisitorGuard)
@Controller()
export class LearningController {
  constructor(
    @Inject(LearningService) private readonly learning: LearningService,
  ) {}
  @Post('learning-plans')
  @ApiBody({ type: PlanCreate })
  @ApiCreatedResponse({ type: PlanResponse })
  @ApiOperation({
    operationId: 'createLearningPlan',
    summary: '选择任务并建立或复用本人计划',
    description:
      '同访客/场景/任务唯一；来源首次固定。持久幂等键同键异载荷409；有效发布任务，岗位来源必须属于本人且已选该方向。201+Location，不自动建立测验。',
  })
  async create(
    @Req() r: CareerRequest,
    @Body(new DtoPipe(PlanCreate)) b: PlanCreate,
    @Query(new EmptyObjectPipe()) _q: object,
    @Res({ passthrough: true }) res: Response,
  ) {
    const p = await this.learning.createPlan(
      r.visitorId,
      r.visitorEnvironment,
      b,
    );
    res.setHeader('Location', `/api/v1/learning-plans/${p.id}`);
    return p;
  }
  @Get('learning-plans')
  @ApiPaging()
  @ApiOkResponse({ type: PlanPage })
  @ApiOperation({
    operationId: 'listLearningPlans',
    summary: '分页恢复本人全部任务',
    description:
      'updatedAt/id倒序；search按方向/任务名，包含下架历史，available=false不能继续新业务；课程数和手动看过数来自当前有效课程，0为真空。',
  })
  list(@Req() r: CareerRequest, @Query(new DtoPipe(PageQuery)) q: PageQuery) {
    return this.learning.plans(r.visitorId, q);
  }
  @Get('learning-plans/:planId')
  @ApiParam({ name: 'planId', type: String })
  @ApiOkResponse({ type: PlanResponse })
  @ApiOperation({
    operationId: 'getLearningPlan',
    summary: '读取本人计划及恢复入口',
    description:
      '仅本人；不存在或他人统一404。latestAttempt按服务端递增sequence，历史结果不被重测覆盖；匿名凭据清理后不能跨设备恢复。',
  })
  get(
    @Req() r: CareerRequest,
    @Param('planId') id: string,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.learning.plan(r.visitorId, id);
  }
  @Patch('learning-plans/:planId')
  @ApiParam({ name: 'planId', type: String })
  @ApiBody({ type: LevelUpdate })
  @ApiOkResponse({ type: PlanResponse })
  @ApiOperation({
    operationId: 'updateLearningLevel',
    summary: '保存本人任务自主学习等级',
    description:
      '完成首测后可改；revision防旧覆盖409，同目标重复幂等。只改变selectedLevel，不改成绩、题库快照或recommendedLevel。',
  })
  level(
    @Req() r: CareerRequest,
    @Param('planId') id: string,
    @Body(new DtoPipe(LevelUpdate)) b: LevelUpdate,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.learning.level(r.visitorId, r.visitorEnvironment, id, b);
  }
  @Post('assessment-attempts')
  @ApiBody({ type: AttemptCreate })
  @ApiCreatedResponse({ type: AttemptResponse })
  @ApiOperation({
    operationId: 'createAssessmentAttempt',
    summary: '创建测验或恢复同任务草稿',
    description:
      '每任务同时一个草稿；四题采用创建时已发布不可变题库快照；仅创建新一轮才发开始事件。持久幂等键；题库不可用422；201+Location，提交前绝不返回正确答案。',
  })
  async attemptCreate(
    @Req() r: CareerRequest,
    @Body(new DtoPipe(AttemptCreate)) b: AttemptCreate,
    @Query(new EmptyObjectPipe()) _q: object,
    @Res({ passthrough: true }) res: Response,
  ) {
    const a = await this.learning.createAttempt(
      r.visitorId,
      r.visitorEnvironment,
      b,
    );
    res.setHeader('Location', `/api/v1/assessment-attempts/${a.id}`);
    return a;
  }
  @Get('assessment-attempts/:attemptId')
  @ApiParam({ name: 'attemptId', type: String })
  @ApiOkResponse({ type: AttemptResponse })
  @ApiOperation({
    operationId: 'getAssessmentAttempt',
    summary: '恢复本人答题草稿或历史答题回顾',
    description:
      '草稿不返回correct/explanation；提交后按该轮快照返回答案解释。题库更新不影响历史，其他访客404。',
  })
  attemptGet(
    @Req() r: CareerRequest,
    @Param('attemptId') id: string,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.learning.attempt(r.visitorId, id);
  }
  @Put('assessment-attempts/:attemptId/answers/:questionId')
  @ApiParam({ name: 'attemptId', type: String })
  @ApiParam({ name: 'questionId', type: String })
  @ApiBody({ type: AnswerUpdate })
  @ApiOkResponse({ type: AttemptResponse })
  @ApiOperation({
    operationId: 'saveAssessmentAnswer',
    summary: '保存单题唯一答案',
    description:
      'option为0/1/2，题目必须属于本轮；revision防旧覆盖409，同目标重复PUT幂等。已提交不可编辑；未知字段/客户端score拒绝。',
  })
  answer(
    @Req() r: CareerRequest,
    @Param('attemptId') id: string,
    @Param('questionId') qid: string,
    @Body(new DtoPipe(AnswerUpdate)) b: AnswerUpdate,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.learning.answer(r.visitorId, id, qid, b);
  }
  @Post('assessment-attempts/:attemptId/submissions')
  @ApiParam({ name: 'attemptId', type: String })
  @ApiBody({ type: KeyInput })
  @ApiCreatedResponse({ type: AttemptResponse })
  @ApiOperation({
    operationId: 'submitAssessmentAttempt',
    summary: '服务端评分并推荐学习起点',
    description:
      '四题全部有效答案才可提交；0/1初阶、2/3进阶、4高阶，mock-score-v1。提交、计划更新、成功事件同事务；并发/重复只产生一个结果一个成功事件。重试同键恢复；重测保留旧结果及已选择等级。201+Location指向已有测验资源。',
  })
  async submit(
    @Req() r: CareerRequest,
    @Param('attemptId') id: string,
    @Body(new DtoPipe(KeyInput)) b: KeyInput,
    @Query(new EmptyObjectPipe()) _q: object,
    @Res({ passthrough: true }) res: Response,
  ) {
    const a = await this.learning.submit(
      r.visitorId,
      r.visitorEnvironment,
      id,
      b,
    );
    res.setHeader('Location', `/api/v1/assessment-attempts/${id}`);
    return a;
  }
  @Get('learning-plans/:planId/courses/:courseId')
  @ApiParam({ name: 'planId', type: String })
  @ApiParam({ name: 'courseId', type: String })
  @ApiOkResponse({ type: LearningCourseResponse })
  @ApiOperation({
    operationId: 'getLearningCourse',
    summary: '读取任务课程和本人共享播放位置',
    description:
      '本人计划+有效课程+任务关联；实际0<秒数<=2100。媒体SHA变化时返回位置0，保留revision防覆盖；手动看过按访客/课程共享，与播放结束分开。',
  })
  course(
    @Req() r: CareerRequest,
    @Param('planId') pid: string,
    @Param('courseId') cid: string,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.learning.learningCourse(r.visitorId, pid, cid);
  }
  @Put('learning-plans/:planId/courses/:courseId/progress')
  @ApiParam({ name: 'planId', type: String })
  @ApiParam({ name: 'courseId', type: String })
  @ApiBody({ type: ProgressUpdate })
  @ApiOkResponse({ type: ProgressResponse })
  @ApiOperation({
    operationId: 'saveCourseProgress',
    summary: '保存本人同课共享播放位置及任务继续入口',
    description:
      '秒数可回退但不得超过实际媒体；初始revision=0，冲突409。mediaVersion须匹配SHA；持久幂等键恢复丢响应。clientEnded只为客户端播放报告，不自动标看过、不认证完课。',
  })
  progress(
    @Req() r: CareerRequest,
    @Param('planId') pid: string,
    @Param('courseId') cid: string,
    @Body(new DtoPipe(ProgressUpdate)) b: ProgressUpdate,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.learning.progress(r.visitorId, pid, cid, b);
  }
  @Put('me/course-marks/:courseId')
  @ApiParam({ name: 'courseId', type: String })
  @ApiOkResponse({ type: MarkResponse })
  @ApiOperation({
    operationId: 'markCourse',
    summary: '幂等手动标记看过',
    description:
      '空请求；按本人/课程共享。不将打开、播放或结束当作手动看过。只有实际状态变化才产生服务端事件。',
  })
  mark(
    @Req() r: CareerRequest,
    @Param('courseId') cid: string,
    @Body(new OptionalEmptyBodyPipe()) _b: object,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.learning.mark(r.visitorId, r.visitorEnvironment, cid, true);
  }
  @Delete('me/course-marks/:courseId')
  @ApiParam({ name: 'courseId', type: String })
  @ApiOkResponse({ type: MarkResponse })
  @ApiOperation({
    operationId: 'unmarkCourse',
    summary: '幂等取消手动看过',
    description:
      '空请求；不删除任何任务的播放位置、答案或学习计划。课程当前必须有效。',
  })
  unmark(
    @Req() r: CareerRequest,
    @Param('courseId') cid: string,
    @Body(new OptionalEmptyBodyPipe()) _b: object,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.learning.mark(r.visitorId, r.visitorEnvironment, cid, false);
  }
}
@Module({
  controllers: [LearningController],
  providers: [LearningService, MediaVerifier],
})
export class LearningModule {}
