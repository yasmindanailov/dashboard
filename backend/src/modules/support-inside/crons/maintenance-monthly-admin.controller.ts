import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../../core/casl/policies.guard';
import { CheckPolicies } from '../../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../../core/casl/permissions';
import { MaintenanceMonthlyService } from './maintenance-monthly.service';

/**
 * MaintenanceMonthlyAdminController — Sprint 8 Fase D.
 *
 * Endpoint canónico para disparar manualmente el cron `maintenance-monthly`
 * desde el panel admin (mismo patrón que `TasksCronsAdminController` de
 * Fase C). Usos:
 *   - Smoke testing manual tras el deploy de Fase D.
 *   - Validación end-to-end vía suite E2E sin esperar al día 1 del mes.
 *   - Recovery operativo si el cron real (BullMQ scheduled) tuvo un
 *     incidente — re-dispara la creación de tasks del mes en curso
 *     (idempotente por `(service_id, billing_month)`).
 *
 * Triple guard (defense in depth, ADR-067 §4):
 *   1. JwtAuthGuard — usuario autenticado.
 *   2. AdminOnlyGuard — rol staff (corte temprano antes de CASL).
 *   3. PoliciesGuard — exige `Manage.Job` (sólo superadmin via wildcard,
 *      coherente con TasksCronsAdminController Fase C — disparar un cron
 *      re-ejecuta side effects con impacto operacional).
 */
@ApiTags('Admin / Support Inside / Crons')
@ApiBearerAuth()
@Controller('admin/support-inside/cron')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class MaintenanceMonthlyAdminController {
  constructor(private readonly service: MaintenanceMonthlyService) {}

  @Post('maintenance-monthly')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Job))
  @ApiOperation({
    summary:
      'Dispara manualmente el cron mensual de mantenimientos Support Inside',
  })
  async run() {
    return { cron: 'maintenance-monthly', result: await this.service.run() };
  }
}
