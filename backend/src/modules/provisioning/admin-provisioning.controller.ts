import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
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

import { CreateDnsRecordDto, UpdateDnsRecordDto } from './dto/dns-records.dto';
import {
  AdminServiceListQueryDto,
  DeprovisionDto,
  SuspendServiceDto,
} from './dto/provisioning.dto';
import {
  DnsExternallyManagedError,
  ProvisioningService,
} from './provisioning.service';

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

  /**
   * Sprint 15C.II Fase B (ADR-083 Amendment A4.1) — refresh manual admin
   * del cache `service_info` (TTL 60s wrapper). Espejo del endpoint cliente
   * `POST /services/:id/refresh` pero con isAdmin=true (bypass ownership).
   * Invocado desde el botón "↻ Refrescar" de `MetricsBar.tsx` cuando renderiza
   * en `/admin/services/[id]`.
   */
  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refrescar service info admin (bypass cache 60s — ADR-083 A4.1)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  refresh(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.provisioning.getInfoForUser(id, req.user.id, true, {
      forceRevalidate: true,
    });
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

  // ─── Suspend / unsuspend (Sprint 15C.II Fase F — ADR-077 Amendment A4) ──

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Suspender servicio (reversible — preserva datos en el proveedor) con motivo canónico',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  suspend(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendServiceDto,
  ) {
    return this.provisioning.suspendAsAdmin(id, dto, req.user.id, {
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Post(':id/unsuspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar servicio suspendido' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  unsuspend(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.provisioning.unsuspendAsAdmin(id, req.user.id, {
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  // ─── DNS records (Sprint 15C Fase 15C.D — ADR-082 §6 — admin) ──────────

  @Get(':id/dns/records')
  @ApiOperation({
    summary:
      'List DNS records (admin) — sin filtro ownership. 404 si DNS externo.',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  async listDns(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    try {
      const { resolution, result } =
        await this.provisioning.listDnsRecordsForUser(id, req.user.id, true, {
          ipAddress: req.ip ?? '0.0.0.0',
          userAgent: req.headers['user-agent'] ?? null,
        });
      return {
        authority: resolution.authority,
        plugin_slug: resolution.plugin?.slug ?? null,
        nameservers: resolution.nameservers,
        result,
      };
    } catch (err) {
      if (err instanceof DnsExternallyManagedError) {
        throw buildDnsExternallyManaged404(err);
      }
      throw err;
    }
  }

  @Post(':id/dns/records')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crea DNS record (admin). 404 si DNS externo.',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  async createDns(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDnsRecordDto,
  ) {
    try {
      const { resolution, result } =
        await this.provisioning.addDnsRecordForUser(
          id,
          { ...dto },
          req.user.id,
          true,
          {
            ipAddress: req.ip ?? '0.0.0.0',
            userAgent: req.headers['user-agent'] ?? null,
          },
        );
      return {
        authority: resolution.authority,
        plugin_slug: resolution.plugin?.slug ?? null,
        result,
      };
    } catch (err) {
      if (err instanceof DnsExternallyManagedError) {
        throw buildDnsExternallyManaged404(err);
      }
      throw err;
    }
  }

  @Patch(':id/dns/records/:recordId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualiza DNS record (admin). 404 si DNS externo.',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  async updateDns(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateDnsRecordDto,
  ) {
    try {
      const { resolution, result } =
        await this.provisioning.updateDnsRecordForUser(
          id,
          recordId,
          { ...dto },
          req.user.id,
          true,
          {
            ipAddress: req.ip ?? '0.0.0.0',
            userAgent: req.headers['user-agent'] ?? null,
          },
        );
      return {
        authority: resolution.authority,
        plugin_slug: resolution.plugin?.slug ?? null,
        result,
      };
    } catch (err) {
      if (err instanceof DnsExternallyManagedError) {
        throw buildDnsExternallyManaged404(err);
      }
      throw err;
    }
  }

  @Delete(':id/dns/records/:recordId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Elimina DNS record (admin). 404 si DNS externo.',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  async deleteDns(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId') recordId: string,
  ) {
    try {
      const { resolution, result } =
        await this.provisioning.deleteDnsRecordForUser(
          id,
          recordId,
          req.user.id,
          true,
          {
            ipAddress: req.ip ?? '0.0.0.0',
            userAgent: req.headers['user-agent'] ?? null,
          },
        );
      return {
        authority: resolution.authority,
        plugin_slug: resolution.plugin?.slug ?? null,
        result,
      };
    } catch (err) {
      if (err instanceof DnsExternallyManagedError) {
        throw buildDnsExternallyManaged404(err);
      }
      throw err;
    }
  }
}

function buildDnsExternallyManaged404(
  err: DnsExternallyManagedError,
): NotFoundException {
  const code =
    err.resolution.reason === 'no_dns_authority_plugin_active'
      ? 'DNS_NO_AUTHORITY_PLUGIN'
      : 'DNS_MANAGED_EXTERNALLY';
  return new NotFoundException({
    code,
    message:
      code === 'DNS_NO_AUTHORITY_PLUGIN'
        ? 'No hay plugin DNS authority activo en el cluster.'
        : 'DNS gestionado externamente.',
    reason: err.resolution.reason,
    nameservers: err.resolution.nameservers,
    hint: 'modify_ns_to_aelium_to_enable_dns_management',
  });
}
