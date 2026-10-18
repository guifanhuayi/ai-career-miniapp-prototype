import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CareerRequest,
  DtoPipe,
  EmptyObjectPipe,
  LocalAdminGuard,
  VisitorGuard,
} from '../http';
import {
  AnalyticsReport,
  EventBatch,
  EventReceipt,
  ReportQuery,
} from './analytics.dto';
import { AnalyticsService } from './analytics.service';
import { AnalyticsReportService } from './analytics-report.service';

@ApiTags('analytics')
@Controller()
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(AnalyticsReportService)
    private readonly reports: AnalyticsReportService,
  ) {}
  @Post('events')
  @HttpCode(200)
  @UseGuards(VisitorGuard)
  @ApiSecurity('visitorBearer')
  @ApiBody({ type: EventBatch })
  @ApiOkResponse({ type: EventReceipt })
  @ApiOperation({
    operationId: 'collectEvents',
    summary: '采集本人客户端行为',
    description:
      '1–50条，白名单，eventId同内容幂等、异内容409。服务端确定归属/环境/session；不接收成功事件、原文或任意properties。视频常规位置15秒限频，位置不是可信学习时长。原子批次。',
  })
  collect(
    @Req() r: CareerRequest,
    @Body(new DtoPipe(EventBatch)) b: EventBatch,
    @Query(new EmptyObjectPipe()) _q: object,
  ) {
    return this.analytics.collect(r.visitorId, r.visitorEnvironment, b);
  }

  @Get('admin/analytics')
  @UseGuards(LocalAdminGuard)
  @ApiSecurity('localAdmin')
  @ApiOkResponse({ type: AnalyticsReport })
  @ApiQuery({
    name: 'environment',
    required: false,
    enum: ['production', 'local', 'test', 'demo'],
  })
  @ApiQuery({ name: 'startDay', required: false, type: String })
  @ApiQuery({ name: 'endDay', required: false, type: String })
  @ApiOperation({
    operationId: 'getAnalyticsReport',
    summary: '本地运营行为报表',
    description:
      '默认production，最近7个北京时间自然日，可查最近365天。只输出汇总，日/周活跃按访客并集；双入口独立漏斗、成熟D1/D7、课程事实分列。P50/P95限可用14天原始样本，人工质量未评审。',
  })
  report(@Query(new DtoPipe(ReportQuery)) q: ReportQuery) {
    return this.reports.report(q);
  }
}
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsReportService],
})
export class AnalyticsModule {}
