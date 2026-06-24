/**
 * Sprint 15D Fase 15D.D — `ResellerclubProvisionerPlugin`.
 *
 * Primer plugin de **registrar de dominios** del proyecto. Materializa
 * ADR-081 (specifics RC) sobre el sub-contrato de registrar (ADR-077 A10) +
 * el framework de plugins (ADR-080). Segundo plugin SaaS real tras Enhance.
 *
 * Alcance por commit (Fase 15D.D):
 *   - **Commit 3 (este scaffold):** identidad + capabilities + manifest + las
 *     5 inline actions de gestión + suspend/unsuspend + plano A
 *     (`checkDomainAvailability`/`getTldPricing`) + `getApiClient` desde vault.
 *     Hace el plugin CARGABLE y verde en el contract test (static-only).
 *   - **Commit 4:** `provision(register)` + DOM-INV-1 (hoy `NOT_IMPLEMENTED`).
 *   - **Commit 5:** `getServiceInfo`/`getStatus`/`DomainInfo`/`deprovision`
 *     (hoy stubs conservadores).
 *   - **Fase 15D.E:** `renew` + lifecycle. **Fase 15D.F:** handlers de
 *     `executeAction` (gestión + admin suspend/unsuspend).
 *
 * Doctrina:
 *   - `is_domain_registrar=true`, `has_dns_management=false` (la autoridad DNS
 *     es Enhance — ADR-082; el plugin RC NO la importa, R4). `has_sso_panel=false`
 *     (puerta unificada — ADR-070, cero SSO al panel RC).
 *   - `getApiClient` construye el `ResellerClubApiClient` desde `plugin_installs`
 *     (config plano + secrets `authUserId`/`apiKey` cifrados con
 *     `SecretVaultService` AES-256-GCM, ADR-080). Cache invalidado por
 *     `updated_at`/`key_version` (mismo patrón Enhance).
 *
 * Reglas:
 *   - R4: importa SOLO de `core/provisioning/*`, `core/database`, `core/security`
 *     y archivos del propio plugin (`./api`, `./resellerclub-customers.service`).
 *     NO importa el orquestador ni otros plugins.
 *   - R7: errores semánticos vía `ProvisionerPluginError`.
 *   - R12: `authUserId`/`apiKey` se descifran en memoria, NUNCA se persisten en
 *     `services.metadata` ni en logs.
 */

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import {
  ActionResult,
  ClientPublicData,
  DeprovisionContext,
  DomainAvailability,
  DomainInfo,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  PluginCapabilities,
  PluginManifest,
  ProvisionContext,
  ProvisionResult,
  ProvisionerPlugin,
  ProvisionerPluginError,
  RegistrantUpdateResult,
  ServiceAction,
  ServiceInfo,
  ServiceInfoStatus,
  ServiceRecoveryHint,
  ServiceStatusReport,
  ServiceWithRelations,
  SsoUrl,
  TldCostEntry,
} from '../../../core/provisioning/types';
import { filterActionsByStatus } from '../../../core/provisioning/plugin-utils';
import { SecretVaultService } from '../../../core/security/secret-vault.service';
import { SettingsService } from '../../../core/settings/settings.service';

import {
  RcDomainDetails,
  RcEnvironment,
  RcOrderId,
  RcPriceOperation,
  ResellerClubApiClient,
  resolveResellerClubBaseUrl,
} from './api';
import { ResellerclubCustomersService } from './resellerclub-customers.service';

/** Slug canónico del plugin. */
const RC_SLUG = 'resellerclub';

/** TLDs ofertados por defecto (ADR-084 §3.4). Con punto (display/oferta). */
const DEFAULT_TLDS_OFFERED = ['.com', '.net', '.org', '.es', '.eu'] as const;

/** NS por defecto si el setting C3 no está poblado (fallback defensivo, ADR-082 §4). */
const DEFAULT_NAMESERVERS = ['ns1.aelium.net', 'ns2.aelium.net'] as const;

/**
 * NS de parking del registrar si el setting no está poblado (fallback defensivo,
 * ADR-082 Amendment F.3). Un dominio-solo (sin hosting) aparca aquí —resuelven
 * en el registrar— porque Enhance no puede crear una zona DNS sin website.
 * PROVISIONAL: confirmar en smoke Fase G.
 */
const DEFAULT_PARKING_NAMESERVERS = [
  'dns1.resellerclub.com',
  'dns2.resellerclub.com',
] as const;

/**
 * Avance mínimo de la expiración (segundos) que cuenta como "1 año renovado"
 * (Fase 15D.E / DOM-INV-4). Cota inferior conservadora: 300 días/año — muy por
 * encima de 0 (detecta un `renew` que no extendió) y muy por debajo de 365
 * (absorbe el desfase calendario/bisiesto del registrar real). Usado tanto para
 * la idempotencia por período como para la verificación post-renew.
 */
const MIN_RENEW_ADVANCE_SECONDS_PER_YEAR = 300 * 24 * 3600;

/**
 * Mapa `classkey` RC → TLD sin punto (ADR-081 A1.2 — clave de unión
 * availability ↔ pricing ↔ `domain_tld_pricing`). Solo los TLDs del scope v1.
 */
const CLASSKEY_TO_TLD: Readonly<Record<string, string>> = {
  domcno: 'com',
  dotnet: 'net',
  domorg: 'org',
  dotes: 'es',
  doteu: 'eu',
};

/** Operación de precio RC → operación canónica de `TldCostEntry` (ADR-084 §1). */
const RC_OP_TO_TLD_OP: Readonly<
  Record<RcPriceOperation, TldCostEntry['operation']>
> = {
  addnewdomain: 'register',
  renewdomain: 'renew',
  addtransferdomain: 'transfer',
  restoredomain: 'restore',
};

// ────────────────────────────────────────────────────────────────────────────
// Manifest schemas — ADR-080 §1 + ADR-081 §2/§8
// ────────────────────────────────────────────────────────────────────────────

const RESELLERCLUB_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    environment: {
      type: 'string',
      enum: ['sandbox', 'production'],
      default: 'sandbox',
      title: 'plugin.resellerclub.config.environment.label',
      description: 'plugin.resellerclub.config.environment',
    },
    markup_percent: {
      type: 'integer',
      default: 25,
      minimum: 0,
      maximum: 1000,
      title: 'plugin.resellerclub.config.markup_percent.label',
      description: 'plugin.resellerclub.config.markup_percent',
    },
    // El subset JsonSchema7 del manifest (ADR-080) solo admite escalares —
    // los TLDs ofertados se modelan como CSV (parseado a array en runtime).
    tlds_offered: {
      type: 'string',
      default: '.com,.net,.org,.es,.eu',
      title: 'plugin.resellerclub.config.tlds_offered.label',
      description: 'plugin.resellerclub.config.tlds_offered',
    },
    default_currency: {
      type: 'string',
      default: 'EUR',
      minLength: 3,
      maxLength: 3,
      title: 'plugin.resellerclub.config.default_currency.label',
      description: 'plugin.resellerclub.config.default_currency',
    },
  },
  additionalProperties: false,
} as const;

const RESELLERCLUB_SECRETS_SCHEMA = {
  type: 'object',
  properties: {
    authUserId: {
      type: 'string',
      minLength: 1,
      title: 'plugin.resellerclub.secrets.authUserId.label',
      description: 'plugin.resellerclub.secrets.authUserId',
    },
    apiKey: {
      type: 'string',
      format: 'password',
      minLength: 8,
      title: 'plugin.resellerclub.secrets.apiKey.label',
      description: 'plugin.resellerclub.secrets.apiKey',
    },
  },
  required: ['authUserId', 'apiKey'],
  additionalProperties: false,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// payloadSchemas de las inline actions con input (JSON-Schema 7).
// Son UX form-side (frontend @rjsf, Fase F.4) — el enforcement real es defensivo
// en los handlers (types.ts:1304 — "el backend nunca confía en el frontend").
// ────────────────────────────────────────────────────────────────────────────

const MODIFY_NAMESERVERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nameservers'],
  properties: {
    nameservers: {
      type: 'array',
      minItems: 2,
      maxItems: 13,
      items: { type: 'string', format: 'hostname', minLength: 1 },
      title: 'plugin.resellerclub.actions.modify_nameservers.field.nameservers',
    },
  },
} as const;

const TOGGLE_PRIVACY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['enabled'],
  properties: {
    enabled: {
      type: 'boolean',
      title: 'plugin.resellerclub.actions.toggle_privacy.field.enabled',
    },
    reason: {
      type: 'string',
      maxLength: 200,
      title: 'plugin.resellerclub.actions.toggle_privacy.field.reason',
    },
  },
} as const;

const TOGGLE_REGISTRAR_LOCK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['locked'],
  properties: {
    locked: {
      type: 'boolean',
      title: 'plugin.resellerclub.actions.toggle_registrar_lock.field.locked',
    },
  },
} as const;

// ────────────────────────────────────────────────────────────────────────────
// inlineActions — sub-contrato de registrar (ADR-077 A10) + suspend (A4)
// ────────────────────────────────────────────────────────────────────────────

const RESELLERCLUB_INLINE_ACTIONS: readonly ServiceAction[] = [
  // 5 acciones de gestión de registrar (ADR-077 A10.4 — required si
  // is_domain_registrar=true). Handlers en Fase 15D.F.
  {
    slug: 'modify_nameservers',
    label: 'plugin.resellerclub.actions.modify_nameservers',
    description: 'plugin.resellerclub.actions.modify_nameservers.description',
    confirmRequired: true, // peligrosa: cambiar NS puede tumbar el dominio (A10.4)
    confirmationText: 'plugin.resellerclub.actions.modify_nameservers.confirm',
    destructive: true,
    payloadSchema: MODIFY_NAMESERVERS_SCHEMA as Record<string, unknown>,
  },
  {
    slug: 'modify_contacts',
    label: 'plugin.resellerclub.actions.modify_contacts',
    confirmRequired: false,
    destructive: false,
  },
  {
    slug: 'toggle_privacy',
    label: 'plugin.resellerclub.actions.toggle_privacy',
    confirmRequired: false,
    destructive: false,
    payloadSchema: TOGGLE_PRIVACY_SCHEMA as Record<string, unknown>,
  },
  {
    slug: 'toggle_registrar_lock',
    label: 'plugin.resellerclub.actions.toggle_registrar_lock',
    confirmRequired: false,
    destructive: false,
    payloadSchema: TOGGLE_REGISTRAR_LOCK_SCHEMA as Record<string, unknown>,
  },
  {
    slug: 'get_auth_code',
    label: 'plugin.resellerclub.actions.get_auth_code',
    description: 'plugin.resellerclub.actions.get_auth_code.description',
    confirmRequired: false,
    destructive: false,
  },
  // suspend/unsuspend admin (ADR-077 A4 — required si supports_suspend=true).
  // Ambas adminOnly; suspend destructive, unsuspend no. Handlers en Fase 15D.F
  // (G1/G2 orders/suspend|unsuspend, ADR-081 §9). El orquestador transiciona
  // services.status + emite service.suspended/unsuspended (R8).
  {
    slug: 'suspend_service',
    label: 'plugin.resellerclub.actions.suspend_service',
    description: 'plugin.resellerclub.actions.suspend_service.description',
    confirmRequired: true,
    confirmationText: 'plugin.resellerclub.actions.suspend_service.confirm',
    destructive: true,
    adminOnly: true,
  },
  {
    slug: 'unsuspend_service',
    label: 'plugin.resellerclub.actions.unsuspend_service',
    description: 'plugin.resellerclub.actions.unsuspend_service.description',
    confirmRequired: true,
    confirmationText: 'plugin.resellerclub.actions.unsuspend_service.confirm',
    destructive: false,
    adminOnly: true,
  },
];

const RESELLERCLUB_CAPABILITIES: PluginCapabilities = {
  has_sso_panel: false, // ADR-070: cero SSO al panel RC (puerta unificada)
  has_metrics: false,
  has_metrics_history: false,
  requires_server: false,
  provision_mode: 'sync',
  completes_via_task: false,
  supports_reconciliation: true, // cron de reconcile (domains/search) — Fase 15D.E
  has_dns_management: false, // ADR-082 A1: la autoridad DNS es Enhance, NO RC
  supports_suspend: true, // G1/G2 orders suspend/unsuspend (admin) — Fase 15D.F
  is_domain_registrar: true, // ADR-077 A10: cumple el sub-contrato de registrar
};

const RESELLERCLUB_MANIFEST: PluginManifest = {
  slug: RC_SLUG,
  version: '1.0.0',
  manifestVersion: 'v1',
  label: 'plugin.resellerclub.label',
  description: 'plugin.resellerclub.description',
  docsUrl: 'docs/features/provisioning/admin-plugins-resellerclub.md',
  settingsCategory: 'provisioner',
  configSchema: RESELLERCLUB_CONFIG_SCHEMA,
  secretsSchema: RESELLERCLUB_SECRETS_SCHEMA,
  // 'custom': el plugin implementa `testConnection()` con un probe de solo
  // lectura (reseller-price) que valida auth (userid+api-key) + atraviesa el
  // WAF de Cloudflare sin registrar nada (ADR-077 A6).
  testConnectionMethod: 'custom',
};

// ────────────────────────────────────────────────────────────────────────────
// Config descifrado + cache del cliente
// ────────────────────────────────────────────────────────────────────────────

interface ResellerclubConfig {
  readonly environment: RcEnvironment;
  readonly markupPercent: number;
  readonly tldsOffered: readonly string[];
  readonly defaultCurrency: string;
  /**
   * DC.NEW-67 (Fase 15D.E) — override **test-only** de la URL base. Permite a los
   * tests de integración apuntar `getApiClient` al `MockResellerClubServer` sin
   * golpear OT&E. **No** está en el `configSchema` del manifest (que es
   * `additionalProperties: false`) → el PATCH /admin/plugins validado por Ajv lo
   * RECHAZA en producción; solo lo siembran los IT que escriben `plugin_installs`
   * directo. `undefined` ⇒ se resuelve por `environment` (sandbox/production).
   */
  readonly baseUrlOverride?: string;
}

interface ApiClientCacheEntry {
  readonly client: ResellerClubApiClient;
  readonly config: ResellerclubConfig;
  readonly cacheKey: string;
}

@Injectable()
export class ResellerclubProvisionerPlugin implements ProvisionerPlugin {
  private readonly logger = new Logger(ResellerclubProvisionerPlugin.name);

  readonly slug = RC_SLUG;
  readonly contractVersion = PROVISIONER_PLUGIN_CONTRACT_VERSION;
  readonly capabilities = RESELLERCLUB_CAPABILITIES;
  readonly inlineActions = RESELLERCLUB_INLINE_ACTIONS;
  readonly manifest = RESELLERCLUB_MANIFEST;

  /** Cache del cliente; invalidado por `updated_at`/`key_version` del install. */
  private apiClientCache: ApiClientCacheEntry | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SecretVaultService,
    private readonly customers: ResellerclubCustomersService,
    private readonly settings: SettingsService,
  ) {}

  // ─── 1. provision() — ramificado por operation (ADR-077 A10 / ADR-081 §5) ──

  async provision(ctx: ProvisionContext): Promise<ProvisionResult> {
    const operation = ctx.operation ?? 'register';
    switch (operation) {
      case 'register':
        return this.provisionRegister(ctx);
      case 'renew':
        return this.provisionRenew(ctx);
      case 'transfer_in':
        return this.provisionTransferIn(ctx);
    }
  }

  /**
   * `operation='register'` — registra el dominio (ADR-081 §5 + DOM-INV-1/ADR-084).
   *
   * Idempotencia en dos capas (registro = irreversible, cuesta dinero):
   *   1. **Reintento puro:** si `provider_reference` ya está persistido → se
   *      devuelve sin tocar RC (ADR-077 idempotencia).
   *   2. **DOM-INV-1 (recovery tras crash):** pre-flight `domains/available`; si
   *      RC reporta el FQDN `regthroughus` (registrado bajo NUESTRA cuenta pero
   *      sin `provider_reference` local — crash entre register y persistencia) →
   *      se **adopta** el order-id existente, NO se re-registra. `regthroughothers`
   *      / cualquier estado ≠ `available` → `DOMAIN_UNAVAILABLE`.
   *
   * Tras un `available`: `ensureRegistrant` (customer + 4 contactos, Commit 2) →
   * `domains/register` con NS = `provisioning.default_nameservers` (C3, ADR-082 §4),
   * `invoice-option=NoInvoice` (Aelium controla el cobro) y WHOIS privacy ON
   * (ADR-081 §10). [Shapes register/details CONSERVADORES hasta el smoke OT&E
   * Fase G — A1.5; validado contra `MockResellerClubServer`.]
   */
  private async provisionRegister(
    ctx: ProvisionContext,
  ): Promise<ProvisionResult> {
    // Capa 1 — reintento puro: ya registrado y persistido (no re-registrar).
    if (ctx.service.provider_reference) {
      this.logger.log(
        `provision(register) service=${ctx.service.id}: provider_reference ` +
          `${ctx.service.provider_reference} ya existe — reintento idempotente.`,
      );
      return {
        providerReference: ctx.service.provider_reference,
        metadata: toFlatMetadata(ctx.service.metadata),
        followUp: ['mark_active'],
      };
    }

    const domain = ctx.service.domain;
    if (!isValidFqdn(domain)) {
      throw new ProvisionerPluginError(
        `El servicio ${ctx.service.id} requiere un FQDN válido en ` +
          `services.domain (got ${domain ?? 'null'}) para registrar el dominio.`,
        'INVALID_PAYLOAD',
        false,
        undefined,
        RC_SLUG,
      );
    }
    const fqdn = (domain as string).trim().toLowerCase();
    const years = extractDomainYears(ctx.service.metadata);

    const { client } = await this.getApiClient();

    // Capa 2 — DOM-INV-1 pre-flight (exactly-once por nombre).
    const { sld, tld } = splitFqdn(fqdn);
    const availability = await client.checkAvailability(sld, [tld]);
    const status = (availability[fqdn] ?? Object.values(availability)[0])
      ?.status;

    if (status === 'regthroughus') {
      // Registrado bajo nuestra cuenta sin provider_reference local → adoptar.
      const orderId = await this.adoptExistingRegistration(client, fqdn);
      return {
        providerReference: orderId,
        metadata: {
          ...toFlatMetadata(ctx.service.metadata),
          domain_operation: 'register',
          domain_years: years,
        },
        followUp: ['mark_active'],
      };
    }
    if (status !== 'available') {
      throw new ProvisionerPluginError(
        `El dominio ${fqdn} no está disponible para registro ` +
          `(estado RC: ${status ?? 'desconocido'}).`,
        'DOMAIN_UNAVAILABLE',
        false,
        undefined,
        RC_SLUG,
      );
    }

    // Disponible → asegurar registrante (customer + 4 contactos) + registrar.
    const refs = await this.customers.ensureRegistrant(ctx.client, client);
    // F.3 (ADR-082 Amendment "dominio-solo aparca en el registrar"): el destino de
    // los NS lo decide el orquestador (R4) según haya o no hosting asociado. Un
    // dominio-solo (`dnsTargetHint='parking'`) aparca en los NS del registrar
    // (resuelven; Enhance no puede crear zona sin website). Sin hint → 'aelium'
    // (comportamiento histórico, fallback defensivo).
    const nameservers =
      ctx.dnsTargetHint === 'parking'
        ? await this.settings.getJson<string[]>(
            'provisioning',
            'registrar_parking_nameservers',
            [...DEFAULT_PARKING_NAMESERVERS],
          )
        : await this.settings.getJson<string[]>(
            'provisioning',
            'default_nameservers',
            [...DEFAULT_NAMESERVERS],
          );

    const orderId = await client.registerDomain({
      'domain-name': fqdn,
      years,
      ns: nameservers,
      'customer-id': refs.customerId,
      'reg-contact-id': refs.contacts.registrant,
      'admin-contact-id': refs.contacts.admin,
      'tech-contact-id': refs.contacts.tech,
      'billing-contact-id': refs.contacts.billing,
      'invoice-option': 'NoInvoice', // Aelium controla el cobro, no RC
      'protect-privacy': true, // WHOIS privacy ON por defecto (ADR-081 §10)
    });

    this.logger.log(
      `provision(register) service=${ctx.service.id}: dominio ${fqdn} ` +
        `registrado (order=${orderId}, years=${years}, ns=[${nameservers.join(', ')}]).`,
    );

    return {
      providerReference: orderId,
      // Preserva la metadata que puso el checkout (defensivo: si añade campos
      // nuevos en el futuro, no se pierden — el orquestador SOBREESCRIBE metadata
      // con este result, no la fusiona) + los refs RC para getServiceInfo/gestión.
      metadata: {
        ...toFlatMetadata(ctx.service.metadata),
        domain_operation: 'register',
        domain_years: years,
        rc_customer_id: refs.customerId,
        rc_registrant_contact_id: refs.contacts.registrant,
        // `nameservers` (array) es la clave canónica que lee el
        // `dns-authority-resolver` (ADR-082 §6 + A3) para resolver la autoridad
        // DNS del dominio. Antes de F.3 se escribía bajo `rc_nameservers` (clave
        // que nadie leía → todo dominio RC resolvía `external`: bug latente).
        // El cron de reconcile mantiene `nameservers` fresco (DH-INV-6).
        nameservers,
        whois_privacy: true,
      },
      followUp: ['mark_active'],
    };
  }

  /**
   * DOM-INV-1 (recovery): el dominio figura `regthroughus` pero no tenemos
   * `provider_reference` local (crash). Recupera el order-id vía
   * `domains/details-by-name` y lo adopta (no re-registra → no doble cobro).
   * [details CONSERVADOR hasta Fase G — A1.5].
   */
  private async adoptExistingRegistration(
    client: ResellerClubApiClient,
    fqdn: string,
  ): Promise<RcOrderId> {
    const details = await client.getDomainDetailsByName(fqdn);
    const orderId = normalizeOrderId(details);
    if (!orderId) {
      throw new ProvisionerPluginError(
        `DOM-INV-1: ${fqdn} figura registrado bajo nuestra cuenta (regthroughus) ` +
          `pero no se pudo extraer el order-id de details para adoptarlo. ` +
          `Reintentar tras reconcile.`,
        'PROVIDER_INTERNAL_ERROR',
        true,
        undefined,
        RC_SLUG,
      );
    }
    this.logger.warn(
      `DOM-INV-1 adopción: ${fqdn} ya registrado bajo nuestra cuenta ` +
        `(order=${orderId}) — recovery tras crash, NO se re-registra.`,
    );
    return orderId;
  }

  /**
   * `operation='transfer_in'` — inicia un transfer-in (ADR-084 §4 + A2, FSM).
   *
   * El transfer es **asíncrono**: este método solo lo INICIA (no activa el
   * servicio — `followUp: []`, queda `pending`); el reconcile cron avanza la FSM
   * `submitted → completed|failed` (motor, DH-INV-6) y entonces el orquestador lo
   * activa + cobra (T2b/T3). El estado vive en `services.metadata.transfer_state`.
   *
   * **DOM-INV-6 (exactly-once de iniciación):** el transfer arranca un service
   * SIN `provider_reference` (igual que register) → no idempotentizable por él.
   * Dos capas (espejo de DOM-INV-1):
   *   1. Reintento puro: si `provider_reference` ya existe → no re-enviar.
   *   2. Recovery tras crash: si el dominio ya figura bajo nuestra cuenta con un
   *      transfer en curso → adoptar el order-id, NO re-iniciar.
   *
   * El EPP `auth-code` llega en `ctx.transferAuthCode` (ADR-077 A14, secreto R12);
   * si falta → `awaiting_auth` (el cliente lo aporta vía la acción curada).
   * [Shapes transfer CONSERVADORES hasta el smoke OT&E Fase 15D.II.G — ADR-081 A7.4.]
   */
  private async provisionTransferIn(
    ctx: ProvisionContext,
  ): Promise<ProvisionResult> {
    // Capa 1 — reintento puro: ya iniciado y persistido (no re-enviar).
    if (ctx.service.provider_reference) {
      this.logger.log(
        `provision(transfer_in) service=${ctx.service.id}: provider_reference ` +
          `${ctx.service.provider_reference} ya existe — transfer ya iniciado, idempotente.`,
      );
      return {
        providerReference: ctx.service.provider_reference,
        metadata: toFlatMetadata(ctx.service.metadata),
        followUp: [], // asíncrono: el reconcile completa y activa
      };
    }

    const domain = ctx.service.domain;
    if (!isValidFqdn(domain)) {
      throw new ProvisionerPluginError(
        `El servicio ${ctx.service.id} requiere un FQDN válido en ` +
          `services.domain (got ${domain ?? 'null'}) para transferir el dominio.`,
        'INVALID_PAYLOAD',
        false,
        undefined,
        RC_SLUG,
      );
    }
    const fqdn = (domain as string).trim().toLowerCase();

    // El EPP auth-code es requisito de `submitted`; sin él → `awaiting_auth`
    // (el cliente lo aporta vía la acción curada `submit_transfer_auth_code`).
    const authCode = (ctx.transferAuthCode ?? '').trim();
    if (!authCode) {
      this.logger.log(
        `provision(transfer_in) service=${ctx.service.id}: falta el EPP ` +
          `auth-code → awaiting_auth (${fqdn}).`,
      );
      return {
        providerReference: null,
        metadata: {
          ...toFlatMetadata(ctx.service.metadata),
          domain_operation: 'transfer_in',
          transfer_state: 'awaiting_auth',
        },
        followUp: [],
      };
    }

    const { client } = await this.getApiClient();

    // Capa 2 — DOM-INV-6: ¿es transferible? si no, ¿ya hay un transfer nuestro
    // en curso (recovery tras crash)? else → TRANSFER_REJECTED.
    const validation = await client.validateTransfer(fqdn);
    const transferable =
      validation.transferable === true ||
      String(validation.transferable).toLowerCase() === 'true';
    if (!transferable) {
      const adopted = await this.adoptInProgressTransfer(client, fqdn);
      if (adopted) {
        return {
          providerReference: adopted.orderId,
          metadata: {
            ...toFlatMetadata(ctx.service.metadata),
            domain_operation: 'transfer_in',
            transfer_state: adopted.state,
          },
          followUp: [],
        };
      }
      throw new ProvisionerPluginError(
        `El dominio ${fqdn} no es transferible ` +
          `(${validation.reason ?? 'no transferible'}).`,
        'TRANSFER_REJECTED',
        false,
        undefined,
        RC_SLUG,
      );
    }

    // Transferible → asegurar registrante + iniciar el transfer.
    const refs = await this.customers.ensureRegistrant(ctx.client, client);
    const nameservers =
      ctx.dnsTargetHint === 'parking'
        ? await this.settings.getJson<string[]>(
            'provisioning',
            'registrar_parking_nameservers',
            [...DEFAULT_PARKING_NAMESERVERS],
          )
        : await this.settings.getJson<string[]>(
            'provisioning',
            'default_nameservers',
            [...DEFAULT_NAMESERVERS],
          );

    const orderId = await client.transferDomain({
      'domain-name': fqdn,
      'auth-code': authCode,
      ns: nameservers,
      'customer-id': refs.customerId,
      'reg-contact-id': refs.contacts.registrant,
      'admin-contact-id': refs.contacts.admin,
      'tech-contact-id': refs.contacts.tech,
      'billing-contact-id': refs.contacts.billing,
      'invoice-option': 'NoInvoice', // Aelium controla el cobro (al completar, A2.3)
      'protect-privacy': true,
    });

    this.logger.log(
      `provision(transfer_in) service=${ctx.service.id}: transfer de ${fqdn} ` +
        `iniciado (order=${orderId}) → submitted; el reconcile lo completará.`,
    );

    return {
      providerReference: orderId,
      metadata: {
        ...toFlatMetadata(ctx.service.metadata),
        domain_operation: 'transfer_in',
        transfer_state: 'submitted',
        rc_customer_id: refs.customerId,
        rc_registrant_contact_id: refs.contacts.registrant,
        nameservers,
        whois_privacy: true,
      },
      followUp: [],
    };
  }

  /**
   * DOM-INV-6 (recovery): si el dominio ya figura bajo nuestra cuenta (un
   * transfer iniciado antes de un crash que no persistió `provider_reference`),
   * adopta su order-id en vez de re-iniciar el transfer. `domains/details` "no
   * existe" → no es nuestro → no hay nada que adoptar (`null`).
   */
  private async adoptInProgressTransfer(
    client: ResellerClubApiClient,
    fqdn: string,
  ): Promise<{ orderId: RcOrderId; state: string } | null> {
    try {
      const details = await client.getDomainDetailsByName(fqdn);
      const orderId = normalizeOrderId(details);
      if (!orderId) return null;
      const action = String(details.actionstatus ?? '').toLowerCase();
      const state = action.includes('fail') ? 'failed' : 'submitted';
      this.logger.warn(
        `DOM-INV-6 adopción: ${fqdn} ya está bajo nuestra cuenta ` +
          `(order=${orderId}, action=${details.actionstatus ?? 'n/a'}) — recovery ` +
          `tras crash, NO se re-inicia el transfer.`,
      );
      return { orderId, state };
    } catch {
      return null;
    }
  }

  /**
   * Estado de la FSM de un transfer-in leído del registrar (motor del reconcile,
   * 15D.II.T2b — ADR-084 A2.2). DH-INV-6: el registrar manda. Lee `domains/details`
   * e interpreta `actionstatus`: en curso → `submitted`; sin acción → `completed`
   * (el dominio culminó a registro normal); rechazo → `failed`; cancelado →
   * `cancelled`. `unknown` si RC está caído (el reconcile salta, fail-soft R7).
   * [CONSERVADOR — el catálogo real de `actionstatus` se refina en el smoke Fase G.]
   */
  async getTransferStatus(
    service: ServiceWithRelations,
  ): Promise<'submitted' | 'completed' | 'failed' | 'cancelled' | 'unknown'> {
    const orderId = service.provider_reference;
    const fqdn = (service.domain ?? '').trim().toLowerCase();
    if (!orderId && !isValidFqdn(fqdn)) return 'unknown';
    try {
      const { client } = await this.getApiClient();
      const details = orderId
        ? await client.getDomainDetailsByOrderId(orderId)
        : await client.getDomainDetailsByName(fqdn);
      const action = String(details.actionstatus ?? '').toLowerCase();
      if (action.includes('progress')) return 'submitted';
      if (action.includes('fail')) return 'failed';
      if (action.includes('cancel')) return 'cancelled';
      return 'completed'; // sin acción en curso → el transfer culminó
    } catch {
      return 'unknown';
    }
  }

  /**
   * `operation='renew'` — renueva el dominio (ADR-081 §5 + DOM-INV-4/ADR-084 A1).
   *
   * **DOM-INV-4 (renovación verificada):** un `renew` que no extiende = el cliente
   * pierde el dominio creyéndolo renovado (el peor fallo de un registrar). Tras
   * `domains/renew` se RELEE `domains/details` y se confirma que `endtime` avanzó
   * ~el período esperado **antes** de marcar éxito; si no avanzó →
   * `PROVIDER_INTERNAL_ERROR` retriable (BullMQ reintenta → DLQ + alerta, R13).
   *
   * **Idempotencia por período (cierra el doble-renew ante crash-retry):** ancla
   * en `services.expires_at` (última expiración registrada por el reconcile, que
   * corre cada 6h y está poblada mucho antes de la 1ª renovación, ~1 año después
   * del registro). Si el `endtime` actual del registrar **ya** está ~`renewYears`
   * por delante del ancla → la renovación de este período YA ocurrió (re-run /
   * recovery): se devuelve éxito **sin** re-llamar a RC (no re-cobra) y sin
   * re-emitir `domain.renewed` (`domain_renew_performed=false`). Si no hay ancla
   * (ventana de las primeras 6h post-registro, sin renovaciones reales): best-effort
   * sobre el `endtime` leído. [Shapes details/renew CONSERVADORES hasta el smoke
   * OT&E Fase G — A1.5; validado contra `MockResellerClubServer`.]
   */
  private async provisionRenew(
    ctx: ProvisionContext,
  ): Promise<ProvisionResult> {
    const orderId = ctx.service.provider_reference;
    if (!orderId) {
      throw new ProvisionerPluginError(
        `renew requiere provider_reference (order-id RC) en el servicio ` +
          `${ctx.service.id} (el dominio debe estar registrado antes de renovar).`,
        'INVALID_STATE',
        false,
        undefined,
        RC_SLUG,
      );
    }
    const renewYears = renewYearsForCycle(ctx.service.billing_cycle);
    const minAdvance = renewYears * MIN_RENEW_ADVANCE_SECONDS_PER_YEAR;
    const { client } = await this.getApiClient();

    // 1. Estado actual en el registrar (fuente de verdad — DH-INV-6).
    const before = await client.getDomainDetailsByOrderId(orderId);
    const beforeEnd = toEpochSeconds(before.endtime);
    if (beforeEnd === null) {
      // Sin `endtime` no se puede verificar DOM-INV-4 → no afirmar éxito.
      throw new ProvisionerPluginError(
        `renew service=${ctx.service.id} (order=${orderId}): details sin endtime ` +
          `legible — no se puede verificar la renovación (DOM-INV-4). Reintentar.`,
        'PROVIDER_INTERNAL_ERROR',
        true,
        undefined,
        RC_SLUG,
      );
    }

    // Redemption/RGP/pending-delete → no es renovable normal (requiere restore,
    // fee distinto). NO retriable — requiere acción admin/cliente.
    const lifecycle = mapRcDomainStatus(before, Date.now()).lifecycle;
    if (lifecycle === 'redemption' || lifecycle === 'pending_delete') {
      throw new ProvisionerPluginError(
        `renew service=${ctx.service.id} (order=${orderId}): el dominio está en ` +
          `${lifecycle} — requiere restore (fee distinto), no renovación normal.`,
        'DOMAIN_IN_REDEMPTION',
        false,
        undefined,
        RC_SLUG,
      );
    }

    // 2. Idempotencia por período: ¿el endtime ya avanzó respecto al último
    //    expires_at registrado? (re-run / recovery tras crash) → no re-renovar.
    const anchorEnd = ctx.service.expires_at
      ? Math.floor(ctx.service.expires_at.getTime() / 1000)
      : null;
    if (anchorEnd !== null && beforeEnd - anchorEnd >= minAdvance) {
      this.logger.warn(
        `renew service=${ctx.service.id} (order=${orderId}): el período ya está ` +
          `renovado (endtime ${beforeEnd} vs ancla ${anchorEnd}) — idempotente, ` +
          `NO se re-renueva (sin doble cobro).`,
      );
      return this.buildRenewResult(ctx, orderId, beforeEnd, renewYears, false);
    }

    // 3. Renovar. `exp-date` = el endtime ACTUAL del registrar (guard de
    //    concurrencia de RC: rechaza si su expiración real no coincide).
    await client.renewDomain({
      'order-id': orderId,
      years: renewYears,
      'exp-date': beforeEnd,
      'invoice-option': 'NoInvoice', // Aelium controla el cobro, no RC
    });

    // 4. DOM-INV-4 — releer y confirmar que avanzó ~el período esperado.
    const after = await client.getDomainDetailsByOrderId(orderId);
    const afterEnd = toEpochSeconds(after.endtime);
    if (afterEnd === null || afterEnd - beforeEnd < minAdvance) {
      throw new ProvisionerPluginError(
        `DOM-INV-4: renew service=${ctx.service.id} (order=${orderId}) NO extendió ` +
          `la expiración (antes=${beforeEnd}, después=${afterEnd ?? 'null'}). NO se ` +
          `marca éxito ni se emite domain.renewed — reintento (DLQ + alerta).`,
        'PROVIDER_INTERNAL_ERROR',
        true,
        undefined,
        RC_SLUG,
      );
    }

    this.logger.log(
      `renew service=${ctx.service.id} (order=${orderId}): renovado +${renewYears}a ` +
        `(endtime ${beforeEnd}→${afterEnd}). DOM-INV-4 OK.`,
    );
    return this.buildRenewResult(ctx, orderId, afterEnd, renewYears, true);
  }

  /**
   * `ProvisionResult` de una renovación. Preserva la metadata existente del
   * servicio (defensivo: el orquestador SOBREESCRIBE metadata con este result) y
   * añade el nuevo `domain_expires_at` (ISO) que el orquestador persiste en
   * `services.expires_at` + `domain_renew_performed` (gate para emitir
   * `domain.renewed` una sola vez). `followUp: []` — el servicio ya está `active`.
   */
  private buildRenewResult(
    ctx: ProvisionContext,
    orderId: RcOrderId,
    newEndEpoch: number,
    renewYears: number,
    performed: boolean,
  ): ProvisionResult {
    return {
      providerReference: orderId,
      metadata: {
        ...toFlatMetadata(ctx.service.metadata),
        domain_operation: 'renew',
        domain_years: renewYears,
        domain_expires_at: new Date(newEndEpoch * 1000).toISOString(),
        domain_renew_performed: performed,
      },
      followUp: [],
    };
  }

  // ─── 2. deprovision() — no-op (el dominio persiste hasta expiración) ────────

  deprovision(ctx: DeprovisionContext): Promise<void> {
    // Doctrina v1 (refina ADR-081 §5): la deprovisión de lifecycle de un DOMINIO
    // es **no-op** (no-async permanente). Un dominio registrado está pagado por su
    // período — cancelar el servicio NO lo borra del registrar (perder un dominio
    // pagado del cliente sería el peor fallo posible); el dominio persiste hasta
    // su expiración y RC gestiona el ciclo (sin auto-renew → expira → redemption
    // → delete). El borrado en período de gracia (`domains/delete`, reembolso de
    // registros accidentales/fraude) es una operación admin EXPLÍCITA y
    // destructiva, diferida a Fase 15D.F — NO es el deprovision de lifecycle.
    this.logger.log(
      `deprovision service=${ctx.service.id} (reason=${ctx.reason}): no-op — el ` +
        `dominio ${ctx.service.domain ?? '?'} persiste en RC hasta expiración ` +
        `(no se borra un dominio pagado).`,
    );
    return Promise.resolve();
  }

  /**
   * `deleteDomain` (ADR-077 A10 / ADR-081 A3.1, 15D.G·2) — borrado **destructivo**
   * en período de gracia (con reembolso). A diferencia de `deprovision` (no-op),
   * esto es una acción admin EXPLÍCITA: elimina el dominio del registrador. El
   * orquestador cancela el `service` Aelium por separado.
   */
  async deleteDomain(service: ServiceWithRelations): Promise<void> {
    const orderId = service.provider_reference;
    if (!orderId) {
      throw new ProvisionerPluginError(
        `deleteDomain requiere provider_reference (order-id RC) en el servicio ` +
          `${service.id} — el dominio debe estar registrado.`,
        'INVALID_STATE',
        false,
        undefined,
        RC_SLUG,
      );
    }
    const { client } = await this.getApiClient();
    await client.deleteDomain(orderId);
    this.logger.warn(
      `deleteDomain service=${service.id} (order=${orderId}): dominio ` +
        `${service.domain ?? '?'} BORRADO del registrar (período de gracia).`,
    );
  }

  // ─── 3. getStatus() — reconcile read (domains/details, ADR-081 §6) ─────────

  async getStatus(service: ServiceWithRelations): Promise<ServiceStatusReport> {
    const orderId = service.provider_reference;
    if (!orderId) {
      return {
        status: 'unknown',
        statusReason: 'plugin.resellerclub.status_reason.not_yet_provisioned',
        checkedAt: new Date().toISOString(),
      };
    }
    const { client } = await this.getApiClient();
    try {
      const details = await client.getDomainDetailsByOrderId(orderId);
      const mapped = mapRcDomainStatus(details, Date.now());
      return {
        status: mapped.status,
        statusReason: mapped.statusReason,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      // Best-effort: proveedor caído / details inaccesible → unknown (no afirmar
      // estado). El reconcile cron (Fase 15D.E) reintenta. [CONSERVADOR — A1.5].
      // Se loguea el detalle — NO se traga en silencio (registrar = dinero).
      this.logger.warn(
        `getStatus service=${service.id} (order=${orderId}): RC inaccesible → ` +
          `unknown. ${err instanceof Error ? err.message : 'error desconocido'}`,
      );
      return {
        status: 'unknown',
        statusReason: 'plugin.resellerclub.status_reason.provider_unreachable',
        checkedAt: new Date().toISOString(),
      };
    }
  }

  // ─── 4. getServiceInfo() — display + DomainInfo (ADR-077 A11) ──────────────

  async getServiceInfo(service: ServiceWithRelations): Promise<ServiceInfo> {
    const orderId = service.provider_reference;
    const fqdn = service.domain;
    if (!orderId || !isValidFqdn(fqdn)) {
      // Aún no aprovisionado: sin order-id no hay dominio que describir → se
      // OMITE `info.domain` (A11.3: no emitir objeto vacío misleading).
      return this.buildBasicInfo(
        service,
        'plugin.resellerclub.status_reason.not_yet_provisioned',
      );
    }

    const { client } = await this.getApiClient();
    let details: RcDomainDetails;
    try {
      details = await client.getDomainDetailsByOrderId(orderId);
    } catch (err) {
      this.logger.warn(
        `getServiceInfo service=${service.id} (order=${orderId}): RC inaccesible ` +
          `→ unknown. ${err instanceof Error ? err.message : 'error desconocido'}`,
      );
      return this.buildBasicInfo(
        service,
        'plugin.resellerclub.status_reason.provider_unreachable',
      );
    }

    const mapped = mapRcDomainStatus(details, Date.now());
    const domain = buildDomainInfo(details, fqdn as string, mapped.lifecycle);
    const availableActions = filterActionsByStatus(
      this.inlineActions,
      mapped.status,
    );

    return {
      status: mapped.status,
      statusReason: mapped.statusReason,
      recoveryHint: mapped.recoveryHint,
      display: {
        primary: fqdn as string,
        secondary: 'plugin.resellerclub.label',
      },
      domain,
      capabilities: {
        ...this.capabilities,
        hasSsoPanel: false,
        inlineActions: availableActions,
      },
      availableActions,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * `ServiceInfo` mínimo válido para los casos sin dominio que describir
   * (no aprovisionado / proveedor inaccesible). OMITE `info.domain` (A11.3).
   */
  private buildBasicInfo(
    service: ServiceWithRelations,
    statusReason: string,
  ): ServiceInfo {
    return {
      status: 'unknown',
      statusReason,
      display: {
        primary: service.domain ?? service.label ?? 'plugin.resellerclub.label',
        secondary: 'plugin.resellerclub.label',
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

  // ─── 5. getSsoUrl() — sin panel RC (ADR-070) ───────────────────────────────

  getSsoUrl(_service: ServiceWithRelations): Promise<SsoUrl | null> {
    // has_sso_panel=false: el cliente NUNCA va al panel RC (puerta unificada).
    // No-async permanente (RC nunca tiene SSO) → sin `require-await`.
    return Promise.resolve(null);
  }

  // ─── 6. executeAction() — gestión curada + admin (Fase 15D.F.1) ────────────
  //
  // Dispatch por slug a los handlers de gestión de registrar (ADR-077 A10) +
  // suspend/unsuspend (A4). El plugin SOLO ejecuta la operación en RC y devuelve
  // `ActionResult`: el wrapper `executeActionWithCacheInvalidation` (core) hace
  // cache + audit + evento `service.action_executed` + enforcement `adminOnly` +
  // redacción R12; los eventos `domain.*_changed` los emite el orquestador
  // (`executeActionForUser`) vía Outbox (R8). [Shapes de gestión CONSERVADORES
  // hasta el smoke OT&E Fase G — A1.5; validados contra MockResellerClubServer.]
  //
  // `modify_contacts` se difiere a Fase 15D.F.2: requiere los datos de contacto
  // enriquecidos del registrante (`ctx.client`/perfil + .es NIF / .eu residencia)
  // que `executeAction` no recibe — pertenece al flujo de checkout/perfil de F.2.
  async executeAction(
    service: ServiceWithRelations,
    actionSlug: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const declared = this.inlineActions.find((a) => a.slug === actionSlug);
    if (!declared) {
      throw new ProvisionerPluginError(
        `Plugin "${RC_SLUG}" no declara la action "${actionSlug}".`,
        'INVALID_PAYLOAD',
        false,
        undefined,
        RC_SLUG,
      );
    }

    // Todas las acciones operan sobre un dominio YA registrado (order-id RC =
    // provider_reference). Sin él no hay nada que gestionar (INVALID_STATE).
    const orderId = service.provider_reference;
    if (!orderId) {
      throw new ProvisionerPluginError(
        `action "${actionSlug}" requiere provider_reference (order-id RC) en el ` +
          `servicio ${service.id} — el dominio debe estar registrado.`,
        'INVALID_STATE',
        false,
        undefined,
        RC_SLUG,
      );
    }

    const { client } = await this.getApiClient();

    switch (actionSlug) {
      case 'modify_nameservers':
        return this.actionModifyNameservers(client, orderId, payload);
      case 'toggle_privacy':
        return this.actionTogglePrivacy(client, orderId, payload);
      case 'toggle_registrar_lock':
        return this.actionToggleRegistrarLock(client, orderId, payload);
      case 'get_auth_code':
        return this.actionGetAuthCode(client, orderId);
      case 'suspend_service':
        return this.actionSuspendService(client, orderId, payload);
      case 'unsuspend_service':
        return this.actionUnsuspendService(client, orderId);
      case 'modify_contacts':
        throw new ProvisionerPluginError(
          `action "modify_contacts" pendiente — Fase 15D.F.2 (flujo de contactos ` +
            `enriquecido + .es/.eu).`,
          'NOT_IMPLEMENTED',
          false,
          undefined,
          RC_SLUG,
        );
      default:
        // Defensivo: el check de `declared` arriba ya cubre slugs desconocidos.
        throw new ProvisionerPluginError(
          `action "${actionSlug}" declarada pero sin handler (bug).`,
          'NOT_IMPLEMENTED',
          false,
          undefined,
          RC_SLUG,
        );
    }
  }

  /**
   * `modify_nameservers` — cambia la **delegación de NS del registro** (NO la
   * zona DNS, que es Enhance; `has_dns_management=false`). Verify-after-write:
   * relee details y devuelve los NS aplicados (DH-INV-6: el registrar manda).
   */
  private async actionModifyNameservers(
    client: ResellerClubApiClient,
    orderId: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const nameservers = parseNameservers(payload);
    await client.modifyNameservers(orderId, nameservers);
    const after = await client.getDomainDetailsByOrderId(orderId);
    const applied = [after.ns1, after.ns2, after.ns3, after.ns4].filter(
      (n): n is string => typeof n === 'string' && n.trim().length > 0,
    );
    return {
      success: true,
      message: 'plugin.resellerclub.actions.modify_nameservers.success',
      data: { nameservers: applied },
    };
  }

  /**
   * `toggle_privacy` — WHOIS privacy ON/OFF. Algunos TLDs no lo soportan → RC
   * devuelve error de negocio que el http-client mapea (el wrapper lo refleja
   * como `success:false`).
   */
  private async actionTogglePrivacy(
    client: ResellerClubApiClient,
    orderId: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const enabled = parseToggleFlag(payload, 'enabled');
    const rawReason =
      typeof payload.reason === 'string' ? payload.reason.trim() : '';
    const reason =
      rawReason.length > 0
        ? rawReason.slice(0, 200)
        : 'Cambio de privacidad solicitado por el titular';
    await client.modifyPrivacyProtection(orderId, enabled, reason);
    return {
      success: true,
      message: enabled
        ? 'plugin.resellerclub.actions.toggle_privacy.enabled'
        : 'plugin.resellerclub.actions.toggle_privacy.disabled',
      data: { whoisPrivacy: enabled },
    };
  }

  /** `toggle_registrar_lock` — theft/registrar lock ON/OFF. */
  private async actionToggleRegistrarLock(
    client: ResellerClubApiClient,
    orderId: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const locked = parseToggleFlag(payload, 'locked');
    if (locked) {
      await client.enableTheftProtection(orderId);
    } else {
      await client.disableTheftProtection(orderId);
    }
    return {
      success: true,
      message: locked
        ? 'plugin.resellerclub.actions.toggle_registrar_lock.enabled'
        : 'plugin.resellerclub.actions.toggle_registrar_lock.disabled',
      data: { registrarLock: locked },
    };
  }

  /**
   * `get_auth_code` — devuelve el EPP/auth code para transfer-OUT (cliente
   * self-service). **SECRETO**: el wrapper redacta `data.authCode` del audit
   * (R12 — `auth.?code` en el sanitizer canónico). RC solo lo emite si el
   * dominio está activo y sin registrar lock (`authCodeAvailable`).
   */
  private async actionGetAuthCode(
    client: ResellerClubApiClient,
    orderId: string,
  ): Promise<ActionResult> {
    const details = await client.getDomainDetailsByOrderId(orderId);
    const { lifecycle } = mapRcDomainStatus(details, Date.now());
    if (lifecycle !== 'active' || detectRegistrarLock(details)) {
      throw new ProvisionerPluginError(
        `get_auth_code (order=${orderId}): el dominio debe estar activo y sin ` +
          `registrar lock para obtener el auth-code.`,
        'REGISTRAR_LOCKED',
        false,
        undefined,
        RC_SLUG,
      );
    }
    const authCode =
      typeof details.domsecret === 'string' && details.domsecret.length > 0
        ? details.domsecret
        : undefined;
    if (!authCode) {
      throw new ProvisionerPluginError(
        `get_auth_code (order=${orderId}): RC no devolvió el auth-code (domsecret).`,
        'PROVIDER_INTERNAL_ERROR',
        true,
        undefined,
        RC_SLUG,
      );
    }
    return {
      success: true,
      message: 'plugin.resellerclub.actions.get_auth_code.success',
      data: { authCode },
    };
  }

  /**
   * `suspend_service` (adminOnly) — suspende el dominio en RC. El orquestador
   * (`ProvisioningService.suspendAsAdmin`) transiciona `services.status` + emite
   * `service.suspended` (R8) — el plugin NO transiciona estado (A4).
   */
  private async actionSuspendService(
    client: ResellerClubApiClient,
    orderId: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult> {
    const rawReason =
      typeof payload.reason === 'string' ? payload.reason.trim() : '';
    const reason =
      rawReason.length > 0
        ? rawReason.slice(0, 200)
        : 'Suspensión administrativa';
    await client.suspendOrder(orderId, reason);
    return {
      success: true,
      message: 'plugin.resellerclub.actions.suspend_service.success',
    };
  }

  /** `unsuspend_service` (adminOnly) — reactiva el dominio en RC. */
  private async actionUnsuspendService(
    client: ResellerClubApiClient,
    orderId: string,
  ): Promise<ActionResult> {
    await client.unsuspendOrder(orderId);
    return {
      success: true,
      message: 'plugin.resellerclub.actions.unsuspend_service.success',
    };
  }

  // ─── testConnection() — probe de credenciales (ADR-077 A6) ─────────────────

  /**
   * Valida que las credenciales RC (userid + api-key) funcionan y que la IP
   * está whitelisteada (atraviesa el WAF de Cloudflare). Probe de **solo
   * lectura** (`products/reseller-price`) — no registra nada. Captura sus
   * propios errores → `{ ok, message }` (incluye credenciales ausentes, que
   * fallan ya en `getApiClient`).
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const { client } = await this.getApiClient();
      await client.getResellerPrice();
      return {
        ok: true,
        message:
          'Credenciales de ResellerClub válidas (reseller-price accesible).',
      };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'error inesperado del proveedor';
      return {
        ok: false,
        message: `No se pudo conectar con ResellerClub: ${reason}`,
      };
    }
  }

  // ─── Plano A registrar (ADR-077 A10 — pre-venta) ───────────────────────────

  /**
   * `domains/available` → disponibilidad (pre-flight DOM-INV-1 + buscador).
   * Premium se reporta `false` conservadoramente (el shape básico de RC no
   * trae señal de premium — [CONSERVADOR, refinar Fase G]; v1 no vende premium).
   */
  async checkDomainAvailability(domain: string): Promise<DomainAvailability> {
    const { sld, tld } = splitFqdn(domain);
    const { client } = await this.getApiClient();
    const res = await client.checkAvailability(sld, [tld]);
    const entry = res[domain.toLowerCase()] ?? Object.values(res)[0];
    const available = entry?.status === 'available';
    return { domain, available, premium: false };
  }

  /**
   * `products/reseller-price` → matriz de COSTE mayorista por TLD × operación ×
   * años (ADR-081 A1.1). El cron `sync-resellerclub-pricing` (Fase 15D.E) aplica
   * `markup_percent` y puebla `domain_tld_pricing`. Solo emite los TLDs
   * reconocidos (`CLASSKEY_TO_TLD`); la moneda es la de venta (`default_currency`,
   * validada same-currency por el cron — ADR-084 A1.2).
   */
  /**
   * `updateRegistrantContact` (ADR-077 A10 additivo, 15D.G·2) — propaga el perfil
   * de titular (`ClientPublicData`) al contacto WHOIS compartido del cliente en RC
   * → todos sus dominios. Delega en `ResellerclubCustomersService` (advisory-lock
   * + verify-after-write + detección de cambio de nombre). El plugin solo resuelve
   * el cliente HTTP desde el vault (R4/R12).
   */
  async updateRegistrantContact(
    client: ClientPublicData,
  ): Promise<RegistrantUpdateResult> {
    const { client: api } = await this.getApiClient();
    return this.customers.updateRegistrantContact(client, api);
  }

  async getTldPricing(): Promise<readonly TldCostEntry[]> {
    const { client, config } = await this.getApiClient();
    const resp = await client.getResellerPrice();

    const entries: TldCostEntry[] = [];
    for (const [productKey, entry] of Object.entries(resp)) {
      const tld = CLASSKEY_TO_TLD[productKey];
      if (!tld) continue; // no es un TLD del scope v1 / no es producto dominio
      const pricing = entry?.['0']?.pricing;
      if (!pricing) continue;
      for (const [rcOp, byYears] of Object.entries(pricing)) {
        const operation = RC_OP_TO_TLD_OP[rcOp as RcPriceOperation];
        if (!operation || !byYears) continue;
        for (const [yearsStr, amount] of Object.entries(byYears)) {
          const years = Number(yearsStr);
          if (!Number.isInteger(years) || years < 1) continue;
          entries.push({
            tld,
            operation,
            years,
            cost: { amount: String(amount), currency: config.defaultCurrency },
          });
        }
      }
    }
    return entries;
  }

  // ─── Internal: construcción + cache del cliente HTTP RC ────────────────────

  /**
   * Construye el `ResellerClubApiClient` desde `plugin_installs` +
   * `SecretVaultService`. Cache invalidado por `updated_at`/`key_version`.
   * **Público pero scoping module-internal** (igual que Enhance): solo el propio
   * módulo RC (plugin + futuros crons/listeners) lo invoca; el resto del sistema
   * usa el plugin por el contrato canónico, nunca el cliente HTTP directamente.
   */
  async getApiClient(): Promise<{
    client: ResellerClubApiClient;
    config: ResellerclubConfig;
  }> {
    const install = await this.prisma.pluginInstall.findUnique({
      where: { slug: this.slug },
    });
    if (!install || !install.enabled) {
      throw new ProvisionerPluginError(
        `Plugin "${this.slug}" no instalado o deshabilitado en plugin_installs.`,
        'INVALID_STATE',
        false,
        undefined,
        RC_SLUG,
      );
    }

    const config = parseResellerclubConfig(install.config);
    // DC.NEW-67: la URL base sale del override test-only si está presente, si no
    // del environment. Va en el cacheKey para invalidar el cliente si cambia.
    const baseUrl =
      config.baseUrlOverride ?? resolveResellerClubBaseUrl(config.environment);
    const cacheKey = `${baseUrl}|${install.updated_at.getTime()}|kv${install.key_version}`;
    if (this.apiClientCache?.cacheKey === cacheKey) {
      return { client: this.apiClientCache.client, config };
    }

    const secrets = parseSecretsBlob(install.secrets);
    const authUserIdBlob = secrets.authUserId;
    const apiKeyBlob = secrets.apiKey;
    if (!authUserIdBlob || !apiKeyBlob) {
      throw new ProvisionerPluginError(
        `Plugin "${this.slug}": faltan los secrets "authUserId"/"apiKey". ` +
          `Configúralos vía PATCH /admin/plugins/${this.slug}.`,
        'INVALID_STATE',
        false,
        undefined,
        RC_SLUG,
      );
    }

    const client = new ResellerClubApiClient({
      baseUrl,
      authUserId: this.vault.decrypt(authUserIdBlob),
      apiKey: this.vault.decrypt(apiKeyBlob),
    });

    this.apiClientCache = { client, config, cacheKey };
    this.logger.log(
      `getApiClient: ResellerClubApiClient construido (env=${config.environment}, cacheKey=…${cacheKey.slice(-20)})`,
    );
    return { client, config };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valida + normaliza la lista de nameservers de `modify_nameservers`
 * (enforcement defensivo: el `payloadSchema` es solo UX form-side). RC exige ≥2.
 */
function parseNameservers(payload: Record<string, unknown>): string[] {
  const raw = payload.nameservers;
  if (!Array.isArray(raw)) {
    throw new ProvisionerPluginError(
      'modify_nameservers: "nameservers" debe ser un array de hostnames.',
      'INVALID_PAYLOAD',
      false,
      undefined,
      RC_SLUG,
    );
  }
  const ns = [
    ...new Set(
      raw
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0),
    ),
  ];
  if (ns.length < 2) {
    throw new ProvisionerPluginError(
      'modify_nameservers: se requieren al menos 2 nameservers válidos.',
      'INVALID_PAYLOAD',
      false,
      undefined,
      RC_SLUG,
    );
  }
  const hostname =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  if (ns.some((n) => !hostname.test(n))) {
    throw new ProvisionerPluginError(
      'modify_nameservers: hay un nameserver con formato de hostname inválido.',
      'INVALID_PAYLOAD',
      false,
      undefined,
      RC_SLUG,
    );
  }
  return ns;
}

/** Lee un flag booleano del payload (acepta `boolean` o `'true'`/`'false'`). */
function parseToggleFlag(
  payload: Record<string, unknown>,
  key: string,
): boolean {
  const v = payload[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new ProvisionerPluginError(
    `${key} debe ser un booleano (true/false).`,
    'INVALID_PAYLOAD',
    false,
    undefined,
    RC_SLUG,
  );
}

/** Divide un FQDN en SLD + TLD (split en el primer punto — TLDs single-label v1). */
function splitFqdn(fqdn: string): { sld: string; tld: string } {
  const normalized = fqdn.trim().toLowerCase();
  const idx = normalized.indexOf('.');
  if (idx <= 0 || idx >= normalized.length - 1) {
    throw new ProvisionerPluginError(
      `FQDN inválido: "${fqdn}".`,
      'INVALID_PAYLOAD',
      false,
      undefined,
      RC_SLUG,
    );
  }
  return { sld: normalized.slice(0, idx), tld: normalized.slice(idx + 1) };
}

/** Validación mínima de FQDN (estilo DH-INV-2): no null, con punto, ≤253. */
function isValidFqdn(domain: string | null): boolean {
  if (typeof domain !== 'string') return false;
  const d = domain.trim();
  return d.length > 0 && d.length <= 253 && d.includes('.');
}

/** Años del registro desde `services.metadata.domain_years` (lo fija el checkout, 15D.B). */
function extractDomainYears(metadata: unknown): number {
  const md =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const raw = md.domain_years;
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= 1 &&
    raw <= 10
  ) {
    return raw;
  }
  throw new ProvisionerPluginError(
    `services.metadata.domain_years ausente o inválido (esperado entero 1..10, ` +
      `got ${typeof raw}). Lo fija el checkout (Fase 15D.B).`,
    'INVALID_PAYLOAD',
    false,
    undefined,
    RC_SLUG,
  );
}

/**
 * Años a renovar según el ciclo de facturación del servicio (Fase 15D.E). Los
 * dominios se facturan `annual` (checkout 15D.B) y los registrars renuevan en
 * años enteros ≥1, así que v1 renueva 1 año por período. Único punto de
 * extensión si se añaden ciclos multi-año a `BillingCycle` (hoy: monthly/
 * quarterly/semiannual/annual/one_time — ninguno multi-año).
 */
const RENEW_YEARS_BY_CYCLE: Readonly<Record<string, number>> = {
  annual: 1,
  // (biennial/triennial irían aquí si se añaden a BillingCycle.)
};
function renewYearsForCycle(cycle: string): number {
  // Suelo 1: el registrar no renueva <1 año (sub-anual / one_time / desconocido).
  return RENEW_YEARS_BY_CYCLE[cycle] ?? 1;
}

/** Extrae el order-id de `domains/details` (orderid → entityid). Null si no hay. */
function normalizeOrderId(details: RcDomainDetails): RcOrderId | null {
  for (const raw of [details.orderid, details.entityid]) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return raw.trim();
  }
  return null;
}

/** Filtra una metadata Json a los valores planos admitidos por ProvisionResult. */
function toFlatMetadata(
  metadata: unknown,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    for (const [k, v] of Object.entries(metadata as Record<string, unknown>)) {
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        out[k] = v;
      }
    }
  }
  return out;
}

// ─── Mapeo domains/details → status + DomainInfo (ADR-081 §6 + ADR-077 A11) ──
// [CONSERVADOR — los nombres/valores exactos de los ejes de estado de RC se
//  confirman en el smoke OT&E (Fase G, A1.5); el mapeo es defensivo.]

interface RcStatusMapping {
  readonly status: ServiceInfoStatus;
  readonly lifecycle: DomainInfo['lifecycle'];
  readonly recoveryHint?: ServiceRecoveryHint;
  readonly statusReason?: string;
}

/**
 * Estado multi-eje de RC (`domains/details`) → `ServiceInfoStatus` + sub-fase
 * del ciclo ICANN (ADR-081 §6 / ADR-082 A2.3). `recoveryHint` se limita a los
 * valores del contrato (`contact_support` para redemption/pending_delete); los
 * hints dedicados `renew`/`restore` + su extensión del tipo se difieren a Fase F
 * — la sub-fase precisa ya viaja en `DomainInfo.lifecycle`.
 */
function mapRcDomainStatus(
  details: RcDomainDetails,
  nowMs: number,
): RcStatusMapping {
  const entity = lc(details.entitystatus);
  const stateBlob = [
    stringifyState(details.currentstatus),
    ...(details.orderstatus ?? []),
  ]
    .map(lc)
    .join(' ');

  const endtime = toEpochSeconds(details.endtime);
  const expired = endtime !== null && endtime * 1000 < nowMs;
  const isRedemption = /redemption|rgp/.test(stateBlob);
  const isPendingDelete = /pending[\s_]?delete/.test(stateBlob);

  if (entity === 'deleted') {
    return {
      status: 'cancelled',
      lifecycle: isPendingDelete ? 'pending_delete' : 'expired',
    };
  }
  if (isPendingDelete) {
    return {
      status: 'expired',
      lifecycle: 'pending_delete',
      recoveryHint: 'contact_support',
      statusReason: 'plugin.resellerclub.status_reason.pending_delete',
    };
  }
  if (isRedemption) {
    return {
      status: 'expired',
      lifecycle: 'redemption',
      // 15D.G·2 (ADR-077 A5 ext): recuperable con tarifa de restore → CTA cliente.
      recoveryHint: 'restore',
      statusReason: 'plugin.resellerclub.status_reason.redemption',
    };
  }
  if (expired) {
    return {
      status: 'expired',
      lifecycle: 'expired',
      // 15D.G·2: aún renovable (gracia) → CTA cliente "Renovar".
      recoveryHint: 'renew',
      statusReason: 'plugin.resellerclub.status_reason.expired',
    };
  }
  if (entity === 'suspended') {
    return {
      status: 'suspended',
      lifecycle: 'active',
      statusReason: 'plugin.resellerclub.status_reason.suspended',
    };
  }
  if (/pending[\s_]?verification|pendingaction/.test(stateBlob)) {
    return {
      status: 'pending',
      lifecycle: 'active',
      statusReason: 'plugin.resellerclub.status_reason.pending_verification',
    };
  }
  if (entity === 'active') {
    return { status: 'active', lifecycle: 'active' };
  }
  return {
    status: 'unknown',
    lifecycle: 'active',
    statusReason: 'plugin.resellerclub.status_reason.inconsistent',
  };
}

/** `domains/details` → `DomainInfo` (ADR-077 A11). Sin PII completa (R12/RGPD). */
function buildDomainInfo(
  details: RcDomainDetails,
  fqdn: string,
  lifecycle: DomainInfo['lifecycle'],
): DomainInfo {
  const nameservers = [
    details.ns1,
    details.ns2,
    details.ns3,
    details.ns4,
  ].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  const endtime = toEpochSeconds(details.endtime);
  const expiresAt =
    endtime !== null ? new Date(endtime * 1000).toISOString() : undefined;
  const registrarLock = detectRegistrarLock(details);

  return {
    fqdn,
    nameservers,
    expiresAt,
    lifecycle,
    whoisPrivacy: toRcBool(details.isprivacyprotected),
    registrarLock,
    // El auth/EPP code solo es obtenible si el dominio está vigente y sin lock
    // (RC además exige >60 días desde el registro — refinar en Fase F/G).
    authCodeAvailable: lifecycle === 'active' && !registrarLock,
    // Resumen de contactos SIN PII completa (A11): presencia por rol. El
    // `registrantName` se omite (no viaja en details; requeriría contacts/details).
    contacts: {
      hasAdmin: hasContactId(details.admincontactid),
      hasTech: hasContactId(details.techcontactid),
      hasBilling: hasContactId(details.billingcontactid),
    },
  };
}

/** Registrar/theft lock activo según los ejes de estado de RC. [CONSERVADOR]. */
function detectRegistrarLock(details: RcDomainDetails): boolean {
  const blob = [
    stringifyState(details.currentstatus),
    ...(details.orderstatus ?? []),
  ]
    .map(lc)
    .join(' ');
  return /transferlock|theftprotect|clienttransferprohibited/.test(blob);
}

function lc(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

function stringifyState(value: string | undefined): string {
  return typeof value === 'string' ? value : '';
}

function toEpochSeconds(raw: string | number | undefined): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim()))
    return Number(raw.trim());
  return null;
}

function toRcBool(raw: boolean | string | undefined): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1';
  }
  return false;
}

function hasContactId(raw: string | number | undefined): boolean {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0;
  if (typeof raw === 'string')
    return /^\d+$/.test(raw.trim()) && Number(raw) > 0;
  return false;
}

function parseResellerclubConfig(raw: unknown): ResellerclubConfig {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const environment: RcEnvironment =
    obj.environment === 'production' ? 'production' : 'sandbox';
  const markupPercent =
    typeof obj.markup_percent === 'number' &&
    Number.isInteger(obj.markup_percent) &&
    obj.markup_percent >= 0
      ? obj.markup_percent
      : 25;
  const tldsOffered =
    typeof obj.tlds_offered === 'string' && obj.tlds_offered.trim().length > 0
      ? obj.tlds_offered
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [...DEFAULT_TLDS_OFFERED];
  const defaultCurrency =
    typeof obj.default_currency === 'string' &&
    obj.default_currency.length === 3
      ? obj.default_currency
      : 'EUR';
  // DC.NEW-67: override test-only de baseUrl (campo no-schema __base_url_override).
  const rawOverride = obj.__base_url_override;
  const baseUrlOverride =
    typeof rawOverride === 'string' && rawOverride.trim().length > 0
      ? rawOverride.trim()
      : undefined;
  return {
    environment,
    markupPercent,
    tldsOffered,
    defaultCurrency,
    baseUrlOverride,
  };
}

/** Shape persistido en `plugin_installs.secrets[<field>]` (ADR-080). */
interface EncryptedSecretBlob {
  ciphertext: string;
  iv: string;
  tag: string;
  key_version: number;
}

function parseSecretsBlob(raw: unknown): Record<string, EncryptedSecretBlob> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, EncryptedSecretBlob> = {};
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
