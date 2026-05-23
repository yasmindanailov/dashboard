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
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  PluginCapabilities,
  PluginManifest,
  ProvisionContext,
  ProvisionResult,
  ProvisionerPlugin,
  ProvisionerPluginError,
  ServiceAction,
  ServiceInfo,
  ServiceStatusReport,
  ServiceWithRelations,
  SsoUrl,
  TldCostEntry,
} from '../../../core/provisioning/types';
import { SecretVaultService } from '../../../core/security/secret-vault.service';

import {
  RcEnvironment,
  RcPriceOperation,
  ResellerClubApiClient,
  resolveResellerClubBaseUrl,
} from './api';
import { ResellerclubCustomersService } from './resellerclub-customers.service';

/** Slug canónico del plugin. */
const RC_SLUG = 'resellerclub';

/** TLDs ofertados por defecto (ADR-084 §3.4). Con punto (display/oferta). */
const DEFAULT_TLDS_OFFERED = ['.com', '.net', '.org', '.es', '.eu'] as const;

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
  },
  {
    slug: 'toggle_registrar_lock',
    label: 'plugin.resellerclub.actions.toggle_registrar_lock',
    confirmRequired: false,
    destructive: false,
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
  ) {}

  // ─── 1. provision() — ramificado por operation (ADR-077 A10 / ADR-081 §5) ──

  async provision(ctx: ProvisionContext): Promise<ProvisionResult> {
    const operation = ctx.operation ?? 'register';
    switch (operation) {
      case 'register':
        // Commit 4: pre-flight checkAvailability (DOM-INV-1) + ensureRegistrant
        // (this.customers) + domains/register con NS=default_nameservers.
        throw new ProvisionerPluginError(
          `provision(register) pendiente — Commit 4 de la Fase 15D.D.`,
          'NOT_IMPLEMENTED',
          false,
          undefined,
          RC_SLUG,
        );
      case 'renew':
        throw new ProvisionerPluginError(
          `provision(renew) pendiente — Fase 15D.E (DOM-INV-4).`,
          'NOT_IMPLEMENTED',
          false,
          undefined,
          RC_SLUG,
        );
      case 'transfer_in':
        throw new ProvisionerPluginError(
          `transfer-in es Sprint 15D.II (FSM de transfer, ADR-084 §4).`,
          'NOT_IMPLEMENTED',
          false,
          undefined,
          RC_SLUG,
        );
    }
  }

  // ─── 2. deprovision() — domains/delete (grace) — Fase 15D.E ────────────────

  async deprovision(ctx: DeprovisionContext): Promise<void> {
    if (!ctx.service.provider_reference) {
      // Idempotente: sin order-id no hay nada que borrar en RC.
      this.logger.warn(
        `deprovision service=${ctx.service.id}: sin provider_reference — no-op.`,
      );
      return;
    }
    throw new ProvisionerPluginError(
      `deprovision (domains/delete) pendiente — Fase 15D.E.`,
      'NOT_IMPLEMENTED',
      false,
      undefined,
      RC_SLUG,
    );
  }

  // ─── 3. getStatus() — reconcile read (domains/details) — Fase 15D.E ────────

  async getStatus(service: ServiceWithRelations): Promise<ServiceStatusReport> {
    // Stub conservador (Commit 5/Fase E lo mapea desde domains/details, A1.5).
    return {
      status: 'unknown',
      statusReason: 'plugin.resellerclub.status_reason.pending_impl',
      checkedAt: new Date().toISOString(),
    };
  }

  // ─── 4. getServiceInfo() — display + DomainInfo (A11) — Commit 5 ───────────

  async getServiceInfo(service: ServiceWithRelations): Promise<ServiceInfo> {
    // Stub conservador: Commit 5 mapea domains/details → status + DomainInfo
    // (ADR-077 A11). Hoy devuelve un ServiceInfo válido sin gestión.
    return {
      status: 'unknown',
      statusReason: 'plugin.resellerclub.status_reason.pending_impl',
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

  async getSsoUrl(_service: ServiceWithRelations): Promise<SsoUrl | null> {
    // has_sso_panel=false: el cliente NUNCA va al panel RC (puerta unificada).
    return null;
  }

  // ─── 6. executeAction() — gestión + admin — Fase 15D.F ─────────────────────

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
    // Handlers (modify_ns/contacts/privacy/lock/auth-code + suspend/unsuspend)
    // se implementan en la Fase 15D.F.
    throw new ProvisionerPluginError(
      `action "${actionSlug}" pendiente — Fase 15D.F.`,
      'NOT_IMPLEMENTED',
      false,
      undefined,
      RC_SLUG,
    );
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
    const cacheKey = `${config.environment}|${install.updated_at.getTime()}|kv${install.key_version}`;
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
      baseUrl: resolveResellerClubBaseUrl(config.environment),
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
    typeof obj.default_currency === 'string' && obj.default_currency.length === 3
      ? obj.default_currency
      : 'EUR';
  return { environment, markupPercent, tldsOffered, defaultCurrency };
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
