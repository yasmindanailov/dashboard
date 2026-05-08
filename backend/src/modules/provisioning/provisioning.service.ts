import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { CircuitBreakerRegistry } from '../../core/provisioning/circuit-breaker';
import {
  DnsAuthorityResolution,
  resolveDnsAuthority,
} from '../../core/provisioning/dns-authority-resolver';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import { ProvisioningCacheService } from '../../core/provisioning/provisioning-cache.service';
import {
  executeActionWithCacheInvalidation,
  getServiceInfoWithCache,
  getSsoUrlWithAudit,
} from '../../core/provisioning/plugin-utils';
import {
  ActionResult,
  ServiceInfo,
  ServiceWithRelations,
  SsoUrl,
} from '../../core/provisioning/types';
import { AuditService } from '../audit/audit.service';

/**
 * Sprint 15C Fase 15C.D — error semántico canónico que la capa REST
 * traduce a `HTTP 404 + body { code, message, nameservers, hint, reason }`
 * cuando la zona DNS del service no vive en un plugin Aelium.
 *
 * Vive aquí (módulo provisioning) para mantener `core/provisioning/` puro
 * de dependencias de NestJS / HttpException. El controller decide cómo
 * mapearlo a HTTP.
 */
export class DnsExternallyManagedError extends Error {
  constructor(public readonly resolution: DnsAuthorityResolution) {
    super(`DNS authority for this service is external (${resolution.reason}).`);
    this.name = 'DnsExternallyManagedError';
  }
}

import {
  AdminServiceListQueryDto,
  DeprovisionDto,
  ServiceListQueryDto,
} from './dto/provisioning.dto';
import { ProvisioningOrchestratorService } from './provisioning-orchestrator.service';

/**
 * ProvisioningService â€” Sprint 11 Fase 11.D (ADR-077 Â§1+Â§2+Â§5 + ADR-070 Â§A/B/C).
 *
 * Capa REST que expone al frontend (cliente + admin) los servicios y las
 * operaciones canÃ³nicas del orquestador a travÃ©s de los wrappers
 * `core/provisioning/plugin-utils`. NO duplica lÃ³gica del orquestador
 * (Fase 11.B): re-utiliza el registry, los wrappers cross-cutting y el
 * propio `ProvisioningOrchestratorService.enqueueProvisioning(...)` para
 * el path admin de reprovision.
 *
 * Reglas:
 *   - **Ownership cliente**: cualquier endpoint con role `client` filtra
 *     por `services.user_id = req.user.id` server-side. Nunca confiamos
 *     en parÃ¡metros de query/path para esto.
 *   - **Audit obligatorio**: SSO open + executeAction + reprovision +
 *     deprovision dejan trail vÃ­a `AuditService.logAccess`/`logChange`
 *     directamente o vÃ­a wrappers.
 *   - **Cache fail-open**: si Redis cae, los wrappers degradan a llamada
 *     directa al plugin. UI no se rompe.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
    private readonly cache: ProvisioningCacheService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly orchestrator: ProvisioningOrchestratorService,
    private readonly breakers: CircuitBreakerRegistry,
  ) {}

  // â”€â”€â”€ Listado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Lista servicios del cliente autenticado. Ownership impuesto por
   * `userId` viniendo siempre del JWT â€” controller nunca pasa un value
   * del query.
   */
  async listForUser(userId: string, query: ServiceListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ServiceWhereInput = {
      user_id: userId,
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        select: this.serviceSummarySelect(),
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.service.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Lista servicios para admin con filtros. Sin ownership (CASL ya
   * confirmÃ³ que es staff).
   */
  async listForAdmin(query: AdminServiceListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ServiceWhereInput = {
      ...(query.user_id ? { user_id: query.user_id } : {}),
      ...(query.provisioner_slug
        ? { provisioner_slug: query.provisioner_slug }
        : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.search
        ? {
            OR: [
              { label: { contains: query.search, mode: 'insensitive' } },
              { domain: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        select: this.adminServiceSummarySelect(),
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.service.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // â”€â”€â”€ Detalle: getServiceInfo cacheado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Devuelve el `ServiceInfo` normalizado del plugin para `/dashboard/services/[id]`.
   *
   * Path:
   *   1. Carga service con relations (user check si aplica).
   *   2. Resuelve el plugin del slug denormalizado.
   *   3. Llama wrapper `getServiceInfoWithCache` (cache Redis + audit
   *      `service.metrics_fetched` en cache miss).
   *   4. Si plugin no registrado â†’ status 'unknown' con statusReason
   *      explÃ­cito (no rompe UI).
   */
  async getInfoForUser(
    serviceId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<{
    service: {
      id: string;
      user_id: string;
      status: string;
      provisioner_slug: string | null;
      product_slug: string;
      product_name: string;
      product_type: string;
      created_at: Date;
    };
    info: ServiceInfo;
  }> {
    const service = await this.loadServiceForView(serviceId);
    if (!isAdmin && service.user_id !== userId) {
      throw new ForbiddenException('No tienes acceso a este servicio.');
    }

    const summary = {
      id: service.id,
      user_id: service.user_id,
      status: String(service.status),
      provisioner_slug: service.provisioner_slug,
      product_slug: service.product.slug,
      product_name: service.product.name,
      product_type: service.product.type,
      created_at: service.created_at,
    };

    const pluginSlug = service.provisioner_slug ?? service.product.provisioner;
    const plugin = this.registry.get(pluginSlug);
    if (!plugin) {
      this.logger.warn(
        `getServiceInfo for service=${service.id}: plugin "${pluginSlug}" not registered. Returning 'unknown' fallback.`,
      );
      return {
        service: summary,
        info: this.buildPluginNotRegisteredFallback(service),
      };
    }

    const ttlSeconds = await this.resolveServiceInfoTtl();
    const info = await getServiceInfoWithCache(
      plugin,
      service,
      this.cache,
      this.events,
      { ttlSeconds },
      this.breakers,
    );

    return { service: summary, info };
  }

  // â”€â”€â”€ SSO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getSsoForUser(
    serviceId: string,
    userId: string,
    isAdmin: boolean,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<SsoUrl | null> {
    const service = await this.loadServiceForView(serviceId);
    if (!isAdmin && service.user_id !== userId) {
      throw new ForbiddenException('No tienes acceso a este servicio.');
    }

    const pluginSlug = service.provisioner_slug ?? service.product.provisioner;
    const plugin = this.registry.getOrThrow(pluginSlug);

    return getSsoUrlWithAudit(
      plugin,
      service,
      {
        actorUserId: userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
      },
      this.events,
      this.audit,
    );
  }

  // â”€â”€â”€ Acciones inline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async executeActionForUser(
    serviceId: string,
    actionSlug: string,
    payload: Record<string, unknown>,
    userId: string,
    isAdmin: boolean,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<ActionResult> {
    const service = await this.loadServiceForView(serviceId);
    if (!isAdmin && service.user_id !== userId) {
      throw new ForbiddenException('No tienes acceso a este servicio.');
    }

    const pluginSlug = service.provisioner_slug ?? service.product.provisioner;
    const plugin = this.registry.getOrThrow(pluginSlug);

    return executeActionWithCacheInvalidation(
      plugin,
      service,
      actionSlug,
      payload,
      {
        actorUserId: userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
      },
      this.cache,
      this.events,
      this.audit,
      this.breakers,
    );
  }

  // ─── DNS records (Sprint 15C Fase 15C.D — ADR-082 §6) ──────────────────

  /**
   * Lista los DNS records de la zona del service. Routea al plugin con
   * `has_dns_management=true` resuelto via `dns-authority-resolver`.
   */
  async listDnsRecordsForUser(
    serviceId: string,
    userId: string,
    isAdmin: boolean,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<{ resolution: DnsAuthorityResolution; result: ActionResult }> {
    const { service, resolution } = await this.loadServiceAndResolveDnsPlugin(
      serviceId,
      userId,
      isAdmin,
    );

    const result = await executeActionWithCacheInvalidation(
      resolution.plugin!,
      service,
      'list_dns_records',
      {},
      {
        actorUserId: userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
      },
      this.cache,
      this.events,
      this.audit,
      this.breakers,
    );
    return { resolution, result };
  }

  async addDnsRecordForUser(
    serviceId: string,
    payload: Record<string, unknown>,
    userId: string,
    isAdmin: boolean,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<{ resolution: DnsAuthorityResolution; result: ActionResult }> {
    const { service, resolution } = await this.loadServiceAndResolveDnsPlugin(
      serviceId,
      userId,
      isAdmin,
    );

    const result = await executeActionWithCacheInvalidation(
      resolution.plugin!,
      service,
      'add_dns_record',
      payload,
      {
        actorUserId: userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
      },
      this.cache,
      this.events,
      this.audit,
      this.breakers,
    );
    return { resolution, result };
  }

  async updateDnsRecordForUser(
    serviceId: string,
    recordId: string,
    payload: Record<string, unknown>,
    userId: string,
    isAdmin: boolean,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<{ resolution: DnsAuthorityResolution; result: ActionResult }> {
    const { service, resolution } = await this.loadServiceAndResolveDnsPlugin(
      serviceId,
      userId,
      isAdmin,
    );

    const result = await executeActionWithCacheInvalidation(
      resolution.plugin!,
      service,
      'update_dns_record',
      { ...payload, recordId },
      {
        actorUserId: userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
      },
      this.cache,
      this.events,
      this.audit,
      this.breakers,
    );
    return { resolution, result };
  }

  async deleteDnsRecordForUser(
    serviceId: string,
    recordId: string,
    userId: string,
    isAdmin: boolean,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<{ resolution: DnsAuthorityResolution; result: ActionResult }> {
    const { service, resolution } = await this.loadServiceAndResolveDnsPlugin(
      serviceId,
      userId,
      isAdmin,
    );

    const result = await executeActionWithCacheInvalidation(
      resolution.plugin!,
      service,
      'delete_dns_record',
      { recordId },
      {
        actorUserId: userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
      },
      this.cache,
      this.events,
      this.audit,
      this.breakers,
    );
    return { resolution, result };
  }

  /**
   * Pipeline canónico para los 4 endpoints DNS:
   *   load service + ownership + resolve DNS authority + verify plugin.
   *
   * Lanza:
   *   - NotFoundException(404) si service no existe (loadServiceForView).
   *   - ForbiddenException(403) si cliente accede a service ajeno.
   *   - DnsExternallyManagedError si la zona no está en plugin Aelium —
   *     la capa REST la traduce a HTTP 404 con shape canónico
   *     `{ code: 'DNS_MANAGED_EXTERNALLY' | 'DNS_NO_AUTHORITY_PLUGIN', ... }`.
   */
  private async loadServiceAndResolveDnsPlugin(
    serviceId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<{
    service: ServiceWithRelations;
    resolution: DnsAuthorityResolution;
  }> {
    const service = await this.loadServiceForView(serviceId);
    if (!isAdmin && service.user_id !== userId) {
      throw new ForbiddenException('No tienes acceso a este servicio.');
    }

    const defaultNs = await this.settings.getJson<readonly string[]>(
      'provisioning',
      'default_nameservers',
      ['ns1.aelium.net', 'ns2.aelium.net'],
    );
    const resolution = resolveDnsAuthority(
      service,
      this.registry,
      Array.isArray(defaultNs) ? defaultNs : [],
    );

    if (resolution.authority === 'external' || !resolution.plugin) {
      throw new DnsExternallyManagedError(resolution);
    }
    return { service, resolution };
  }

  // â”€â”€â”€ Admin: reprovision â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Re-encola provisioning para un service. Ãštil cuando un plugin fallÃ³
   * con error retriable y el admin reintenta tras corregir credenciales,
   * o tras aÃ±adir el plugin que faltaba.
   */
  async reprovisionAsAdmin(
    serviceId: string,
    actorUserId: string,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<{ enqueued: true }> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, user_id: true, status: true },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    await this.orchestrator.enqueueProvisioning(serviceId);

    await this.audit.logChange({
      user_id: actorUserId,
      entity_type: 'Service',
      entity_id: serviceId,
      action: 'service.reprovision_requested',
      changes_before: { status: String(service.status) },
      changes_after: { status: 'provisioning' },
    });
    await this.audit.logAccess({
      user_id: actorUserId,
      action: 'service_reprovision_admin',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent ?? null,
      resource: 'Service',
      metadata: { resource_id: serviceId, target_user_id: service.user_id },
    });

    return { enqueued: true };
  }

  // â”€â”€â”€ Admin: deprovision â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * CancelaciÃ³n administrativa: marca el service como `cancelled` con
   * cancellation_reason explÃ­cita y emite `service.cancelled` para que
   * los listeners cross-mÃ³dulo (support-inside slot release, futuros
   * plugins reales que liberan recursos) reaccionen.
   *
   * El plugin.deprovision() real se delegarÃ¡ a Sprint 15 (plugins reales);
   * los plugins triviales `internal`/`manual` son no-op.
   */
  async deprovisionAsAdmin(
    serviceId: string,
    dto: DeprovisionDto,
    actorUserId: string,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<{ id: string; status: string; cancellation_reason: string }> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, user_id: true, status: true, provisioner_slug: true },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    const reasonText = dto.notes ? `${dto.reason}: ${dto.notes}` : dto.reason;

    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        status: 'cancelled',
        cancelled_at: new Date(),
        cancellation_reason: reasonText,
      },
      select: { id: true, status: true, cancellation_reason: true },
    });

    this.events.emit('service.cancelled', {
      service_id: serviceId,
      user_id: service.user_id,
      provisioner_slug: service.provisioner_slug,
      reason: dto.reason,
      actor_user_id: actorUserId,
    });

    await this.audit.logChange({
      user_id: actorUserId,
      entity_type: 'Service',
      entity_id: serviceId,
      action: 'service.deprovisioned_admin',
      changes_before: { status: String(service.status) },
      changes_after: {
        status: 'cancelled',
        cancellation_reason: reasonText,
        reason_code: dto.reason,
      },
    });
    await this.audit.logAccess({
      user_id: actorUserId,
      action: 'service_deprovision_admin',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent ?? null,
      resource: 'Service',
      metadata: {
        resource_id: serviceId,
        target_user_id: service.user_id,
        reason_code: dto.reason,
      },
    });

    return {
      id: updated.id,
      status: String(updated.status),
      cancellation_reason: updated.cancellation_reason ?? reasonText,
    };
  }

  // â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private serviceSummarySelect() {
    return {
      id: true,
      user_id: true,
      status: true,
      label: true,
      domain: true,
      provisioner_slug: true,
      provider_reference: true,
      created_at: true,
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          provisioner: true,
        },
      },
    } satisfies Prisma.ServiceSelect;
  }

  private adminServiceSummarySelect() {
    return {
      ...this.serviceSummarySelect(),
      cancelled_at: true,
      cancellation_reason: true,
    } satisfies Prisma.ServiceSelect;
  }

  private async loadServiceForView(
    serviceId: string,
  ): Promise<ServiceWithRelations> {
    const row = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
            provisioner: true,
            provisioner_config: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: row.user_id },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        language: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Usuario del servicio no encontrado.');
    }

    return {
      ...row,
      client: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: null,
        phone: null,
        locale: user.language ?? null,
        country_code: null,
      },
      product: {
        id: row.product.id,
        slug: row.product.slug,
        name: row.product.name,
        type: String(row.product.type),
        provisioner: row.product.provisioner,
        provisioner_config:
          (row.product.provisioner_config as Record<string, unknown>) ?? null,
      },
    } as ServiceWithRelations;
  }

  private buildPluginNotRegisteredFallback(
    service: ServiceWithRelations,
  ): ServiceInfo {
    return {
      status: 'unknown',
      statusReason: 'Plugin no registrado',
      display: {
        primary: service.label ?? service.domain ?? service.product.name,
        secondary: service.product.name,
      },
      capabilities: {
        has_sso_panel: false,
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: false,
        supports_reconciliation: false,
        has_dns_management: false, // ADR-077 Amendment A1
        hasSsoPanel: false,
        inlineActions: [],
      },
      availableActions: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  private async resolveServiceInfoTtl(): Promise<number> {
    try {
      const ttl = await this.settings.getNumber(
        'provisioning',
        'service_info_ttl_seconds',
        60,
      );
      if (Number.isFinite(ttl) && ttl > 0) return ttl;
    } catch (err) {
      this.logger.warn(
        `Failed to read provisioning.service_info_ttl_seconds setting: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return 60;
  }
}
