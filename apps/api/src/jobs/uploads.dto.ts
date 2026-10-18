import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class UploadFields {
  @ApiProperty({ type: String, pattern: '^[a-zA-Z0-9_-]{8,64}$' })
  @Matches(/^[a-zA-Z0-9_-]{8,64}$/)
  idempotencyKey!: string;
}
export class UploadResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({
    type: String,
    enum: ['image/png', 'image/jpeg', 'image/webp'],
  })
  mediaType!: string;
  @ApiProperty({ type: Number }) size!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
  @ApiProperty({
    type: String,
    description: '相对API路径，必须带本人Bearer下载；不得把凭据放URL。',
  })
  contentPath!: string;
}
export class OcrCreate extends UploadFields {
  @ApiProperty({ type: String }) @Matches(/^[a-f0-9-]{36}$/) uploadId!: string;
}
export class OcrResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) uploadId!: string;
  @ApiProperty({ type: String, enum: ['succeeded', 'failed'] }) status!: string;
  @ApiProperty({ type: String, enum: ['local-fixture', 'local-manual'] })
  provider!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) text?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) errorCode?:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
