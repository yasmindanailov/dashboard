/**
 * Sprint 15C Fase 15C.C (2026-05-08) — `EnhanceProvisionerPlugin`.
 *
 * Materializa ADR-083 §1-§10 (35 decisiones frozen) sobre el contrato canónico
 * `ProvisionerPlugin` v2 (ADR-077). Primer plugin SaaS real del proyecto.
 *
 * Responsabilidades:
 *   - Implementar los 6 métodos del contrato (provision/deprovision/getStatus +
 *     getServiceInfo/getSsoUrl/executeAction).
 *   - Exponer manifest declarativo (configSchema + secretsSchema) para que la
 *     UI admin (`/admin/settings/plugins`) renderice el form de configuración
 *     dinámico (ADR-080 §1).
 *   - Construir el `EnhanceApiClient` lazy desde `plugin_installs`
 *     (config plana + secrets cifrados con `SecretVaultService`). Cache
 *     invalidado automáticamente cuando admin edita config (vía `updated_at`).
 *
 * NO responsabilidades:
 *   - Cache de `service_info` Redis L1 (60s) → wrapper `getServiceInfoWithCache`
 *     del orquestador (ADR-080 §5 + ADR-077 §5).
 *   - Audit de eventos `service.*` → wrappers cross-cutting.
 *   - Circuit breaker → wrapper.
 *   - Validación payload de inline actions con Ajv → wrapper
 *     `executeActionWithCacheInvalidation` antes de invocar `executeAction`.
 *   - Steps 1-4 del provision flow 6-step → `EnhanceCustomersService`
 *     (idempotency cross-process con advisory lock).
 *
 * Capabilities estáticas frozen (ADR-083 §9 decisión 31 + ADR-077 Amendment A4):
 *   - has_sso_panel: true (Customer Panel via OTP)
 *   - has_metrics: true (disk + bandwidth + email + db counts)
 *   - has_dns_management: true (Enhance es PowerDNS authority)
 *   - supports_reconciliation: true (cron 6h)
 *   - supports_suspend: true (patchSubscription({ isSuspended }) — Sprint 15C.II Fase F)
 *
 * inlineActions (ADR-083 §9 decisión 32 + Amendments A3 + A4.1 + A5.1 + ADR-077 A4) — 10 actions:
 *   - cliente: reset_account_password
 *   - DNS:     list_dns_records, add_dns_record, update_dns_record, delete_dns_record
 *   - admin:   change_package, recalculate_provider_metrics, list_available_plans,
 *              suspend_service, unsuspend_service
 *   (Sprint 15C.II Fase B: view_disk_usage + view_bandwidth_usage eliminados —
 *    métricas refrescadas via botón ↻ en MetricsBar + forceRevalidate flag.
 *    Sprint 15C.II Fase E: `force_resync` → `recalculate_provider_metrics`
 *    — naming honesto, Amendment A5.1.
 *    Sprint 15C.II Fase F: `suspend_service` + `unsuspend_service` añadidas
 *    — ADR-077 Amendment A4. El orquestador transiciona `services.status` y
 *    emite `service.suspended` / `service.unsuspended`; el plugin solo llama
 *    a `patchSubscription({ isSuspended })`.)
 *
 * Reglas:
 *   - R4: importa SOLO de `core/provisioning/types` (contrato),
 *     `core/provisioning/plugin-utils` (librería de helpers cross-cutting —
 *     ej. `filterActionsByStatus`), `core/database`, `core/security` (vault),
 *     Y los archivos del propio plugin (`./api`, `./enhance-customers.service`).
 *     NO importa el orquestador (`modules/provisioning`).
 *   - R7: errores semánticos vía `ProvisionerPluginError`.
 *   - R12: `apiToken` se descifra en memoria, NUNCA se persiste en
 *     `services.metadata` ni en logs.
 *   - R13: errores no desaparecen — el orquestador respeta `retriable` flag.
 */

import * as crypto from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import {
  ActionResult,
  ActionSideEffect,
  AppPresence,
  ClientPublicData,
  DeprovisionContext,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  PluginCapabilities,
  PluginManifest,
  ProvisionContext,
  ProvisionResult,
  ProvisionerPlugin,
  ProvisionerPluginError,
  ServiceAction,
  ServiceInfo,
  ServiceInfoStatus,
  ServiceMetrics,
  ServiceRecoveryHint,
  ServiceSslStatus,
  ServiceSslSummary,
  ServiceStatusReport,
  ServiceWithRelations,
  SsoUrl,
} from '../../../core/provisioning/types';
import { filterActionsByStatus } from '../../../core/provisioning/plugin-utils';
import {
  EncryptedSecret,
  SecretVaultService,
} from '../../../core/security/secret-vault.service';

import {
  EnhanceApiClient,
  EnhanceBandwidth,
  EnhanceDomainSslCert,
  EnhanceStatus,
  EnhanceSubscription,
  EnhanceUsedResourcesFullListing,
  EnhanceWebsite,
  EnhanceWebsiteApp,
  EnhanceWebsiteStatus,
} from './api';
import { EnhanceCustomersService } from './enhance-customers.service';

// ────────────────────────────────────────────────────────────────────────────
// Manifest schemas — ADR-083 §1 decisión 4
// ────────────────────────────────────────────────────────────────────────────

const ENHANCE_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    baseUrl: {
      type: 'string',
      format: 'uri',
      // Sprint 15C.II Fase B fix-up (2026-05-10): smoke real reveló que
      // rjsf usaba el property name (ej. "masterOrgId") como label cuando
      // el schema no declara `title`. Ahora cada field declara `title`
      // con i18n key — `translateSchema()` lo resuelve a ES en el render.
      title: 'plugin.enhance_cp.config.baseUrl.label',
      description: 'plugin.enhance_cp.config.baseUrl',
    },
    masterOrgId: {
      type: 'string',
      format: 'uuid',
      title: 'plugin.enhance_cp.config.masterOrgId.label',
      description: 'plugin.enhance_cp.config.masterOrgId',
    },
    reconciliationIntervalHours: {
      type: 'integer',
      default: 6,
      minimum: 1,
      maximum: 168,
      title: 'plugin.enhance_cp.config.reconciliationIntervalHours.label',
      description: 'plugin.enhance_cp.config.reconciliationIntervalHours',
    },
    // Sprint 15C.II Fase F.8 (frozen 2026-05-16 — dossier §A.11.10.5.1 R4) —
    // Umbral de alerta de cuota de disco. Cuando `pct = used / total * 100`
    // cruza este valor en una pasada del cron L3 (`EnhanceReconciliationCron
    // .runAsExecutor` → `QuotaThresholdDetectorService.detectAndNotify`), el
    // detector emite `service.quota_threshold_crossed` (una sola vez por
    // transición, edge-triggered con la tabla `service_quota_alerts`).
    // Default 85 = industry standard. `minimum: 50` evita desactivarlo de
    // facto; `maximum: 95` evita pisar el umbral crítico hardcoded (≥95% =
    // rojo en la UI). 95% NO es configurable — `L18 + YAGNI` (si un plugin
    // pide un 2º umbral configurable en el futuro, se promueve).
    quota_alert_threshold_pct: {
      type: 'integer',
      default: 85,
      minimum: 50,
      maximum: 95,
      title: 'plugin.enhance_cp.config.quota_alert_threshold_pct.label',
      description: 'plugin.enhance_cp.config.quota_alert_threshold_pct',
    },
  },
  required: ['baseUrl', 'masterOrgId'],
  additionalProperties: false,
} as const;

const ENHANCE_SECRETS_SCHEMA = {
  type: 'object',
  properties: {
    apiToken: {
      type: 'string',
      format: 'password',
      minLength: 16,
      title: 'plugin.enhance_cp.secrets.apiToken.label',
      description: 'plugin.enhance_cp.secrets.apiToken',
    },
  },
  required: ['apiToken'],
  additionalProperties: false,
} as const;

/**
 * Sprint 15C Fase 15C.E.2 — ADR-080 Amendment B (2026-05-09).
 *
 * Schema declarativo del shape de `Product.provisioner_config` para
 * productos hosting Enhance. Renderizado por `@rjsf/core` en el form admin
 * de productos (`/admin/products/new` + `/admin/products/[id]/edit`).
 *
 * El plugin valida runtime (defense-in-depth) en `provision()` con
 * `extractEnhancePlanId()` — la validación form-side via Ajv es UX, no
 * enforcement. Si `productConfig.enhance_plan_id` no es entero ≥1, el plugin
 * lanza `ProvisionerPluginError('INVALID_PAYLOAD', false)`.
 *
 * `enhance_plan_id` apunta a una `plan.id` del Master Org Aelium (ver
 * `EnhancePlan` en api/types.ts + acción curada admin `list_available_plans`,
 * ADR-083 Amendment A3, que alimenta el dropdown del modal admin
 * `change_package` cuando llegue Fase 15C.J).
 */
const ENHANCE_PRODUCT_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    enhance_plan_id: {
      type: 'integer',
      minimum: 1,
      title: 'plugin.enhance_cp.product_config.enhance_plan_id.label',
      description: 'plugin.enhance_cp.product_config.enhance_plan_id',
    },
  },
  required: ['enhance_plan_id'],
  additionalProperties: false,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// inlineActions payloadSchemas — ADR-083 §9 decisión 32
// ────────────────────────────────────────────────────────────────────────────

const NEW_DNS_RECORD_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA'], // V1: 7 de 11 (ADR-083 §5 decisión 17)
    },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    value: { type: 'string', minLength: 1, maxLength: 4096 },
    ttl: { type: 'integer', minimum: 60, maximum: 86400 },
    proxy: { type: 'boolean' },
  },
  required: ['kind', 'name', 'value'],
  additionalProperties: false,
} as const;

const UPDATE_DNS_RECORD_SCHEMA = {
  type: 'object',
  properties: {
    recordId: { type: 'string', minLength: 1 },
    kind: {
      type: 'string',
      enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA'],
    },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    value: { type: 'string', minLength: 1, maxLength: 4096 },
    ttl: { type: 'integer', minimum: 60, maximum: 86400 },
    proxy: { type: 'boolean' },
  },
  required: ['recordId'],
  additionalProperties: false,
} as const;

const DELETE_DNS_RECORD_SCHEMA = {
  type: 'object',
  properties: { recordId: { type: 'string', minLength: 1 } },
  required: ['recordId'],
  additionalProperties: false,
} as const;

const CHANGE_PACKAGE_SCHEMA = {
  type: 'object',
  properties: { planId: { type: 'integer', minimum: 1 } },
  required: ['planId'],
  additionalProperties: false,
} as const;

const ENHANCE_INLINE_ACTIONS: readonly ServiceAction[] = [
  // Acciones cliente
  {
    slug: 'reset_account_password',
    label: 'plugin.enhance_cp.actions.reset_password',
    description: 'plugin.enhance_cp.actions.reset_password.description',
    confirmRequired: true,
    confirmationText: 'plugin.enhance_cp.actions.reset_password.confirm',
    destructive: false,
  },
  // Sprint 15C.II Fase B (2026-05-10) — eliminados `view_disk_usage` y
  // `view_bandwidth_usage` por decisión doctrinal A1 frozen:
  // [ADR-083 Amendment A4.1](docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md#a41-refresh-metrics-pattern-decisión-doctrinal-a1-frozen).
  // Razón: violan UI_SPEC §1.2 P4 "acción no contemplación" — eran botones
  // que solo invalidaban cache 60s wrapper. Reemplazados por botón "↻
  // Refrescar" en `MetricsBar.tsx` → server action `refreshServiceInfoAction`
  // que invalida cache + re-fetch + revalidatePath. Patrón Stripe/Vercel.
  // Las métricas ya viven en MetricsBar (cliente + admin) refrescadas vía
  // `getServiceInfo` con `forceRevalidate: true` cuando se pulsa ↻.
  // DNS records (ADR-082 §6 + ADR-077 Amendment A1.3 — 4 slugs canónicos required si has_dns_management=true)
  {
    slug: 'list_dns_records',
    label: 'plugin.enhance_cp.actions.list_dns_records',
    confirmRequired: false,
    destructive: false,
  },
  {
    slug: 'add_dns_record',
    label: 'plugin.enhance_cp.actions.add_dns_record',
    confirmRequired: false,
    destructive: false,
    payloadSchema: NEW_DNS_RECORD_SCHEMA as Record<string, unknown>,
  },
  {
    slug: 'update_dns_record',
    label: 'plugin.enhance_cp.actions.update_dns_record',
    confirmRequired: false,
    destructive: false,
    payloadSchema: UPDATE_DNS_RECORD_SCHEMA as Record<string, unknown>,
  },
  {
    slug: 'delete_dns_record',
    label: 'plugin.enhance_cp.actions.delete_dns_record',
    confirmRequired: true,
    confirmationText: 'plugin.enhance_cp.actions.delete_dns_record.confirm',
    destructive: true,
    payloadSchema: DELETE_DNS_RECORD_SCHEMA as Record<string, unknown>,
  },
  // Acciones admin-only (Sprint 15C Fase 15C.E — ADR-077 Amendment A3 + ADR-083 Amendment A3)
  // El wrapper `executeActionWithCacheInvalidation` enforce el flag `adminOnly` con
  // HTTP 403 + audit + evento `service.action_admin_only_violation` cuando un cliente
  // no-admin intenta invocarlas. CASL `Subject.Service + Action.Update` es grano grueso;
  // este flag es grano fino por inline action.
  {
    slug: 'change_package',
    label: 'plugin.enhance_cp.actions.change_package',
    description: 'plugin.enhance_cp.actions.change_package.description',
    confirmRequired: true,
    confirmationText: 'plugin.enhance_cp.actions.change_package.confirm',
    destructive: false,
    adminOnly: true,
    payloadSchema: CHANGE_PACKAGE_SCHEMA as Record<string, unknown>,
  },
  // Sprint 15C.II Fase E — ADR-083 Amendment A5.1: rename `force_resync` →
  // `recalculate_provider_metrics` (naming honesto — la acción NO reconcilia
  // nada; hace `PUT calculate-resource-usage` para que Enhance recalcule
  // disco/ancho-de-banda en SU lado, distinto del cron L3 reconcile y del
  // botón ↻ Refrescar). Se renderiza en `AdminServiceOperationsCard` (no en
  // la barra genérica "Acciones rápidas") — el frontend la añade a
  // `INTERNAL_HELPER_SLUGS`. Corrige Amendment A4.2 (que era inexacto).
  {
    slug: 'recalculate_provider_metrics',
    label: 'plugin.enhance_cp.actions.recalculate_provider_metrics',
    description:
      'plugin.enhance_cp.actions.recalculate_provider_metrics.description',
    confirmRequired: false,
    destructive: false,
    adminOnly: true,
  },
  // 10ª action (ADR-083 Amendment A3): admin-only read-only que alimenta
  // el dropdown del modal admin `change_package` con la lista de planes
  // disponibles del Master Org Aelium. Reemplaza la rama
  // `getServiceInfo admin variant` no implementada (decisión 30 original).
  {
    slug: 'list_available_plans',
    label: 'plugin.enhance_cp.actions.list_available_plans',
    confirmRequired: false,
    destructive: false,
    adminOnly: true,
  },
  // Sprint 15C.II Fase F — ADR-077 Amendment A4: suspender / reactivar el
  // servicio sin desprovisionarlo (preserva datos en el proveedor). Ambas
  // adminOnly (la suspensión es operación administrativa, NO cliente self-
  // service). El plugin solo invoca `patchSubscription({ isSuspended })`; el
  // orquestador (`ProvisioningService.suspendAsAdmin` / `unsuspendAsAdmin`)
  // transiciona `services.status` (active ⇄ suspended), escribe `suspended_at`
  // / `suspension_reason` y emite `service.suspended` / `service.unsuspended`.
  // NO declaran `payloadSchema`: el flujo va por el endpoint dedicado
  // `POST /admin/services/:id/suspend|unsuspend` con su propio `SuspendServiceDto`
  // — el `{ reason }` se pasa al plugin por si una API de proveedor lo acepta
  // (Enhance no lo usa). Frontend las trata como helper internas
  // (`INTERNAL_HELPER_SLUGS` de `ActionsBar`) — se operan desde
  // `AdminServiceOperationsCard`, no desde la barra de acciones rápidas (L15).
  {
    slug: 'suspend_service',
    label: 'plugin.enhance_cp.actions.suspend_service',
    description: 'plugin.enhance_cp.actions.suspend_service.description',
    confirmRequired: true,
    confirmationText: 'plugin.enhance_cp.actions.suspend_service.confirm',
    destructive: true,
    adminOnly: true,
  },
  {
    slug: 'unsuspend_service',
    label: 'plugin.enhance_cp.actions.unsuspend_service',
    description: 'plugin.enhance_cp.actions.unsuspend_service.description',
    confirmRequired: true,
    confirmationText: 'plugin.enhance_cp.actions.unsuspend_service.confirm',
    destructive: false,
    adminOnly: true,
  },
  // Sprint 15C.II Fase F.10 — ADR-077 Amendment A9 + ADR-083 Amendment A9
  // (2026-05-18). Action canónica `open_app_admin` con slug fijo + payload
  // discriminator `{ appId }`. El plugin internamente discrimina por kind:
  //   - kind='wordpress' → SSO contractual via getWordpressUserSsoUrl
  //   - kind='joomla'    → URL canónica ${site_url}/administrator
  // El plugin emite la URL fresh on-demand en ActionResult.data — NO se
  // cachea (SSO one-shot, canónicas re-generadas para consistencia).
  // NO destructive, NO confirmRequired, NO adminOnly (cliente self-service:
  // abrir admin de SU app). El frontend renderiza el atajo per-app desde
  // `info.apps[].actions[]` (NO desde `info.availableActions[]` — D4 frozen
  // §A.11.10.7.2 — separación entre acciones del servicio entero y acciones
  // de una instalación específica).
  {
    slug: 'open_app_admin',
    label: 'plugin.enhance_cp.actions.open_app_admin.label',
    description: 'plugin.enhance_cp.actions.open_app_admin.description',
    confirmRequired: false,
    destructive: false,
  },
];

const ENHANCE_CAPABILITIES: PluginCapabilities = {
  has_sso_panel: true,
  panel_label: 'plugin.enhance_cp.panel_label',
  has_metrics: true,
  has_metrics_history: false,
  requires_server: false,
  provision_mode: 'sync',
  completes_via_task: false,
  supports_reconciliation: true,
  has_dns_management: true, // ADR-077 Amendment A1 + ADR-082 §3
  // Sprint 15C.II Fase F — ADR-077 Amendment A4: Enhance soporta suspender /
  // reactivar subscriptions vía `patchSubscription({ isSuspended })` (operativo
  // desde Sprint 15C Fase B). Declara las 2 inline actions `suspend_service` /
  // `unsuspend_service` (ambas adminOnly) abajo.
  supports_suspend: true,
  // Sprint 15D — ADR-077 Amendment A10: Enhance es hosting/DNS authority, NO
  // registrar de dominios (registrar de dominios = resellerclub).
  is_domain_registrar: false,
};

const ENHANCE_MANIFEST: PluginManifest = {
  slug: 'enhance_cp',
  version: '1.0.0',
  manifestVersion: 'v1',
  label: 'plugin.enhance_cp.label',
  description: 'plugin.enhance_cp.description',
  docsUrl: 'docs/features/provisioning/admin-plugins-enhance.md',
  settingsCategory: 'provisioner',
  configSchema: ENHANCE_CONFIG_SCHEMA,
  secretsSchema: ENHANCE_SECRETS_SCHEMA,
  // Sprint 15C.II Fase F.3 (GAP-15CII-G8): `'custom'` — el `getStatus` de
  // Enhance requiere un `provider_reference` real (subscription_id), así que
  // un servicio sintético siempre reportaba "sin metadata" (falso negativo).
  // `testConnection()` hace el probe canónico ADR-083 §1 dec.5: `GET /version`
  // (vivo) + `GET /orgs/{master}` (token válido + RBAC).
  testConnectionMethod: 'custom',
  productConfigSchema: ENHANCE_PRODUCT_CONFIG_SCHEMA,
};

// ────────────────────────────────────────────────────────────────────────────
// Plugin
// ────────────────────────────────────────────────────────────────────────────

interface EnhanceConfig {
  readonly baseUrl: string;
  readonly masterOrgId: string;
  readonly reconciliationIntervalHours: number;
}

interface ApiClientCacheEntry {
  readonly client: EnhanceApiClient;
  readonly config: EnhanceConfig;
  readonly cacheKey: string;
}

@Injectable()
export class EnhanceProvisionerPlugin implements ProvisionerPlugin {
  private readonly logger = new Logger(EnhanceProvisionerPlugin.name);

  readonly slug = 'enhance_cp';
  readonly contractVersion = PROVISIONER_PLUGIN_CONTRACT_VERSION;
  readonly capabilities = ENHANCE_CAPABILITIES;
  readonly inlineActions = ENHANCE_INLINE_ACTIONS;
  readonly manifest = ENHANCE_MANIFEST;

  /**
   * Cache del API client construido. Invalidación canónica: cuando
   * `plugin_installs.updated_at` cambia (admin edita config), el cacheKey
   * cambia y se reconstruye en la próxima llamada. Sin necesidad de
   * listener `plugin.config_changed` ad-hoc — el `updated_at` ES el
   * trigger natural.
   */
  private apiClientCache: ApiClientCacheEntry | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SecretVaultService,
    private readonly customers: EnhanceCustomersService,
  ) {}

  // ─── 1. provision() — flow 6-step idempotente ──────────────────────────

  async provision(ctx: ProvisionContext): Promise<ProvisionResult> {
    // DH-INV-1 + DH-INV-2 (ADR-082 §1) — hosting service SIEMPRE tiene FQDN.
    if (!isValidFqdn(ctx.service.domain)) {
      throw new ProvisionerPluginError(
        `Hosting service ${ctx.service.id} requires a valid FQDN ` +
          `in services.domain (got ${ctx.service.domain ?? 'null'}). ` +
          `See ADR-082 §1 DH-INV-1/DH-INV-2.`,
        'INVALID_PAYLOAD',
        false,
      );
    }
    const domain = ctx.service.domain as string;

    const planId = extractEnhancePlanId(ctx.productConfig);

    const { client: api, config } = await this.getApiClient();
    const user = {
      id: ctx.client.id,
      email: ctx.client.email,
      displayName: buildDisplayName(ctx.client),
    };

    this.logger.log(
      `provision service=${ctx.service.id} user=${user.id} domain=${domain} ` +
        `planId=${planId} correlation=${ctx.correlationId}`,
    );

    // Steps 1-4: ensure customer + login + member + owner (idempotente).
    const mapping = await this.customers.ensureCustomer(
      user,
      api,
      config.masterOrgId,
    );

    // Step 5: createSubscription
    const subscription = await api.createSubscription(
      config.masterOrgId,
      mapping.enhance_org_id,
      { planId },
    );

    // Step 6: createWebsite
    const website = await api.createWebsite(mapping.enhance_org_id, {
      domain,
      subscriptionId: subscription.id,
    });

    return {
      providerReference: String(subscription.id),
      metadata: {
        enhance_website_id: website.id,
        enhance_org_id: mapping.enhance_org_id,
        enhance_subscription_id: String(subscription.id),
        enhance_plan_id: planId,
        primary_domain: domain,
      },
      followUp: ['mark_active'] as const,
    };
  }

  // ─── 2. deprovision() — DELETE subscription idempotente ────────────────

  async deprovision(ctx: DeprovisionContext): Promise<void> {
    const refs = extractServiceRefs(ctx.service);
    if (!refs) {
      this.logger.warn(
        `deprovision service=${ctx.service.id}: no enhance_org_id/subscription_id ` +
          `in metadata — nothing to deprovision (idempotent no-op).`,
      );
      return;
    }
    const { client: api } = await this.getApiClient();
    try {
      await api.deleteSubscription(refs.orgId, refs.subscriptionId);
      this.logger.log(
        `deprovision service=${ctx.service.id}: deleted subscription=${refs.subscriptionId} ` +
          `org=${refs.orgId} reason=${ctx.reason}`,
      );
    } catch (err) {
      // 404 → ya borrado externamente (idempotente). Cualquier otro error sube.
      if (
        err instanceof ProvisionerPluginError &&
        err.code === 'INVALID_STATE'
      ) {
        this.logger.warn(
          `deprovision service=${ctx.service.id}: subscription=${refs.subscriptionId} ` +
            `not found in Enhance — treating as already deprovisioned.`,
        );
        return;
      }
      throw err;
    }
  }

  // ─── 3. getStatus() — reconcile read ───────────────────────────────────

  async getStatus(service: ServiceWithRelations): Promise<ServiceStatusReport> {
    const refs = extractServiceRefs(service);
    if (!refs) {
      return {
        status: 'unknown',
        statusReason:
          'service has no enhance_org_id/subscription_id in metadata',
        checkedAt: new Date().toISOString(),
      };
    }
    const { client: api } = await this.getApiClient();
    try {
      const subscription = await api.getSubscription(
        refs.orgId,
        refs.subscriptionId,
      );
      return {
        status: mapSubscriptionStatus(subscription),
        statusReason: subscription.suspendedBy
          ? `suspended by ${subscription.suspendedBy}`
          : undefined,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (
        err instanceof ProvisionerPluginError &&
        err.code === 'INVALID_STATE'
      ) {
        // 404 → reconcile detecta drift: subscription_missing.
        // Sprint 15C.II Fase B fix-up: statusReason ahora es i18n key (no
        // string literal en inglés). El frontend ServiceHeader aplica t().
        // Fase C completará la discriminación cliente vs admin (UI_SPEC §4.13).
        return {
          status: 'unknown',
          statusReason: 'plugin.enhance_cp.status_reason.subscription_missing',
          checkedAt: new Date().toISOString(),
        };
      }
      throw err;
    }
  }

  /**
   * Sprint 15C.II Fase F.3 (GAP-15CII-G8) — test-connection canónico
   * (ADR-083 §1 decisión 5), independiente de cualquier servicio:
   *   1. `GET /version` (sin auth) → Enhance está vivo y alcanzable.
   *   2. `GET /orgs/{masterOrgId}` → el token es válido y tiene RBAC sobre
   *      el master org (401/403 ⇒ credenciales/permisos mal).
   * Sin side-effects. Captura sus propios errores — devuelve `{ ok, message }`
   * (incluye el caso de credenciales ausentes, que falla ya en `getApiClient`).
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const { client: api, config } = await this.getApiClient();
      const version = await api.getVersion();
      await api.getOrg(config.masterOrgId);
      return {
        ok: true,
        message: `Enhance orchd v${version} alcanzable; el token tiene acceso al master org.`,
      };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'error inesperado del proveedor';
      return {
        ok: false,
        message: `No se pudo conectar con Enhance: ${reason}`,
      };
    }
  }

  // ─── 4. getServiceInfo() — display + métricas ──────────────────────────

  async getServiceInfo(service: ServiceWithRelations): Promise<ServiceInfo> {
    const refs = extractServiceRefs(service);
    if (!refs) {
      return this.buildUnknownInfo(
        service,
        'plugin.enhance_cp.status_reason.not_yet_provisioned',
      );
    }
    const websiteId = extractWebsiteId(service);
    const { client: api } = await this.getApiClient();

    // Lectura paralela: subscription es obligatoria; bandwidth + resources +
    // website son best-effort (si fallan, devolvemos info sin métricas y/o
    // sin ssl). Sprint 15C.II Fase F.7 (ADR-083 A8.3): `getWebsite` se añade
    // al Promise.all para luego encadenar `getDomainSsl(website.domain.id)`
    // — el sub-fetch SSL depende del website y va fuera del Promise.all.
    // Sprint 15C.II Fase F.10 (ADR-083 Amendment A9.3): se añade
    // `getWebsiteApps` al Promise.all. Fail-soft: si el endpoint falla, las
    // apps NO bloquean el resto del getServiceInfo (heredado patrón de
    // bandwidth/resources/website). El plugin omite el campo `apps` cuando
    // el resultado es `null` o `items.length === 0` (capability-driven por
    // presencia — ADR-077 Amendment A9.4).
    const [subscription, bandwidth, resources, website, websiteAppsListing] =
      await Promise.all([
        api.getSubscription(refs.orgId, refs.subscriptionId).catch((err) => {
          if (
            err instanceof ProvisionerPluginError &&
            err.code === 'INVALID_STATE'
          ) {
            return null;
          }
          throw err;
        }),
        api
          .getSubscriptionBandwidth(refs.orgId, refs.subscriptionId)
          .catch(() => null),
        api
          .calculateResourceUsage(refs.orgId, refs.subscriptionId)
          .catch(() => null),
        websiteId
          ? api.getWebsite(refs.orgId, websiteId).catch(() => null)
          : Promise.resolve(null),
        websiteId
          ? api.getWebsiteApps(refs.orgId, websiteId).catch((err) => {
              this.logger.warn(
                `getWebsiteApps service=${service.id} websiteId=${websiteId} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
              );
              return null;
            })
          : Promise.resolve(null),
      ]);

    if (!subscription) {
      return this.buildUnknownInfo(
        service,
        'plugin.enhance_cp.status_reason.subscription_missing',
        // ADR-083 Amendment A5.2: recurso borrado externamente del proveedor
        // → re-aprovisionable (re-crea customer/subscription/website).
        'reprovision',
      );
    }

    const status = mapSubscriptionStatus(subscription);
    const metrics = buildMetrics(bandwidth, resources);
    // Sub-fetch SSL — depende de `website` (necesita `domain.id`). Best-effort
    // — devuelve `undefined` en cualquier error de red/auth (no exponer parcial).
    // Si el endpoint orchd responde 404 (no hay cert), devuelve
    // `{ status: 'none' }` para que la UI lo muestre como estado real.
    const ssl = await buildSslSummary(api, website);

    // Sprint 15C.II Fase F.10 (ADR-077 Amendment A9 + ADR-083 Amendment A9):
    // construir `AppPresence[]` desde el listado del proveedor. Capability-
    // driven por presencia: si el listado es null (fail-soft del Promise.all)
    // o vacío, el plugin OMITE el campo `apps` del ServiceInfo (NO emite
    // array vacío misleading).
    const apps: readonly AppPresence[] | undefined =
      websiteAppsListing && websiteAppsListing.items.length > 0
        ? websiteAppsListing.items.map((app) => buildAppPresence(app))
        : undefined;

    const availableActions = filterActionsByStatus(this.inlineActions, status);

    // Sprint 15C.II Fase E — ADR-083 Amendment A5.2 (drift de plan): si el
    // `planId` en Enhance (ground truth) ≠ el `enhance_plan_id` del producto
    // Aelium, hay divergencia. Doctrina ADR-082 DH-INV-6: Enhance gana — el
    // status canónico NO cambia (sigue `active`), pero exponemos
    // `recoveryHint: 'reconcile'` para que la UI admin pueda ofrecer el
    // re-sync del cron L3 manual que actualiza la metadata local. NO se
    // bloquea la lectura: `display.secondary` ya muestra el `planName` real
    // del proveedor. Heredable a 15D/15E/15G.
    const productPlanId = readPositiveIntConfig(
      service.product.provisioner_config,
      'enhance_plan_id',
    );
    const planDiverged =
      status === 'active' &&
      productPlanId !== null &&
      typeof subscription.planId === 'number' &&
      productPlanId !== subscription.planId;

    const recoveryHint: ServiceRecoveryHint | undefined = planDiverged
      ? 'reconcile'
      : undefined;
    // Sprint 15C.II Fase F (ADR-077 Amendment A4): para una subscription
    // suspendida en Enhance (`suspendedBy` set), `statusReason` es la i18n key
    // genérica `plugin.enhance_cp.status_reason.suspended` (el ServiceHeader
    // la traduce — cliente-segura, no expone el member ID del operador Enhance).
    // El motivo REAL de la suspensión (la taxonomía canónica `SuspensionReason`
    // + nota interna) vive en `services.suspension_reason` (Aelium-side) y el
    // admin lo ve en el banner amarillo de `/admin/services/[id]`. NUNCA es un
    // drift re-aprovisionable — no se emite `recoveryHint`.
    const statusReason = subscription.suspendedBy
      ? 'plugin.enhance_cp.status_reason.suspended'
      : planDiverged
        ? 'plugin.enhance_cp.status_reason.plan_divergence'
        : undefined;

    return {
      status,
      statusReason,
      recoveryHint,
      display: {
        primary: service.domain ?? subscription.friendlyName,
        secondary: subscription.planName,
      },
      metrics,
      ssl,
      apps,
      capabilities: {
        ...this.capabilities,
        hasSsoPanel: true,
        inlineActions: availableActions,
      },
      availableActions,
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── 5. getSsoUrl() — 2-call OTP flow optimizado ───────────────────────

  async getSsoUrl(service: ServiceWithRelations): Promise<SsoUrl | null> {
    const refs = extractServiceRefs(service);
    if (!refs) return null;

    // Optimización: ownerMemberId está cacheado en enhance_customers
    // (ADR-083 §4 decisión 13) → evita el GET /orgs/{cust} previo.
    const mapping = await this.prisma.enhanceCustomer.findUnique({
      where: { user_id: service.user_id },
    });
    if (!mapping) {
      this.logger.warn(
        `getSsoUrl service=${service.id}: no enhance_customers mapping for user=${service.user_id}. ` +
          `Reconcile cron should detect this orphan service.`,
      );
      return null;
    }

    const { client: api } = await this.getApiClient();
    const otpUrl = await api.getMemberSsoOtpUrl(
      mapping.enhance_org_id,
      mapping.enhance_owner_member_id,
    );

    // TTL conservador (5 min). Enhance gestiona el TTL real — Aelium NO
    // cachea la URL (ADR-083 §4 decisión 15) — `expiresAt` es solo display.
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    return {
      url: otpUrl,
      expiresAt,
      panelLabel: 'plugin.enhance_cp.panel_label',
      opensIn: 'new_tab',
    };
  }

  // ─── 6. executeAction() — dispatch por slug ────────────────────────────

  async executeAction(
    service: ServiceWithRelations,
    actionSlug: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const declared = this.inlineActions.find((a) => a.slug === actionSlug);
    if (!declared) {
      throw new ProvisionerPluginError(
        `Plugin "${this.slug}" does not declare action slug="${actionSlug}".`,
        'INVALID_PAYLOAD',
        false,
      );
    }

    const refs = extractServiceRefs(service);
    if (!refs) {
      throw new ProvisionerPluginError(
        `Service ${service.id} has no enhance refs in metadata — cannot execute action "${actionSlug}".`,
        'INVALID_STATE',
        false,
      );
    }

    const { client: api } = await this.getApiClient();

    switch (actionSlug) {
      case 'reset_account_password':
        return this.actionResetAccountPassword(service);

      case 'list_dns_records':
        return this.actionListDnsRecords(api, refs, service);
      case 'add_dns_record':
        return this.actionAddDnsRecord(api, refs, service, payload);
      case 'update_dns_record':
        return this.actionUpdateDnsRecord(api, refs, service, payload);
      case 'delete_dns_record':
        return this.actionDeleteDnsRecord(api, refs, service, payload);

      case 'change_package':
        return this.actionChangePackage(api, refs, service, payload);
      case 'recalculate_provider_metrics':
        return this.actionRecalculateProviderMetrics(api, refs);
      case 'list_available_plans':
        return this.actionListAvailablePlans();
      case 'suspend_service':
        return this.actionSuspendService(api, refs);
      case 'unsuspend_service':
        return this.actionUnsuspendService(api, refs);

      // Sprint 15C.II Fase F.10 — ADR-077 Amendment A9 + ADR-083 Amendment A9
      case 'open_app_admin':
        return this.actionOpenAppAdmin(api, refs, service, payload);

      default:
        // Defensive: shouldn't reach (declared check above).
        throw new ProvisionerPluginError(
          `Plugin "${this.slug}": action "${actionSlug}" declared but not implemented (bug).`,
          'NOT_IMPLEMENTED',
          false,
        );
    }
  }

  // ─── Action implementations ────────────────────────────────────────────

  private async actionResetAccountPassword(
    service: ServiceWithRelations,
  ): Promise<ActionResult> {
    const mapping = await this.prisma.enhanceCustomer.findUnique({
      where: { user_id: service.user_id },
    });
    if (!mapping) {
      throw new ProvisionerPluginError(
        `No enhance_customers mapping for user=${service.user_id}.`,
        'INVALID_STATE',
        false,
      );
    }
    const { client: api } = await this.getApiClient();
    const newPassword = generateRandomPassword();
    await api.resetLoginPassword(mapping.enhance_owner_login_id, {
      NewPassword: newPassword,
    });
    return {
      success: true,
      message: 'plugin.enhance_cp.actions.reset_password.success',
      data: { password: newPassword }, // expuesto al cliente UNA vez (R12 — wrapper sanea audit)
      sideEffects: ['service.password_reset'] as readonly ActionSideEffect[],
    };
  }

  // Sprint 15C.II Fase B (2026-05-10) — `actionViewMetrics` eliminado.
  // Las inline actions `view_disk_usage`/`view_bandwidth_usage` se removieron
  // del manifest (decisión doctrinal A1 frozen — ADR-083 Amendment A4.1).
  // Las métricas siguen disponibles en `getServiceInfo().metrics` (calculadas
  // en `getServiceInfo()` con `getSubscriptionBandwidth` + `calculateResourceUsage`)
  // y se refrescan vía botón "↻ Refrescar" en `MetricsBar.tsx` que invoca el
  // server action `refreshServiceInfoAction` con `forceRevalidate: true`.

  private async actionListDnsRecords(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
    service: ServiceWithRelations,
  ): Promise<ActionResult> {
    const websiteId = extractWebsiteId(service);
    const domain = service.domain;
    if (!websiteId || !domain) {
      throw new ProvisionerPluginError(
        `Service ${service.id}: missing enhance_website_id or domain — cannot list DNS records.`,
        'INVALID_STATE',
        false,
      );
    }
    const zone = await api.getDnsZone(refs.orgId, websiteId, domain);
    // Sprint 15C.II Fase E — ADR-083 Amendment A5.3: estado DNSSEC read-only.
    // PowerDNS (vía Enhance) expone los DS/DNSKEY records cuando la zona tiene
    // DNSSEC firmado. Aelium NO gestiona DNSSEC (activar/rotar = panel Enhance,
    // DC.NEW-15C-DNSSEC) — solo lo refleja para que la UI muestre un Badge.
    const dnssecActive =
      typeof zone.dnssecDsRecords === 'string' &&
      zone.dnssecDsRecords.length > 0 &&
      typeof zone.dnssecDnskeyRecords === 'string' &&
      zone.dnssecDnskeyRecords.length > 0;
    return {
      success: true,
      data: {
        zone: {
          origin: zone.origin,
          soa: zone.soa,
          records: zone.records,
          ...(dnssecActive
            ? {
                dnssec: {
                  dsRecords: zone.dnssecDsRecords,
                  dnskeyRecords: zone.dnssecDnskeyRecords,
                },
              }
            : {}),
        },
      },
    };
  }

  private async actionAddDnsRecord(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
    service: ServiceWithRelations,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const websiteId = extractWebsiteId(service);
    const domain = service.domain;
    if (!websiteId || !domain) {
      throw new ProvisionerPluginError(
        `Service ${service.id}: missing enhance_website_id or domain.`,
        'INVALID_STATE',
        false,
      );
    }
    // Payload validado por wrapper Ajv contra NEW_DNS_RECORD_SCHEMA.
    const created = await api.addDnsRecord(refs.orgId, websiteId, domain, {
      kind: payload.kind as never,
      name: payload.name as string,
      value: payload.value as string,
      ttl: payload.ttl as number | undefined,
      proxy: payload.proxy as boolean | undefined,
    });
    return {
      success: true,
      data: { recordId: created.id },
      sideEffects: ['service.dns_modified'] as readonly ActionSideEffect[],
    };
  }

  private async actionUpdateDnsRecord(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
    service: ServiceWithRelations,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const websiteId = extractWebsiteId(service);
    const domain = service.domain;
    if (!websiteId || !domain) {
      throw new ProvisionerPluginError(
        `Service ${service.id}: missing enhance_website_id or domain.`,
        'INVALID_STATE',
        false,
      );
    }
    const recordId = payload.recordId as string;
    const update: Record<string, unknown> = {};
    for (const k of ['kind', 'name', 'value', 'ttl', 'proxy'] as const) {
      if (payload[k] !== undefined) update[k] = payload[k];
    }
    await api.updateDnsRecord(refs.orgId, websiteId, domain, recordId, update);
    return {
      success: true,
      sideEffects: ['service.dns_modified'] as readonly ActionSideEffect[],
    };
  }

  private async actionDeleteDnsRecord(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
    service: ServiceWithRelations,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const websiteId = extractWebsiteId(service);
    const domain = service.domain;
    if (!websiteId || !domain) {
      throw new ProvisionerPluginError(
        `Service ${service.id}: missing enhance_website_id or domain.`,
        'INVALID_STATE',
        false,
      );
    }
    const recordId = payload.recordId as string;
    await api.deleteDnsRecord(refs.orgId, websiteId, domain, recordId);
    return {
      success: true,
      sideEffects: ['service.dns_modified'] as readonly ActionSideEffect[],
    };
  }

  private async actionChangePackage(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
    service: ServiceWithRelations,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const planId = payload.planId as number;
    await api.patchSubscription(refs.orgId, refs.subscriptionId, { planId });

    // Sprint 15C Fase 15C.H: actualizar `service.metadata.enhance_plan_id`
    // tras éxito del PATCH a Enhance. Sin esto, el cron L3
    // `EnhanceReconciliationCron` detectaría `plan_divergence` cada 6h tras
    // cualquier change_package admin (false positive: la divergencia es
    // intencional y reciente, no un cambio externo no autorizado). El
    // snapshot Aelium-side del plan asignado vive en metadata, NO en
    // `Product.provisioner_config` (ese es el default de catálogo).
    const md = (service.metadata as Record<string, unknown> | null) ?? {};
    try {
      await this.prisma.service.update({
        where: { id: service.id },
        data: { metadata: { ...md, enhance_plan_id: planId } },
      });
    } catch (dbErr) {
      // Sprint 15C.II Fase G.1.b (§A.2 área 5 — ADR-083 Amendment A10).
      // El PATCH a Enhance YA tuvo éxito (Enhance es ground truth y queda en
      // el plan nuevo), pero la sincronización del snapshot local falló. NO
      // compensamos revirtiendo el PATCH: una 2ª llamada externa también
      // puede fallar y no cubre un crash del proceso entre PATCH y update.
      // En su lugar fallamos con un error SEMÁNTICO y retriable:
      //   - la operación es idempotente — re-ejecutar change_package con el
      //     mismo planId re-aplica el PATCH (no-op en Enhance) y reintenta el
      //     update local, convergiendo el snapshot;
      //   - mientras tanto el cron L3 (`EnhanceReconciliationCron`) detecta la
      //     `plan_divergence` transitoria y la expone en el `AdminDriftBanner`,
      //     coherente con la doctrina reconcile emit-only de F.9 (Amendment IV).
      // Reusa el code `PROVIDER_INTERNAL_ERROR` (retriable) — NO añade un code
      // al contrato ADR-077 (frozen). El detalle accionable vive en el mensaje
      // (logueado por el wrapper) y en el amendment ADR-083 A10.
      const cause = dbErr instanceof Error ? dbErr.message : String(dbErr);
      throw new ProvisionerPluginError(
        `change_package: Enhance subscription ${refs.subscriptionId} (org ${refs.orgId}) ` +
          `was patched to plan ${planId}, but the local metadata sync failed. ` +
          `The operation is idempotent — retry change_package to reconcile the local ` +
          `snapshot; the L3 cron will flag the transient plan_divergence until then. ` +
          `Cause: ${cause}`,
        'PROVIDER_INTERNAL_ERROR',
        true,
        dbErr,
        'enhance_cp',
      );
    }

    return {
      success: true,
      message: 'plugin.enhance_cp.actions.change_package.success',
      data: { newPlanId: planId },
    };
  }

  /**
   * Sprint 15C.II Fase E — ADR-083 Amendment A5.1 (rename de `force_resync`).
   *
   * Pide a Enhance que recalcule activamente disco + ancho de banda de la
   * subscription en SU lado (`PUT /orgs/{org}/subscriptions/{sub}/calculate-resource-usage`),
   * y devuelve el resultado fresco. NO reconcilia metadata local, NO emite
   * eventos drift — eso es el cron L3 (`EnhanceReconciliationCron`). Tampoco
   * es el botón ↻ Refrescar (que solo re-lee lo último ya calculado). El
   * `sideEffect` `service.metrics_invalidated` hace que el wrapper invalide
   * el cache `service_info` para que la siguiente lectura traiga lo recalculado.
   */
  private async actionRecalculateProviderMetrics(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
  ): Promise<ActionResult> {
    const usage = await api.calculateResourceUsage(
      refs.orgId,
      refs.subscriptionId,
    );
    return {
      success: true,
      message: 'plugin.enhance_cp.actions.recalculate_provider_metrics.success',
      data: { resources: usage },
      sideEffects: [
        'service.metrics_invalidated',
      ] as readonly ActionSideEffect[],
    };
  }

  /**
   * Sprint 15C Fase 15C.E — ADR-083 Amendment A3 (10ª inline action).
   *
   * Devuelve la lista de planes disponibles del Master Org Aelium
   * (`config.masterOrgId`) — alimenta el dropdown del modal admin
   * `change_package`. Reemplaza la rama `getServiceInfo admin variant`
   * declarada en la decisión 30 original (no implementada — habría
   * supuesto extender el contrato canónico ADR-077).
   *
   * Read-only desde el punto de vista de Aelium. Audit + cache
   * invalidation se aplica uniformemente desde el wrapper
   * `executeActionWithCacheInvalidation` (idempotencia: el cache
   * service_info NO contiene plans, así que la invalidación no afecta
   * lecturas relacionadas — coherente con el resto de actions admin).
   */
  private async actionListAvailablePlans(): Promise<ActionResult> {
    const { client: api, config } = await this.getApiClient();
    const listing = await api.listPlans(config.masterOrgId);
    return {
      success: true,
      data: { plans: listing.items, total: listing.total },
    };
  }

  /**
   * Sprint 15C.II Fase F — ADR-077 Amendment A4 (`suspend_service`).
   *
   * Suspende la subscription en Enhance (`patchSubscription({ isSuspended: true })`).
   * Idempotente en el lado del proveedor: PATCH sobre una subscription ya
   * suspendida es no-op. El orquestador (`ProvisioningService.suspendAsAdmin`)
   * ya gateó por `services.status === 'active'` antes de llegar aquí, así que
   * en la práctica solo se invoca sobre servicios activos; si hubiera drift
   * (Enhance ya suspendido pero Aelium `active`), el PATCH es inofensivo y la
   * transición a `suspended` en Aelium resuelve el drift.
   *
   * NO transiciona `services.status` ni emite eventos — eso es responsabilidad
   * del orquestador (R8 audit centralizado). NO usa el `{ reason }` del payload
   * (Enhance no acepta motivo en `patchSubscription`); se conserva en la firma
   * para plugins futuros cuya API sí lo soporte (cPanel `suspendacct` reason).
   */
  private async actionSuspendService(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
  ): Promise<ActionResult> {
    await api.patchSubscription(refs.orgId, refs.subscriptionId, {
      isSuspended: true,
    });
    return {
      success: true,
      message: 'plugin.enhance_cp.actions.suspend_service.success',
      data: { suspended: true },
    };
  }

  /**
   * Sprint 15C.II Fase F — ADR-077 Amendment A4 (`unsuspend_service`).
   *
   * Reactiva la subscription en Enhance (`patchSubscription({ isSuspended: false })`).
   * Idempotente. NO transiciona `services.status` ni emite eventos — el
   * orquestador (`ProvisioningService.unsuspendAsAdmin`) lo hace.
   */
  private async actionUnsuspendService(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
  ): Promise<ActionResult> {
    await api.patchSubscription(refs.orgId, refs.subscriptionId, {
      isSuspended: false,
    });
    return {
      success: true,
      message: 'plugin.enhance_cp.actions.unsuspend_service.success',
      data: { suspended: false },
    };
  }

  /**
   * Sprint 15C.II Fase F.10 — ADR-077 Amendment A9 + ADR-083 Amendment A9.
   *
   * Abre el admin de una app CMS instalada (WordPress o Joomla) en una
   * pestaña nueva. Slug fijo `'open_app_admin'` + payload discriminator
   * `{ appId: string }`. Dispatcher interno por `app.app` kind:
   *
   *   - kind='wordpress' → SSO contractual via getDefaultWpSsoUser +
   *     getWordpressUserSsoUrl. Returns ActionResult.data con
   *     { url: <SSO URL>, kind: 'sso', opensIn: 'new_tab' }.
   *
   *   - kind='joomla' → URL canónica `${site_url}/administrator` derivada
   *     de getJoomlaInfo. Returns ActionResult.data con
   *     { url: <URL canónica>, kind: 'canonical', opensIn: 'new_tab' }.
   *
   * Errores semánticos:
   *   - App `appId` no existe en la website → INVALID_STATE.
   *   - WP sin default user configurado (404 defensive) → INVALID_STATE
   *     (esto NO debería pasar — el frontend filtra el botón disabled
   *     leyendo `actions: []` de getServiceInfo; este path solo se alcanza
   *     si el cliente fuerza el call vía curl).
   *   - Kind no soportado (defensive — futuros kinds desconocidos) →
   *     NOT_IMPLEMENTED.
   *
   * El plugin NO emite eventos ni invalida cache — la action es read-only
   * desde el punto de vista del proveedor (genera URL fresh on-demand) y
   * NO requiere cache invalidation. Audit per-app (R6 frozen — ADR-077
   * A9.7) se añade en la capa orquestador (ProvisioningService.executeAction
   * o capa equivalente del flow admin).
   */
  private async actionOpenAppAdmin(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
    service: ServiceWithRelations,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    // 1. Validar payload `{ appId: string }`.
    const appId = payload?.appId;
    if (typeof appId !== 'string' || appId.length === 0) {
      throw new ProvisionerPluginError(
        `action "open_app_admin" requires payload.appId (string).`,
        'INVALID_PAYLOAD',
        false,
      );
    }

    // 2. Resolver websiteId desde metadata (sin ello no podemos enumerar apps).
    const websiteId = extractWebsiteId(service);
    if (!websiteId) {
      throw new ProvisionerPluginError(
        `Service ${service.id} has no enhance_website_id in metadata — cannot open app admin.`,
        'INVALID_STATE',
        false,
      );
    }

    // 3. Re-query las apps del website para localizar `appId` (no cacheamos
    //    — las apps pueden cambiar runtime; el listado es ligero).
    const appsListing = await api.getWebsiteApps(refs.orgId, websiteId);
    const app = appsListing.items.find((a) => a.id === appId);
    if (!app) {
      throw new ProvisionerPluginError(
        `App ${appId} not found in website ${websiteId}.`,
        'INVALID_STATE',
        false,
      );
    }

    // 4. Dispatcher por kind (ADR-083 Amendment A9.2).
    if (app.app === 'wordpress') {
      const defaultUser = await api.getDefaultWpSsoUser(
        refs.orgId,
        websiteId,
        app.id,
      );
      if (!defaultUser) {
        // Defensive: el frontend ya gateó el botón disabled (getServiceInfo
        // emite `actions: []` cuando `defaultWpUserId` está ausente del
        // listado). Este path solo si el cliente forzó el call vía curl.
        throw new ProvisionerPluginError(
          `WordPress default SSO user not configured for app ${appId}.`,
          'INVALID_STATE',
          false,
        );
      }
      const ssoUrl = await api.getWordpressUserSsoUrl(
        refs.orgId,
        websiteId,
        app.id,
        defaultUser.id,
      );
      return {
        success: true,
        message: 'plugin.enhance_cp.actions.open_app_admin.success',
        data: {
          url: ssoUrl,
          appKind: 'wordpress',
          urlKind: 'sso',
          opensIn: 'new_tab',
        },
      };
    }

    if (app.app === 'joomla') {
      const joomlaInfo = await api.getJoomlaInfo(refs.orgId, websiteId, app.id);
      // Normaliza trailing slash + concatena /administrator (URL canónica
      // del CMS Joomla desde 2005 — ADR-083 A9.1 doctrina).
      const baseUrl = joomlaInfo.site_url.replace(/\/$/, '');
      return {
        success: true,
        message: 'plugin.enhance_cp.actions.open_app_admin.success',
        data: {
          url: `${baseUrl}/administrator`,
          appKind: 'joomla',
          urlKind: 'canonical',
          opensIn: 'new_tab',
        },
      };
    }

    // 5. Kind desconocido (defensive — futuros kinds soportados por orchd).
    throw new ProvisionerPluginError(
      `App kind "${String(app.app)}" not supported by open_app_admin (Enhance F.10).`,
      'NOT_IMPLEMENTED',
      false,
    );
  }

  // ─── Internal: API client construction & caching ───────────────────────

  /**
   * Devuelve el `EnhanceApiClient` construido a partir de
   * `plugin_installs` + `SecretVaultService`. Cache invalidado por
   * `updated_at` + `key_version`.
   *
   * **Público pero scoping module-internal**: sólo los servicios que viven
   * en `EnhanceCpModule` (`EnhanceDnsDefaultsService`, listeners
   * registrados en `ProvisioningModule` que consumen este plugin) deben
   * llamarlo. Código fuera del módulo Enhance **debe** invocar el plugin
   * a través del contrato canónico (`provision`/`getStatus`/`executeAction`/...)
   * — nunca directamente al cliente HTTP. Renombrado de `getApi` (Sprint
   * 15C Fase 15C.C) a `getApiClient` (Sprint 15C Fase 15C.D) para que el
   * call-site del listener exprese intent.
   */
  async getApiClient(): Promise<{
    client: EnhanceApiClient;
    config: EnhanceConfig;
  }> {
    const install = await this.prisma.pluginInstall.findUnique({
      where: { slug: this.slug },
    });
    if (!install || !install.enabled) {
      throw new ProvisionerPluginError(
        `Plugin "${this.slug}" not installed or not enabled in plugin_installs.`,
        'INVALID_STATE',
        false,
      );
    }

    const config = parseEnhanceConfig(install.config);

    // Cache key incluye `updated_at` — al editar config admin, el cache se
    // invalida automáticamente sin necesidad de listener `plugin.config_changed`.
    const cacheKey = `${config.baseUrl}|${config.masterOrgId}|${install.updated_at.getTime()}|kv${install.key_version}`;
    if (this.apiClientCache?.cacheKey === cacheKey) {
      return { client: this.apiClientCache.client, config };
    }

    // Decrypt apiToken via SecretVaultService.
    const secrets = parseSecretsBlob(install.secrets);
    const apiTokenBlob = secrets.apiToken;
    if (!apiTokenBlob) {
      throw new ProvisionerPluginError(
        `Plugin "${this.slug}": secret "apiToken" not configured. ` +
          `Configure it via PATCH /admin/plugins/${this.slug}.`,
        'INVALID_STATE',
        false,
      );
    }
    const apiToken = this.vault.decrypt(apiTokenBlob);

    const client = new EnhanceApiClient({
      baseUrl: config.baseUrl,
      apiToken,
    });

    this.apiClientCache = { client, config, cacheKey };
    this.logger.log(
      `getApiClient: built EnhanceApiClient for ${config.baseUrl} (cacheKey=${cacheKey.slice(-30)})`,
    );
    return { client, config };
  }

  private buildUnknownInfo(
    service: ServiceWithRelations,
    reason: string,
    // Sprint 15C.II Fase E — ADR-077 Amendment A5 + ADR-083 Amendment A5.2:
    // el plugin clasifica su drift al campo declarativo `recoveryHint`. La UI
    // ramifica por este valor (NUNCA matchea `reason`/`statusReason` por
    // string) para ofrecer el CTA de remediación correcto. `not_yet_provisioned`
    // y `subscription_missing` → 'reprovision' (re-crear el recurso).
    recoveryHint: ServiceRecoveryHint = 'reprovision',
  ): ServiceInfo {
    return {
      status: 'unknown',
      statusReason: reason,
      recoveryHint,
      display: {
        primary: service.domain ?? service.label ?? 'Hosting Enhance',
        secondary: 'plugin.enhance_cp.label',
      },
      capabilities: {
        ...this.capabilities,
        hasSsoPanel: false,
        inlineActions: [],
      },
      availableActions: [],
      fetchedAt: new Date().toISOString(),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

interface ServiceEnhanceRefs {
  readonly orgId: string;
  readonly subscriptionId: number;
}

function extractServiceRefs(
  service: ServiceWithRelations,
): ServiceEnhanceRefs | null {
  const md = service.metadata as Record<string, unknown> | null | undefined;
  const orgId = md?.enhance_org_id;
  const ref = service.provider_reference;
  if (typeof orgId !== 'string' || orgId.length === 0) return null;
  if (typeof ref !== 'string' || ref.length === 0) return null;
  const subscriptionId = Number(ref);
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) return null;
  return { orgId, subscriptionId };
}

function extractWebsiteId(service: ServiceWithRelations): string | null {
  const md = service.metadata as Record<string, unknown> | null | undefined;
  const wsId = md?.enhance_website_id;
  return typeof wsId === 'string' && wsId.length > 0 ? wsId : null;
}

function extractEnhancePlanId(productConfig: Record<string, unknown>): number {
  const raw = productConfig['enhance_plan_id'];
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
    throw new ProvisionerPluginError(
      `product.provisioner_config.enhance_plan_id missing or invalid ` +
        `(expected positive integer, got typeof=${typeof raw}).`,
      'INVALID_PAYLOAD',
      false,
    );
  }
  return raw;
}

/**
 * Lectura no-lanzante de un entero positivo en `product.provisioner_config`.
 * Devuelve `null` si la config es `null`, el campo no existe, o no es un
 * entero positivo. Usado por `getServiceInfo()` para detectar drift de plan
 * sin romper si la config está incompleta (a diferencia de `extractEnhancePlanId`
 * que SÍ lanza — ese se usa en `provision()` donde el config es obligatorio).
 */
function readPositiveIntConfig(
  config: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!config) return null;
  const raw = config[key];
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0
    ? raw
    : null;
}

/**
 * Construye el nombre legible para Enhance Customer + Member + Login.
 * Prioridad: company_name > "first_name last_name" > email.
 */
function buildDisplayName(client: ClientPublicData): string {
  if (client.company_name && client.company_name.trim().length > 0) {
    return client.company_name.trim();
  }
  const fullName = [client.first_name, client.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return fullName.length > 0 ? fullName : client.email;
}

/**
 * Validación mínima de FQDN — suficiente para DH-INV-2 (ADR-082 §1).
 * NO valida estrictamente RFC 1035 — Enhance hace su propia validación final.
 * Aelium solo defiende contra null / vacío / sin punto / demasiado largo.
 */
function isValidFqdn(domain: string | null): boolean {
  if (typeof domain !== 'string') return false;
  if (domain.length === 0 || domain.length > 253) return false;
  if (!domain.includes('.')) return false;
  return true;
}

/**
 * Mapea EnhanceStatus + suspendedBy → ServiceInfoStatus canónico.
 * Espejo del comportamiento Enhance:
 *   - status='active' + suspendedBy=null → active
 *   - status='active' + suspendedBy=<id> → suspended
 *   - status='deleted'                   → cancelled
 */
function mapSubscriptionStatus(sub: EnhanceSubscription): ServiceInfoStatus {
  if (sub.status === ('deleted' satisfies EnhanceStatus)) return 'cancelled';
  if (sub.suspendedBy && sub.suspendedBy.length > 0) return 'suspended';
  if (sub.status === 'active') return 'active';
  return 'unknown';
}

/**
 * Mapea EnhanceWebsiteStatus → ServiceInfoStatus.
 * Reservado para uso futuro (getServiceInfo podría diferenciar status del
 * website vs status de la subscription si llega caso).
 */
export function mapWebsiteStatus(ws: EnhanceWebsiteStatus): ServiceInfoStatus {
  switch (ws) {
    case 'active':
      return 'active';
    case 'suspended':
      return 'suspended';
    case 'creating':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'deleting':
    case 'deleted':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

// ─── F.10 Apps helpers (Sprint 15C.II — ADR-077 A9 + ADR-083 A9) ────────

/**
 * Mapea un `EnhanceWebsiteApp` del listado del proveedor a `AppPresence`
 * (shape contractual genérico de ADR-077 Amendment A9).
 *
 * Decide si la action `'open_app_admin'` está disponible para esta
 * instalación según el kind:
 *   - WordPress: requiere `defaultWpUserId` presente en el listado.
 *     Si falta (i.e. el cliente NO ha configurado un default SSO user
 *     en el panel) → `actions: []` → frontend renderiza atajo DISABLED
 *     con tooltip + CTA al panel via `SsoButton` existente.
 *   - Joomla: siempre disponible (URL canónica `${site_url}/administrator`
 *     no requiere user configurado — el cliente entra con sus credenciales).
 *   - Kinds futuros (no presentes hoy en orchd): default sin actions
 *     (defensive — heredabilidad sin breaking changes).
 *
 * Heredabilidad (ADR-077 A9.9 §"plugins futuros"): plugins SaaS que añadan
 * apps suman cases aquí o copian el patrón con sus propios kinds. El shape
 * genérico `AppPresence` queda intacto.
 */
function buildAppPresence(app: EnhanceWebsiteApp): AppPresence {
  const baseLabel =
    app.app === 'wordpress'
      ? 'plugin.enhance_cp.apps.wordpress'
      : app.app === 'joomla'
        ? 'plugin.enhance_cp.apps.joomla'
        : 'plugin.enhance_cp.apps.unknown';

  // El kind del contrato genérico es string libre plugin-internal (D2/R3
  // frozen §A.11.10.7.2). Aquí solo emitimos los kinds que orchd reporta
  // hoy ('wordpress' | 'joomla'); futuros se añaden sin amendment.
  const kind: string = app.app;

  // Determinar si 'open_app_admin' está disponible per kind.
  const openAdminAction: ServiceAction = {
    slug: 'open_app_admin',
    label: 'plugin.enhance_cp.actions.open_app_admin.label',
    description: 'plugin.enhance_cp.actions.open_app_admin.description',
    confirmRequired: false,
    destructive: false,
  };

  let actions: readonly ServiceAction[] = [];
  if (app.app === 'wordpress') {
    // WP: requiere default user configurado (optimización ADR-083 A9.3 —
    // el field opcional del listado evita call extra a getDefaultWpSsoUser
    // per-app en getServiceInfo).
    if (app.defaultWpUserId !== undefined) {
      actions = [openAdminAction];
    }
  } else if (app.app === 'joomla') {
    // Joomla: siempre disponible (URL canónica del CMS Joomla desde 2005).
    actions = [openAdminAction];
  }
  // Kinds futuros: default `actions: []` defensive — el frontend renderiza
  // disabled state hasta que el plugin se actualice para soportar el kind.

  const presence: AppPresence = {
    appId: app.id,
    kind,
    label: baseLabel,
    version: app.version,
    actions,
  };

  // Path opcional (omitido si la app está en raíz — el OAS lo declara así).
  if (app.path !== undefined && app.path.length > 0) {
    return { ...presence, path: app.path };
  }
  return presence;
}

function buildMetrics(
  bandwidth: EnhanceBandwidth | null,
  resources: EnhanceUsedResourcesFullListing | null,
): ServiceMetrics | undefined {
  if (!bandwidth && !resources) return undefined;

  const metrics: ServiceMetrics = {
    fetchedAt: new Date().toISOString(),
  };

  if (bandwidth) {
    metrics.bandwidthUsedMb = bandwidth.usedMb;
  }

  if (resources) {
    for (const item of resources.items) {
      const lower = item.name.toLowerCase();
      if (lower === 'disk' || lower === 'diskspace') {
        metrics.diskUsedMb = item.usage;
        if (item.total !== undefined) metrics.diskTotalMb = item.total;
      } else if (lower === 'emailaccounts' || lower === 'email_accounts') {
        metrics.emailAccountsUsed = item.usage;
        if (item.total !== undefined) metrics.emailAccountsTotal = item.total;
      } else if (lower === 'databases' || lower === 'mysqldbs') {
        metrics.databasesUsed = item.usage;
        if (item.total !== undefined) metrics.databasesTotal = item.total;
      }
    }
  }
  return metrics;
}

// ─── F.7 SSL helpers (Sprint 15C.II — ADR-077 A7 + ADR-083 A8) ──────────

/**
 * Umbral canónico entre `valid` y `expiring_soon` — 14 días naturales.
 * ADR-077 A7.4: fijo (NO setting), industry standard ACME/LE (LE auto-renueva
 * 30d antes → 14d da margen para detectar fallos de renovación). Cálculo
 * server-side; el frontend NUNCA hace aritmética de fechas (races UTC/local
 * + permite tests deterministas con `now` inyectable).
 */
export const SSL_EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Parser defensivo de la fecha `expires` del cert (orchd OAS la declara
 * `string` sin formato — en la práctica ISO-8601, pero defensemos contra
 * RFC-2822 u otros). Devuelve `null` si el string es ilegible — el caller
 * omite el `ssl` para no exponer parciales.
 */
export function parseEnhanceCertDate(raw: string): Date | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Heurística de auto-renovación — ADR-083 A8.4.
 *
 * Enhance auto-renueva los certs Let's Encrypt (~30 días antes de expirar,
 * política orchd built-in). Los certs subidos por el cliente vía
 * `POST /v2/domains/{domain_id}/ssl` son custom y NO se auto-renuevan.
 * La distinción no viaja explícita en `DomainSslCert.issuer`, pero es
 * derivable: el `issuer` LE es estable ("Let's Encrypt Authority X3",
 * "Let's Encrypt R3", "Let's Encrypt E1"…) — todos contienen "Let's Encrypt"
 * (apostrofado o no).
 *
 * Cualquier cert NO LE devuelve `false` (no `undefined`) — el cliente lo
 * subió sabiendo que es manual; queremos mostrarle "renovación manual"
 * explícito, no omitir la línea.
 */
export function detectAutoRenew(issuer: string): boolean {
  return /let'?s\s*encrypt/i.test(issuer);
}

/**
 * Mapeo cert orchd → `ServiceSslSummary` — ADR-083 A8.4.
 *
 *   - `website === null`           → `undefined` (no podemos resolver `domain.id`).
 *   - `getDomainSsl` throws        → `undefined` (red/auth — no exponer parcial).
 *   - `getDomainSsl` devuelve null → `{ status: 'none' }` (404 = sin cert).
 *   - cert con `expires` ilegible  → `undefined` (no exponer parcial).
 *   - cert válido → cálculo server-side (expired / expiring_soon / valid).
 *
 * `now` es inyectable para tests deterministas.
 */
export async function buildSslSummary(
  api: EnhanceApiClient,
  website: EnhanceWebsite | null,
  now: Date = new Date(),
): Promise<ServiceSslSummary | undefined> {
  if (!website) return undefined;

  let cert: EnhanceDomainSslCert | null;
  try {
    cert = await api.getDomainSsl(website.domain.id);
  } catch {
    return undefined;
  }
  if (cert === null) return { status: 'none' };

  const expiresAt = parseEnhanceCertDate(cert.expires);
  if (!expiresAt) return undefined;

  const msUntilExpiry = expiresAt.getTime() - now.getTime();
  const status: ServiceSslStatus =
    msUntilExpiry <= 0
      ? 'expired'
      : msUntilExpiry <= SSL_EXPIRING_SOON_MS
        ? 'expiring_soon'
        : 'valid';

  return {
    status,
    expiresAt: expiresAt.toISOString(),
    autoRenew: detectAutoRenew(cert.issuer),
    issuer: cert.issuer,
  };
}

// `filterActionsByStatus` se movió a `core/provisioning/plugin-utils.ts`
// (Sprint 15C.II Fase F.4) para que el orquestador la reutilice al re-derivar
// `availableActions` desde el estado administrativo. El plugin lo importa de
// ahí (ver el bloque de imports arriba).

function parseEnhanceConfig(raw: unknown): EnhanceConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ProvisionerPluginError(
      'plugin_installs.config is missing or malformed for enhance_cp.',
      'INVALID_STATE',
      false,
    );
  }
  const obj = raw as Record<string, unknown>;
  const baseUrl = obj.baseUrl;
  const masterOrgId = obj.masterOrgId;
  const reconciliationIntervalHours =
    typeof obj.reconciliationIntervalHours === 'number' &&
    Number.isInteger(obj.reconciliationIntervalHours)
      ? obj.reconciliationIntervalHours
      : 6;
  if (
    typeof baseUrl !== 'string' ||
    baseUrl.length === 0 ||
    typeof masterOrgId !== 'string' ||
    masterOrgId.length === 0
  ) {
    throw new ProvisionerPluginError(
      'plugin_installs.config for enhance_cp is missing baseUrl or masterOrgId.',
      'INVALID_STATE',
      false,
    );
  }
  return { baseUrl, masterOrgId, reconciliationIntervalHours };
}

function parseSecretsBlob(raw: unknown): Record<string, EncryptedSecret> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, EncryptedSecret> = {};
  for (const [key, blob] of Object.entries(raw as Record<string, unknown>)) {
    if (
      blob &&
      typeof blob === 'object' &&
      'ciphertext' in blob &&
      'iv' in blob &&
      'tag' in blob &&
      'key_version' in blob
    ) {
      const b = blob as Record<string, unknown>;
      if (
        typeof b.ciphertext === 'string' &&
        typeof b.iv === 'string' &&
        typeof b.tag === 'string' &&
        typeof b.key_version === 'number'
      ) {
        out[key] = {
          ciphertext: b.ciphertext,
          iv: b.iv,
          tag: b.tag,
          key_version: b.key_version,
        };
      }
    }
  }
  return out;
}

function generateRandomPassword(): string {
  // 16 bytes = 128 bits hex (32 chars). Suficiente para el primer login.
  // El cliente puede cambiarlo desde el panel Enhance una vez recibido por email.
  return crypto.randomBytes(16).toString('hex');
}
