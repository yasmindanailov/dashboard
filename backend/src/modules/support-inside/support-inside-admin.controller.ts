import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { SupportInsideAdminService } from './support-inside-admin.service';
import { AssignTechnicianDto } from './dto/support-inside.dto';

/**
 * SupportInsideAdminController — Rediseño UI F3·E8.
 *
 * Gestión admin por-cliente de las suscripciones Support Inside, bajo
 * `/api/v1/admin/support-inside/*`. Triple guard (defense in depth, ADR-067
 * §4): JwtAuthGuard + AdminOnlyGuard + PoliciesGuard con `Manage.SupportInside`.
 * Distinto del controller de PLANES (`/admin/support-inside/plans`).
 *
 * La gestión per-cliente NO es una página nueva: alimenta la sección SI
 * ("Plan de soporte") + el picker "Reasignar técnico" del detalle de servicio
 * admin unificado (`/admin/services/[id]`, plantilla única cliente+admin
 * F.12). Por eso expone lecturas keyed por `serviceId` y de técnicos elegibles.
 */
@ApiTags('Admin / Support Inside')
@ApiBearerAuth()
@Controller('admin/support-inside')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class SupportInsideAdminController {
  constructor(private readonly service: SupportInsideAdminService) {}

  @Patch('subscriptions/:id/technician')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.SupportInside))
  @ApiOperation({
    summary:
      'Asignar/reasignar el técnico de una suscripción (null desasigna). Reasigna las tareas de mantenimiento pending del periodo en curso.',
  })
  assignTechnician(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.service.assignTechnician(id, dto.technician_id ?? null);
  }

  @Get('subscriptions/by-service/:serviceId')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.SupportInside))
  @ApiOperation({
    summary:
      'Bloque gestionado (técnico + presencia + progreso de mantenimiento + SLA) de la suscripción SI dueña del servicio. 404 si el servicio no es Support Inside.',
  })
  getManagedByService(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.service.getManagedByService(serviceId);
  }

  @Get('technicians/eligible')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.SupportInside))
  @ApiOperation({
    summary:
      'Técnicos elegibles (staff de soporte activo) con presencia y carga de mantenimiento, para el picker "Reasignar técnico".',
  })
  listEligibleTechnicians() {
    return this.service.listEligibleTechnicians();
  }
}
