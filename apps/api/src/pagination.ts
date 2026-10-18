import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional, ApiQuery } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
// Swagger12 query DTO flattening drops enum refs; use explicit named parameters.
export const ApiPaging = () =>
  applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({ name: 'search', required: false, type: String, maxLength: 100 }),
  );
