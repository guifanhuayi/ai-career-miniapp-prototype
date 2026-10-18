import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateBy,
} from 'class-validator';
import { validJd } from '../../../../packages/domain/src';
import { PageQuery } from '../pagination';

export const inputSources = [
  'text',
  'example',
  'image-manual',
  'fixture-confirmed',
] as const;
export const analysisStates = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export class JobDescriptionCreate {
  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    default: '',
    description: '岗位名称选填；按Unicode code point计数，超长拒绝，不截断。',
  })
  @IsString()
  @MaxLength(100)
  title = '';
  @ApiProperty({
    type: String,
    maxLength: 8000,
    description:
      '已核对的不可变正文，非空白且Unicode code point <=8000；证据区间用UTF-16下标。',
  })
  @IsString()
  @ValidateBy({
    name: 'validJd',
    validator: {
      validate: validJd,
      defaultMessage: () => 'JD须非空白且不超过8000个Unicode码点',
    },
  })
  text!: string;
  @ApiProperty({ type: String, enum: [...inputSources] })
  @IsIn(inputSources)
  source!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Matches(/^[a-f0-9-]{36}$/)
  uploadId?: string | null;
  @ApiProperty({ type: String, pattern: '^[a-zA-Z0-9_-]{8,64}$' })
  @Matches(/^[a-zA-Z0-9_-]{8,64}$/)
  idempotencyKey!: string;
}
export class JobDescriptionResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String }) text!: string;
  @ApiProperty({ type: String, enum: [...inputSources] }) source!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) uploadId?:
    | string
    | null;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
export class AnalysisCreate {
  @ApiProperty({ type: String })
  @Matches(/^[a-f0-9-]{36}$/)
  jobDescriptionId!: string;
  @ApiProperty({ type: String, pattern: '^[a-zA-Z0-9_-]{1,64}$' })
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/)
  flowId!: string;
  @ApiProperty({ type: String, pattern: '^[a-zA-Z0-9_-]{8,64}$' })
  @Matches(/^[a-zA-Z0-9_-]{8,64}$/)
  idempotencyKey!: string;
}
export class EvidenceResponse {
  @ApiProperty({ type: String }) sceneId!: string;
  @ApiProperty({ type: String }) sceneName!: string;
  @ApiProperty({ type: String, enum: ['direct', 'extension'] }) kind!: string;
  @ApiProperty({ type: String }) quote!: string;
  @ApiProperty({ type: Number }) start!: number;
  @ApiProperty({ type: Number }) end!: number;
}
export class AnalysisResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) jobDescriptionId!: string;
  @ApiProperty({ type: String }) flowId!: string;
  @ApiProperty({ type: String, enum: [...analysisStates] }) status!: string;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: Number }) attempts!: number;
  @ApiProperty({ type: String, example: 'local-rules' }) provider!: string;
  @ApiProperty({ type: String, example: 'jd-rules-v1' }) rulesVersion!: string;
  @ApiProperty({ type: JobDescriptionResponse }) input!: JobDescriptionResponse;
  @ApiProperty({ type: [EvidenceResponse] }) items!: EvidenceResponse[];
  @ApiProperty({ type: [String] }) selectedScenes!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) errorCode?:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time' }) deadline!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt?: string | null;
}
export class AnalysisQuery extends PageQuery {
  @ApiPropertyOptional({ type: String, enum: [...analysisStates] })
  @IsOptional()
  @IsIn(analysisStates)
  status?: string;
}
export class AnalysisPage {
  @ApiProperty({ type: [AnalysisResponse] }) items!: AnalysisResponse[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
}
export class AnalysisCancel {
  @ApiProperty({ type: String, enum: ['cancelled'] })
  @IsIn(['cancelled'])
  status!: string;
}
export class DirectionSelection {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) revision!: number;
  @ApiProperty({ type: [String], minItems: 1, maxItems: 17 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(17)
  @ArrayUnique()
  @IsString({ each: true })
  sceneIds!: string[];
}
