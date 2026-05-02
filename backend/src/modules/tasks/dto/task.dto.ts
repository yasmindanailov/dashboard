/* ═══════════════════════════════════════
   task.dto — Sprint 16 Fase 16.B (ADR-079)
   DTOs canónicos: solo flujos read-only sobre triggers automáticos.
   Sin POST manual ni PATCH libre. Sólo: list, findOne, assign, complete,
   cancel y endpoints derivados (checklist + maintenance log + notes).
   ═══════════════════════════════════════ */

import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TaskSourceSystem,
  TaskStatus,
  TaskPriority,
  ChecklistItemKind,
} from '@prisma/client';

/* ── Enum aliases para uso en frontend / type narrowing ── */

export const TaskSourceSystemDto = TaskSourceSystem;
export type TaskSourceSystemDto = TaskSourceSystem;
export const TaskStatusDto = TaskStatus;
export type TaskStatusDto = TaskStatus;
export const TaskPriorityDto = TaskPriority;
export type TaskPriorityDto = TaskPriority;

/* ── Scope para vista segmentada del tablero ── */
export enum TaskScopeDto {
  mine = 'mine',
  unassigned = 'unassigned',
  all = 'all',
}

/* ── Listado de tasks ── */
export class TaskListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(TaskScopeDto)
  scope?: TaskScopeDto;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskSourceSystem)
  source_system?: TaskSourceSystem;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @IsOptional()
  @IsUUID()
  client_id?: string;

  /** Filtra por origen vinculado (conversation_id|slot_id|service_id|...). */
  @IsOptional()
  @IsUUID()
  source_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['today', 'week', 'all'])
  time_range?: 'today' | 'week' | 'all';
}

/* ── Asignación / reasignación ──
   Cubre 3 casos canónicos:
     1. Auto-asignación desde cola pública (`assigned_to=current_user`).
     2. Reasignación admin (`assigned_to=otro_agente`).
     3. Liberación a cola pública (`assigned_to=null`). */
export class AssignTaskDto {
  @IsOptional()
  @IsUUID()
  assigned_to?: string | null;
}

/* ── Completar una task no-bridge ──
   `note` es obligatoria condicionalmente según `source_system` (ADR-079 §3.9):
     - support_ticket          → NO usa este DTO (bridge — ver TicketBridgeCompletionDto)
     - support_inside_slot     → NO usa este DTO (delega en MaintenanceLogService)
     - provisioning_manual     → SÍ obligatoria
     - client_lifecycle        → SÍ obligatoria
     - project                 → SÍ obligatoria
   El service valida según contexto. */
export class CompleteTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;
}

/* ── Completar bridge ticket ↔ task ──
   Delega en SupportService.updateConversation y persiste ClientNote
   (source_system='ticket'). `ticket_action` decide el estado nuevo. */
export enum TicketActionDto {
  resolve = 'resolve',
  close = 'close',
}

export class TicketBridgeCompletionDto {
  @IsEnum(TicketActionDto)
  ticket_action!: TicketActionDto;

  @IsString()
  @MaxLength(5000)
  resolution_note!: string;
}

/* ── Cancelar una task — sin nota obligatoria (ADR-079 §3.9 excepción) ── */
export class CancelTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/* ── Checklist completion (Sprint 8 Fase B.5 — sin cambios funcionales) ── */
export enum ChecklistItemKindDto {
  service = 'service',
  product = 'product',
}

export class CompleteChecklistItemDto {
  @IsUUID()
  item_id!: string;

  @IsEnum(ChecklistItemKind)
  item_kind!: ChecklistItemKind;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/* ── Record maintenance log ──
   Sprint 16 (ADR-079 §3.8): `client_facing_notes` = email al cliente
   (renombrado desde `notes`). `internal_notes` opcional → ClientNote
   con source_system='maintenance_log'. */
export class RecordMaintenanceLogDto {
  @IsString()
  @MaxLength(10000)
  client_facing_notes!: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  month_year?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internal_notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteChecklistItemDto)
  checklist_completions?: CompleteChecklistItemDto[];
}
