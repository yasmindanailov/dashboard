/* ═══════════════════════════════════════
   TasksController — Sprint 16 Fase 16.B (ADR-079) + Sprint 13.5 Fase C (DC.34)
   API canónica read-only sobre triggers automáticos.
   Sin POST manual ni PATCH libre — sólo: list, findOne, assign, complete,
   complete-ticket-bridge, stats, checklist + maintenance log.
   El endpoint /:id/cancel se eliminó físicamente en Sprint 13.5 Fase C
   (DC.34). La cancelación es consecuencia mecánica de listeners cross-
   sistema (`tasks-on-slot-released`, `tasks-on-service-cancelled`,
   `SupportTicketTaskCreatorListener.handleUnassigned`) que invocan
   `TasksService.cancel()` directo, sin pasar por HTTP.
   ═══════════════════════════════════════ */

import {
  Controller,
  Get,
  Post,
  Patch,
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
  AssignTaskDto,
  CompleteChecklistItemDto,
  CompleteTaskDto,
  RecordMaintenanceLogDto,
  TaskListQueryDto,
  TaskScopeDto,
  TicketBridgeCompletionDto,
} from './dto/task.dto';
import { ChecklistCompletionService } from './checklist-completion.service';
import { MaintenanceLogService } from './maintenance-log.service';
import { ClientNotesService } from '../clients/client-notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';

const ADMIN_ROLES = ['superadmin', 'agent_full'];

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TasksController {
  constructor(
    private readonly service: TasksService,
    private readonly checklist: ChecklistCompletionService,
    private readonly maintenanceLog: MaintenanceLogService,
    private readonly clientNotes: ClientNotesService,
  ) {}

  /* ── Listado + detalle + stats ── */

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'List tasks (paginated, filtered)' })
  findAll(@Req() req: AuthenticatedRequest, @Query() query: TaskListQueryDto) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.service.findAll(query, req.user.id, isAdmin);
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'Get task counters for StatusTabs' })
  getStats(
    @Req() req: AuthenticatedRequest,
    @Query('scope') scope?: TaskScopeDto,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.service.getStats(req.user.id, isAdmin, scope);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'Get task detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /* ── Mutaciones canónicas — sin POST /tasks ni PATCH /tasks/:id libre ── */

  @Patch(':id/assign')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({
    summary:
      'Asignar / reasignar / liberar a cola pública. Admin pleno o auto-asignación desde cola pública.',
  })
  assign(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.service.assign(id, dto, req.user.id, isAdmin);
  }

  @Patch(':id/complete')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({
    summary:
      'Completar task no-bridge (provisioning_manual / client_lifecycle / project). Nota obligatoria — se persiste en client_notes con source_system=task_completion.',
  })
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.service.complete(id, dto, req.user.id);
  }

  @Patch(':id/complete-ticket-bridge')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({
    summary:
      'Completar bridge ticket↔task. Delega en module support para resolver/cerrar el ticket vinculado y notificar al cliente.',
  })
  completeTicketBridge(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketBridgeCompletionDto,
  ) {
    return this.service.completeTicketBridge(id, dto, req.user.id);
  }

  /* ── Checklist + maintenance log (Sprint 8 Fase B.5 — preservado) ── */

  @Get(':id/checklist')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'Listar checklist + completions de la task' })
  async getChecklist(@Param('id', ParseUUIDPipe) id: string) {
    const task = await this.service.findOne(id);
    if (task.source_system !== 'support_inside_slot') {
      return { items: [], completions: [] };
    }
    // Resolver `service_id` desde el slot vinculado.
    const slot = await this.checklist.getSlotForTask(task.source_id);
    const items = await this.checklist.findChecklistForTask(
      slot?.service_id ?? null,
      slot?.product_id ?? null,
    );
    const completions = await this.checklist.findByTask(id);
    return { items, completions };
  }

  @Post(':id/checklist/complete')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({ summary: 'Marcar checklist item como completado' })
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
      'Cerrar task de mantenimiento: maintenance_log + items requeridos + emit maintenance.completed (atómico).',
  })
  recordMaintenanceLog(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordMaintenanceLogDto,
  ) {
    return this.maintenanceLog.recordCompletion(id, dto, req.user.id);
  }

  /* ── Notas asociadas a la task (read-only — la creación es atómica con
       complete()) ── */

  @Get(':id/notes')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'Listar notas vinculadas a la task' })
  listNotes(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientNotes.findByTask(id);
  }
}
