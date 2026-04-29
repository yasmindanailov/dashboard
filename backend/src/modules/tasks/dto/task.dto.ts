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

/**
 * Sprint 8 Fase B.5 (2026-04-29) — checklist completable + maintenance log.
 *
 * `item_kind` distingue dónde vive el item al que se refiere `item_id`:
 *   - `service`: snapshot del servicio (`service_checklist_items`) que
 *     se popula al provisionar (Sprint 11). Es el caso canónico cuando
 *     hay servicio activo.
 *   - `product`: items globales del producto (`product_checklist_items`)
 *     usados como fallback cuando un servicio no tiene snapshot todavía
 *     (caso transitorio hasta Sprint 11). Permite que el agente cierre
 *     mantenimiento incluso antes de que `ServiceChecklistItem` exista.
 */
export enum ChecklistItemKindDto {
  service = 'service',
  product = 'product',
}

export class CompleteChecklistItemDto {
  @ApiProperty({ description: 'UUID del item (service_* o product_*).' })
  @IsUUID()
  item_id: string;

  @ApiProperty({ enum: ChecklistItemKindDto })
  @IsEnum(ChecklistItemKindDto)
  item_kind: ChecklistItemKindDto;

  @ApiPropertyOptional({
    description:
      'Comentario opcional del agente al completar el item (ej: "actualicé core a v2.5").',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Sprint 8 Fase B.5 — registra `MaintenanceLog` (1:1 con la task) +
 * cierra la task tipo `maintenance` / `maintenance_management`. Reúne en
 * una sola transacción la creación del log + status=completed + emisión
 * de `maintenance.completed` para que el cliente reciba la notificación.
 *
 * `month_year` se calcula del `task.billing_month` (poblado por el cron
 * mensual del Sprint 8 Fase D) o del momento actual si no estaba populado.
 * El DTO permite override explícito por si el agente cierra retroactivamente
 * un mantenimiento del mes anterior (caso operativo real).
 */
export class RecordMaintenanceLogDto {
  @ApiProperty({
    description:
      'Resumen del mantenimiento que se inyecta en la plantilla del email al cliente.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  notes: string;

  @ApiPropertyOptional({
    description:
      'YYYY-MM al que corresponde el mantenimiento. Default: task.billing_month o mes actual.',
  })
  @IsOptional()
  @IsString()
  month_year?: string;

  @ApiPropertyOptional({
    description:
      'Notas internas (sólo equipo). Se persisten como ClientNote con task_id + category=solution. Equivalente al campo internal_notes de CompleteTaskDto pero específico del flujo maintenance.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internal_notes?: string;

  @ApiPropertyOptional({
    description:
      'Lista opcional de items de checklist que se completan en el mismo POST (atajo del flujo "Completar y notificar"). Cada item debe tener {item_id, item_kind, notes?}.',
    type: [CompleteChecklistItemDto],
  })
  @IsOptional()
  checklist_completions?: CompleteChecklistItemDto[];
}

/**
 * Sprint 8.B.1.bis (2026-04-29): vista segmentada del tablero según
 * UI_SPEC §5.15 — "Mis tareas" / "Sin asignar" / "Todas". Filtro implícito
 * que acota qué tareas se ven antes de aplicar status/type/priority.
 *
 *   - `mine`        → assigned_to = userId actual.
 *   - `unassigned`  → assigned_to IS NULL (la cola de pendientes que
 *                     cualquier staff puede tomar).
 *   - `all`         → todas las tareas (sólo staff; el role-based
 *                     filtering del service no aplica scope cuando es admin).
 *
 * Si se omite, se mantiene el comportamiento clásico: agente ve sus
 * tareas + sin asignar en una sola lista, admin ve todas.
 */
export enum TaskScopeDto {
  mine = 'mine',
  unassigned = 'unassigned',
  all = 'all',
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
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TaskScopeDto)
  scope?: TaskScopeDto;
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
