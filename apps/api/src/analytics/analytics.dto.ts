import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { clientEvents } from '../../../../packages/domain/src/event-policy';

export class ClientEvent {
  @ApiProperty({ type: String })
  @Matches(/^[a-zA-Z0-9_-]{8,64}$/)
  eventId!: string;
  @ApiProperty({ enum: [...clientEvents] })
  @IsIn([...clientEvents])
  name!: string;
  @ApiProperty({ type: Number, enum: [1] }) @Equals(1) schemaVersion!: number;
  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString({ strict: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
  occurredAt!: string;
  @ApiProperty({ type: String })
  @Matches(/^[a-zA-Z0-9._-]{1,32}$/)
  appVersion!: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/)
  flowId?: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[a-zA-Z0-9_-]{1,32}$/)
  sceneId?: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/)
  planId?: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[a-zA-Z0-9_-]{1,80}$/)
  courseId?: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/)
  analysisJobId?: string;
  @ApiPropertyOptional({ type: Number })
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(2100)
  position?: number;
}
export class EventBatch {
  @ApiProperty({ type: [ClientEvent], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ClientEvent)
  events!: ClientEvent[];
}
export class EventReceipt {
  @ApiProperty({ type: Number }) accepted!: number;
  @ApiProperty({ type: Number }) duplicates!: number;
  @ApiProperty({ type: Number }) throttled!: number;
}
export class ReportQuery {
  @ApiPropertyOptional({
    enum: ['production', 'local', 'test', 'demo'],
    default: 'production',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['production', 'local', 'test', 'demo'])
  environment = 'production';
  @ApiPropertyOptional({ type: String, example: '2026-10-01' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDay?: string;
  @ApiPropertyOptional({ type: String, example: '2026-10-18' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDay?: string;
}
export class FunnelRow {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number }) chains!: number;
  @ApiProperty({ type: Number }) flows!: number;
  @ApiProperty({ type: Number }) visitors!: number;
}
export class ActivityRow {
  @ApiProperty({ type: String }) day!: string;
  @ApiProperty({ type: Number }) dau!: number;
  @ApiProperty({ type: Number }) wau!: number;
}
export class RetentionPoint {
  @ApiProperty({ type: String }) observationDay!: string;
  @ApiProperty({ type: Boolean }) pending!: boolean;
  @ApiProperty({ type: Boolean }) ongoing!: boolean;
  @ApiProperty({ type: Number, nullable: true }) returned!: number | null;
  @ApiProperty({ type: Number, nullable: true }) rate!: number | null;
}
export class RetentionRow {
  @ApiProperty({ type: String }) day!: string;
  @ApiProperty({ type: Number }) cohortSize!: number;
  @ApiProperty({ type: RetentionPoint }) d1!: RetentionPoint;
  @ApiProperty({ type: RetentionPoint }) d7!: RetentionPoint;
}
export class EventCount {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number }) count!: number;
}
export class DistributionRow {
  @ApiProperty({ type: String }) kind!: string;
  @ApiProperty({ type: String }) resourceId!: string;
  @ApiProperty({ type: [EventCount] }) events!: EventCount[];
}
export class RequestReport {
  @ApiProperty({ type: Number }) count!: number;
  @ApiProperty({ type: Number }) failures!: number;
  @ApiProperty({ type: Number }) retries!: number;
  @ApiProperty({ type: Number, nullable: true }) successRate!: number | null;
  @ApiProperty({ type: Number, nullable: true }) p50Ms!: number | null;
  @ApiProperty({ type: Number, nullable: true }) p95Ms!: number | null;
  @ApiProperty({ type: Number }) percentileSamples!: number;
  @ApiProperty({ type: String }) percentileStart!: string;
  @ApiProperty({ type: String }) percentileEnd!: string;
  @ApiProperty({ type: [EventCount] }) errors!: EventCount[];
}
export class AnalysisReport {
  @ApiProperty({ type: Number }) count!: number;
  @ApiProperty({ type: Number }) succeeded!: number;
  @ApiProperty({ type: Number }) failed!: number;
  @ApiProperty({ type: Number }) timedOut!: number;
  @ApiProperty({ type: Number }) noMatch!: number;
  @ApiProperty({ type: Number }) suggestions!: number;
  @ApiProperty({ type: Number }) deselected!: number;
  @ApiProperty({ type: Number }) reviewedSelections!: number;
  @ApiProperty({ type: Number, nullable: true }) noMatchRate!: number | null;
  @ApiProperty({ type: Number, nullable: true }) deselectionRate!:
    | number
    | null;
  @ApiProperty({ type: String }) evidenceQuality!: string;
  @ApiProperty({ type: String }) humanReview!: string;
  @ApiProperty({ type: String }) provider!: string;
}
export class AnalyticsReport {
  @ApiProperty({ type: String }) environment!: string;
  @ApiProperty({ type: String }) startDay!: string;
  @ApiProperty({ type: String }) endDay!: string;
  @ApiProperty({ type: String }) timezone!: string;
  @ApiProperty({ type: String }) generatedAt!: string;
  @ApiProperty({ type: Number }) activeVisitors!: number;
  @ApiProperty({ type: [ActivityRow] }) activity!: ActivityRow[];
  @ApiProperty({ type: [FunnelRow] }) jobFunnel!: FunnelRow[];
  @ApiProperty({ type: [FunnelRow] }) taskFunnel!: FunnelRow[];
  @ApiProperty({ type: [RetentionRow] }) retention!: RetentionRow[];
  @ApiProperty({ type: [EventCount] }) events!: EventCount[];
  @ApiProperty({ type: [DistributionRow] }) distribution!: DistributionRow[];
  @ApiProperty({ type: RequestReport }) requests!: RequestReport;
  @ApiProperty({ type: AnalysisReport }) analysis!: AnalysisReport;
  @ApiProperty({ type: Number }) clockAnomalies!: number;
  @ApiProperty({ type: Number }) positionAnomalies!: number;
  @ApiProperty({ type: [String] }) notes!: string[];
}
