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
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateDnsRecordDto, UpdateDnsRecordDto } from './dto/dns-records.dto';
import { ExecuteActionDto, ServiceListQueryDto } from './dto/provisioning.dto';
import {
  DnsExternallyManagedError,
  ProvisioningService,
} from './provisioning.service';

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

  /**
   * Sprint 15C.II Fase F.3 (GAP-15CII-M) — timeline de auditoría del
   * servicio para el cliente: UNION change-log + access-log filtrado por el
   * servicio, **whitelist GDPR** (solo acciones cliente-seguras; sin
   * `changes_*`/`correlation_id`/IP del staff; impersonación admin con
   * detalle — nombre del agente + panel — decisión Yasmin 2026-05-12).
   * Cursor pagination `(created_at, id)` DESC vía `?cursor=&limit=`.
   */
  @Get(':id/audit')
  @ApiOperation({
    summary:
      'Timeline de auditoría del servicio (vista cliente — whitelist GDPR, cursor pagination)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  audit(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.provisioning.getServiceTimelineForUser(
      id,
      req.user.id,
      isAdmin,
      {
        cursor,
        limit: limit && /^\d+$/.test(limit) ? parseInt(limit, 10) : undefined,
      },
    );
  }

  /**
   * Sprint 15C.II Fase B (ADR-083 Amendment A4.1) — refresh manual del
   * cache `service_info` (TTL 60s wrapper). Endpoint POST porque tiene
   * side-effect (invalida cache Redis + re-fetch fresco del proveedor).
   *
   * Cliente lo invoca desde el botón "↻ Refrescar" de MetricsBar.tsx
   * vía server action `refreshServiceInfoAction(serviceId)`. Reusa la
   * misma ruta de `getInfoForUser` con `forceRevalidate: true`.
   *
   * Sprint 15C.II Fase F.3 (B.1) — `ProvisioningService.getInfoForUser`
   * impone un cooldown server-side per-servicio (≈15s, `SET NX EX` en Redis):
   * dentro de la ventana el refresh degrada a una lectura cacheada normal
   * (coalescing — la respuesta sigue siendo un `ServiceDetailResponse` válido,
   * sin error; no requiere cambios en el cliente). Cliente y admin comparten
   * la ventana.
   */
  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Refrescar service info bypasseando cache 60s (ADR-083 A4.1 — botón ↻ MetricsBar)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  refresh(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.provisioning.getInfoForUser(id, req.user.id, isAdmin, {
      forceRevalidate: true,
    });
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
    // Sprint 15C.II Fase C round 5 (smoke real Yasmin 2026-05-10): shape
    // ahora `{ sso: SsoUrl | null, errorCode: string | null }` —
    // el frontend SsoButton ramifica por errorCode para mostrar mensaje
    // útil cuando el plugin reportó INVALID_STATE (drift detectable —
    // ej. member_id stale en `enhance_customers`) en lugar del genérico
    // "El proveedor no devolvió una sesión válida".
    return this.provisioning.getSsoForUser(id, req.user.id, isAdmin, {
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'] ?? null,
    });
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

  // ─── DNS records (Sprint 15C Fase 15C.D — ADR-082 §6) ──────────────────

  @Get(':id/dns/records')
  @ApiOperation({
    summary:
      'List DNS records de la zona del service (cliente). 404 si DNS gestionado externamente.',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  async listDns(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    try {
      const { resolution, result } =
        await this.provisioning.listDnsRecordsForUser(
          id,
          req.user.id,
          isAdmin,
          {
            ipAddress: req.ip ?? '0.0.0.0',
            userAgent: req.headers['user-agent'] ?? null,
          },
        );
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
    summary:
      'Crea un DNS record en la zona del service (cliente). 404 si DNS externo.',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  async createDns(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDnsRecordDto,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    try {
      const { resolution, result } =
        await this.provisioning.addDnsRecordForUser(
          id,
          { ...dto },
          req.user.id,
          isAdmin,
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
    summary:
      'Actualiza un DNS record de la zona del service (cliente). 404 si DNS externo.',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  async updateDns(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateDnsRecordDto,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    try {
      const { resolution, result } =
        await this.provisioning.updateDnsRecordForUser(
          id,
          recordId,
          { ...dto },
          req.user.id,
          isAdmin,
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
    summary:
      'Elimina un DNS record de la zona del service (cliente). 404 si DNS externo.',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  async deleteDns(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId') recordId: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    try {
      const { resolution, result } =
        await this.provisioning.deleteDnsRecordForUser(
          id,
          recordId,
          req.user.id,
          isAdmin,
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

/**
 * Sprint 15C Fase 15C.D — mapea `DnsExternallyManagedError` a HTTP 404
 * con shape canónico documentado en ADR-082 §6.
 */
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
