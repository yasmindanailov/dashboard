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
 * Capabilities estáticas frozen (ADR-083 §9 decisión 31):
 *   - has_sso_panel: true (Customer Panel via OTP)
 *   - has_metrics: true (disk + bandwidth + email + db counts)
 *   - has_dns_management: true (Enhance es PowerDNS authority)
 *   - supports_reconciliation: true (cron 6h)
 *
 * inlineActions (ADR-083 §9 decisión 32 + Amendment A3 + Amendment A4.1) — 8 actions:
 *   - cliente: reset_account_password
 *   - DNS:     list_dns_records, add_dns_record, update_dns_record, delete_dns_record
 *   - admin:   change_package, force_resync, list_available_plans
 *   (Sprint 15C.II Fase B: view_disk_usage + view_bandwidth_usage eliminados —
 *    métricas refrescadas via botón ↻ en MetricsBar + forceRevalidate flag)
 *
 * Reglas:
 *   - R4: importa SOLO de `core/provisioning/types`, `core/database`,
 *     `core/security` (vault), Y los archivos del propio plugin
 *     (`./api`, `./enhance-customers.service`). NO importa orquestador.
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
  ServiceStatusReport,
  ServiceWithRelations,
  SsoUrl,
} from '../../../core/provisioning/types';
import {
  EncryptedSecret,
  SecretVaultService,
} from '../../../core/security/secret-vault.service';

import {
  EnhanceApiClient,
  EnhanceBandwidth,
  EnhanceStatus,
  EnhanceSubscription,
  EnhanceUsedResourcesFullListing,
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
      description: 'plugin.enhance_cp.config.baseUrl',
    },
    masterOrgId: {
      type: 'string',
      format: 'uuid',
      description: 'plugin.enhance_cp.config.masterOrgId',
    },
    reconciliationIntervalHours: {
      type: 'integer',
      default: 6,
      minimum: 1,
      maximum: 168,
      description: 'plugin.enhance_cp.config.reconciliationIntervalHours',
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
    confirmRequired: true,
    confirmationText: 'plugin.enhance_cp.actions.change_package.confirm',
    destructive: false,
    adminOnly: true,
    payloadSchema: CHANGE_PACKAGE_SCHEMA as Record<string, unknown>,
  },
  {
    slug: 'force_resync',
    label: 'plugin.enhance_cp.actions.force_resync',
    description: 'plugin.enhance_cp.actions.force_resync.description',
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
  testConnectionMethod: 'getStatus',
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
        return {
          status: 'unknown',
          statusReason: 'subscription not found in Enhance (drift detected)',
          checkedAt: new Date().toISOString(),
        };
      }
      throw err;
    }
  }

  // ─── 4. getServiceInfo() — display + métricas ──────────────────────────

  async getServiceInfo(service: ServiceWithRelations): Promise<ServiceInfo> {
    const refs = extractServiceRefs(service);
    if (!refs) {
      return this.buildUnknownInfo(service, 'service not yet provisioned');
    }
    const { client: api } = await this.getApiClient();

    // Lectura paralela: subscription es obligatoria; bandwidth + resources
    // son best-effort (si fallan, devolvemos info sin métricas).
    const [subscription, bandwidth, resources] = await Promise.all([
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
    ]);

    if (!subscription) {
      return this.buildUnknownInfo(
        service,
        'subscription not found in Enhance (drift detected)',
      );
    }

    const status = mapSubscriptionStatus(subscription);
    const metrics = buildMetrics(bandwidth, resources);
    const availableActions = filterActionsByStatus(this.inlineActions, status);

    return {
      status,
      statusReason: subscription.suspendedBy
        ? `suspended by ${subscription.suspendedBy}`
        : undefined,
      display: {
        primary: service.domain ?? subscription.friendlyName,
        secondary: subscription.planName,
      },
      metrics,
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
      case 'force_resync':
        return this.actionForceResync(api, refs);
      case 'list_available_plans':
        return this.actionListAvailablePlans();

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
    return {
      success: true,
      data: {
        zone: { origin: zone.origin, soa: zone.soa, records: zone.records },
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
    await this.prisma.service.update({
      where: { id: service.id },
      data: { metadata: { ...md, enhance_plan_id: planId } },
    });

    return {
      success: true,
      message: 'plugin.enhance_cp.actions.change_package.success',
      data: { newPlanId: planId },
    };
  }

  private async actionForceResync(
    api: EnhanceApiClient,
    refs: ServiceEnhanceRefs,
  ): Promise<ActionResult> {
    const usage = await api.calculateResourceUsage(
      refs.orgId,
      refs.subscriptionId,
    );
    return {
      success: true,
      message: 'plugin.enhance_cp.actions.force_resync.success',
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
  ): ServiceInfo {
    return {
      status: 'unknown',
      statusReason: reason,
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

/**
 * Filtra `inlineActions` por `ServiceInfoStatus`. Acciones que no tienen
 * sentido en estado terminal (cancelled) o transitorio (pending/failed/unknown)
 * no aparecen en la UI.
 */
function filterActionsByStatus(
  actions: readonly ServiceAction[],
  status: ServiceInfoStatus,
): readonly ServiceAction[] {
  if (status === 'active' || status === 'suspended') return actions;
  // En todos los demás estados (pending/cancelled/failed/expired/unknown)
  // las acciones inline no aplican — el cliente debe esperar reconcile o
  // contactar soporte.
  return [];
}

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
