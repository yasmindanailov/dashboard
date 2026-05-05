import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { AdminPluginsService } from './admin-plugins.service';
import { AdminPluginUpdateDto } from './dto/admin-plugin-update.dto';

/**
 * AdminPluginsController — Sprint 15A Fase G (ADR-080 §7).
 *
 * Endpoints REST bajo `/api/v1/admin/plugins` con triple guard
 * (defense in depth, ADR-067 §4):
 *  1. `JwtAuthGuard` — usuario autenticado.
 *  2. `AdminOnlyGuard` — rol staff (corte temprano antes de CASL).
 *  3. `PoliciesGuard` — evalúa `@CheckPolicies(Manage Plugin)`.
 *
 * Sólo `superadmin` tiene `Manage Plugin` (ADR-080 — Subject admin-puro,
 * mismo patrón que `NotificationTemplate` / `Job`). El resto de staff
 * (`agent_full`/`agent_billing`/`agent_support`) recibe 403 — los plugins
 * manejan credenciales sensibles del proveedor (api keys cifradas).
 */
@ApiTags('Admin / Plugins')
@ApiBearerAuth()
@Controller('admin/plugins')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class AdminPluginsController {
  constructor(private readonly service: AdminPluginsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Plugin))
  @ApiOperation({
    summary:
      'Lista plugins disponibles con su manifest + estado de instalación',
  })
  list() {
    return this.service.list();
  }

  @Get(':slug')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Plugin))
  @ApiOperation({
    summary:
      'Detalle de un plugin (manifest + config + secrets enmascarados + circuit state)',
  })
  findOne(@Param('slug') slug: string) {
    return this.service.findOne(slug);
  }

  @Patch(':slug')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Plugin))
  @ApiOperation({
    summary:
      'Actualiza enabled / config / secrets del plugin. Valida contra manifest schemas (Ajv). Audit + emit plugin.config_changed.',
  })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
    @Body() dto: AdminPluginUpdateDto,
  ) {
    return this.service.update(slug, req.user.id, dto);
  }

  @Post(':slug/test-connection')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Plugin))
  @ApiOperation({
    summary:
      'Invoca plugin.getStatus() con un service sintético y reporta éxito/error sin persistir cambios.',
  })
  testConnection(@Param('slug') slug: string) {
    return this.service.testConnection(slug);
  }
}
