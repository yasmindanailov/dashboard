import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../../core/casl/policies.guard';
import { CheckPolicies } from '../../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../../core/casl/permissions';
import { TasksOverdueService } from './tasks-overdue.service';
import { TasksUnassignedOverdueService } from './tasks-unassigned-overdue.service';
import { MaintenanceCriticalService } from './maintenance-critical.service';

/**
 * TasksCronsAdminController — Sprint 8 Fase C (2026-05-01).
 *
 * Endpoint canónico para disparar manualmente los crons de tareas /
 * mantenimiento desde el panel admin. Usos:
 *   - Smoke testing manual (Yasmin) tras el deploy de Fase C.
 *   - Validación end-to-end vía suite E2E (`tests/e2e/tasks-crons.spec.ts`)
 *     sin esperar al schedule diario.
 *   - Recovery operativo: si el cron real (BullMQ scheduled) tuvo un
 *     incidente, el superadmin puede re-disparar la ejecución sin esperar
 *     al próximo tick de 24h.
 *
 * Triple guard (defense in depth, ADR-067 §4):
 *   1. `JwtAuthGuard` — usuario autenticado.
 *   2. `AdminOnlyGuard` — rol staff (corte temprano antes de CASL).
 *   3. `PoliciesGuard` — exige `Manage.Job` (sólo superadmin via wildcard).
 *
 * Por qué `Manage.Job` y no `Manage.Task`:
 *   - Disparar un cron re-ejecuta side effects (UPDATE status + emit
 *     eventos + envío de emails). Tiene la misma simetría operativa que
 *     reintentar un job de DLQ — restringido a superadmin.
 *   - Coherente con `JobsController.retry` (Sprint 9 Fase F).
 */
@ApiTags('Admin / Tasks / Crons')
@ApiBearerAuth()
@Controller('admin/tasks/cron')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class TasksCronsAdminController {
  constructor(
    private readonly overdue: TasksOverdueService,
    private readonly unassignedOverdue: TasksUnassignedOverdueService,
    private readonly maintenanceCritical: MaintenanceCriticalService,
  ) {}

  @Post(':name')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Job))
  @ApiOperation({
    summary:
      'Dispara manualmente un cron de tareas (overdue | unassigned-overdue | maintenance-critical)',
  })
  async run(@Param('name') name: string): Promise<{
    cron: string;
    result: unknown;
  }> {
    switch (name) {
      case 'overdue':
        return { cron: name, result: await this.overdue.run() };
      case 'unassigned-overdue':
        return { cron: name, result: await this.unassignedOverdue.run() };
      case 'maintenance-critical':
        return { cron: name, result: await this.maintenanceCritical.run() };
      default:
        throw new BadRequestException(
          `Cron desconocido "${name}". Valores válidos: overdue, unassigned-overdue, maintenance-critical.`,
        );
    }
  }
}
