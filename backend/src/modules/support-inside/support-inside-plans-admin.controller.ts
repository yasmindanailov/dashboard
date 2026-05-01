import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { SupportInsidePlansAdminService } from './support-inside-plans-admin.service';
import { UpdateSupportInsidePlanDto } from './dto/support-inside.dto';

/**
 * SupportInsidePlansAdminController — Sprint 8 Fase D + ADR-075.
 *
 * Endpoints admin para gestión de los 3 planes Support Inside. Bajo
 * `/api/v1/admin/support-inside/plans` con triple guard (defense in depth,
 * ADR-067 §4):
 *   1. JwtAuthGuard — usuario autenticado.
 *   2. AdminOnlyGuard — rol staff (corte temprano antes de CASL).
 *   3. PoliciesGuard con `Manage.SupportInside` (sólo `superadmin` +
 *      `agent_full` por ADR-075 §A — cambiar precios/SLA/canales tiene
 *      impacto comercial y operativo).
 *
 * NO se exponen `POST` ni `DELETE` — los 3 planes son seedeados; un
 * cuarto plan exige migración + ADR específico (ADR-075 §A.3).
 */
@ApiTags('Admin / Support Inside Plans')
@ApiBearerAuth()
@Controller('admin/support-inside/plans')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class SupportInsidePlansAdminController {
  constructor(private readonly service: SupportInsidePlansAdminService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.SupportInside))
  @ApiOperation({
    summary: 'Listado de los 3 planes Support Inside (índice clicable)',
  })
  list() {
    return this.service.list();
  }

  @Get(':slug')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.SupportInside))
  @ApiOperation({
    summary:
      'Detalle full del plan para el editor con secciones card (ADR-075 §B.2)',
  })
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Patch(':slug')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.SupportInside))
  @ApiOperation({
    summary:
      'Actualizar plan (cualquier subset de las 5 secciones — Identidad/Precios/Slots/Soporte/Avanzada)',
  })
  update(@Param('slug') slug: string, @Body() dto: UpdateSupportInsidePlanDto) {
    return this.service.update(slug, dto);
  }
}
