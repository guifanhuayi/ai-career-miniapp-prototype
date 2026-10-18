import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  sceneCategories as categories,
  contentStatuses,
} from '../../../packages/domain/src';

export { categories, contentStatuses };
export class PageQuery {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
export class SceneQuery extends PageQuery {
  @ApiPropertyOptional({
    type: String,
    enum: [...categories],
    enumName: 'SceneCategory',
  })
  @IsOptional()
  @IsIn(categories)
  category?: string;
}
export class AdminQuery extends PageQuery {
  @ApiPropertyOptional({
    type: String,
    enum: [...contentStatuses],
    enumName: 'ContentStatus',
  })
  @IsOptional()
  @IsIn(contentStatuses)
  status?: string;
}
export class SyllabusDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  beginner!: string[];
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  intermediate!: string[];
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  advanced!: string[];
}
export class SceneResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({
    type: String,
    enum: [...categories],
    enumName: 'SceneCategory',
  })
  category!: string;
  @ApiProperty({ type: String }) icon!: string;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: String }) output!: string;
  @ApiProperty({ type: SyllabusDto }) syllabus!: SyllabusDto;
  @ApiProperty({
    type: String,
    enum: [...contentStatuses],
    enumName: 'ContentStatus',
  })
  status!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: Number }) taskCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
export class ScenePage {
  @ApiProperty({ type: [SceneResponse] }) items!: SceneResponse[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
}
export class TaskResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) sceneId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) output!: string;
  @ApiProperty({
    type: String,
    enum: [...contentStatuses],
    enumName: 'ContentStatus',
  })
  status!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: Number }) position!: number;
}
export class TaskPage {
  @ApiProperty({ type: [TaskResponse] }) items!: TaskResponse[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
}
export class SceneUpdate {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @ApiProperty({
    type: String,
    enum: [...categories],
    enumName: 'SceneCategory',
  })
  @IsIn(categories)
  category!: string;
  @ApiProperty({ type: String, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;
  @ApiProperty({ type: String, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  output!: string;
  @ApiProperty({ type: SyllabusDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SyllabusDto)
  syllabus!: SyllabusDto;
  @ApiProperty({ type: Number, minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10000)
  position!: number;
}
export class TaskUpdate {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ type: String, maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;
  @ApiProperty({ type: Number, minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10000)
  position!: number;
}
export class ChapterDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
  @ApiProperty({ type: Number, minimum: 0.001 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.001)
  durationSeconds!: number;
}
export class MappingDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/)
  taskId!: string;
  @ApiProperty({
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    enumName: 'LearningLevel',
  })
  @IsIn(['beginner', 'intermediate', 'advanced'])
  level!: string;
}
export class CourseFields {
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
  @ApiProperty({ type: String, maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  author!: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      '实际总时长；草稿可未知，发布须与受控媒体探测值一致且<=2100，不取整。',
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  durationSeconds?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,80}$/)
  mediaAssetId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  authorization?: string | null;
  @ApiProperty({
    type: Boolean,
    description: '首期自行制作测试资源须true，不能冒充教学课程。',
  })
  @IsBoolean()
  isTest!: boolean;
  @ApiProperty({ type: [ChapterDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChapterDto)
  chapters!: ChapterDto[];
  @ApiProperty({ type: [MappingDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MappingDto)
  mappings!: MappingDto[];
}
export class CourseCreate extends CourseFields {
  @ApiProperty({ type: String, pattern: '^[a-zA-Z0-9_-]{8,64}$' })
  @Matches(/^[a-zA-Z0-9_-]{8,64}$/)
  idempotencyKey!: string;
}
export class CourseUpdate extends CourseFields {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
}
export class CourseResponse extends CourseFields {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({
    type: String,
    enum: [...contentStatuses],
    enumName: 'ContentStatus',
  })
  status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '受控本机媒体相对API路径，非来源网页。',
  })
  mediaPath?: string | null;
}
export class CoursePage {
  @ApiProperty({ type: [CourseResponse] }) items!: CourseResponse[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
}
export class CourseQuery extends PageQuery {
  @ApiProperty({ type: String, maxLength: 64 })
  @Matches(/^[a-z0-9_-]{1,64}$/)
  taskId!: string;
  @ApiProperty({
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    enumName: 'LearningLevel',
  })
  @IsIn(['beginner', 'intermediate', 'advanced'])
  level!: string;
}
export class ReleaseCreate {
  @ApiProperty({
    type: String,
    enum: ['scene', 'task', 'course', 'question-set'],
  })
  @IsIn(['scene', 'task', 'course', 'question-set'])
  resource!: string;
  @ApiProperty({ type: String, maxLength: 80 })
  @Matches(/^[a-zA-Z0-9_-]{1,80}$/)
  resourceId!: string;
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ type: String, enum: ['published', 'archived'] })
  @IsIn(['published', 'archived'])
  status!: string;
  @ApiProperty({ type: String, pattern: '^[a-zA-Z0-9_-]{8,64}$' })
  @Matches(/^[a-zA-Z0-9_-]{8,64}$/)
  idempotencyKey!: string;
}
export class ReleaseResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) resource!: string;
  @ApiProperty({ type: String }) resourceId!: string;
  @ApiProperty({ type: String }) action!: string;
  @ApiProperty({ type: Number }) fromVersion!: number;
  @ApiProperty({ type: Number }) toVersion!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
export class ReleasePage {
  @ApiProperty({ type: [ReleaseResponse] }) items!: ReleaseResponse[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
}
export class MediaResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) durationSeconds!: number;
  @ApiProperty({ type: Boolean }) isTest!: boolean;
  @ApiProperty({ type: String }) authorization!: string;
}
export class QuestionDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/)
  id!: string;
  @ApiProperty({ type: String, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;
  @ApiProperty({ type: [String], minItems: 3, maxItems: 3 })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  options!: string[];
  @ApiProperty({ type: Number, minimum: 0, maximum: 2 })
  @IsInt()
  @Min(0)
  @Max(2)
  correct!: number;
  @ApiProperty({ type: String, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  explanation!: string;
}
export class QuestionSetCreate {
  @ApiProperty({ type: String, maxLength: 32 })
  @Matches(/^[a-z0-9_-]{1,32}$/)
  sceneId!: string;
  @ApiProperty({ type: String, maxLength: 80 })
  @Matches(/^mock-[a-zA-Z0-9_-]{1,75}$/)
  version!: string;
  @ApiProperty({
    type: Boolean,
    enum: [true],
    description: '首期只提供模拟题库，正式题库需后续重新确认规则。',
  })
  @Equals(true)
  isMock!: boolean;
  @ApiProperty({ type: [QuestionDto], minItems: 4, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
  @ApiProperty({ type: String, pattern: '^[a-zA-Z0-9_-]{8,64}$' })
  @Matches(/^[a-zA-Z0-9_-]{8,64}$/)
  idempotencyKey!: string;
}
export class QuestionSetUpdate {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) revision!: number;
  @ApiProperty({ type: [QuestionDto], minItems: 4, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}
export class QuestionSetResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) sceneId!: string;
  @ApiProperty({ type: String }) version!: string;
  @ApiProperty({ type: Boolean }) isMock!: boolean;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({
    type: String,
    enum: [...contentStatuses],
    enumName: 'ContentStatus',
  })
  status!: string;
  @ApiProperty({ type: [QuestionDto] }) questions!: QuestionDto[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
export class QuestionSetPage {
  @ApiProperty({ type: [QuestionSetResponse] }) items!: QuestionSetResponse[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
}
