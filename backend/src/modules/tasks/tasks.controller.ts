/* ═══════════════════════════════════════
   TasksController — REST API for tasks
   Ref: DECISIONS.md §10, UI_SPEC.md §5.15-5.16
   ═══════════════════════════════════════ */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  CompleteTaskDto,
  CompleteChecklistItemDto,
  RecordMaintenanceLogDto,
  TaskListQueryDto,
  TaskScopeDto,
} from './dto/task.dto';
import { ChecklistCompletionService } from './checklist-completion.service';
import { MaintenanceLogService } from './maintenance-log.service';
import { TaskNotesService } from './task-notes.service';
import { CreateTaskNoteDto } from './dto/task-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TasksController {
  constructor(
    private readonly service: TasksService,
    private readonly checklist: ChecklistCompletionService,
    private readonly maintenanceLog: MaintenanceLogService,
    private readonly notes: TaskNotesService,
  ) {}

  @Post()
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Task))
  @ApiOperation({ summary: 'Create a new task' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTaskDto) {
    const user = req.user;
    return this.service.create(dto, user.id);
  }

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'List tasks (paginated, filtered)' })
  findAll(@Req() req: AuthenticatedRequest, @Query() query: TaskListQueryDto) {
    const user = req.user;
    const isAdmin = ['superadmin', 'agent_full'].includes(user.role.slug);
    return this.service.findAll(query, user.id, isAdmin);
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'Get task counters for StatusTabs' })
  getStats(
    @Req() req: AuthenticatedRequest,
    @Query('scope') scope?: TaskScopeDto,
  ) {
    const user = req.user;
    const isAdmin = ['superadmin', 'agent_full'].includes(user.role.slug);
    return this.service.getStats(user.id, isAdmin, scope);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'Get task detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({ summary: 'Update task (status, assignment, etc.)' })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const user = req.user;
    const isAdmin = ['superadmin', 'agent_full'].includes(user.role.slug);
    return this.service.update(id, dto, user.id, isAdmin);
  }

  @Patch(':id/complete')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({ summary: 'Complete task with notes (maintenance flow)' })
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTaskDto,
  ) {
    const user = req.user;
    return this.service.complete(id, dto, user.id);
  }

  /* ── Sprint 8 Fase B.5 — checklist + maintenance_log ── */

  @Get(':id/checklist')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({
    summary:
      'Listar checklist disponible para una task (items + estado completado)',
  })
  async getChecklist(@Param('id', ParseUUIDPipe) id: string) {
    const task = await this.service.findOne(id);
    // `findOne` usa INCLUDE_RELATIONS_DETAIL que trae `service.product`
    // anidado (no `product_id` directo). Para los items globales del
    // producto (fallback cuando no hay snapshot) extraemos el id de ahí.
    const productId = task.service?.product?.id ?? null;
    const items = await this.checklist.findChecklistForTask(
      task.service_id ?? null,
      productId,
    );
    const completions = await this.checklist.findByTask(id);
    return { items, completions };
  }

  @Post(':id/checklist/complete')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({
    summary:
      'Marcar un checklist item como completado dentro de la task (idempotente)',
  })
  completeChecklistItem(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteChecklistItemDto,
  ) {
    return this.checklist.complete(id, dto, req.user.id);
  }

  @Post(':id/maintenance/log')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({
    summary:
      'Cerrar task de mantenimiento: crea maintenance_log + valida items requeridos + emite maintenance.completed',
  })
  recordMaintenanceLog(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordMaintenanceLogDto,
  ) {
    return this.maintenanceLog.recordCompletion(id, dto, req.user.id);
  }

  /* ── Sprint 8 Fase B.9 (2026-04-30) — Notas internas inline ── */

  @Get(':id/notes')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({
    summary: 'Listar notas internas (category=technical) asociadas a la task',
  })
  listNotes(@Param('id', ParseUUIDPipe) id: string) {
    return this.notes.list(id);
  }

  @Post(':id/notes')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({
    summary:
      'Añadir nota interna (technical) inline durante la ejecución de la tarea',
  })
  createNote(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskNoteDto,
  ) {
    return this.notes.create(id, dto, req.user.id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can(Action.Delete, Subject.Task))
  @ApiOperation({ summary: 'Delete task (admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
