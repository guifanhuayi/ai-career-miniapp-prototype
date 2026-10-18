import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
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
import {
  OcrCreate,
  OcrResponse,
  UploadFields,
  UploadResponse,
} from './uploads.dto';
import {
  MAX_IMAGE_BYTES,
  type UploadedImage,
  UploadsService,
} from './uploads.service';

@ApiTags('private-images')
@ApiSecurity('visitorBearer')
@UseGuards(VisitorGuard)
@Controller()
export class UploadsController {
  constructor(
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_IMAGE_BYTES + 1,
        fields: 1,
        files: 1,
        parts: 3,
        fieldNameSize: 40,
        fieldSize: 128,
        headerPairs: 30,
        fieldNestingDepth: 0,
        fieldArrayIndexLimit: 0,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'idempotencyKey'],
      additionalProperties: false,
      properties: {
        file: { type: 'string', format: 'binary' },
        idempotencyKey: { type: 'string', pattern: '^[a-zA-Z0-9_-]{8,64}$' },
      },
    },
  })
  @ApiCreatedResponse({ type: UploadResponse })
  @ApiOperation({
    operationId: 'createPrivateUpload',
    summary: '保存本人岗位截图',
    description:
      '单张实际JPG/PNG/WEBP，非空且<=10MiB（含边界）；完整解码并限制1亿像素防资源耗尽，不信文件名/MIME。私有存储、24h过期、同键同文件重读/异文件409；201+Location。原文件名不保存，不公开静态目录。',
  })
  async create(
    @Req() request: CareerRequest,
    @Body(new DtoPipe(UploadFields)) fields: UploadFields,
    @UploadedFile() file: UploadedImage | undefined,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!request.is('multipart/form-data'))
      throw new UnsupportedMediaTypeException('请使用图片multipart请求');
    const result = await this.uploads.create(request.visitorId, fields, file);
    response.setHeader('Location', `/api/v1/uploads/${result.id}`);
    return result;
  }
  @Get('uploads/:uploadId')
  @ApiParam({ name: 'uploadId', type: String })
  @ApiOkResponse({ type: UploadResponse })
  @ApiOperation({
    operationId: 'getPrivateUpload',
    summary: '读取本人图片元数据',
    description:
      '他人/不存在/已过期同为404；不返回磁盘路径、文件名、私人图片公开地址。',
  })
  upload(
    @Req() request: CareerRequest,
    @Param('uploadId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.uploads.upload(request.visitorId, id);
  }
  @Get('uploads/:uploadId/content')
  @ApiParam({ name: 'uploadId', type: String })
  @ApiOperation({
    operationId: 'getPrivateUploadContent',
    summary: '下载本人原始截图',
    description:
      '必须Bearer，不接受URL凭据。到期404，校验实际字节完整性；private/no-store，禁止缓存为公开图片。',
  })
  @ApiResponse({
    status: 200,
    description: '已校验的本人图片',
    content: {
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/webp': { schema: { type: 'string', format: 'binary' } },
    },
  })
  async content(
    @Req() request: CareerRequest,
    @Param('uploadId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res() response: Response,
  ) {
    const result = await this.uploads.content(request.visitorId, id);
    response.setHeader('Content-Type', result.mediaType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(result.bytes);
  }
  @Post('ocr-jobs')
  @ApiBody({ type: OcrCreate })
  @ApiCreatedResponse({ type: OcrResponse })
  @ApiOperation({
    operationId: 'createOcrJob',
    summary: '本地模拟识别或提示手工补录',
    description:
      '仅登记过哈希的原型示例图片返回local-fixture模拟文字；任意新图返回failed/local-manual/OCR_NOT_CONNECTED_MANUAL_REQUIRED且text=null，绝不套示例。201表示记录创建而非真实OCR完成；用户须核对/补录后确认JD。',
  })
  async createOcr(
    @Req() request: CareerRequest,
    @Body(new DtoPipe(OcrCreate)) input: OcrCreate,
    @Query(new EmptyObjectPipe()) _query: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.uploads.createOcr(request.visitorId, input);
    response.setHeader('Location', `/api/v1/ocr-jobs/${result.id}`);
    return result;
  }
  @Get('ocr-jobs/:ocrJobId')
  @ApiParam({ name: 'ocrJobId', type: String })
  @ApiOkResponse({ type: OcrResponse })
  @ApiOperation({
    operationId: 'getOcrJob',
    summary: '恢复本人模拟识别记录',
    description: '私有归属与图片过期同时校验，404不透露他人信息。',
  })
  ocr(
    @Req() request: CareerRequest,
    @Param('ocrJobId') id: string,
    @Query(new EmptyObjectPipe()) _query: object,
  ) {
    return this.uploads.ocr(request.visitorId, id);
  }
}
