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
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { ExecuteActionDto, ServiceListQueryDto } from './dto/provisioning.dto';
import { ProvisioningService } from './provisioning.service';

/**
 * ProvisioningController — Sprint 11 Fase 11.D (ADR-070 + ADR-077 + ADR-066).
 *
 * Endpoints del PORTAL CLIENTE (`/api/v1/services/*`). Ownership
 * enforced server-side: cualquier role no-staff sólo ve sus propios
 * servicios — `userId = req.user.id` se pasa al service, no se acepta
 * desde query.
 *
 * Roles staff (`superadmin` / `agent_*`) pueden invocar estos endpoints
 * y se les bypassa el filtro ownership (vía CASL `Manage.Service`). Para
 * operaciones admin destructivas (reprovision/deprovision) usar
 * `AdminProvisioningController` en `admin-provisioning.controller.ts`.
 */
const ADMIN_ROLES = [
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
];

@ApiTags('Services (cliente)')
@ApiBearerAuth()
@Controller('services')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get()
  @ApiOperation({
    summary: 'List own services (cliente) — admin sees own, NO global view',
  })
  @CheckPolicies((ability) => ability.can(Action.List, Subject.Service))
  list(@Req() req: AuthenticatedRequest, @Query() query: ServiceListQueryDto) {
    return this.provisioning.listForUser(req.user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Service detail with normalized ServiceInfo from plugin (cached, ADR-077 §5)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.provisioning.getInfoForUser(id, req.user.id, isAdmin);
  }

  @Post(':id/sso')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SSO URL al panel del proveedor (audit obligatorio ADR-070 §B)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  async sso(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    // Wrapper canónico `{ sso: SsoUrl | null }` — el frontend ramifica
    // por presencia/ausencia del SSO sin parsear `null` literal del body.
    const sso = await this.provisioning.getSsoForUser(
      id,
      req.user.id,
      isAdmin,
      {
        ipAddress: req.ip ?? '0.0.0.0',
        userAgent: req.headers['user-agent'] ?? null,
      },
    );
    return { sso };
  }

  @Post(':id/actions/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ejecutar acción inline curada (ADR-070 §C — audit + invalida cache)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  executeAction(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slug') actionSlug: string,
    @Body() dto: ExecuteActionDto,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.provisioning.executeActionForUser(
      id,
      actionSlug,
      dto.payload,
      req.user.id,
      isAdmin,
      {
        ipAddress: req.ip ?? '0.0.0.0',
        userAgent: req.headers['user-agent'] ?? null,
      },
    );
  }
}
