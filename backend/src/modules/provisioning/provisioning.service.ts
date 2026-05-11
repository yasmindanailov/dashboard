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
    options?: { forceRevalidate?: boolean },
  ): Promise<{
    service: {
      id: string;
      user_id: string;
      status: string;
      provisioner_slug: string | null;
      // Sprint 15C.II Fase C round 2 (smoke real Yasmin 2026-05-10): el
      // wrapper canónico provisioning resuelve el plugin con
      // `service.provisioner_slug ?? service.product.provisioner` (línea
      // 247 abajo). Cuando un service no tiene provisioner_slug propio
      // (típicamente porque el pipeline provisioning no llegó a marcarlo
      // — caso `not_yet_provisioned`), el plugin del producto SÍ se invoca
      // y devuelve `info`. La UI admin mostraba "Plugin (provisioner): —"
      // para esos casos — información engañosa: el plugin SÍ está actuando.
      // Este campo expone explícitamente el plugin del producto para que
      // la UI muestre el "effective slug" (con anotación visual "desde
      // producto" cuando difiere del service slug). Cliente no lo usa.
      product_provisioner: string;
      product_slug: string;
      product_name: string;
      product_type: string;
      created_at: Date;
      // Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10):
      // exponer datos canónicos de cancelación al frontend para que la UI
      // pueda renderizar el banner terminal "Servicio cancelado · {razón}"
      // en lugar del banner drift (que es semánticamente FALSO sobre un
      // service terminal — el service NO es un drift, es un estado
      // operativo final). Smoke real reveló bug crítico: service
      // `cancelled` por `provisioning_failed:INVALID_PAYLOAD` mostraba
      // AlertBanner "no aprovisionado en proveedor" + botón Re-aprovisionar
      // que producía loop infinito (cancelled → reprovisionar → INVALID
      // PAYLOAD → cancelled).
      cancellation_reason: string | null;
      cancelled_at: Date | null;
      // Sprint 15C.II Fase C round 7 (smoke real Yasmin 2026-05-10):
      // Datos canónicos del cliente (nombre + email) para que la UI
      // admin muestre info legible en lugar de UUIDs crudos. Estándar
      // industria Stripe/Vercel admin: info primaria visible, UUIDs
      // secundarios con copy-to-clipboard. El email solo lo expone al
      // admin (cliente accede a su propia página /dashboard/services/[id]
      // donde su email es trivialmente conocido). El frontend SC chequea
      // `isAdmin` antes de renderizar estos campos.
      client_name: string;
      client_email: string;
      // Sprint 15C.II Fase C round 7: domain del service (puede ser
      // null para products no-hosting tipo support_inside). Cuando
      // presente, la UI lo muestra como identificador primario del
      // service (ADR-082 DH-INV-2 — hosting service SIEMPRE tiene FQDN).
      domain: string | null;
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
      product_provisioner: service.product.provisioner,
      product_slug: service.product.slug,
      product_name: service.product.name,
      product_type: service.product.type,
      created_at: service.created_at,
      cancellation_reason: service.cancellation_reason,
      cancelled_at: service.cancelled_at,
      // Sprint 15C.II Fase C round 7: client info + domain canónicos.
      // buildClientDisplayName prioriza company_name > "first_name
      // last_name" > email (consistente con buildDisplayName del plugin
      // Enhance CP). client.first_name + last_name vienen de
      // loadServiceForView (no incluyen company_name — los services
      // del MVP no tienen company_name asociado en User; se añadirá en
      // Sprint futuro de Clients refactor).
      client_name: buildClientDisplayName(service.client),
      client_email: service.client.email,
      domain: service.domain,
    };

    // Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10):
    // shortcircuit canónico para estados terminales. Si `service.status`
    // es `cancelled` o `terminated`, NO invocamos al plugin — el service
    // ya no opera contra el proveedor (la cola provisioning incluso
    // skipea jobs sobre status terminal:
    // `provisioning-orchestrator.service.ts:144`). Llamar al plugin sería
    // semánticamente incorrecto y daría falsos positivos de drift (el
    // plugin retornaría `unknown/not_yet_provisioned` por metadata
    // perdida en deprovision o provision fail, y la UI mostraría
    // AlertBanner drift sobre un service que ya está terminal — bug
    // que reportó Yasmin smoke real).
    //
    // El shortcircuit retorna `info.status='cancelled'` (o 'terminated')
    // canónico con `statusReason` traducible derivada del
    // `cancellation_reason` técnico (audit trace). El frontend renderiza
    // un banner danger explícito + oculta acciones futiles (SSO,
    // operaciones admin, reprovision). Heredable a 15D RC, 15E Docker,
    // 15G Plesk: cualquier service cancelled aplica el mismo patrón.
    const TERMINAL_STATUSES = new Set(['cancelled', 'terminated']);
    if (TERMINAL_STATUSES.has(String(service.status))) {
      return {
        service: summary,
        info: this.buildTerminalServiceFallback(service),
      };
    }

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
    // Sprint 15C.II Fase B (ADR-083 Amendment A4.1): si options.forceRevalidate=true,
    // el wrapper salta el cache Redis 60s y re-fetch fresco del proveedor.
    // Caso canónico: botón "↻ Refrescar" en `MetricsBar.tsx` → server action
    // `refreshServiceInfoAction` → endpoint POST /:id/refresh (este service
    // method con forceRevalidate=true).
    const info = await getServiceInfoWithCache(
      plugin,
      service,
      this.cache,
      this.events,
      { ttlSeconds, forceRevalidate: options?.forceRevalidate === true },
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
  ): Promise<{ sso: SsoUrl | null; errorCode: string | null }> {
    const service = await this.loadServiceForView(serviceId);
    if (!isAdmin && service.user_id !== userId) {
      throw new ForbiddenException('No tienes acceso a este servicio.');
    }

    const pluginSlug = service.provisioner_slug ?? service.product.provisioner;
    const plugin = this.registry.getOrThrow(pluginSlug);

    // Sprint 15C.II Fase C round 5: shape canónico GetSsoUrlResult
    // distingue null legítimo (caso "no aplica") de errorCode (drift
    // detectable — la UI puede dar mensaje útil al admin).
    return getSsoUrlWithAudit(
      plugin,
      service,
      {
        actorUserId: userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
        actorIsAdmin: isAdmin, // Sprint 15C Fase 15C.E — ADR-077 Amendment A3
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
        actorIsAdmin: isAdmin, // Sprint 15C Fase 15C.E — ADR-077 Amendment A3
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
        actorIsAdmin: isAdmin, // Sprint 15C Fase 15C.E — ADR-077 Amendment A3
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
        actorIsAdmin: isAdmin, // Sprint 15C Fase 15C.E — ADR-077 Amendment A3
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
        actorIsAdmin: isAdmin, // Sprint 15C Fase 15C.E — ADR-077 Amendment A3
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
        actorIsAdmin: isAdmin, // Sprint 15C Fase 15C.E — ADR-077 Amendment A3
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

    // Sprint 15C.II Fase C round 2 (smoke real Yasmin 2026-05-10): reset
    // canónico `status -> provisioning` antes del enqueue. Sin esto, el
    // worker `provisionService` aplica la guard idempotente
    // (`provisioning-orchestrator.service.ts:151`) y skipea silently
    // cualquier service con `status='active'`. Caso canónico que reveló
    // el bug: drift `not_yet_provisioned` (plugin reporta unknown sin
    // refs externas) sobre service que vive en Aelium con status canónico
    // `active`. El admin pulsa "Re-aprovisionar ahora" → enqueue OK pero
    // worker skip → cero efecto operativo + cero feedback al admin.
    //
    // Patrón industria (Plesk admin "Reset & re-provision", cPanel WHM
    // "Force re-provisioning", ResellerClub admin force-reprovision):
    // el botón admin admin de re-aprovisión es una **operación deliberada
    // del operador** que reinicia el ciclo provisioning aunque el state
    // sea active — el operador asume responsabilidad. La guard idempotente
    // sigue siendo correcta para el flujo automático
    // `invoice.paid → enqueueProvisioning` (evita duplicar provisión).
    //
    // Coherente con DH-INV-6 (ADR-082): NO modificamos status
    // automáticamente desde un cron o listener, solo desde una acción
    // explícita del admin que firma audit `service.reprovision_requested`.
    await this.prisma.service.update({
      where: { id: serviceId },
      data: { status: 'provisioning' },
    });

    // Sprint 15C.II Fase C round 3 (smoke real Yasmin 2026-05-10):
    // invalidar cache `service_info:${id}` ANTES del enqueue. El job
    // corre async (segundos), y mientras tanto la UI admin re-fetch
    // (revalidatePath del SC + auto-refresh frontend tras 5s). Sin
    // esta invalidación, la UI seguiría leyendo cached
    // `not_yet_provisioned` aunque el status DB ya hubiera cambiado.
    // El orquestador re-invalida tras provision OK/failure (defense
    // in depth — la cache se mantiene fresca en cada hito).
    await this.cache.invalidate(serviceId);

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

    // Sprint 15C.II Fase E: `notify_client` (default true) controla si el
    // listener `notifications-on-service-cancelled` despacha el email +
    // campana al cliente. El listener consume este flag del payload.
    const notifyClient = dto.notify_client !== false;
    this.events.emit('service.cancelled', {
      service_id: serviceId,
      user_id: service.user_id,
      provisioner_slug: service.provisioner_slug,
      reason: dto.reason,
      actor_user_id: actorUserId,
      notify_client: notifyClient,
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
        notify_client: notifyClient,
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
      // Sprint 15C.II Fase B fix-up: statusReason como i18n key. El frontend
      // ServiceHeader aplica t() — fallback a la key cruda si translator no
      // tiene la entrada (compat retro).
      statusReason: 'service.status_reason.plugin_not_registered',
      // Sprint 15C.II Fase E — ADR-077 Amendment A5: plugin no registrado
      // (disabled / desinstalado). NO es re-aprovisionable hasta que el admin
      // re-instale el plugin — la UI no ofrece CTA accionable.
      recoveryHint: 'contact_support',
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

  /**
   * Sprint 15C.II Fase C round 4 (UI_SPEC §4.13 + ADR-082 DH-INV-6) —
   * shortcircuit canónico para services en estado terminal (`cancelled`,
   * `terminated`). NO se invoca al plugin (cualquier respuesta del plugin
   * sería falsa info sobre un service que ya no opera) — retornamos
   * directamente `info.status` canónico, capabilities sin acciones, y
   * el `statusReason` derivado del `service.cancellation_reason` para
   * transparencia del audit trail.
   *
   * Heredable a todos los plugins SaaS: 15D RC, 15E Docker, 15G Plesk
   * pueden tener services cancelled por las mismas 3 rutas (admin
   * deprovision / provision fail permanente / drift+admin decisión).
   * Patrón canónico = NO renderizar drift UX sobre estado terminal.
   */
  private buildTerminalServiceFallback(
    service: ServiceWithRelations,
  ): ServiceInfo {
    // ServiceInfo.status no incluye 'terminated' (solo 'cancelled' como
    // estado terminal del set canónico ADR-070). Ambos service.status
    // terminales colapsan a `info.status='cancelled'` para la UI — el
    // service.status canónico (terminated vs cancelled) sigue disponible
    // en `summary.status` para diferenciar si un plugin futuro lo necesita.
    return {
      status: 'cancelled',
      // El frontend traduce con `t()` — fallback a la key cruda si no
      // declarada (compat retro). Las keys son universales (no plugin-
      // específicas) porque el patrón es canónico cross-plugin.
      statusReason: this.buildTerminalStatusReasonKey(service),
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
        has_dns_management: false,
        hasSsoPanel: false,
        inlineActions: [],
      },
      availableActions: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Mapea `service.cancellation_reason` (text libre histórico — viene de
   * `provisioning_failed:CODE`, razones admin, etc.) a una i18n key
   * canónica frontend. Si no matchea ningún patrón conocido, devuelve la
   * key generic `service.terminal.cancelled.reason.unknown`. El frontend
   * decide si mostrar también el reason crudo (admin) vs solo el
   * mensaje generic empático (cliente — UI_SPEC §1.2 P5 voz Aelium).
   */
  private buildTerminalStatusReasonKey(service: ServiceWithRelations): string {
    const reason = service.cancellation_reason ?? '';
    if (reason.startsWith('provisioning_failed:')) {
      return 'service.terminal.cancelled.reason.provisioning_failed';
    }
    if (reason.length === 0) {
      return 'service.terminal.cancelled.reason.unknown';
    }
    return 'service.terminal.cancelled.reason.admin_action';
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

/**
 * Sprint 15C.II Fase C round 7 (smoke real Yasmin 2026-05-10) — helper
 * file-private para nombre legible del cliente, equivalente al
 * `buildDisplayName` del plugin Enhance CP (espejo en
 * `enhance.plugin.ts:1013`). Prioridad: company_name > "first_name
 * last_name" > email. Reutilizable por cualquier shape que exponga
 * datos del cliente al admin (UI_SPEC: info legible primero, IDs
 * secundarios). El refactor que centralice esto en `core/clients/`
 * vendrá en Sprint futuro de Clients (no scope Sprint 15C).
 */
function buildClientDisplayName(
  client: ServiceWithRelations['client'],
): string {
  if (client.company_name && client.company_name.trim().length > 0) {
    return client.company_name.trim();
  }
  const parts = [client.first_name, client.last_name]
    .filter((p): p is string => Boolean(p && p.trim().length > 0))
    .map((p) => p.trim());
  if (parts.length > 0) return parts.join(' ');
  return client.email;
}
