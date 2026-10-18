import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { json } from 'express';
import { AnalyticsModule } from './analytics/analytics.controller';
import { AnalyticsReportService } from './analytics/analytics-report.service';
import { CatalogModule } from './catalog.controller';
import { loadLocalEnvironment, localConfig } from './config';
import { CoreModule } from './core.module';
import { Database } from './database';
import { FoundationController } from './foundation.controller';
import {
  allowedOrigins,
  type CareerRequest,
  ErrorResponse,
  SafeExceptionFilter,
} from './http';
import { AnalysisRunner } from './jobs/analysis.runner';
import { JobsModule } from './jobs/jobs.controller';
import { UploadRetentionRunner } from './jobs/upload-retention.runner';
import { LearningModule } from './learning/learning.controller';

@Module({
  imports: [
    CoreModule,
    CatalogModule,
    JobsModule,
    LearningModule,
    AnalyticsModule,
  ],
  controllers: [FoundationController],
  providers: [
    {
      provide: 'RUNTIME_CONFIG',
      useFactory: () => Object.freeze(localConfig()),
    },
  ],
})
export class AppModule {}

export function createDocument(app: NestExpressApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('百年前程 AI成长课 API')
    .setDescription(
      '首期本地系统；REST /api/v1；无登录匿名访客；MySQL持久化；外部服务local-simulated。所有时间UTC ISO8601；报表Asia/Shanghai。错误统一code/message/details/requestId。管理API仅回环+X-Admin-Local:1。',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description: '服务端签发的64位十六进制访客凭据，无微信登录。',
      },
      'visitorBearer',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-Admin-Local',
        description: '本地管理请求固定为1；不代表线上管理员鉴权。',
      },
      'localAdmin',
    )
    .build();
  const document = SwaggerModule.createDocument(app, builder, {
    extraModels: [ErrorResponse],
  });
  for (const path of Object.values(document.paths))
    for (const operation of Object.values(path ?? {})) {
      if (
        !operation ||
        typeof operation !== 'object' ||
        !('responses' in operation)
      )
        continue;
      for (const [status, description] of Object.entries({
        400: '参数或未知字段错误',
        401: '缺失或无效访客凭据',
        403: '本地访问约束失败',
        404: '资源不可用或不属于本人',
        409: '版本/幂等冲突',
        413: '请求过大',
        415: '媒体不受支持',
        422: '业务规则不满足',
        429: '请求频率超限',
        500: '服务或数据库暂不可用',
      })) {
        operation.responses[status] ??= {
          description,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        };
      }
    }
  return document;
}

export async function createApp(options: { startWorkers?: boolean } = {}) {
  loadLocalEnvironment();
  const config = localConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    bodyParser: false,
  });
  app.set('trust proxy', false);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new SafeExceptionFilter());
  const db = app.get(Database);
  const buckets = new Map<string, { start: number; count: number }>();
  app.use(
    (
      req: CareerRequest,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      const start = performance.now();
      const incoming = req.headers['x-request-id'];
      req.requestId =
        typeof incoming === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming)
          ? incoming
          : randomUUID();
      res.setHeader('X-Request-Id', req.requestId);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.on('finish', () => {
        // Never serialize request headers, query values, bodies, exception objects or credentials.
        const route =
          typeof req.route?.path === 'string' ? req.route.path : '/unmatched';
        const retry = Number(req.headers['x-retry-count'] ?? 0);
        void db.apiRequestMetric
          .create({
            data: {
              requestId: req.requestId,
              route,
              method: req.method,
              status: res.statusCode,
              errorCode: req.errorCode,
              durationMs: performance.now() - start,
              retryCount:
                Number.isInteger(retry) && retry >= 0 && retry <= 5 ? retry : 0,
              environment: config.environment,
            },
          })
          .catch(() => {
            process.stderr.write('request_metric_write_failed\n');
          });
      });
      const hostname = req.hostname;
      if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) {
        req.errorCode = 'ACCESS_DENIED';
        res.status(403).json({
          code: req.errorCode,
          message: '仅限本机访问',
          details: [],
          requestId: req.requestId,
        });
        return;
      }
      const now = Date.now();
      // Keyed by local connection address, never stored in metrics. Bounded and pruned.
      const key = `${req.socket.remoteAddress}:${req.path === '/api/v1/visitor-sessions' ? 'visitor' : 'api'}`;
      const bucket = buckets.get(key);
      const limit =
        config.environment === 'test'
          ? 2000
          : req.path === '/api/v1/visitor-sessions'
            ? 20
            : 300;
      if (!bucket || now - bucket.start >= 60_000)
        buckets.set(key, { start: now, count: 1 });
      else if (++bucket.count > limit) {
        res.setHeader('Retry-After', '60');
        req.errorCode = 'RATE_LIMITED';
        res.status(429).json({
          code: req.errorCode,
          message: '请求过于频繁，请稍后重试',
          details: [],
          requestId: req.requestId,
        });
        return;
      }
      for (const [id, b] of buckets)
        if (now - b.start > 60_000) buckets.delete(id);
      next();
    },
  );
  app.enableCors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Retry-Count',
      'X-Admin-Local',
    ],
    exposedHeaders: ['X-Request-Id', 'Location'],
    credentials: false,
  });
  app.use(json({ limit: '128kb' }));
  app.use(
    (
      error: { status?: number },
      req: CareerRequest,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      if (!error) {
        next();
        return;
      }
      const status = error.status === 413 ? 413 : 400;
      req.errorCode = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR';
      res.status(status).json({
        code: req.errorCode,
        message: status === 413 ? '请求过大' : '无效JSON',
        details: [],
        requestId: req.requestId,
      });
    },
  );
  await app.init();
  if (options.startWorkers !== false) {
    app.get(AnalysisRunner).start();
    app.get(UploadRetentionRunner).start();
    app.get(AnalyticsReportService).start();
  }
  const document = createDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
    swaggerOptions: { persistAuthorization: false },
  });
  app.enableShutdownHooks();
  return app;
}
