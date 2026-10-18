import {
  Body,
  Controller,
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
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  type CareerRequest,
  DtoPipe,
  EmptyObjectPipe,
  VisitorGuard,
} from '../http';
import { ApiPaging } from '../pagination';
import { AnalysisRunner, RuleAnalyzer } from './analysis.runner';
import {
  AnalysisCancel,
  AnalysisCreate,
  AnalysisPage,
  AnalysisQuery,
  AnalysisResponse,
  analysisStates,
  DirectionSelection,
  JobDescriptionCreate,
  JobDescriptionResponse,
} from './jobs.dto';
import { JobsService } from './jobs.service';
import { UploadRetentionRunner } from './upload-retention.runner';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@ApiTags('job-analysis')
@ApiSecurity('visitorBearer')
@UseGuards(VisitorGuard)
@Controller()
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}
  @Post('job-descriptions')
  @ApiBody({ type: JobDescriptionCreate })
  @ApiCreatedResponse({ type: JobDescriptionResponse })
  @ApiOperation({
    operationId: 'createJobDescription',
    summary: '确认岗位输入版本',
    description:
      '只保存本人确认的不可变正文快照。岗位名<=100、JD非空<=8000 Unicode码点，不截断。幂等同键同载荷重读，异载荷409；201+Location。',
  })
  async createInput(
    @Req() request: CareerRequest,
    @Body(new DtoPipe(JobDescriptionCreate)) input: JobDescriptionCreate,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.jobs.createInput(request.visitorId, input);
    response.setHeader('Location', `/api/v1/job-descriptions/${result.id}`);
    return result;
  }
  @Get('job-descriptions/:jobDescriptionId')
  @ApiParam({ name: 'jobDescriptionId', type: String })
  @ApiOkResponse({ type: JobDescriptionResponse })
  @ApiOperation({
    operationId: 'getJobDescription',
    summary: '读取本人岗位输入',
    description: '正文只返回本人；他人/不存在统一404，不写入通用日志。',
  })
  input(
    @Req() request: CareerRequest,
    @Param('jobDescriptionId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.jobs.input(request.visitorId, id);
  }
  @Post('analysis-jobs')
  @ApiBody({ type: AnalysisCreate })
  @ApiCreatedResponse({ type: AnalysisResponse })
  @ApiOperation({
    operationId: 'createAnalysisJob',
    summary: '创建持久化规则分析任务',
    description:
      '201表示任务资源已创建，不表示分析完成；poll Location。local-rules/jd-rules-v1显式模拟。60秒deadline、10秒处理租约、最多2次尝试；成功事件同业务事务写入。',
  })
  async createAnalysis(
    @Req() request: CareerRequest,
    @Body(new DtoPipe(AnalysisCreate)) input: AnalysisCreate,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.jobs.createAnalysis(request.visitorId, input);
    response.setHeader('Location', `/api/v1/analysis-jobs/${result.id}`);
    return result;
  }
  @Get('analysis-jobs')
  @ApiPaging()
  @ApiQuery({ name: 'status', required: false, enum: [...analysisStates] })
  @ApiOkResponse({ type: AnalysisPage })
  @ApiOperation({
    operationId: 'listAnalysisJobs',
    summary: '恢复本人岗位分析',
    description:
      '仅本人，createdAt/id倒序稳定分页；search按岗位标题，状态白名单。未完成、失败与成功均可恢复。',
  })
  analyses(
    @Req() request: CareerRequest,
    @Query(new DtoPipe(AnalysisQuery)) query: AnalysisQuery,
  ) {
    return this.jobs.analyses(request.visitorId, query);
  }
  @Get('analysis-jobs/:analysisJobId')
  @ApiParam({ name: 'analysisJobId', type: String })
  @ApiOkResponse({ type: AnalysisResponse })
  @ApiOperation({
    operationId: 'getAnalysisJob',
    summary: '读取本人分析任务与证据',
    description:
      'queued/running/succeeded/failed/cancelled，实际处理状态。证据UTF-16区间对应本次input快照；延伸建议无虚构quote。',
  })
  analysis(
    @Req() request: CareerRequest,
    @Param('analysisJobId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.jobs.analysis(request.visitorId, id);
  }
  @Patch('analysis-jobs/:analysisJobId')
  @ApiParam({ name: 'analysisJobId', type: String })
  @ApiBody({ type: AnalysisCancel })
  @ApiOkResponse({ type: AnalysisResponse })
  @ApiOperation({
    operationId: 'cancelAnalysisJob',
    summary: '取消本人未结束分析',
    description:
      '只接受status=cancelled；重复取消幂等。其他终态409，处理租约失效后旧计算不能写回成功。',
  })
  cancel(
    @Req() request: CareerRequest,
    @Param('analysisJobId') id: string,
    @Body(new DtoPipe(AnalysisCancel)) _input: AnalysisCancel,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.jobs.cancel(request.visitorId, id);
  }
  @Put('analysis-jobs/:analysisJobId/selection')
  @ApiParam({ name: 'analysisJobId', type: String })
  @ApiBody({ type: DirectionSelection })
  @ApiOkResponse({ type: AnalysisResponse })
  @ApiOperation({
    operationId: 'saveAnalysisSelection',
    summary: '确认分析方向候选',
    description:
      '1–17个不重复方向，必须属于本次成功结果且当前发布；revision防旧覆盖，同目标重复PUT幂等。只保存待选任务方向，不自动建立默认首任务/成绩。',
  })
  select(
    @Req() request: CareerRequest,
    @Param('analysisJobId') id: string,
    @Body(new DtoPipe(DirectionSelection)) input: DirectionSelection,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.jobs.select(request.visitorId, id, input);
  }
}
@Module({
  controllers: [JobsController, UploadsController],
  providers: [
    JobsService,
    AnalysisRunner,
    RuleAnalyzer,
    UploadsService,
    UploadRetentionRunner,
  ],
  exports: [AnalysisRunner, UploadRetentionRunner],
})
export class JobsModule {}
