import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
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
  ApiProperty,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { localConfig } from './config';
import { Database } from './database';
import {
  type CareerRequest,
  EmptyObjectPipe,
  hashCredential,
  LocalAdminGuard,
  VisitorGuard,
} from './http';

export class HealthResponse {
  @ApiProperty({ type: String, enum: ['ok'] }) status!: string;
  @ApiProperty({ type: String, enum: ['mysql'] }) database!: string;
  @ApiProperty({ type: String, enum: ['local', 'test', 'demo'] })
  environment!: string;
  @ApiProperty({ type: String, enum: ['local-simulated'] })
  externalServices!: string;
}
export class VisitorResponse {
  @ApiProperty({ type: String, format: 'uuid' }) visitorId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, enum: ['local', 'test', 'demo'] })
  environment!: string;
  @ApiProperty({
    type: String,
    example: '清除本机存储或换设备后，记录无法自动找回。',
  })
  storageNotice!: string;
}
export class VisitorSessionResponse extends VisitorResponse {
  @ApiProperty({
    type: String,
    pattern: '^[a-f0-9]{64}$',
    description: '仅返回一次，保存到本机；后续使用 Bearer 访问本人资源。',
  })
  credential!: string;
}
const notice = '清除本机存储或换设备后，记录无法自动找回。';
@ApiTags('foundation')
@Controller()
export class FoundationController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject('RUNTIME_CONFIG')
    private readonly config: ReturnType<typeof localConfig>,
  ) {}

  @Get('health')
  @ApiOperation({
    operationId: 'getHealth',
    summary: '验证服务与真实MySQL连接',
    description: '只读；数据库不可达返回500，不返回假健康。',
  })
  @ApiOkResponse({ type: HealthResponse })
  async health(
    @Query(new EmptyObjectPipe()) _query: object,
  ): Promise<HealthResponse> {
    await this.db.verifyConnection();
    return {
      status: 'ok',
      database: 'mysql',
      environment: this.config.environment,
      externalServices: 'local-simulated',
    };
  }

  @Get('admin/system')
  @UseGuards(LocalAdminGuard)
  @ApiSecurity('localAdmin')
  @ApiOperation({
    operationId: 'getLocalAdminSystem',
    summary: '本地管理环境状态',
    description:
      '仅回环请求，须X-Admin-Local:1；存在Origin时须为明确允许的本机后台来源；公网配置启动即拒绝。',
  })
  @ApiOkResponse({ type: HealthResponse })
  async adminSystem(
    @Query(new EmptyObjectPipe()) _query: object,
  ): Promise<HealthResponse> {
    return this.health({});
  }

  @Post('visitor-sessions')
  @ApiOperation({
    operationId: 'createVisitorSession',
    summary: '首次自动创建匿名访客',
    description:
      '无需微信登录。空对象请求；不可设置ownerId或环境；每次明确创建新访客，不做账号合并。凭据只存SHA256摘要。201+Location=/api/v1/me。',
  })
  @ApiBody({
    schema: { type: 'object', additionalProperties: false, properties: {} },
  })
  @ApiCreatedResponse({ type: VisitorSessionResponse })
  async createVisitor(
    @Body(new EmptyObjectPipe()) _body: object,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VisitorSessionResponse> {
    const credential = randomBytes(32).toString('hex');
    const visitor = await this.db.visitor.create({
      data: {
        environment: this.config.environment,
        credentials: { create: { tokenHash: hashCredential(credential) } },
      },
    });
    response.setHeader('Location', '/api/v1/me');
    response.setHeader('Cache-Control', 'no-store');
    return {
      visitorId: visitor.id,
      credential,
      createdAt: visitor.createdAt.toISOString(),
      environment: visitor.environment,
      storageNotice: notice,
    };
  }

  @Get('me')
  @UseGuards(VisitorGuard)
  @ApiSecurity('visitorBearer')
  @ApiOperation({
    operationId: 'getCurrentVisitor',
    summary: '读取当前访客',
    description: '归属仅由凭据决定；无读写副作用。',
  })
  @ApiOkResponse({ type: VisitorResponse })
  async me(
    @Req() request: CareerRequest,
    @Query(new EmptyObjectPipe()) _query: object,
  ): Promise<VisitorResponse> {
    const visitor = await this.db.visitor.findUniqueOrThrow({
      where: { id: request.visitorId },
    });
    return {
      visitorId: visitor.id,
      createdAt: visitor.createdAt.toISOString(),
      environment: visitor.environment,
      storageNotice: notice,
    };
  }
}
