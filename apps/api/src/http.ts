import { createHash, randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  BadRequestException,
  type CanActivate,
  Catch,
  type ExceptionFilter,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  type PipeTransform,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Request, Response } from 'express';
import { Database } from './database';

export interface CareerRequest extends Request {
  requestId: string;
  visitorId: string;
  visitorEnvironment: string;
  errorCode?: string;
}
export class ErrorResponse {
  @ApiProperty({ type: String, example: 'VALIDATION_ERROR' }) code!: string;
  @ApiProperty({ type: String }) message!: string;
  @ApiProperty({ type: [String] }) details!: string[];
  @ApiProperty({
    type: String,
    pattern: '^[a-zA-Z0-9_-]{1,64}$',
    description: '有效客户端关联ID原样返回；无效或缺失时服务端生成UUID。',
  })
  requestId!: string;
}
export class DtoPipe implements PipeTransform {
  constructor(private readonly dto: new () => object) {}
  transform(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Expected an object');
    const object = plainToInstance(this.dto, value, {
      enableImplicitConversion: false,
    });
    const errors = validateSync(object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length)
      throw new BadRequestException(
        errors.flatMap((e) =>
          Object.values(e.constraints ?? { nested: 'Invalid nested value' }),
        ),
      );
    return object;
  }
}
export class EmptyObjectPipe implements PipeTransform {
  transform(value: unknown) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 0
    ) {
      throw new BadRequestException(
        'Expected an empty object without additional fields',
      );
    }
    return value;
  }
}
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<CareerRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body =
      error instanceof HttpException ? error.getResponse() : undefined;
    const raw =
      typeof body === 'object' && body !== null
        ? (body as { message?: unknown }).message
        : body;
    const details = Array.isArray(raw)
      ? raw.filter((v) => typeof v === 'string')
      : [];
    const codes: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'VISITOR_CREDENTIAL_REQUIRED',
      403: 'ACCESS_DENIED',
      404: 'RESOURCE_NOT_FOUND',
      409: 'VERSION_OR_IDEMPOTENCY_CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA',
      422: 'BUSINESS_RULE_REJECTED',
      429: 'RATE_LIMITED',
    };
    request.errorCode = codes[status] ?? 'INTERNAL_ERROR';
    response.status(status).json({
      code: request.errorCode,
      message:
        status >= 500
          ? '服务暂不可用，请稍后重试'
          : typeof raw === 'string'
            ? raw
            : '请求参数不符合接口规范',
      details,
      requestId: request.requestId ?? randomUUID(),
    } satisfies ErrorResponse);
  }
}
export const hashCredential = (value: string) =>
  createHash('sha256').update(value).digest('hex');
@Injectable()
export class VisitorGuard implements CanActivate {
  constructor(@Inject(Database) private readonly db: Database) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<CareerRequest>();
    const token = request.headers.authorization;
    if (typeof token !== 'string' || !/^Bearer [a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException();
    const credential = await this.db.visitorCredential.findUnique({
      where: { tokenHash: hashCredential(token.slice(7)) },
      include: { visitor: true },
    });
    if (!credential) throw new UnauthorizedException();
    request.visitorId = credential.visitorId;
    request.visitorEnvironment = credential.visitor.environment;
    return true;
  }
}
export const allowedOrigins = new Set([
  'http://127.0.0.1:8000',
  'http://localhost:8000',
  'http://127.0.0.1:10086',
  'http://localhost:10086',
]);
@Injectable()
export class LocalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const address = request.socket.remoteAddress;
    if (
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') ||
      request.headers['x-admin-local'] !== '1' ||
      (request.headers.origin && !allowedOrigins.has(request.headers.origin))
    )
      throw new ForbiddenException();
    return true;
  }
}
