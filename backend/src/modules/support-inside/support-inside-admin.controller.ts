import {
  Body,
  Controller,
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
 * `/api/v1/admin/support-inside/subscriptions`. Triple guard (defense in
 * depth, ADR-067 §4): JwtAuthGuard + AdminOnlyGuard + PoliciesGuard con
 * `Manage.SupportInside`. Distinto del controller de PLANES.
 */
@ApiTags('Admin / Support Inside Subscriptions')
@ApiBearerAuth()
@Controller('admin/support-inside/subscriptions')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class SupportInsideAdminController {
  constructor(private readonly service: SupportInsideAdminService) {}

  @Patch(':id/technician')
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
}
