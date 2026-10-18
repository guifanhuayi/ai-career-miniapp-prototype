import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { levels } from '../../../../packages/domain/src';
import { CourseResponse, SyllabusDto } from '../catalog.dto';

export class KeyInput {
  @ApiProperty({ type: String, pattern: '^[a-zA-Z0-9_-]{8,64}$' })
  @Matches(/^[a-zA-Z0-9_-]{8,64}$/)
  idempotencyKey!: string;
}
export class PlanCreate extends KeyInput {
  @ApiProperty({ type: String })
  @Matches(/^[a-z0-9_-]{1,32}$/)
  sceneId!: string;
  @ApiProperty({ type: String }) @Matches(/^[a-z0-9_-]{1,64}$/) taskId!: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Matches(/^[a-f0-9-]{36}$/)
  sourceAnalysisId?: string;
}
export class LevelUpdate {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) revision!: number;
  @ApiProperty({ type: String, enum: [...levels] })
  @IsIn(levels)
  selectedLevel!: string;
}
export class AttemptCreate extends KeyInput {
  @ApiProperty({ type: String }) @Matches(/^[a-f0-9-]{36}$/) planId!: string;
}
export class AnswerUpdate {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) revision!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 2 })
  @IsInt()
  @Min(0)
  @Max(2)
  option!: number;
}
export class QuestionView {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: [String] }) options!: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) answer?: number | null;
  @ApiPropertyOptional({ type: Number, description: '仅已提交结果可见' })
  correct?: number;
  @ApiPropertyOptional({ type: String, description: '仅已提交结果可见' })
  explanation?: string;
}
export class AttemptResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) planId!: string;
  @ApiProperty({ type: Number }) sequence!: number;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: String, enum: ['draft', 'submitted'] }) status!: string;
  @ApiProperty({ type: String }) questionVersion!: string;
  @ApiProperty({ type: String }) scoringVersion!: string;
  @ApiProperty({ type: Boolean }) isMock!: boolean;
  @ApiProperty({ type: [QuestionView] }) questions!: QuestionView[];
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty({ type: String, nullable: true, enum: [...levels, null] })
  recommendedLevel!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;
}
export class PlanResponse {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) sceneId!: string;
  @ApiProperty({ type: String }) sceneName!: string;
  @ApiProperty({ type: String }) taskId!: string;
  @ApiProperty({ type: String }) taskName!: string;
  @ApiProperty({ type: String }) output!: string;
  @ApiProperty({ type: SyllabusDto }) syllabus!: SyllabusDto;
  @ApiProperty({ type: Boolean }) available!: boolean;
  @ApiProperty({ type: String }) flowId!: string;
  @ApiProperty({ type: String, nullable: true }) sourceAnalysisId!:
    | string
    | null;
  @ApiProperty({ type: String }) sourceTitle!: string;
  @ApiProperty({ type: String, nullable: true, enum: [...levels, null] })
  recommendedLevel!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: [...levels, null] })
  selectedLevel!: string | null;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: String, nullable: true }) latestAttemptId!:
    | string
    | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['draft', 'submitted', null],
  })
  latestAttemptStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastCourseId!: string | null;
  @ApiProperty({ type: Number }) courseCount!: number;
  @ApiProperty({ type: Number }) markedCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
export class PlanPage {
  @ApiProperty({ type: [PlanResponse] }) items!: PlanResponse[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
}
export class ProgressResponse {
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: Boolean }) clientEnded!: boolean;
  @ApiProperty({ type: String }) mediaVersion!: string;
}
export class LearningCourseResponse {
  @ApiProperty({ type: CourseResponse }) course!: CourseResponse;
  @ApiProperty({ type: ProgressResponse }) progress!: ProgressResponse;
  @ApiProperty({ type: Boolean }) marked!: boolean;
}
export class ProgressUpdate extends KeyInput {
  @ApiProperty({ type: Number, minimum: 0 }) @IsInt() @Min(0) revision!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 2100 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(2100)
  position!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() clientEnded!: boolean;
  @ApiProperty({ type: String, pattern: '^[a-f0-9]{64}$' })
  @Matches(/^[a-f0-9]{64}$/)
  mediaVersion!: string;
}
export class MarkResponse {
  @ApiProperty({ type: String }) courseId!: string;
  @ApiProperty({ type: Boolean }) marked!: boolean;
}
