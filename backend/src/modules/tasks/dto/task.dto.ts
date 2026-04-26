/* ═══════════════════════════════════════
   Task DTOs — Create, Update, Query, Complete
   Ref: DECISIONS.md §10, DATABASE_SCHEMA.md tasks
   ═══════════════════════════════════════ */

import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  MaxLength,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum TaskTypeDto {
  wow_call = 'wow_call',
  maintenance = 'maintenance',
  maintenance_management = 'maintenance_management',
  project_task = 'project_task',
  custom_work = 'custom_work',
  support_setup = 'support_setup',
}

export enum TaskStatusDto {
  pending = 'pending',
  in_progress = 'in_progress',
  completed = 'completed',
  not_completed_in_time = 'not_completed_in_time',
  cancelled = 'cancelled',
}

export enum TaskPriorityDto {
  low = 'low',
  medium = 'medium',
  high = 'high',
  critical = 'critical',
}

/* ── Create ── */
export class CreateTaskDto {
  @ApiProperty() @IsEnum(TaskTypeDto) type: TaskTypeDto;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TaskPriorityDto)
  priority?: TaskPriorityDto;
  @ApiProperty() @IsUUID() client_id: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() service_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigned_to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() client_note?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() due_date?: string;
}

/* ── Update ── */
export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TaskStatusDto)
  status?: TaskStatusDto;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TaskPriorityDto)
  priority?: TaskPriorityDto;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigned_to?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() due_date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() client_note?: string;
}

/* ── Complete ── */
export class CompleteTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() client_notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() internal_notes?: string;
}

/* ── Query (list) ── */
export class TaskListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TaskStatusDto)
  status?: TaskStatusDto;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TaskTypeDto) type?: TaskTypeDto;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TaskPriorityDto)
  priority?: TaskPriorityDto;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigned_to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() time_range?:
    | 'today'
    | 'week'
    | 'all';
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/* ── Stats ── */
export class TaskStatsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigned_to?: string;
}
