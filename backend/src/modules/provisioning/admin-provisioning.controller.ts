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
import { ClientNotesService } from '../clients/client-notes.service';

import { CreateDnsRecordDto, UpdateDnsRecordDto } from './dto/dns-records.dto';
import {
  AdminServiceListQueryDto,
  DeprovisionDto,
  SuspendServiceDto,
  UnsuspendServiceDto,
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
  constructor(
    private readonly provisioning: ProvisioningService,
    // Sprint 15C.II F.6 — endpoint `GET /admin/services/:id/notes` para que
    // la página `/admin/services/[id]` renderice las notas operativas inline
    // (`source_system='service' AND source_id=:id`).
    private readonly clientNotes: ClientNotesService,
  ) {}

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
   * Sprint 15C.II Fase F.6 (§F.6.3) — listado de notas operativas del
   * servicio. Devuelve los `ClientNote` con `source_system='service' AND
   * source_id=:id` ordenados por `(is_pinned desc, created_at desc)`.
   *
   * Por defecto sin límite (la lista por servicio rara vez crece más allá
   * de unas decenas — cancelaciones / suspensiones / reactivaciones); si
   * en el futuro fuera necesario, paginar reutilizando `ClientNoteQueryDto`.
   * El path canónico de "ver todas las notas del cliente" es
   * `/admin/clients/:userId` → tab Notas (que usa `findByClient` con
   * filtros completos).
   */
  @Get(':id/notes')
  @ApiOperation({
    summary: 'List operational notes of a service (admin) — F.6 §F.6.3',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  // F.6 §F.6.3: lectura staff sobre datos del cliente — coherente con
  // `detail()` + `audit()` (ambos `@AuditAccess('Service')`). Las notas
  // contienen contexto operativo del cliente (motivo de suspensión, etc.)
  // — su lectura debe quedar en el log GDPR de transparencia.
  @AuditAccess('Service')
  notes(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientNotes.findByService(id);
  }

  /**
   * Sprint 15C.II Fase F.3 (GAP-15CII-M) — timeline de auditoría del
   * servicio para admin: UNION change-log + access-log filtrado por el
   * servicio, **sin filtro** (admin ve `changes_*`, `correlation_id`, IP del
   * staff, metadata íntegra). Cursor pagination `(created_at, id)` DESC vía
   * `?cursor=&limit=`. `@AuditAccess('Service')` deja el trail "agente X
   * consultó la auditoría del servicio Y" (coherente con el resto de
   * lecturas staff sobre datos del cliente).
   */
  @Get(':id/audit')
  @ApiOperation({
    summary:
      'Timeline de auditoría del servicio (vista admin — sin filtro, cursor pagination)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  @AuditAccess('Service')
  audit(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.provisioning.getServiceTimelineForUser(id, req.user.id, true, {
      cursor,
      limit: limit && /^\d+$/.test(limit) ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Sprint 15C.II Fase B (ADR-083 Amendment A4.1) — refresh manual admin
   * del cache `service_info` (TTL 60s wrapper). Espejo del endpoint cliente
   * `POST /services/:id/refresh` pero con isAdmin=true (bypass ownership).
   * Invocado desde el botón "↻ Refrescar" de `MetricsBar.tsx` cuando renderiza
   * en `/admin/services/[id]`.
   *
   * Sprint 15C.II Fase F.3 (B.1) — el cooldown server-side per-servicio vive
   * en `ProvisioningService.getInfoForUser` y aplica también aquí: cliente y
   * admin comparten la misma ventana (≈15s) — un admin depurando recibe el
   * valor cacheado dentro de la ventana, lo cual no impide depurar (orchd
   * responde <5s, el cache retiene su TTL).
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
    @Body() dto: UnsuspendServiceDto,
  ) {
    return this.provisioning.unsuspendAsAdmin(id, dto, req.user.id, {
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  /**
   * Sprint 15C.II Fase F.4.3 — realinea el estado de suspensión en el
   * proveedor con `services.status` (autoritativo para el lifecycle
   * administrativo) sin tocar la BD ni emitir eventos de lifecycle. Es la
   * remediación del aviso de desync de `/admin/services/[id]` (cuando
   * `getInfoForUser` reporta `summary.provider_state_desync === true`).
   * Reusa la inline action canónica `suspend_service` / `unsuspend_service`
   * del plugin (idempotente). Ver `ProvisioningService.resyncProviderStateAsAdmin`.
   */
  @Post(':id/resync-provider-state')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Realinear el estado de suspensión del proveedor con services.status (sin transición de lifecycle)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  resyncProviderState(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.provisioning.resyncProviderStateAsAdmin(id, req.user.id, {
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  /**
   * Sprint 15C.II Fase F.9 (`DC.45` — dossier §A.11.10.6 + refinamiento
   * §A.11.10.6.2 R1..R6 frozen + Amendments naming clash + DI).
   *
   * Reconcile per-servicio admin — cierra el cabo del CTA "Reconciliar
   * contra el proveedor" del `<AdminDriftBanner>` (F.3 — cuando
   * `info.recoveryHint === 'reconcile'`) y por fila drift del
   * `<PluginOperationalOverview>` (F.2). Single-shot — vs el cron L3 que
   * recorre todos los services del plugin cada 6h.
   *
   * El servicio (`ProvisioningService.reconcileServiceAsAdmin`) gestiona
   * el pipeline canónico: 404 → shortcircuit terminal → cooldown 30s
   * Redis SET NX EX (con coalescing al último `ServiceReconcileResult`
   * cacheado si la ventana está activa, o 409 `RECONCILE_IN_PROGRESS` si
   * no hay cacheado) → delegación a `ReconcileRegistryService.reconcileOne`
   * (que invoca el executor del plugin, throw 400
   * `RECONCILE_ONE_NOT_SUPPORTED` si no soporta) → invalidate cache
   * service_info → `ClientNote` automática si `driftsApplied > 0` (R3
   * frozen, categoría nueva `reconciliation` ADR-079 A5) → evento
   * `service.reconciled_external_change` con `trigger: 'manual_single'`
   * (R2 — reuso) → audit `service.reconciled_single` change_log +
   * `service_reconcile_admin` access_log (target_user_id para portal
   * RGPD F.3 GAP-M).
   *
   * NO acepta body — toda la información necesaria viene del path param
   * + actor del JWT + ctx del request. El servicio devuelve
   * `ServiceReconcileResult & { coalesced?: true }` que el frontend usa
   * para el Toast UX (R5 frozen).
   */
  @Post(':id/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reconciliar un único servicio contra el ground truth del proveedor (single-shot vs cron L3)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  reconcileOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.provisioning.reconcileServiceAsAdmin(id, req.user.id, {
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
