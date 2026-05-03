/* ═══════════════════════════════════════
   TasksController — Sprint 16 Fase 16.B (ADR-079)
   API canónica read-only sobre triggers automáticos.
   Sin POST manual ni PATCH libre — sólo: list, findOne, assign, complete,
   complete-ticket-bridge, cancel, stats, checklist + maintenance log.
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
  ForbiddenException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import {
  AssignTaskDto,
  CancelTaskDto,
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

  /**
   * @deprecated Sprint 16 (ADR-079 amendment A2): la cancelación humana de
   * tasks queda eliminada de la UI. La doctrina canónica establece que las
   * tasks son **read-only** respecto al sistema vinculado:
   *   - Cancelación = consecuencia mecánica de un evento del sistema vinculado
   *     (slot liberado, servicio cancelado, ticket desasignado, item del
   *     checklist eliminado). Los listeners cross-sistema (`tasks-on-slot-
   *     released`, `tasks-on-service-cancelled`, `SupportTicketTaskCreator
   *     Listener.handleUnassigned`) lo gestionan invocando `service.cancel()`
   *     directamente, sin pasar por HTTP.
   *   - Reasignación = decisión humana del superadmin sobre QUIÉN hace el
   *     trabajo. Vía canónica: `PATCH /tasks/:id/assign` con dropdown UI.
   *
   * Este endpoint queda como **interno admin** durante la transición.
   * Restricted a `superadmin` para evitar uso desde UI cliente/agente.
   * Pendiente de eliminación física en Fase 16.D cuando se actualicen los
   * E2E que aún lo invocan (DC documentado en backlog).
   */
  @Patch(':id/cancel')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({
    summary:
      '[DEPRECATED admin-only] Cancelar task. La cancelación canónica es automática vía listeners cross-sistema. Sólo accesible a superadmin para casos de debug/migración.',
    deprecated: true,
  })
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTaskDto,
  ) {
    if (req.user.role.slug !== 'superadmin') {
      throw new ForbiddenException(
        'La cancelación humana de tasks ya no se expone (ADR-079 §A2). Para reasignar, usa /tasks/:id/assign.',
      );
    }
    return this.service.cancel(id, dto, req.user.id);
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
