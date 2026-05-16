import {
  BadRequestException,
  ConflictException,
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
  filterActionsByStatus,
  getServiceInfoWithCache,
  getSsoUrlWithAudit,
} from '../../core/provisioning/plugin-utils';
import {
  ActionResult,
  ProvisionerPlugin,
  ServiceInfo,
  ServiceWithRelations,
  SsoUrl,
  SuspensionReason,
} from '../../core/provisioning/types';
import { AuditService } from '../audit/audit.service';
import { ClientNotesService } from '../clients/client-notes.service';

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
  SuspendServiceDto,
  SuspensionReasonDto,
  UnsuspendServiceDto,
} from './dto/provisioning.dto';
import { ProvisioningOrchestratorService } from './provisioning-orchestrator.service';

/**
 * Sprint 15C.II Fase F.3 (B.1) — ventana (segundos) del cooldown server-side
 * del force-refresh manual de `service_info` por servicio. El `MetricsRefreshButton`
 * del frontend ya impone 10s de cooldown visible; éste es el guardado
 * server-side (el endpoint `POST /:id/refresh` es martilleable directamente),
 * ligeramente más conservador que el del cliente. Dentro de la ventana el
 * refresh degrada a una lectura cacheada normal (coalescing), no a un error.
 * Constante por ahora (no setting): cambiar el valor sería un follow-up trivial.
 */
const REFRESH_COOLDOWN_SECONDS = 15;

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
    // Sprint 15C.II F.6: las transiciones admin (suspend/unsuspend/deprovision)
    // crean un `ClientNote` direct-call dentro de la `$transaction` del cambio
    // de status (R3 §A.11.10.3.2 — ambas ops o ninguna).
    private readonly clientNotes: ClientNotesService,
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
      // Sprint 15C.II Fase F (ADR-077 Amendment A4): datos canónicos de
      // suspensión para el banner amarillo "Servicio suspendido" del frontend.
      // `suspension_reason` es la cadena combinada `"<reason>"` o
      // `"<reason>: <internal_note>"` (mismo patrón que `cancellation_reason`)
      // — el frontend cliente solo renderiza la parte `<reason>` (etiqueta
      // localizada); el admin ve la cadena completa.
      suspended_at: Date | null;
      suspension_reason: string | null;
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
      // Sprint 15C.II Fase F.4.1 — desincronización del estado de
      // suspensión entre `services.status` (autoritativo para el lifecycle
      // *administrativo*, decisión de Aelium) y el estado *operacional* que
      // reporta el plugin/proveedor (DH-INV-6 — dimensión distinta). `true`
      // cuando uno dice "suspended" y el otro no. Vive en este summary
      // (contrato frontend), NO en `ServiceInfo` (contrato plugin) — es una
      // observación del orquestador, no algo que el plugin puede conocer.
      // La UI admin lo usa para avisar y ofrecer el botón "Realinear estado
      // del proveedor con Aelium" (`POST /admin/services/:id/resync-provider-state`).
      provider_state_desync: boolean;
      // Sprint 15C.II Fase F.8 — umbral de alerta de cuota de disco que el
      // frontend usa para colorear la barra de almacenamiento (ámbar al
      // ≥threshold, rojo ≥95% hardcoded). Patrón paralelo a
      // `provider_state_desync`: vive en el summary (contrato frontend), NO
      // en `ServiceInfo` (contrato plugin) — el plugin no necesita conocer
      // este setting de UX. Lo poblamos leyendo `plugin_installs.config
      // .quota_alert_threshold_pct` cuando el plugin declara `has_metrics`;
      // `null` cuando el plugin no es relevante o el admin no editó el
      // setting (frontend cae al comportamiento legacy sin coloreo —
      // capability-driven, heredable).
      quota_alert_threshold_pct: number | null;
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
      // Sprint 15C.II Fase F (ADR-077 Amendment A4): suspensión canónica.
      suspended_at: service.suspended_at,
      suspension_reason: service.suspension_reason,
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
      // Sprint 15C.II Fase F.4.1: se recalcula abajo (solo en el path normal,
      // tras consultar al plugin). En los shortcircuits — terminal /
      // plugin-no-registrado — no hay estado de proveedor con el que
      // comparar, así que queda `false`.
      provider_state_desync: false,
      // Sprint 15C.II Fase F.8: se pobla abajo en el path normal (tras
      // resolver el plugin, si declara `has_metrics`). En shortcircuits
      // terminales el `MetricsBar` no se renderiza — queda `null`.
      quota_alert_threshold_pct: null as number | null,
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

    // Sprint 15C.II Fase F.8 — populamos el threshold del install si el
    // plugin declara `has_metrics`. Patrón paralelo a `provider_state_desync`:
    // capa orquestador, no toca contrato del plugin. Heredable a cualquier
    // plugin futuro con `has_metrics` (15E Docker / 15G Plesk).
    if (plugin.capabilities.has_metrics) {
      summary.quota_alert_threshold_pct =
        await this.loadQuotaAlertThresholdFromInstall(pluginSlug);
    }

    const ttlSeconds = await this.resolveServiceInfoTtl(plugin);

    // Sprint 15C.II Fase B (ADR-083 Amendment A4.1): si options.forceRevalidate,
    // el wrapper salta el cache `service_info` y re-fetch fresco del proveedor.
    // Caso canónico: botón "↻ Refrescar" en `MetricsBar.tsx` → server action
    // `refreshServiceInfoAction` → endpoint POST /:id/refresh (este método con
    // `forceRevalidate=true`).
    //
    // Sprint 15C.II Fase F.3 (B.1) — cooldown server-side per-servicio: el
    // cooldown de 10s de `MetricsRefreshButton` es solo cliente; el endpoint
    // es martilleable directamente y el TTL del cache mitiga el *coste* (sirve
    // cacheado) pero no el *abuso* (N clientes distintos forzando refresh del
    // mismo servicio = N llamadas al proveedor). Adquirimos una ventana Redis
    // `SET NX EX` por servicio; si ya hay una activa, degradamos a una lectura
    // cacheada normal (coalescing — el usuario recibe el valor actual, ≤
    // REFRESH_COOLDOWN_SECONDS de antigüedad cuando el cache está caliente, sin
    // tocar al proveedor y sin error). Cuando el cache está frío el wrapper hace
    // un fetch igualmente (cache miss → fetch), que es lo correcto: quieres
    // datos cuando no hay ninguno. Cliente y admin comparten la misma ventana
    // (es "cuántas veces se re-consulta al proveedor por servicio", no "por
    // usuario") — un admin depurando tampoco gana martilleando: orchd responde
    // <5s y el cache retiene `ttlSeconds`.
    let forceRevalidate = options?.forceRevalidate === true;
    if (forceRevalidate) {
      const acquired = await this.cache.tryAcquireRefreshCooldown(
        service.id,
        REFRESH_COOLDOWN_SECONDS,
      );
      if (!acquired) {
        forceRevalidate = false;
        this.logger.debug(
          `Refresh for service ${service.id} within ${REFRESH_COOLDOWN_SECONDS}s cooldown window — serving cached value`,
        );
      }
    }

    let info = await getServiceInfoWithCache(
      plugin,
      service,
      this.cache,
      this.events,
      { ttlSeconds, forceRevalidate },
      this.breakers,
    );

    // ─── Sprint 15C.II Fase F.4.1 — reconciliación del status administrativo ──
    //
    // `services.status` es **autoritativo** para el lifecycle *administrativo*
    // (suspended / cancelled — decisión de Aelium sobre si el cliente puede
    // operar el servicio). DH-INV-6 (ADR-082 — "el proveedor gana en
    // conflicto") aplica al estado *operacional* (plan, refs, métricas, drift):
    // son dimensiones distintas. El plugin deriva `info.status` de lo que ve en
    // el proveedor (`mapSubscriptionStatus`). Si Aelium tiene el servicio
    // `suspended` pero el proveedor reporta `active` (típico: el flujo F.1 a
    // medio terminar, el `MockEnhanceServer` in-memory reiniciado, el cron de
    // billing, o un cambio directo en el panel de Enhance) la UI mostraba el
    // banner amarillo de suspensión PERO sin el botón "Reanudar" (el plugin
    // no devolvía `unsuspend_service` en `availableActions` porque cree que
    // está activo) → estado roto sin salida. El desync inverso (BD `active`,
    // proveedor `suspended`) mostraba "Reanudar" que devolvía
    // `409 SERVICE_NOT_SUSPENDED`.
    //
    // Esta capa del orquestador (heredable a TODOS los plugins, sin que cada
    // uno lo implemente):
    //   1. Detecta el desfase de la dimensión de suspensión y lo expone en
    //      `summary.provider_state_desync` (contrato frontend — NO en
    //      `ServiceInfo`, que es contrato del plugin; el plugin no puede
    //      conocer este desfase, solo ve su lado).
    //   2. Re-deriva `availableActions` desde `services.status` (el estado
    //      administrativo): los botones siempre coinciden con lo que aceptan
    //      los guards de `suspendAsAdmin`/`unsuspendAsAdmin` — y, además, es
    //      auto-curativo (clicar "Suspender" sobre un servicio que el proveedor
    //      ya tiene suspendido es idempotente; clicar "Reanudar" sobre uno que
    //      Aelium tiene suspendido aplica el `unsuspend_service` que realinea
    //      el proveedor).
    //   3. Cuando Aelium lo tiene `suspended`, fuerza `info.status='suspended'`
    //      para que el banner cliente + el header + el badge sean coherentes
    //      (también si el proveedor reporta `active`/`cancelled`/`expired` por
    //      una desincronización — el aviso de desync admin lo explica). NO baja
    //      `info.status` cuando Aelium lo tiene `active` y el proveedor reporta
    //      algo MÁS restrictivo (`suspended`/`cancelled`/`expired`): el cliente
    //      realmente no puede usar el servicio ahora mismo — no lo ocultamos;
    //      dejamos el estado del proveedor visible y el admin lo resuelve
    //      (con "Realinear" si es suspensión; re-aprovisionar / cancelar
    //      formalmente si el proveedor lo da por eliminado).
    //
    // El override de `info.status='suspended'` (cuando `services.status` lo
    // está) y la re-derivación de `availableActions` aplican a **todos** los
    // plugins (no solo los `supports_suspend`): un servicio `internal`/`manual`
    // suspendido por impago (cron de billing — Fase F.5) debe verse suspendido
    // por el cliente igual que uno de un plugin que sí lo modela. El **flag**
    // `provider_state_desync`, en cambio, solo tiene sentido para plugins que
    // modelan la suspensión (los demás no tienen "estado de proveedor" con el
    // que estar en sync). Y todo esto solo cuando el proveedor está *accesible*
    // (`info.status ∉ {unknown, failed}`): si está caído / circuit open no
    // tocamos nada — el admin ve el `AdminDriftBanner` de "proveedor
    // inaccesible". NO se hace shortcircuit del plugin (a un servicio
    // suspendido sí le pedimos `getServiceInfo` — queremos las métricas). Caso
    // real que motivó cubrir también `cancelled`/`expired`: el
    // `MockEnhanceServer` in-memory reiniciado tras una suspensión deja la
    // suscripción reportando `deleted` (→ `info.status='cancelled'`) mientras
    // `services.status` sigue `suspended`.
    {
      const adminStatus = String(service.status);
      const providerStatus = info.status; // antes de cualquier override
      const providerReachable =
        providerStatus !== 'unknown' && providerStatus !== 'failed';
      if (
        providerReachable &&
        (adminStatus === 'active' || adminStatus === 'suspended') &&
        providerStatus !== adminStatus
      ) {
        if (adminStatus === 'suspended') {
          // Aelium manda: la UI muestra `suspended` (banner cliente + header +
          // badge coherentes) y `availableActions` se re-deriva del estado
          // administrativo (incluye `unsuspend_service` si el plugin lo modela).
          const reconciledActions = filterActionsByStatus(
            plugin.inlineActions,
            'suspended',
          );
          info = {
            ...info,
            status: 'suspended',
            availableActions: reconciledActions,
            capabilities: {
              ...info.capabilities,
              inlineActions: reconciledActions,
            },
          };
        } else {
          // `adminStatus === 'active'`: NO bajamos `info.status` a `active`
          // (el cliente no puede usar el servicio si el proveedor lo bloqueó /
          // eliminó). Re-derivamos `availableActions` del estado administrativo
          // (`active`) para que los botones coincidan con lo que aceptan los
          // guards — y es auto-curativo (clicar "Suspender" re-suspende en el
          // proveedor de forma idempotente).
          const reconciledActions = filterActionsByStatus(
            plugin.inlineActions,
            'active',
          );
          info = {
            ...info,
            availableActions: reconciledActions,
            capabilities: {
              ...info.capabilities,
              inlineActions: reconciledActions,
            },
          };
        }
        if (plugin.capabilities.supports_suspend) {
          summary.provider_state_desync = true;
        }
      }
    }

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
    // Sprint 15C.II Fase F — ADR-077 Amendment A4: `suspend_service` /
    // `unsuspend_service` NO se invocan por el endpoint genérico de acciones
    // inline (`POST /services/:id/actions/:slug`) — transicionan
    // `services.status` y requieren el motivo canónico del `SuspendServiceDto`.
    // El camino sancionado es `POST /admin/services/:id/suspend|unsuspend` →
    // `suspendAsAdmin` / `unsuspendAsAdmin` (que sí invocan la inline action
    // internamente vía `executeActionWithCacheInvalidation`). Defense-in-depth:
    // sin esto un admin podría suspender en el proveedor sin transicionar el
    // estado en Aelium (drift que el cron L3 acabaría reconciliando, pero
    // mejor no permitir el medio-estado).
    if (
      actionSlug === 'suspend_service' ||
      actionSlug === 'unsuspend_service'
    ) {
      throw new ForbiddenException({
        code: 'USE_DEDICATED_SUSPEND_ENDPOINT',
        message:
          'Usa POST /admin/services/:id/suspend o /unsuspend para suspender / reactivar un servicio.',
        action_slug: actionSlug,
      });
    }

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
    // Sprint 15C.II F.6 — R2 (dossier §A.11.10.3.2): el path admin/manual
    // exige nota. Hoy `deprovisionAsAdmin` solo se invoca con `actorUserId`
    // string (no hay path sistema — DC.46 auto-cancel lo introduciría en
    // fase aparte). Naming `notes` vs `internal_note` viene heredado de
    // `DeprovisionDto`; alinearlo con `Suspend` está en el backlog
    // post-15C.II — fuera de scope F.6.
    if (!dto.notes?.trim()) {
      throw new BadRequestException({
        code: 'NOTE_REQUIRED',
        message:
          'La nota interna es obligatoria para acciones manuales de lifecycle.',
      });
    }

    // F.6.2: `cancellation_reason` guarda solo el motivo-enum. La narrativa
    // libre vive en `ClientNote.body` — mantiene la separación enum/nota
    // coherente con `suspension_reason` (también F.6.2). El audit_log
    // preserva ambas piezas (defense-in-depth de trazabilidad).
    const reasonText = dto.reason;
    const cancelledAt = new Date();
    const noteBody = dto.notes.trim();
    // R3 (dossier §A.11.10.3.2): `service.update` + `clientNote.create` en
    // la misma transacción Prisma — el plugin call (si lo hubiera) NO está
    // aún implementado para `deprovisionAsAdmin` (sigue siendo solo lado
    // Aelium hoy; `DC.46`/`plugin.deprovision()` está deferido).
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.service.update({
        where: { id: serviceId },
        data: {
          status: 'cancelled',
          cancelled_at: cancelledAt,
          cancellation_reason: reasonText,
        },
        select: { id: true, status: true, cancellation_reason: true },
      });
      await this.clientNotes.createFromServiceLifecycleAction(
        {
          user_id: service.user_id,
          author_id: actorUserId,
          service_id: serviceId,
          triggered_by_action: 'service.cancelled',
          body: noteBody,
        },
        tx,
      );
      return u;
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
        internal_note: noteBody,
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

  // ─── Admin: suspend / unsuspend (Sprint 15C.II Fase F — ADR-077 Amendment A4) ───

  /**
   * Suspende un servicio: lo desactiva en el proveedor **preservando los datos**
   * (distinto de `deprovisionAsAdmin`, que destruye recursos). Pensado para
   * impago temporal, uso indebido en investigación, RGPD art. 18, mantenimiento
   * del cluster. Reversible vía `unsuspendAsAdmin`.
   *
   * Pipeline canónico (espejo del patrón `executeActionForUser` + transición de
   * estado, análogo a `deprovisionAsAdmin`):
   *   1. Carga service + relations (404 si no existe).
   *   2. Guard de estado:
   *      - ya `suspended` → no-op idempotente, retorna `alreadySuspended: true`
   *        (ADR-077 A4.4) sin invocar al plugin, sin evento, sin audit.
   *      - distinto de `active` → 409 (no se suspende un service
   *        pending/provisioning/failed/cancelled/terminated).
   *   3. Resuelve plugin; 409 si no registrado o `!capabilities.supports_suspend`
   *      (defense-in-depth — el frontend ya ramifica por el flag, ADR-070).
   *   4. Invoca la inline action canónica `suspend_service` vía
   *      `executeActionWithCacheInvalidation` (breaker + invalidación cache +
   *      audit `service.action_executed:suspend_service` + evento
   *      `service.action_executed` + enforcement `adminOnly`). 409 si falla.
   *   5. Transición `services.status -> 'suspended'`, `suspended_at = now()`,
   *      `suspension_reason` combinado (`"<reason>"` o `"<reason>: <internal_note>"`,
   *      mismo patrón que `cancellation_reason`).
   *   6. Re-invalida cache `service_info:<id>` (defense-in-depth tras el cambio
   *      de status; el wrapper ya invalidó tras la action).
   *   7. Emite `service.suspended` (consumido por
   *      `notifications-on-service-suspended` → email + campana al cliente si
   *      `notify_client !== false`).
   *   8. Audit `service.suspended` (cambio de estado) + `service_suspend_admin`
   *      (acceso staff con `target_user_id`).
   *
   * Sprint 15C.II Fase F.5 (`DC.44` billing-suspend-unify) — punto único de
   * transición de estado para la suspensión, también desde el cron de impago
   * (`ServiceLifecycleWorker.autoSuspendServices`). `actorUserId` puede ser
   * `null` (actor sistema — sin actor humano): en ese caso `opts.actorLabel`
   * lo identifica en el audit (taxonomía `system:<dominio>-<cron|job>`) y NO se
   * escribe `audit_access_log` (no hay "lectura staff" que registrar — solo el
   * cambio de estado en `audit_change_log`). `opts.allowUnsupported` permite
   * suspender servicios cuyo plugin **no** declara `supports_suspend`
   * (`internal`/`manual`): en ese caso no hay inline action `suspend_service`
   * que invocar — la suspensión es solo del lado de Aelium (BD + evento +
   * audit), igual que hacía el worker antes de F.5 (el cliente la ve igual:
   * `getInfoForUser` fuerza `info.status='suspended'` cuando `services.status`
   * lo está). Para el caso humano (admin vía `POST /admin/services/:id/suspend`)
   * `allowUnsupported` se omite → 409 `SUSPEND_NOT_SUPPORTED` (el frontend ya
   * ramifica por el flag, ADR-070). Heredable a 15E Docker / 15G Plesk.
   */
  async suspendAsAdmin(
    serviceId: string,
    dto: SuspendServiceDto,
    actorUserId: string | null,
    ctx?: { ipAddress?: string; userAgent?: string | null },
    opts?: { actorLabel?: string; allowUnsupported?: boolean },
  ): Promise<{
    id: string;
    status: string;
    suspension_reason: string | null;
    suspended_at: string | null;
    alreadySuspended?: true;
  }> {
    const service = await this.loadServiceForView(serviceId);

    if (String(service.status) === 'suspended') {
      this.logger.log(
        `suspendAsAdmin: service=${serviceId} already suspended — no-op (ADR-077 A4.4 idempotency).`,
      );
      return {
        id: service.id,
        status: 'suspended',
        suspension_reason: service.suspension_reason,
        suspended_at: service.suspended_at
          ? service.suspended_at.toISOString()
          : null,
        alreadySuspended: true,
      };
    }
    if (String(service.status) !== 'active') {
      throw new ConflictException({
        code: 'SERVICE_NOT_SUSPENDABLE',
        message: `Solo se puede suspender un servicio activo (estado actual: ${service.status}).`,
        current_status: String(service.status),
      });
    }
    // Sprint 15C.II F.6 — R2 (dossier §A.11.10.3.2): defense-in-depth de
    // "nota obligatoria para acciones manuales". El frontend ya valida el
    // textarea como `required`; este guard cierra el path bypass con curl.
    // Para actor sistema (`actorUserId === null`, p.ej. cron de billing) la
    // nota es opcional — el caller la compone con contexto canónico
    // (nº de factura, etc.) y la pasa por `dto.internal_note`.
    if (actorUserId !== null && !dto.internal_note?.trim()) {
      throw new BadRequestException({
        code: 'NOTE_REQUIRED',
        message:
          'La nota interna es obligatoria para acciones manuales de lifecycle.',
      });
    }

    const pluginSlug = service.provisioner_slug ?? service.product.provisioner;
    const plugin = this.registry.get(pluginSlug);
    if (!plugin) {
      throw new ConflictException({
        code: 'PLUGIN_NOT_REGISTERED',
        message: `El plugin "${pluginSlug}" no está registrado.`,
      });
    }
    const pluginModelsSuspend = plugin.capabilities.supports_suspend === true;
    if (!pluginModelsSuspend && !opts?.allowUnsupported) {
      throw new ConflictException({
        code: 'SUSPEND_NOT_SUPPORTED',
        message: `El plugin "${pluginSlug}" no soporta suspensión de servicios.`,
      });
    }

    // Solo invocamos la inline action `suspend_service` si el plugin modela la
    // suspensión. Para `internal`/`manual` (con `allowUnsupported`) la
    // suspensión es solo del lado de Aelium — no hay nada que hacer en el
    // proveedor.
    if (pluginModelsSuspend) {
      const result = await executeActionWithCacheInvalidation(
        plugin,
        service,
        'suspend_service',
        { reason: dto.reason },
        {
          actorUserId,
          actorLabel: opts?.actorLabel,
          ipAddress: ctx?.ipAddress ?? '',
          userAgent: ctx?.userAgent ?? null,
          actorIsAdmin: true,
        },
        this.cache,
        this.events,
        this.audit,
        this.breakers,
      );
      if (!result.success) {
        throw new ConflictException({
          code: 'SUSPEND_PROVIDER_FAILED',
          message:
            'No se pudo suspender el servicio en el proveedor. Inténtalo de nuevo o contacta con el equipo técnico.',
          provider_message_key: result.message ?? null,
        });
      }
    }

    // F.6.2 (dossier §A.11.10.3): `services.suspension_reason` guarda solo el
    // motivo-enum (separación categórico/narrativa). La narrativa libre
    // (`dto.internal_note`) vive en `ClientNote.body` — el banner cliente
    // localiza el enum y la UI admin enriquece con la nota del ClientNote.
    const suspensionReason = dto.reason;
    const suspendedAt = new Date();
    // F.6 — `triggered_by_action` diferencia el auto-suspend por impago del
    // suspend manual admin, para que la UI los pueda mostrar distintos en el
    // timeline del cliente (icono / etiqueta).
    const triggeredByAction:
      | 'service.suspended'
      | 'service.auto_suspended_overdue' =
      actorUserId === null && opts?.actorLabel?.startsWith('system:billing-')
        ? 'service.auto_suspended_overdue'
        : 'service.suspended';
    // El caller del modal admin pasa la nota libre; el cron de billing pasa
    // el body ya compuesto ("Suspendido automáticamente por impago — Factura N").
    // R2 garantiza que para admin `internal_note` no es vacío; el `??` cubre
    // el path sistema cuando el caller no compone body (defensivo).
    const noteBody = dto.internal_note?.trim() ?? '<sin nota>';
    // R3 (dossier §A.11.10.3.2): `service.update` + `clientNote.create` viven
    // en la misma transacción Prisma — si la nota falla, el status no transita
    // (un retry del admin es seguro: `suspendAsAdmin` es idempotente por el
    // guard `'suspended' → no-op`, A4.4 ADR-077). Plugin call + cache +
    // eventos + audit quedan FUERA (asimétricos por naturaleza — provider call
    // idempotente, listeners consumen estado committed, audit con su propia
    // política).
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.service.update({
        where: { id: serviceId },
        data: {
          status: 'suspended',
          suspended_at: suspendedAt,
          suspension_reason: suspensionReason,
        },
        select: {
          id: true,
          status: true,
          suspension_reason: true,
          suspended_at: true,
        },
      });
      await this.clientNotes.createFromServiceLifecycleAction(
        {
          user_id: service.user_id,
          author_id: actorUserId,
          service_id: serviceId,
          triggered_by_action: triggeredByAction,
          body: noteBody,
        },
        tx,
      );
      return u;
    });

    await this.cache.invalidate(serviceId);

    const notifyClient = dto.notify_client !== false;
    this.events.emit('service.suspended', {
      service_id: serviceId,
      user_id: service.user_id,
      provisioner_slug: service.provisioner_slug,
      reason: dto.reason,
      actor_user_id: actorUserId,
      ...(actorUserId === null && opts?.actorLabel
        ? { actor: opts.actorLabel }
        : {}),
      suspended_at: suspendedAt.toISOString(),
      notify_client: notifyClient,
    });

    await this.audit.logChange({
      user_id: actorUserId,
      entity_type: 'Service',
      entity_id: serviceId,
      action: 'service.suspended',
      changes_before: { status: String(service.status) },
      changes_after: {
        status: 'suspended',
        suspension_reason: suspensionReason,
        reason_code: dto.reason,
        ...(dto.internal_note ? { internal_note: dto.internal_note } : {}),
        notify_client: notifyClient,
        ...(actorUserId === null && opts?.actorLabel
          ? { actor: opts.actorLabel }
          : {}),
      },
    });
    // `audit_access_log` solo para actores humanos (es "lectura staff sobre
    // datos del cliente"). El actor sistema (cron/job) deja solo el
    // `audit_change_log` con `actor:'system:...'`.
    if (actorUserId !== null) {
      await this.audit.logAccess({
        user_id: actorUserId,
        action: 'service_suspend_admin',
        ip_address: ctx?.ipAddress ?? '',
        user_agent: ctx?.userAgent ?? null,
        resource: 'Service',
        metadata: {
          resource_id: serviceId,
          target_user_id: service.user_id,
          reason_code: dto.reason,
        },
      });
    }

    return {
      id: updated.id,
      status: String(updated.status),
      suspension_reason: updated.suspension_reason,
      suspended_at: updated.suspended_at
        ? updated.suspended_at.toISOString()
        : suspendedAt.toISOString(),
    };
  }

  /**
   * Reactiva un servicio suspendido (espejo de `suspendAsAdmin`):
   *   - ya `active` → no-op idempotente (`alreadyActive: true`).
   *   - distinto de `suspended` → 409.
   *   - invoca `unsuspend_service` → transición `status -> 'active'`,
   *     `suspended_at = null`, `suspension_reason = null` → cache invalidate →
   *     emite `service.unsuspended` → audit.
   *
   * Sin DTO: la reactivación no requiere motivo (solo se restaura el estado
   * previo a la suspensión). El cliente siempre recibe email + campana
   * `service.unsuspended` (reactivar es buena noticia — no hay toggle de
   * supresión, a diferencia de `suspend`).
   *
   * Sprint 15C.II Fase F.5: `actorUserId` puede ser `null` (actor sistema —
   * ej. `reactivar al pagar`, `pause expirado`) con `opts.actorLabel`; sin
   * `audit_access_log` en ese caso. `opts.allowUnsupported` para plugins sin
   * `supports_suspend` (espejo de `suspendAsAdmin`) — no hay inline action que
   * invocar, solo la transición de estado del lado de Aelium.
   */
  async unsuspendAsAdmin(
    serviceId: string,
    dto: UnsuspendServiceDto,
    actorUserId: string | null,
    ctx?: { ipAddress?: string; userAgent?: string | null },
    opts?: { actorLabel?: string; allowUnsupported?: boolean },
  ): Promise<{ id: string; status: string; alreadyActive?: true }> {
    const service = await this.loadServiceForView(serviceId);

    if (String(service.status) === 'active') {
      this.logger.log(
        `unsuspendAsAdmin: service=${serviceId} already active — no-op (ADR-077 A4.4 idempotency).`,
      );
      return { id: service.id, status: 'active', alreadyActive: true };
    }
    if (String(service.status) !== 'suspended') {
      throw new ConflictException({
        code: 'SERVICE_NOT_SUSPENDED',
        message: `Solo se puede reactivar un servicio suspendido (estado actual: ${service.status}).`,
        current_status: String(service.status),
      });
    }
    // Sprint 15C.II F.6 — R2 (dossier §A.11.10.3.2): defense-in-depth.
    // Para actor sistema (`actorUserId === null`, p.ej. listener auto-reactivar
    // al pagar) la nota es opcional — el caller la compone con el nº de
    // factura: "Reactivado automáticamente al pagar la factura N".
    if (actorUserId !== null && !dto.internal_note?.trim()) {
      throw new BadRequestException({
        code: 'NOTE_REQUIRED',
        message:
          'La nota interna es obligatoria para acciones manuales de lifecycle.',
      });
    }

    const pluginSlug = service.provisioner_slug ?? service.product.provisioner;
    const plugin = this.registry.get(pluginSlug);
    if (!plugin) {
      throw new ConflictException({
        code: 'PLUGIN_NOT_REGISTERED',
        message: `El plugin "${pluginSlug}" no está registrado.`,
      });
    }
    const pluginModelsSuspend = plugin.capabilities.supports_suspend === true;
    if (!pluginModelsSuspend && !opts?.allowUnsupported) {
      throw new ConflictException({
        code: 'SUSPEND_NOT_SUPPORTED',
        message: `El plugin "${pluginSlug}" no soporta suspensión de servicios.`,
      });
    }

    if (pluginModelsSuspend) {
      const result = await executeActionWithCacheInvalidation(
        plugin,
        service,
        'unsuspend_service',
        {},
        {
          actorUserId,
          actorLabel: opts?.actorLabel,
          ipAddress: ctx?.ipAddress ?? '',
          userAgent: ctx?.userAgent ?? null,
          actorIsAdmin: true,
        },
        this.cache,
        this.events,
        this.audit,
        this.breakers,
      );
      if (!result.success) {
        throw new ConflictException({
          code: 'UNSUSPEND_PROVIDER_FAILED',
          message:
            'No se pudo reactivar el servicio en el proveedor. Inténtalo de nuevo o contacta con el equipo técnico.',
          provider_message_key: result.message ?? null,
        });
      }
    }

    const previousReason = service.suspension_reason;
    // F.6 — `triggered_by_action` discrimina el auto-unsuspend del listener
    // de billing-on-invoice-paid del unsuspend manual admin.
    const triggeredByAction:
      | 'service.unsuspended'
      | 'service.auto_unsuspended_overdue' =
      actorUserId === null &&
      opts?.actorLabel === 'system:billing-on-invoice-paid'
        ? 'service.auto_unsuspended_overdue'
        : 'service.unsuspended';
    const noteBody = dto.internal_note?.trim() ?? '<sin nota>';
    // R3 (dossier §A.11.10.3.2): cambio de status + `ClientNote` en una sola
    // transacción Prisma. Plugin call (provider) ya completó arriba.
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.service.update({
        where: { id: serviceId },
        data: { status: 'active', suspended_at: null, suspension_reason: null },
        select: { id: true, status: true },
      });
      await this.clientNotes.createFromServiceLifecycleAction(
        {
          user_id: service.user_id,
          author_id: actorUserId,
          service_id: serviceId,
          triggered_by_action: triggeredByAction,
          body: noteBody,
        },
        tx,
      );
      return u;
    });

    await this.cache.invalidate(serviceId);

    this.events.emit('service.unsuspended', {
      service_id: serviceId,
      user_id: service.user_id,
      provisioner_slug: service.provisioner_slug,
      actor_user_id: actorUserId,
      ...(actorUserId === null && opts?.actorLabel
        ? { actor: opts.actorLabel }
        : {}),
      previous_suspension_reason: previousReason,
    });

    await this.audit.logChange({
      user_id: actorUserId,
      entity_type: 'Service',
      entity_id: serviceId,
      action: 'service.unsuspended',
      changes_before: {
        status: 'suspended',
        suspension_reason: previousReason,
      },
      changes_after: {
        status: 'active',
        ...(actorUserId === null && opts?.actorLabel
          ? { actor: opts.actorLabel }
          : {}),
      },
    });
    if (actorUserId !== null) {
      await this.audit.logAccess({
        user_id: actorUserId,
        action: 'service_unsuspend_admin',
        ip_address: ctx?.ipAddress ?? '',
        user_agent: ctx?.userAgent ?? null,
        resource: 'Service',
        metadata: { resource_id: serviceId, target_user_id: service.user_id },
      });
    }

    return { id: updated.id, status: String(updated.status) };
  }

  /**
   * Sprint 15C.II Fase F.5.3 — auto-reactivación al pagar. El listener
   * `reactivate-services-on-invoice-paid` (en `ProvisioningModule`) resuelve
   * los `service_id` de la factura pagada y llama a este método por cada uno.
   * Reactiva el servicio **solo si** está `suspended` con el motivo `overdue_payment`
   * (la suspensión por impago es la que el pago cancela — NO se des-suspende un
   * servicio suspendido por abuso, RGPD o mantenimiento porque el cliente pague
   * otra factura). Idempotente: si ya está `active` (alguien lo reactivó a mano),
   * no-op. Actor sistema (`actorUserId: null` + `actorLabel`).
   *
   * Sprint 15C.II F.6: el listener pasa el `invoiceNumber` para que este
   * método componga el body del `ClientNote` con el contexto canónico
   * ("Reactivado automáticamente al pagar la factura N"). Patrón simétrico
   * al cron de `autoSuspendServices` que compone el body con la factura
   * impagada antes de llamar a `suspendAsAdmin`.
   */
  async reactivateSuspendedServiceOnPayment(
    serviceId: string,
    invoiceNumber: string,
  ): Promise<void> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, status: true, suspension_reason: true },
    });
    if (!service) {
      this.logger.warn(
        `reactivateSuspendedServiceOnPayment: service ${serviceId} not found — skipping.`,
      );
      return;
    }
    if (String(service.status) !== 'suspended') {
      return; // No suspendido — nada que reactivar.
    }
    if (
      this.parseSuspensionReasonCode(service.suspension_reason) !==
      'overdue_payment'
    ) {
      this.logger.log(
        `reactivateSuspendedServiceOnPayment: service ${serviceId} suspended for a non-overdue reason ` +
          `(${service.suspension_reason ?? 'unknown'}) — leaving suspended (a paid invoice does not undo it).`,
      );
      return;
    }
    await this.unsuspendAsAdmin(
      serviceId,
      {
        internal_note: `Reactivado automáticamente al pagar la factura ${invoiceNumber}`,
      },
      null,
      undefined,
      {
        actorLabel: 'system:billing-on-invoice-paid',
        allowUnsupported: true,
      },
    );
    this.logger.log(
      `reactivateSuspendedServiceOnPayment: service ${serviceId} reactivated (overdue invoice paid).`,
    );
  }

  /**
   * Sprint 15C.II Fase F.4.3 — realinea el estado de **suspensión** en el
   * proveedor con `services.status` (autoritativo para el lifecycle
   * administrativo), **sin tocar la BD ni emitir eventos de lifecycle**. Es
   * una operación de RECONCILIACIÓN idempotente, no una transición de estado:
   *   - `services.status === 'suspended'` → asegura el servicio suspendido en
   *     el proveedor (inline action `suspend_service`).
   *   - `services.status === 'active'`    → asegura el servicio activo en el
   *     proveedor (inline action `unsuspend_service`).
   *   - cualquier otro estado → 409 (esta operación solo cubre la dimensión de
   *     suspensión; un servicio `pending`/`failed`/`cancelled`/`terminated` no
   *     tiene "estado de suspensión del proveedor" que realinear).
   *
   * Pensada para el botón "Realinear estado del proveedor con Aelium" del
   * banner de desync de `/admin/services/[id]` (cuando
   * `summary.provider_state_desync === true`, ver `getInfoForUser` F.4.1).
   * Reutiliza `executeActionWithCacheInvalidation` (circuit breaker +
   * invalidación de cache `service_info` + audit `service.action_executed` +
   * evento `service.action_executed`) — esto es legítimo: "se ejecutó la
   * acción inline X" SÍ ocurrió. Lo que NO se emite es `service.suspended` /
   * `service.unsuspended` (no es un cambio de lifecycle — el lifecycle ya
   * estaba en `services.status`; aquí solo el proveedor se pone al día), ni se
   * escribe `services.status` / `suspended_at` / `suspension_reason`. Audit de
   * acceso staff propio: `service_provider_state_resync_admin`.
   *
   * Idempotente: si el proveedor ya está en el estado destino, la inline
   * action es un no-op inofensivo (Enhance `patchSubscription({ isSuspended })`
   * sobre el mismo valor). Heredable a 15E Docker / 15G Plesk (15D RC no
   * aplica — `supports_suspend=false`).
   */
  async resyncProviderStateAsAdmin(
    serviceId: string,
    actorUserId: string,
    ctx: { ipAddress: string; userAgent?: string | null },
  ): Promise<{
    id: string;
    target_state: 'active' | 'suspended';
    aligned: true;
  }> {
    const service = await this.loadServiceForView(serviceId);

    const adminStatus = String(service.status);
    if (adminStatus !== 'active' && adminStatus !== 'suspended') {
      throw new ConflictException({
        code: 'SERVICE_STATE_NOT_RESYNCABLE',
        message: `Solo se puede realinear el estado del proveedor para servicios activos o suspendidos (estado actual: ${adminStatus}).`,
        current_status: adminStatus,
      });
    }

    const pluginSlug = service.provisioner_slug ?? service.product.provisioner;
    const plugin = this.registry.get(pluginSlug);
    if (!plugin) {
      throw new ConflictException({
        code: 'PLUGIN_NOT_REGISTERED',
        message: `El plugin "${pluginSlug}" no está registrado.`,
      });
    }
    if (!plugin.capabilities.supports_suspend) {
      throw new ConflictException({
        code: 'SUSPEND_NOT_SUPPORTED',
        message: `El plugin "${pluginSlug}" no gestiona la suspensión de servicios — no hay estado de proveedor que realinear.`,
      });
    }

    const targetSuspended = adminStatus === 'suspended';
    const actionSlug = targetSuspended
      ? 'suspend_service'
      : 'unsuspend_service';
    const payload: Record<string, unknown> = targetSuspended
      ? { reason: this.parseSuspensionReasonCode(service.suspension_reason) }
      : {};

    const result = await executeActionWithCacheInvalidation(
      plugin,
      service,
      actionSlug,
      payload,
      {
        actorUserId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
        actorIsAdmin: true,
      },
      this.cache,
      this.events,
      this.audit,
      this.breakers,
    );
    if (!result.success) {
      throw new ConflictException({
        code: 'PROVIDER_RESYNC_FAILED',
        message:
          'No se pudo realinear el estado del servicio en el proveedor. Inténtalo de nuevo o contacta con el equipo técnico.',
        provider_message_key: result.message ?? null,
      });
    }

    await this.cache.invalidate(serviceId);

    await this.audit.logAccess({
      user_id: actorUserId,
      action: 'service_provider_state_resync_admin',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent ?? null,
      resource: 'Service',
      metadata: {
        resource_id: serviceId,
        target_user_id: service.user_id,
        target_state: adminStatus,
        action_slug: actionSlug,
      },
    });

    return {
      id: service.id,
      target_state: adminStatus,
      aligned: true,
    };
  }

  /**
   * Sprint 15C.II Fase F.4 — extrae el código `SuspensionReason` canónico de
   * `services.suspension_reason`, que se persiste combinado como `"<reason>"`
   * o `"<reason>: <internal_note>"` (mismo patrón que `cancellation_reason`).
   * Si la parte previa al `": "` no es un código conocido, devuelve `'other'`.
   *
   * Sprint 15C.II Fase F.6 (F.6.2): el formato canónico de `suspension_reason`
   * pasa a ser **solo el enum** (sin `": <nota>"`). Este helper sigue siendo
   * útil porque:
   *   - es robusto a ambos formatos (split por `": "` devuelve el string
   *     completo cuando no hay `": "`, que coincide con el enum),
   *   - la migración data F.6.4 (one-shot) limpia las filas viejas que
   *     todavía tienen el formato combinado.
   * Tras F.6.4 aplicada, este helper podría simplificarse a un
   * `Object.values(...).includes(combined)`, pero el coste es mínimo y
   * mantenerlo defensivo blinda contra rollbacks parciales.
   */
  private parseSuspensionReasonCode(combined: string | null): SuspensionReason {
    if (!combined) return 'other';
    const code = combined.split(': ', 1)[0]?.trim();
    return (Object.values(SuspensionReasonDto) as string[]).includes(code)
      ? (code as SuspensionReason)
      : 'other';
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
      // Sprint 15C.II Fase F (ADR-077 Amendment A4): el listado admin muestra
      // el estado de suspensión por fila (badge + motivo) — paralelo a
      // cancelled_at/cancellation_reason.
      suspended_at: true,
      suspension_reason: true,
    } satisfies Prisma.ServiceSelect;
  }

  /**
   * Sprint 15C.II Fase F.3 (GAP-15CII-M) — timeline de auditoría de un
   * servicio. Carga el servicio (solo `id`/`user_id`), aplica ownership
   * (`ForbiddenException` si cliente accede a servicio ajeno; admin sin
   * filtro), y delega a `AuditService.getServiceTimeline` que aplica el
   * recorte GDPR cuando `!isAdmin`. El `@AuditAccess('Service')` del
   * controller admin deja el trail "agente X consultó la auditoría del
   * servicio Y" (coherente con el resto de lecturas staff).
   */
  async getServiceTimelineForUser(
    serviceId: string,
    userId: string,
    isAdmin: boolean,
    opts: { cursor?: string | null; limit?: number },
  ) {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, user_id: true },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (!isAdmin && service.user_id !== userId) {
      throw new ForbiddenException('No tienes acceso a este servicio.');
    }
    return this.audit.getServiceTimeline(serviceId, {
      isAdmin,
      cursor: opts.cursor ?? null,
      limit: opts.limit,
    });
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
        supports_suspend: false, // ADR-077 Amendment A4
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
        supports_suspend: false, // ADR-077 Amendment A4
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

  /**
   * Resuelve el TTL (segundos) del cache L1 `service_info` para un plugin.
   * Precedencia (Sprint 15C.II Fase F.3 — GAP-15CII-G4):
   *   1. `plugin.manifest.serviceInfoCacheTtlSeconds` si lo declara.
   *   2. setting global `provisioning.service_info_ttl_seconds`.
   *   3. default 60s.
   * Siempre con *sanity floor* de 5s (un TTL menor martillaría al proveedor).
   */
  private async resolveServiceInfoTtl(
    plugin: ProvisionerPlugin,
  ): Promise<number> {
    const manifestTtl = plugin.manifest.serviceInfoCacheTtlSeconds;
    if (typeof manifestTtl === 'number' && Number.isFinite(manifestTtl)) {
      return Math.max(Math.floor(manifestTtl), 5);
    }
    try {
      const ttl = await this.settings.getNumber(
        'provisioning',
        'service_info_ttl_seconds',
        60,
      );
      if (Number.isFinite(ttl) && ttl > 0) return Math.max(Math.floor(ttl), 5);
    } catch (err) {
      this.logger.warn(
        `Failed to read provisioning.service_info_ttl_seconds setting: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return 60;
  }

  /**
   * Sprint 15C.II Fase F.8 (dossier §A.11.10.5.1 R4/R7).
   *
   * Lee `quota_alert_threshold_pct` del install config (ADR-080 — manifest
   * declarativo persistido en `plugin_installs.config`). Devuelve `null`
   * cuando:
   *   - la install no existe (plugin no habilitado),
   *   - el setting no está editado (frontend cae al comportamiento legacy
   *     sin coloreo),
   *   - el valor está fuera del rango canónico `[50, 95]` (defensa contra
   *     corrupción del config — el manifest validó al guardar, pero
   *     defendemos contra escritura directa al DB).
   *
   * NO devuelve el default 85 cuando es null — eso es trabajo del frontend:
   * el SC del page recibe `null` y simplemente no pasa la prop al
   * `MetricsBar`, manteniendo capability-driven (cualquier plugin con
   * `has_metrics` que no haya configurado el setting no colorea — heredable).
   */
  private async loadQuotaAlertThresholdFromInstall(
    slug: string,
  ): Promise<number | null> {
    try {
      const install = await this.prisma.pluginInstall.findUnique({
        where: { slug },
        select: { config: true },
      });
      const raw = (install?.config as Record<string, unknown> | null)?.[
        'quota_alert_threshold_pct'
      ];
      if (
        typeof raw === 'number' &&
        Number.isInteger(raw) &&
        raw >= 50 &&
        raw <= 95
      ) {
        return raw;
      }
    } catch (err) {
      // R7 — degradación elegante: si la lectura del install falla, el
      // frontend cae al comportamiento legacy sin coloreo, mejor eso que
      // 500 el endpoint completo.
      this.logger.warn(
        `Failed to load quota_alert_threshold_pct for plugin "${slug}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return null;
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
