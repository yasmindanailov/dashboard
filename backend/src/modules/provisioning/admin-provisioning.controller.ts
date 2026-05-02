import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Action, Subject } from '../../core/casl/permissions';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditAccess } from '../audit/audit.decorator';

import {
  AdminServiceListQueryDto,
  DeprovisionDto,
} from './dto/provisioning.dto';
import { ProvisioningService } from './provisioning.service';

/**
 * AdminProvisioningController — Sprint 11 Fase 11.D (ADR-066 §portal admin).
 *
 * Endpoints staff-only en `/api/v1/admin/services/*`. Triple guard
 * canónico (JwtAuthGuard + AdminOnlyGuard + PoliciesGuard) — el
 * `AdminOnlyGuard` cierra primera línea (defense-in-depth) y CASL afina
 * por rol vía `Manage.Service` (`agent_billing` y `agent_support` solo
 * tienen Read/List, NO pueden disparar reprovision ni deprovision —
 * sólo `superadmin` y `agent_full` lo pueden).
 */
@ApiTags('Services (admin)')
@ApiBearerAuth()
@Controller('admin/services')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class AdminProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get()
  @ApiOperation({
    summary: 'List all services (admin) with filters por user/plugin/status',
  })
  @CheckPolicies((ability) => ability.can(Action.List, Subject.Service))
  list(@Query() query: AdminServiceListQueryDto) {
    return this.provisioning.listForAdmin(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Service detail (admin) — vista federada del cliente sin filtro ownership',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  @AuditAccess('Service')
  detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // Admin puede ver cualquier service — pasamos isAdmin=true para
    // saltar el check de ownership.
    return this.provisioning.getInfoForUser(id, req.user.id, true);
  }

  @Post(':id/reprovision')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Re-encolar provisioning (escotilla admin tras corregir credenciales / añadir plugin que faltaba)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  reprovision(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.provisioning.reprovisionAsAdmin(id, req.user.id, {
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Post(':id/deprovision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancelación administrativa con reason canónico (cancelled/expired/admin_override)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  deprovision(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeprovisionDto,
  ) {
    return this.provisioning.deprovisionAsAdmin(id, dto, req.user.id, {
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
