/**
 * Sprint 11 Fase 11.B (2026-05-01) — Contrato canónico ProvisionerPlugin v2.
 *
 * Materializa literalmente ADR-077 §1 + §2.
 * https://github.com/yasmindanailov/dashboard/blob/master/docs/10-decisions/adr-077-contrato-provisioner-plugin-v2.md
 *
 * Cualquier plugin de provisioning DEBE implementar `ProvisionerPlugin` v2.
 * Cualquier cambio breaking a estos tipos requiere ADR específico + bump v3
 * + período de coexistencia (ver ADR-077 §6 política de versionado).
 *
 * Importación canónica desde plugins:
 *   import type { ProvisionerPlugin, ServiceInfo, ... } from 'src/core/provisioning/types';
 *
 * Los plugins NO importan `src/modules/provisioning/*` (R4). Sí importan:
 *   - este archivo (contrato).
 *   - `src/core/provisioning/plugin-utils` (wrappers cross-cutting).
 */

import type { Service } from '@prisma/client';

// ────────────────────────────────────────────────────────────────────────────
// 1. Servicio Prisma con relaciones (input al plugin)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Servicio Prisma con relaciones precargadas que el orquestador inyecta
 * al plugin en `ProvisionContext`. El plugin NO debe consultar Prisma
 * directamente — todo lo que necesita viene en este shape.
 */
export interface ServiceWithRelations extends Service {
  client: ClientPublicData;
  product: {
    id: string;
    slug: string;
    name: string;
    type: string;
    provisioner: string;
    provisioner_config: Record<string, unknown> | null;
  };
}

/**
 * Datos públicos del cliente sanitizados (sin password hash, sin secretos).
 * Lo que el plugin puede usar para enviar al proveedor externo.
 */
export interface ClientPublicData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phone: string | null;
  locale: string | null;
  /** País del cliente en ISO-3166 alpha-2 (de `ClientProfile.country`, default 'ES'). */
  country_code: string | null;

  // ── Sprint 15D — ADR-077 Amendment A12 (datos de registrante) ──────────────
  // Campos additivos OPCIONALES que el orquestador puebla desde `ClientProfile`
  // (1:1 con `users`) para que los plugins de registrar (`is_domain_registrar=true`)
  // creen el customer/contact WHOIS en el proveedor (ej. ResellerClub
  // `customers/signup` + `contacts/add` — ADR-081 §3/§4). Capability-agnósticos:
  // el resto de plugins los ignoran. NO bumpea `contractVersion` (additivo).
  // Pueden venir `null`/`undefined` si el cliente no completó su perfil → el
  // registrar aplica la doctrina de elegibilidad (`REGISTRANT_INELIGIBLE`,
  // familia DOM-INV-5). El `phone-cc` (código de país telefónico) NO es un campo:
  // el plugin lo deriva de `country_code` (ADR-081 §3).
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  tax_id?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. ProvisionContext + ProvisionResult (entrada/salida de provision())
// ────────────────────────────────────────────────────────────────────────────

export interface ProvisionContext {
  /** Servicio Prisma con relaciones precargadas. */
  readonly service: ServiceWithRelations;

  /** Datos del cliente sanitizados. */
  readonly client: ClientPublicData;

  /** Configuración del producto (jsonb plano de `products.provisioner_config`). */
  readonly productConfig: Record<string, unknown>;

  /**
   * ID de servidor asignado por `infrastructure.pickServerForProduct()`.
   * Solo poblado para plugins con `capabilities.requires_server = true`
   * (hoy solo `docker_engine` — Sprint 15E). Resto reciben `null`.
   */
  readonly serverId: string | null;

  /** Correlation ID para audit + log + tracing distribuido. */
  readonly correlationId: string;

  /**
   * Sprint 15D — ADR-077 Amendment A10. Intención del provision para plugins
   * de registrar (`is_domain_registrar=true`). El orquestador la fija según
   * el origen: checkout inicial → `'register'`; cron de renovación
   * (`invoice.paid` de la factura de renovación) → `'renew'`; checkout de
   * transferencia → `'transfer_in'`.
   *
   * Opcional, default `'register'` si ausente — los plugins no-registrar lo
   * ignoran. Es lo que permite distinguir un REINTENTO de register (crash
   * recovery, idempotente: no recrea) de una RENOVACIÓN intencional del
   * período siguiente (DOM-INV-1 + DOM-INV-4, ADR-084).
   */
  readonly operation?: 'register' | 'renew' | 'transfer_in';

  /**
   * Sprint 15D Fase 15D.F.3 — ADR-082 Amendment "dominio-solo aparca en el
   * registrar". Destino de la delegación de nameservers que el orquestador
   * resuelve para un `register` de registrar, según tenga o no hosting asociado:
   *
   *   - `'aelium'`  → el dominio tiene hosting (flujos F1/F2): NS = `provisioning.default_nameservers`.
   *     La zona DNS la acuña el website del DNS authority (Enhance).
   *   - `'parking'` → dominio-solo sin hosting (flujo F5): NS = `provisioning.registrar_parking_nameservers`
   *     (resuelven en el registrar; Enhance no puede crear una zona sin website).
   *
   * Opcional; los plugins no-registrar lo ignoran. Si ausente, el plugin asume
   * `'aelium'` (comportamiento histórico, fallback defensivo). El listener
   * `switch-domain-ns-on-hosting-activated` conmuta `parking`→`aelium` cuando
   * se añade hosting más tarde a un dominio aparcado.
   */
  readonly dnsTargetHint?: 'aelium' | 'parking';
}

export interface ProvisionResult {
  /**
   * Identificador del recurso en el sistema externo (cPanel account ID,
   * domain ID, container ID, etc.). NULL para plugins `internal`/`manual`.
   * El orquestador lo persiste en `services.provider_reference`.
   */
  providerReference: string | null;

  /**
   * Metadata adicional del proveedor para persistir en `services.metadata`.
   * Plano, sin secretos. `string[]` admitido (additivo, Sprint 15D.F.3) para
   * listas escalares como `nameservers` (lo lee el `dns-authority-resolver`,
   * ADR-082 §6); compatible hacia atrás (los valores escalares siguen válidos).
   */
  metadata: Record<string, string | number | boolean | string[]>;

  /**
   * Acciones de seguimiento que el orquestador ejecuta tras éxito.
   * Lista cerrada — ver ProvisioningFollowUp.
   */
  followUp: readonly ProvisioningFollowUp[];
}

export type ProvisioningFollowUp =
  | 'mark_active' // services.status = 'active' inmediatamente
  | 'wait_for_task_completion' // services.status = 'pending', listener `provisioning-on-task-completed` lo activa
  | 'create_setup_task'; // crea Task(type=support_setup) en cola pública

// ────────────────────────────────────────────────────────────────────────────
// 3. DeprovisionContext (entrada de deprovision())
// ────────────────────────────────────────────────────────────────────────────

export interface DeprovisionContext {
  readonly service: ServiceWithRelations;
  readonly reason: 'cancelled' | 'expired' | 'admin_override';
  readonly correlationId: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. ServiceStatusReport (salida de getStatus())
// ────────────────────────────────────────────────────────────────────────────

export interface ServiceStatusReport {
  /** Estado actual real en el proveedor. */
  status: ServiceInfoStatus;
  /** Texto libre del proveedor explicando el estado. */
  statusReason?: string;
  /** Última verificación. */
  checkedAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. ServiceInfo (salida de getServiceInfo())
// ────────────────────────────────────────────────────────────────────────────

export type ServiceInfoStatus =
  | 'active'
  | 'suspended'
  | 'expired'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'unknown'; // proveedor caído / timeout

export interface ServiceMetrics {
  diskUsedMb?: number;
  diskTotalMb?: number;
  bandwidthUsedMb?: number;
  bandwidthTotalMb?: number;
  /** Solo Docker. */
  ramUsedMb?: number;
  /** Solo Docker. */
  ramTotalMb?: number;
  /** Solo Docker. */
  cpuUsagePercent?: number;
  emailAccountsUsed?: number;
  emailAccountsTotal?: number;
  databasesUsed?: number;
  databasesTotal?: number;
  /** Campos libres del plugin. */
  custom?: Record<string, string | number>;
  /** Timestamp de la lectura del proveedor. */
  fetchedAt: string;
}

/**
 * Sprint 15C.II Fase E — ADR-077 Amendment A5 (2026-05-11).
 *
 * Pista de recuperación canónica que el plugin emite cuando reporta un
 * `status` de drift / proveedor inaccesible. La UI ramifica por este valor
 * para ofrecer el CTA de remediación correcto — NUNCA matchea `statusReason`
 * por string (ese campo es i18n display, no contrato de comportamiento).
 *
 *   - `'reprovision'`     → el recurso no existe en el proveedor (nunca se
 *                            creó, o se borró externamente). Remediación:
 *                            `POST /admin/services/:id/reprovision`
 *                            (re-ejecuta `plugin.provision()` steps 1-N).
 *   - `'reconcile'`       → el recurso existe pero la metadata local
 *                            divergió (plan, refs, etc.). Remediación:
 *                            reconciliación single-shot del plugin (cron L3
 *                            manual) que re-lee el ground truth del proveedor
 *                            y actualiza Aelium (ADR-082 DH-INV-6).
 *   - `'contact_support'` → drift no auto-remediable por el admin (estado del
 *                            proveedor incoherente o proveedor caído). La UI
 *                            no ofrece CTA accionable.
 *   - `'renew'`           → (15D.G·2, dominios) el recurso expiró pero aún es
 *                            renovable (período de gracia). CTA cliente "Renovar"
 *                            (la renovación es invoice-driven, ADR-081 §5).
 *   - `'restore'`         → (15D.G·2, dominios) en redención: recuperable con
 *                            tarifa especial (restore). CTA cliente "Restaurar".
 *
 * Extensible: futuras clases de remediación se añaden a esta unión + se
 * documentan en ADR-077 Amendment A5 + el frontend las ramifica
 * explícitamente (`AdminDriftBanner` admin · detalle de dominio cliente).
 */
export type ServiceRecoveryHint =
  | 'reprovision'
  | 'reconcile'
  | 'contact_support'
  | 'renew'
  | 'restore';

/**
 * Sprint 15C.II Fase F — ADR-077 Amendment A4 (capability `supports_suspend`,
 * frozen 2026-05-10) materialización.
 *
 * Taxonomía canónica del motivo de una suspensión administrativa. Es una
 * lista cerrada **cliente-segura**: la UI muestra al cliente la etiqueta
 * localizada del enum (NUNCA texto libre del admin — eso es la `internal_note`
 * que va solo al audit log + banner admin). Heredable a todos los plugins con
 * `supports_suspend=true` (15D RC no aplica, 15E Docker, 15G Plesk) y a los
 * módulos transversales que disparan suspensiones:
 *
 *   - `'overdue_payment'`        → impago vencido (cron billing-suspend-on-overdue,
 *                                   Sprint 8 Fase 8.1). Reactivación automática al pagar.
 *   - `'abuse_investigation'`    → uso indebido / DMCA en investigación (support inside).
 *   - `'scheduled_maintenance'`  → mantenimiento programado del cluster (Sprint 10 / 15E).
 *   - `'gdpr_restriction'`       → derecho a limitación del tratamiento, RGPD art. 18
 *                                   (Sprint 12.5, a petición del interesado).
 *   - `'other'`                  → cualquier otro motivo. La etiqueta cliente es genérica
 *                                   ("Otros motivos") — el email de suspensión dirige al
 *                                   cliente a soporte para los detalles (la nota interna
 *                                   NUNCA se incluye en comunicaciones al cliente).
 *
 * El plugin recibe el motivo en `executeAction('suspend_service', { reason })`
 * por si su API de proveedor lo acepta (ej. cPanel `suspendacct` reason) — los
 * que no lo usan (Enhance `patchSubscription({ isSuspended })`) lo ignoran.
 */
export type SuspensionReason =
  | 'overdue_payment'
  | 'abuse_investigation'
  | 'scheduled_maintenance'
  | 'gdpr_restriction'
  | 'other';

/**
 * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7 (2026-05-13).
 *
 * Estado canónico del certificado SSL/TLS del recurso. La UI ramifica por
 * este valor (NUNCA por matching de strings sobre `issuer` ni por
 * aritmética de fechas en cliente — el cálculo vive server-side en el
 * plugin, ver A7.4).
 *
 *   - `'valid'`          → cert presente, expira en > 14 días naturales.
 *   - `'expiring_soon'`  → cert presente, expira en ≤ 14 días pero todavía
 *                            no expirado. Aviso ámbar; el plugin puede
 *                            declarar `autoRenew: true` para señalar que
 *                            el proveedor renovará a tiempo (LE típico).
 *   - `'expired'`        → cert presente pero `expiresAt <= now`. Aviso
 *                            rojo — el sitio aparecerá como "No seguro"
 *                            en navegadores hasta que se renueve.
 *   - `'none'`           → no hay cert configurado para el dominio (caso
 *                            de dominios añadidos antes de issuance, tras
 *                            revocación, o sitios servidos solo por HTTP).
 *                            Aviso gris informativo + CTA SSO al panel.
 */
export type ServiceSslStatus = 'valid' | 'expiring_soon' | 'expired' | 'none';

/**
 * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7 (2026-05-13).
 *
 * Sub-shape del campo opcional `ServiceInfo.ssl?`. Read-only — Aelium no
 * gestiona el cert (ADR-082 DH-INV-6 — el proveedor es authoritative);
 * este shape existe solo para que la UI exponga el estado al cliente /
 * admin.
 */
export interface ServiceSslSummary {
  /** Estado canónico — ver `ServiceSslStatus`. */
  status: ServiceSslStatus;

  /**
   * ISO-8601. Solo presente cuando `status` ∈ {`valid`, `expiring_soon`,
   * `expired`} (en `none` no hay cert, no hay fecha). El frontend lo
   * renderiza como "expira en X días" (formato relativo); admin puede
   * mostrar la fecha exacta en tooltip.
   */
  expiresAt?: string;

  /**
   * Si el proveedor renueva el cert automáticamente (típico LetsEncrypt) o
   * lo dejó manual (custom upload del cliente). `undefined` si el plugin
   * no puede determinarlo. El frontend renderiza la línea "renovación
   * automática: sí/no" solo si el valor está definido (no inventa "no").
   */
  autoRenew?: boolean;

  /**
   * Emisor del cert ("Let's Encrypt Authority X3", "DigiCert", "ZeroSSL"…).
   * Display-only — la UI lo muestra como texto. El frontend NUNCA ramifica
   * comportamiento por este valor (eso lo hace `status` + `autoRenew`); el
   * plugin sí puede usarlo internamente para derivar `autoRenew`.
   */
  issuer?: string;
}

/**
 * Sprint 15C.II Fase F.10 — ADR-077 Amendment A9 (2026-05-18).
 *
 * Representa una "aplicación instalada" dentro del recurso del proveedor
 * (típicamente una website/hosting): WordPress, Joomla, futuros CMS
 * (drupal, mediawiki, prestashop, nodejs, python, ...).
 *
 * Shape mínimo contractual genérico. Los detalles per-kind (WordPressInfo,
 * JoomlaInfo, ...) son plugin-internal y viven en endpoints/actions
 * plugin-internos invocados on-demand cuando F.10.x stats UI lo requiera
 * ([ADR-077 Amendment A9.5](../../../docs/10-decisions/adr-077-contrato-provisioner-plugin-v2.md)).
 *
 * Capability-driven por presencia (mismo molde A5/A6/A7/A8): plugins
 * que NO soporten apps instalables OMITEN el campo `ServiceInfo.apps`.
 *
 * Multi-instancia: una misma website puede tener N apps del mismo kind
 * en distintos paths (ej: WP en `/` + WP en `/blog`). Cada `AppPresence`
 * lleva su propio `appId` + `path` para diferenciar.
 */
export interface AppPresence {
  /**
   * ID estable provisto por el proveedor (UUID en Enhance; string libre
   * en general). Sirve como discriminator del payload en
   * `executeAction('open_app_admin', { appId })`.
   */
  appId: string;

  /**
   * String libre plugin-internal (mismo patrón `ServiceAction.slug`).
   * Convención: lowercase + snake_case si compuesto.
   *
   * Valores actuales (Sprint 15C.II Fase F.10):
   *   - 'wordpress' — WP app, SSO contractual orchd via `getWordpressUserSsoUrl`.
   *   - 'joomla'    — Joomla app, URL canónica `${site_url}/administrator`.
   *
   * Valores futuros (heredabilidad): 'nodejs', 'python', 'drupal',
   * 'mediawiki', 'prestashop', etc. — añadidos sin amendment del
   * contrato cuando un plugin los soporte.
   */
  kind: string;

  /**
   * i18n key (translatable en el frontend). El plugin emite la key
   * canónica; el frontend traduce. Ejemplos:
   *   - 'plugin.enhance_cp.apps.wordpress'
   *   - 'plugin.enhance_cp.apps.joomla'
   */
  label: string;

  /**
   * Subdirectorio si la app NO está instalada en la raíz del recurso.
   * Si está en raíz (path conceptual `/`), omitido. Permite multi-instancia:
   * 2 WP en una misma website (uno en `/`, otro en `/blog`) → 2 entries
   * diferenciadas por `path`.
   */
  path?: string;

  /** Versión instalada de la app (informativo, display-only). */
  version?: string;

  /**
   * Acciones disponibles per-instalación. Mismo shape `ServiceAction`
   * que las acciones del servicio entero (incluye `adminOnly`).
   *
   * Sprint 15C.II Fase F.10 declara una sola acción canónica:
   *   - `'open_app_admin'` — abre el admin de la app (SSO o URL canónica
   *     según kind; payload `{ appId }`; returns `ActionResult.data`
   *     con `{ url, kind: 'sso'|'canonical', opensIn: 'new_tab' }`).
   *
   * Acciones futuras (heredabilidad — additivas a `actions[]`):
   *   - `'update_app_version'` (DC.NEW-53)
   *   - `'install_app_plugin'` (DC.NEW-53, WP-only)
   *   - `'set_default_wp_sso_user'` (DC.NEW-53, WP-only)
   *   - `'uninstall_app'` (DC.NEW-52)
   *   - ...
   *
   * Si la action está ausente del array, el frontend NO renderiza el
   * botón (capability-driven por presencia). Ejemplo concreto Sprint
   * 15C.II Fase F.10: WordPress sin default user → plugin omite
   * `'open_app_admin'` de `actions[]` → frontend renderiza el atajo
   * DISABLED con tooltip "Configura un usuario WP por defecto en el
   * panel" + CTA "Abrir panel".
   */
  actions: readonly ServiceAction[];
}

/**
 * Sprint 15D — ADR-077 Amendment A11 (2026-05-22).
 *
 * Estado de gestión de un dominio reportado por el registrar, para que la
 * UI de gestión (cliente/admin) renderice valores actuales + las 5 inline
 * actions de registrar (A10: modify_nameservers, modify_contacts,
 * toggle_privacy, toggle_registrar_lock, get_auth_code). Capability-driven
 * por presencia (mismo molde A5/A7/A9): solo plugins con
 * `is_domain_registrar=true` lo emiten para services de `product.type='domain'`;
 * el resto OMITE `ServiceInfo.domain`.
 *
 * PII: `contacts` es un RESUMEN (presencia + nombre del registrant), NUNCA
 * direcciones/teléfonos/emails completos — `ServiceInfo` se cachea en Redis
 * (ADR-080) y NO debe contener PII completa (R12 + RGPD). Los detalles
 * completos de contacto se leen on-demand para el form de `modify_contacts`,
 * fuera del snapshot cacheado.
 */
export interface DomainInfo {
  /** FQDN registrado (= services.domain). */
  fqdn: string;
  /** Nameservers actuales según el registrar. */
  nameservers: readonly string[];
  /**
   * Expiración real del registrar (ISO-8601). Espejo de `services.expires_at`
   * (ADR-082 A2.3). Autoritativa para dominios; `display.expiresAt` la refleja.
   */
  expiresAt?: string;
  /**
   * Sub-fase del ciclo ICANN (ADR-082 A2.3). `'active'` si el dominio está
   * vigente; el resto cuando `ServiceInfo.status='expired'`.
   */
  lifecycle: 'active' | 'expired' | 'redemption' | 'pending_delete';
  /** WHOIS privacy ON/OFF (default ON — ADR-081). Refleja `toggle_privacy`. */
  whoisPrivacy: boolean;
  /** Registrar lock / theft protection ON/OFF. Refleja `toggle_registrar_lock`. */
  registrarLock: boolean;
  /**
   * Si el auth/EPP code puede obtenerse AHORA (`get_auth_code`). p.ej. false
   * si `registrarLock` activo o dominio <60 días desde el registro.
   */
  authCodeAvailable: boolean;
  /** Preferencia de auto-renovación (en v1 = factura + avisos, no cobro — ADR-084). */
  autoRenew?: boolean;
  /** Resumen de contactos (presencia + nombre del registrant). SIN PII completa. */
  contacts?: {
    registrantName?: string;
    hasAdmin: boolean;
    hasTech: boolean;
    hasBilling: boolean;
  };
}

export interface ServiceInfo {
  /**
   * Estado real del servicio en el proveedor.
   * Distinto de `services.status` (cache local) — el plugin lo determina.
   */
  status: ServiceInfoStatus;
  statusReason?: string;

  /**
   * Sprint 15C.II Fase E — ADR-077 Amendment A5 (2026-05-11).
   *
   * Solo relevante cuando `status` ∈ {`unknown`, `failed`, `suspended`,
   * `expired`} (drift). Si presente, indica la clase de remediación canónica
   * que la UI debe ofrecer al admin. Si ausente (incluyendo cuando
   * `status === 'active'`), la UI no ofrece CTA de recuperación.
   * Ver `ServiceRecoveryHint`. El plugin es la única autoridad sobre qué
   * drift es recuperable y cómo — el frontend NUNCA matchea `statusReason`.
   */
  recoveryHint?: ServiceRecoveryHint;

  display: {
    /** Ej. "miweb.com" / "cliente1.aelium.net" / "miempresa.es". */
    primary: string;
    /** Ej. "Hosting Pro 10GB" / "Cloud Office Pro 4GB". */
    secondary?: string;
    /** ISO-8601. */
    expiresAt?: string;
    autoRenew?: boolean;
  };

  /** undefined si plugin no expone métricas. */
  metrics?: ServiceMetrics;

  /**
   * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7 (2026-05-13).
   *
   * Solo presente si el plugin puede leer el estado del cert SSL/TLS del
   * recurso. Si ausente (incluyendo cuando el plugin sabe leerlo pero la
   * lectura falló o devolvió datos parciales/ilegibles), la UI no
   * renderiza la card SSL. Ver `ServiceSslSummary`.
   *
   * La presencia del campo es la **señal de capability** — no se añade un
   * flag nuevo a `PluginCapabilities` (mismo patrón que `metrics?` y
   * `recoveryHint?`, Amendment A5).
   */
  ssl?: ServiceSslSummary;

  /**
   * Sprint 15C.II Fase F.10 — ADR-077 Amendment A9 (2026-05-18).
   *
   * Apps CMS instaladas dentro del recurso del proveedor (websites con
   * WordPress / Joomla / etc.). Capability-driven por presencia (mismo
   * molde A5/A6/A7/A8): plugins que NO soporten apps instalables OMITEN
   * el campo; plugins que sí lo soporten lo emiten (vacío permitido si
   * no hay instalaciones — el frontend gatea por `length > 0` para
   * renderizar el card).
   *
   * El frontend renderiza `<AppShortcutsCard>` solo si
   * `info.apps !== undefined && info.apps.length > 0`. NUNCA ramifica
   * por `provisioner_slug` (ADR-070).
   *
   * Shape mínimo contractual (`AppPresence`); los detalles per-kind
   * (`WordPressInfo`/`JoomlaInfo`/futuros) son plugin-internal y viven
   * en endpoints/actions plugin-internos invocados on-demand cuando
   * F.10.x stats UI lo requiera (DC.NEW-51).
   */
  apps?: readonly AppPresence[];

  /**
   * Sprint 15D — ADR-077 Amendment A11 (2026-05-22).
   *
   * Estado de gestión del dominio. Capability-driven por presencia: plugins
   * con `is_domain_registrar=true` lo emiten para services de
   * `product.type='domain'`; el resto lo OMITE. El frontend renderiza el card
   * de gestión de dominio solo si `info.domain !== undefined`. NUNCA ramifica
   * por `provisioner_slug` (ADR-070). Ver `DomainInfo`.
   */
  domain?: DomainInfo;

  /**
   * Capability flags por instancia de servicio. Override estáticos por
   * contexto. Ej. un servicio Docker en pool sin admin panel devuelve
   * `hasSsoPanel=false` aunque el plugin declare estático `has_sso_panel=true`.
   */
  capabilities: ServiceCapabilities;

  /**
   * Subset de `plugin.inlineActions` filtrado por el estado actual del
   * servicio (ej. `restart` no aparece si `status='cancelled'`).
   */
  availableActions: readonly ServiceAction[];

  /** Timestamp de la lectura del proveedor (cache se calcula desde aquí). */
  fetchedAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 6. SsoUrl (salida de getSsoUrl())
// ────────────────────────────────────────────────────────────────────────────

export interface SsoUrl {
  /** URL completa con session token. */
  url: string;
  /** ISO-8601. Típicamente 5-15 min. */
  expiresAt: string;
  /** Etiqueta del panel de destino (i18n key del plugin). */
  panelLabel: string;
  /** Canónico: siempre 'new_tab' para no perder el dashboard. */
  opensIn: 'new_tab';
}

// ────────────────────────────────────────────────────────────────────────────
// 7. ServiceAction + ActionResult (entrada/salida de executeAction())
// ────────────────────────────────────────────────────────────────────────────

export interface ServiceAction {
  /** Slug canónico (kebab-case) — lista cerrada por plugin. */
  slug: string;
  /** Etiqueta i18n key. */
  label: string;
  /** Descripción i18n key (opcional). */
  description?: string;
  /** Si requiere modal de confirmación. */
  confirmRequired: boolean;
  /** Texto de confirmación i18n key (si confirmRequired). */
  confirmationText?: string;
  /** Si renderizar con estilo destructive. */
  destructive: boolean;
  /**
   * Sprint 15C Fase 15C.E (ADR-077 Amendment A3 + ADR-083 Amendment A3).
   *
   * Si `true`, la acción solo puede ser invocada por usuarios con rol
   * staff (`superadmin` / `agent_full` / `agent_billing` / `agent_support`).
   * El wrapper `executeActionWithCacheInvalidation` la enforce con HTTP 403
   * (ForbiddenException) + audit pesado + evento
   * `service.action_admin_only_violation` cuando un cliente la invoca.
   *
   * Default `false` (client-callable). Plugins existentes que no declaran
   * el campo conservan comportamiento previo.
   *
   * Frontend filtra `inlineActions` por rol: el cliente sólo ve acciones
   * con `adminOnly !== true`; admin ve todas. El backend nunca confía en
   * el frontend (defense-in-depth).
   *
   * Ortogonal a `destructive`: una action puede ser `adminOnly` sin ser
   * destructive (ej. `change_package` sólo impacta billing) o destructive
   * sin ser admin-only (ej. `delete_dns_record` borra record propio).
   */
  adminOnly?: boolean;
  /**
   * Sprint 15C.II Fase D (ADR-083 Amendment A4.5 — gap G2 audit técnico
   * 2026-05-10). R12 compliance: secrets nunca audit.
   *
   * Lista de keys de `ActionResult.data.<key>` cuyo nombre matchea el regex
   * canónico `/(password|secret|token|apiKey|privateKey)/i` pero que el
   * plugin DECLARA legítimamente auditables sin redactar (uncommon —
   * requiere ADR específico justificando). Default `[]` (no allowList:
   * TODOS los matches del regex se redactan a `'[REDACTED]'` antes de
   * persistir audit_change_log).
   *
   * NO aplica a `reset_account_password` ni equivalentes — esas siempre
   * redactan. Caso de uso hipotético: una action que retorna un
   * `metadata.access_token_id` (identificador, no el token en sí) cuyo
   * nombre matchea por substring pero NO contiene secreto.
   *
   * El sanitizer canónico vive en
   * [`core/provisioning/audit-sanitizer.ts`](./audit-sanitizer.ts) y se
   * invoca desde `executeActionWithCacheInvalidation` antes de
   * `audit.logChange`. Heredable a 15D RC, 15E Docker, 15G Plesk.
   */
  allowsSensitiveDataInAudit?: readonly string[];
  /**
   * Schema de payload (Zod descrito como JSON Schema 7).
   * Usado por frontend para construir el formulario inline.
   */
  payloadSchema?: Record<string, unknown>;
}

export type ActionSideEffect =
  | 'service.metrics_invalidated'
  | 'service.restarted'
  | 'service.dns_modified'
  | 'service.password_reset'
  | 'service.subdomain_changed';

export interface ActionResult {
  /** Si la acción terminó OK desde el punto de vista del plugin. */
  success: boolean;
  /** Mensaje al cliente (i18n key del plugin). */
  message?: string;
  /**
   * Side effects para que el orquestador notifique a otros módulos.
   * Lista cerrada — solo strings de `ActionSideEffect`.
   */
  sideEffects?: readonly ActionSideEffect[];
  /** Datos adicionales que el frontend renderiza inline (ej. logs tail). */
  data?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Capability flags estáticos cerrados
// ────────────────────────────────────────────────────────────────────────────

export interface PluginCapabilities {
  /** Soporta SSO al panel externo (getSsoUrl puede devolver no-null). */
  has_sso_panel: boolean;
  /** Etiqueta del panel para el botón cliente. Solo si `has_sso_panel=true`. */
  panel_label?: string;
  /** Devuelve métricas en `getServiceInfo.metrics`. */
  has_metrics: boolean;
  /** Aelium guarda series temporales (server_metrics filtradas). Solo Docker. */
  has_metrics_history: boolean;
  /** Requiere asignación de servidor (`pickServerForProduct`). Solo Docker. */
  requires_server: boolean;
  /**
   * Provision es síncrono (devuelve antes de N segundos) o asíncrono.
   * Si `async`, el orquestador no espera el resultado y delega al webhook
   * o cron de reconciliación del plugin.
   */
  provision_mode: 'sync' | 'async';
  /**
   * Plugin completa el provisioning vía Task del agente.
   * Si `true`, el listener `provisioning-on-task-completed` activa el servicio
   * cuando se cierra la Task asociada. Hoy solo `manual`.
   */
  completes_via_task: boolean;
  /**
   * Aelium puede hacer reconciliación periódica (cron `service-reconcile`)
   * llamando a `getStatus()`. False si la operación es cara para el proveedor.
   */
  supports_reconciliation: boolean;
  /**
   * Sprint 15C — ADR-077 Amendment A1 + ADR-082 §3.
   *
   * Indica si el plugin gestiona zonas DNS authoritative (puede listar y
   * CRUD records de las zonas asociadas a sus services).
   *
   * Plugins con `has_dns_management=true` DEBEN soportar las 4 inline
   * actions canónicas en `executeAction()`:
   *   - `list_dns_records`   → devuelve la lista completa de records de la zona.
   *   - `add_dns_record`     → crea un record (payload validado vs schema).
   *   - `update_dns_record`  → modifica un record existente.
   *   - `delete_dns_record`  → elimina un record por ID.
   *
   * El orquestador `provisioning` invoca estas actions vía
   * `core/provisioning/dns-authority-resolver.ts` (ADR-082 §6) cuando
   * sirve `GET/POST/PATCH/DELETE /api/v1/services/{id}/dns/records`.
   *
   * Plugins con `has_dns_management=false` NO declaran esos slugs en
   * `inlineActions` — el resolver los excluye del routing.
   *
   * Mapping inicial canónico (ADR-077 Amendment A1.2):
   *   - `internal`, `manual`, `resellerclub`, `docker_engine`: false
   *   - `enhance_cp` (Sprint 15C): true
   *   - `cpanel_whm`, `plesk_obsidian`: true (si Aelium opera DNS authority)
   *   - `cloudflare_dns` (hipotético): true
   */
  has_dns_management: boolean;

  /**
   * Sprint 15C.II Fase F — ADR-077 Amendment A4 (2026-05-10).
   *
   * El plugin soporta suspender / reactivar el servicio sin desprovisionarlo
   * (preserva los datos en el proveedor — solo desactiva el acceso). Distinto
   * de `deprovision`, que destruye recursos. Crítico para impago temporal vs
   * cancelación definitiva, abuse en investigación, RGPD art. 18, mantenimiento.
   *
   * Plugins con `supports_suspend=true` DEBEN declarar en `inlineActions` los
   * 2 slugs canónicos `suspend_service` y `unsuspend_service` (ambos
   * `adminOnly: true` — suspensión es operación administrativa, NO cliente
   * self-service) e implementarlos idempotentes en `executeAction()`. El
   * `services.status` canónico transiciona a `suspended` / `active` y el
   * **orquestador** (`ProvisioningService.suspendAsAdmin` / `unsuspendAsAdmin`)
   * emite `service.suspended` / `service.unsuspended` post-action — NUNCA el
   * plugin (R8 audit centralizado).
   *
   * Plugins con `supports_suspend=false` NO declaran esos slugs. El contract
   * test `provisioner-plugin-suspend.contract.spec.ts` verifica la consistencia
   * bidireccional.
   *
   * Mapping inicial (ADR-077 Amendment A4.2):
   *   - `internal`, `manual`, `resellerclub`: false
   *   - `enhance_cp` (Sprint 15C.II Fase F): true (via `patchSubscription({ isSuspended })`)
   *   - `docker_engine` (15E): true (`docker stop` preservando volúmenes)
   *   - `plesk` (15G): true (`--update-domain -status suspended/active`)
   */
  supports_suspend: boolean;

  /**
   * Sprint 15D — ADR-077 Amendment A10 (2026-05-21).
   *
   * Indica si el plugin registra/gestiona dominios contra un registrar
   * (ResellerClub, Hexonet, OpenSRS, ...). Distinto de `has_dns_management`:
   * un registrar puede NO ser autoridad DNS (RC: los NS van a Aelium/Enhance).
   *
   * Plugins con `is_domain_registrar=true` cumplen el SUB-CONTRATO DE
   * REGISTRAR:
   *   - Plano A (pre-venta): implementan `checkDomainAvailability?()` y
   *     `getTldPricing?()` (required cuando la capability es true — enforzado
   *     por el contract test).
   *   - Plano B (ciclo de vida): `provision()` distingue
   *     register/renew/transfer_in vía `ProvisionContext.operation`.
   *   - Plano C (gestión): declaran las 5 inline actions canónicas
   *     (`modify_nameservers`, `modify_contacts`, `toggle_privacy`,
   *     `toggle_registrar_lock`, `get_auth_code`) y emiten `ServiceInfo.domain`
   *     (A11) para sus services de dominio.
   *
   * Las garantías transversales (exactly-once por nombre, lock de
   * concurrencia, guardia de margen, renovación verificada, elegibilidad) las
   * gobierna ADR-084 (DOM-INV-1..5), NO este contrato — aquí solo se declara
   * la forma.
   *
   * Mapping inicial (ADR-077 A10.5):
   *   - `internal`, `manual`, `enhance_cp`, `docker_engine`, `plesk_obsidian`: false
   *   - `resellerclub` (Sprint 15D): true
   */
  is_domain_registrar: boolean;
}

/**
 * Capability flags por instancia de servicio (overrides estáticos).
 * `getServiceInfo()` devuelve este shape; el frontend ramifica por estos flags
 * (NUNCA por `provisioner_slug` — eso rompería ADR-070).
 */
export interface ServiceCapabilities extends PluginCapabilities {
  /** Por instancia: si el SSO está disponible AHORA. */
  hasSsoPanel: boolean;
  /** Por instancia: subset disponible para este servicio + estado actual. */
  inlineActions: readonly ServiceAction[];
}

// ────────────────────────────────────────────────────────────────────────────
// 9. ProvisionerPluginError (clase de error semántico canónico)
// ────────────────────────────────────────────────────────────────────────────

export type ProvisionerErrorCode =
  | 'PROVIDER_TIMEOUT' // retriable=true
  | 'PROVIDER_RATE_LIMITED' // retriable=true
  | 'PROVIDER_AUTH_FAILED' // retriable=false (credenciales mal — alerta admin)
  | 'PROVIDER_RESOURCE_EXHAUSTED' // retriable=false (capacidad superada)
  | 'INVALID_PAYLOAD' // retriable=false (DTO mal — bug del orquestador)
  | 'INVALID_STATE' // retriable=false (servicio en estado incompatible)
  | 'NOT_IMPLEMENTED' // retriable=false (capability declarada pero no soportada — bug)
  | 'PROVIDER_INTERNAL_ERROR' // retriable=true por defecto
  | 'NETWORK_ERROR' // retriable=true
  | 'RECONCILE_ONE_NOT_SUPPORTED' // retriable=false (F.9 — plugin no implementa reconcileOne?())
  // ─── Sprint 15D — ADR-077 Amendment A10: códigos de negocio de dominio ───
  // Todos retriable=false (no son fallos transitorios — reintentar no cambia
  // el resultado; el cliente o el admin deben actuar). Cada registrar mapea
  // sus errores nativos (códigos RC, EPP 2xxx, ...) a estos (RC: ADR-081 §7).
  | 'DOMAIN_UNAVAILABLE' // el dominio ya está registrado (por otro o por nosotros en reintento)
  | 'DOMAIN_PREMIUM' // precio dinámico fuera de la tabla TLD pricing → bloquear v1 (venta v1.1)
  | 'REGISTRANT_INELIGIBLE' // el registrant no cumple requisitos del TLD (.es→NIF, .eu→residencia UE) → DOM-INV-5
  | 'TRANSFER_REJECTED' // el registrar de origen/destino rechazó el transfer (lock, <60d, NACK) → 15D.II
  | 'INVALID_AUTH_CODE' // EPP/auth code incorrecto en transfer_in → 15D.II
  | 'DOMAIN_IN_REDEMPTION' // dominio en RGP/redemption: no renovable normal, requiere restore (fee distinto)
  | 'REGISTRAR_LOCKED'; // operación bloqueada por registrar lock activo (hay que desbloquear antes)

/**
 * Error semántico canónico — todos los plugins lanzan instancias de esta clase,
 * no `Error` plano. El orquestador usa `error.retriable` para decidir si
 * reintentar (con backoff [30s, 90s, 270s]) o ir directo a DLQ + emitir
 * `service.provisioning_failed`.
 *
 * `module` (Sprint 15C.II Fase F.3 — GAP-15CII-N): origen lógico del error
 * (p.ej. `provisioning.enhance_cp`), leído por `GlobalExceptionFilter` para
 * que `error_log.module` refleje el módulo real en vez del genérico `'http'`.
 * Mutable a propósito: los plugins lanzan `new ProvisionerPluginError(msg,
 * code, retriable)` sin conocer su contexto de invocación; el **wrapper**
 * (`plugin-utils`), que sí sabe el slug, lo setea antes de re-lanzar. También
 * vale pasarlo en el constructor cuando el caller ya lo conoce.
 */
export class ProvisionerPluginError extends Error {
  constructor(
    message: string,
    public readonly code: ProvisionerErrorCode,
    public readonly retriable: boolean,
    public readonly cause?: unknown,
    public module?: string,
  ) {
    super(message);
    this.name = 'ProvisionerPluginError';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 9.5. Reconciliation shapes (per-servicio)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Sprint 15C.II Fase F.9 — ADR-077 Amendment A8 (dossier §A.11.10.6.2).
 *
 * Tipos canónicos del flujo "reconcile per-servicio" (`reconcileOne?()` opcional
 * en `ProvisionerPlugin`). Conviven con `ReconcileResult` agregado del
 * reconcile-all en `reconcile-registry.service.ts:74` — son shapes distintos
 * con propósitos distintos: `ReconcileResult` (agregado) lo produce el cron
 * L3 con conteos sumarizados; `ServiceReconcileResult` (per-servicio) lo
 * produce `reconcileOne` con detalle por drift. Naming clash resuelto en
 * Amendment 2026-05-16 § A.11.10.6.2 — sufijo `Service*` heredable a fases
 * futuras (15D RC / 15E Docker / 15G Plesk) para cualquier shape per-servicio.
 */

/**
 * Tipo de drift detectado al comparar el estado local Aelium contra el ground
 * truth del proveedor. Alineado con los 3 casos del cron L3 (Enhance
 * `ReconcileChangeType`) para que `reconcileOne` use el mismo vocabulario
 * canónico — heredable a otros plugins (los específicos del proveedor pueden
 * mapear sus diferencias a uno de estos 3).
 *
 *   - `subscription_missing`: el proveedor reporta 404 para el
 *     `provider_reference` (subscription/orden/contenedor) del service. El
 *     plugin lo detecta como drift; el orquestador F.9 NO lo aplica
 *     automáticamente (R4 frozen — protege contra desyncs transitorios
 *     destructivos como `MockEnhanceServer` reiniciado).
 *   - `status_divergence`: el status real del proveedor difiere del
 *     `services.status` administrativo. Auto-adopt solo si el status del
 *     proveedor es `active` o `suspended` (R4 + DH-INV-6 + F.4 A1).
 *   - `plan_divergence`: el plan/recursos asignados en el proveedor difieren
 *     del `product.provisioner_config` esperado. Auto-adopt sobre
 *     `services.metadata` (drift de catálogo, no destructivo).
 */
export type ServiceDriftType =
  | 'subscription_missing'
  | 'status_divergence'
  | 'plan_divergence';

/**
 * Drift individual detectado al reconciliar un servicio. Shape genérico
 * heredable — los valores `before`/`after` son `unknown` para que cada plugin
 * los serialice según su modelo (p.ej. Enhance pone strings de status, ints
 * de plan_id, null para subscription_missing).
 */
export interface ServiceDrift {
  /** Categoría canónica del drift. */
  readonly type: ServiceDriftType;
  /** Valor que tenía Aelium antes (estado local). */
  readonly before: unknown;
  /** Valor que reporta el proveedor (ground truth). */
  readonly after: unknown;
  /** Si el orquestador aplicó este drift sobre el estado local (R4 safe-adopt). */
  readonly applied: boolean;
  /** Mensaje humano opcional para audit/timeline. */
  readonly message?: string;
}

/**
 * Resultado de `reconcileOne(service)` per-servicio. Separa explícitamente los
 * drifts detectados de los aplicados — `driftsApplied ⊆ driftsDetected`. R4
 * frozen — los drifts NO aplicados (típicamente status `cancelled`/
 * `subscription_missing` del proveedor) quedan en `driftsDetected` pero NO
 * mutan `services.status` (transiciones destructivas requieren intención
 * humana explícita vía `deprovisionAsAdmin` — `DC.46`).
 */
export interface ServiceReconcileResult {
  readonly driftsDetected: readonly ServiceDrift[];
  readonly driftsApplied: readonly ServiceDrift[];
  readonly reconciledAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// 9.7. Registrar shapes (plano A — pre-venta) — Sprint 15D, ADR-077 A10
// ────────────────────────────────────────────────────────────────────────────

/**
 * Salida de `checkDomainAvailability(domain)`. Usado por el buscador
 * (`/dashboard/domains/search`) y como pre-flight de DOM-INV-1 (exactly-once
 * por nombre, ADR-084) antes de un `register`.
 */
export interface DomainAvailability {
  domain: string;
  available: boolean;
  /**
   * El registrar marca el dominio como premium (precio dinámico fuera de la
   * tabla TLD pricing). v1 lo bloquea (`DOMAIN_PREMIUM`); venta v1.1 (ADR-084).
   */
  premium: boolean;
  /** Precio premium si `premium=true` (informativo; no se vende en v1). */
  premiumPrice?: { amount: string; currency: string };
}

/**
 * Entrada de la matriz de COSTE mayorista que `getTldPricing()` devuelve. El
 * cron de sync (ADR-084 §1) aplica markup y puebla `domain_tld_pricing`,
 * permitiendo que el sync sea agnóstico al registrar.
 *
 * Moneda (ADR-084 A1.2 — moneda única v1): `cost.currency` DEBE coincidir con
 * la moneda de venta configurada (`plugin.<registrar>.default_currency`); el
 * cron es fail-safe y omite + alerta (`system.error`) las filas con otra
 * moneda en lugar de tarifar mal.
 */
export interface TldCostEntry {
  /** Sin punto, lowercase ('com', 'es', 'eu'). */
  tld: string;
  operation: 'register' | 'renew' | 'transfer' | 'restore';
  /** 1..10. */
  years: number;
  /** Coste mayorista del registrar. */
  cost: { amount: string; currency: string };
}

/**
 * Resultado de `updateRegistrantContact` (Sprint 15D Fase 15D.G·2).
 */
export interface RegistrantUpdateResult {
  /** Se propagó al registrar (false si el cliente aún no tiene contacto/dominios). */
  propagated: boolean;
  /** Dominios del cliente que reflejan el cambio (comparten el contacto). */
  domainsAffected: number;
  /**
   * El nombre del titular cambió → puede disparar verificación + lock de
   * transferencia ICANN de 60 días (la UI avisa al cliente). [CONSERVADOR Fase G].
   */
  nameChanged: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// 10. ProvisionerPlugin (interfaz canónica v2)
// ────────────────────────────────────────────────────────────────────────────

/**
 * ProvisionerPlugin v2 — contrato canónico congelado por ADR-077.
 *
 * Implementa los 6 métodos:
 *   - 3 heredados de ADR-021 (provision, deprovision, getStatus)
 *   - 3 nuevos de ADR-070 (getServiceInfo, getSsoUrl, executeAction)
 *
 * Versionado: el contrato v2 es estable. Cambios futuros que rompan
 * compatibilidad requieren ADR explícito + bump a v3 + migración.
 */
export interface ProvisionerPlugin {
  /** Identificador canónico del plugin (slug en kebab-case). Inmutable. */
  readonly slug: string;

  /** Versión del contrato implementado. Hoy: 'v2'. */
  readonly contractVersion: 'v2';

  /** Capability flags declarados estáticamente. */
  readonly capabilities: PluginCapabilities;

  /** Lista cerrada de acciones inline soportadas. */
  readonly inlineActions: readonly ServiceAction[];

  // ─── Métodos heredados ADR-021 ─────────────────────────────────────────

  /**
   * Crea el servicio en el sistema externo (o marca activo si interno).
   * Idempotente: si ya existe `provider_reference`, devuelve éxito sin recrear.
   * Lanza `ProvisionerPluginError` con código semántico en fallo.
   */
  provision(ctx: ProvisionContext): Promise<ProvisionResult>;

  /**
   * Cancela / elimina el servicio en el sistema externo.
   * Idempotente: si ya está cancelado externamente, devuelve éxito.
   */
  deprovision(ctx: DeprovisionContext): Promise<void>;

  /**
   * Lectura puntual del estado real en el sistema externo.
   * NO debe consultar cache de Aelium — es la fuente de verdad ad-hoc.
   * Usado por crons de reconciliación, no por `/dashboard/services/[id]`.
   */
  getStatus(service: ServiceWithRelations): Promise<ServiceStatusReport>;

  // ─── Métodos nuevos ADR-070 (canónicos a partir de v2) ─────────────────

  /**
   * Devuelve información normalizada del servicio para renderizar
   * `/dashboard/services/[id]`. El orquestador la cachea en Redis con
   * TTL configurable. Plugins NO gestionan la cache — el wrapper
   * `core/provisioning/plugin-utils.getServiceInfoWithCache()` lo hace.
   */
  getServiceInfo(service: ServiceWithRelations): Promise<ServiceInfo>;

  /**
   * Devuelve URL firmada de single sign-on al panel del proveedor.
   * Devuelve `null` si el plugin no soporta SSO (ej. resellerclub, manual).
   * El orquestador audita la llamada con `service.sso_opened`.
   */
  getSsoUrl(service: ServiceWithRelations): Promise<SsoUrl | null>;

  /**
   * Ejecuta una acción inline del catálogo `inlineActions`.
   * El wrapper `executeActionWithCacheInvalidation()` invalida cache
   * y emite `service.action_executed` automáticamente.
   * El plugin SOLO implementa la lógica del proveedor.
   */
  executeAction(
    service: ServiceWithRelations,
    actionSlug: string,
    payload: Record<string, unknown>,
  ): Promise<ActionResult>;

  /**
   * Test de conectividad **independiente de cualquier servicio** (Sprint
   * 15C.II Fase F.3 — GAP-15CII-G8). **Obligatorio** si
   * `manifest.testConnectionMethod === 'custom'`; ignorado en otro caso.
   *
   * A diferencia de `getStatus()` (que requiere un `provider_reference`
   * real), esto hace un *probe* ligero contra el proveedor con las
   * credenciales configuradas — p.ej. `GET /version` (alive) + `GET /orgs/{master}`
   * (auth + RBAC) en Enhance. NO debe tener side-effects. Captura sus
   * propios errores y los reporta como `{ ok: false, message }` —
   * `AdminPluginsService.testConnection` no espera que lance.
   */
  testConnection?(): Promise<{ ok: boolean; message: string }>;

  /**
   * Reconcilia un único servicio contra el ground truth del proveedor (Sprint
   * 15C.II Fase F.9 — ADR-077 Amendment A8, dossier §A.11.10.6.2 R1 frozen).
   * Análogo per-servicio al cron L3 de reconcile-all (`ReconcileRegistryService
   * .reconcileAll`), pensado para que el admin pulse el CTA "Reconciliar
   * contra el proveedor" en `<AdminDriftBanner>` (cuando `info.recoveryHint
   * === 'reconcile'`) o por fila en `<PluginOperationalOverview>` (F.2) y
   * cierre el drift puntualmente sin esperar a la siguiente pasada del cron.
   *
   * **Estrictamente opcional** — capability-driven por presencia del método
   * (mismo patrón que A6 `testConnection?()` y A7 `ServiceInfo.ssl?`). Plugins
   * que NO lo implementen → `ReconcileRegistryService.reconcileOne(slug,
   * service)` lanza `ProvisionerPluginError({ code:
   * 'RECONCILE_ONE_NOT_SUPPORTED', module: 'reconcile', http: 400 })` y el
   * frontend gatea el CTA leyendo la capability del manifest (NO se añade
   * flag explícito en `PluginCapabilities` — consistencia con A6/A7).
   *
   * **Doctrina safe-to-adopt** (R4 frozen) — espejo del cron L3 +
   * DH-INV-6 + F.4 A1:
   *   - Status del proveedor `active`/`suspended` → auto-adopt sobre
   *     `services.status` (alineado al lifecycle administrativo).
   *   - Cualquier otro status (`cancelled`, `subscription_missing`,
   *     `terminated`, `expired`) → drift detectado y emitido en
   *     `driftsDetected`, **NO mutado** sobre `services.status` (transiciones
   *     destructivas requieren intención humana explícita vía
   *     `deprovisionAsAdmin` — `DC.46`).
   *   - Drift `plan_divergence` → auto-adopt sobre `services.metadata`
   *     (drift de catálogo, no destructivo).
   *
   * El plugin SOLO devuelve el `ServiceReconcileResult`; el orquestador
   * (`ProvisioningService.reconcileServiceAsAdmin`) gestiona transacción,
   * cache invalidation, audit, evento `service.reconciled_external_change`
   * con `trigger: 'manual_single'` (R2), y la creación opcional de
   * `ClientNote` vía F.6 si `driftsApplied > 0` (R3) — el plugin NUNCA
   * toca esos canales (R8 audit centralizado).
   */
  reconcileOne?(service: ServiceWithRelations): Promise<ServiceReconcileResult>;

  // ─── Plano A registrar (Sprint 15D — ADR-077 Amendment A10) ────────────
  // Opcionales en la interface, **required** cuando
  // `capabilities.is_domain_registrar === true` (enforzado por el contract
  // test A10.4). Permiten que el buscador y el cron de pricing sean agnósticos
  // al registrar (ADR-070). `suggestDomainNames?()` (buscador rico) se difiere
  // a Sprint 15D.II — su firma NO se congela aquí.

  /**
   * Consulta disponibilidad de un FQDN contra el registrar. Usado por el
   * buscador (`/dashboard/domains/search`) y como pre-flight de DOM-INV-1
   * (exactly-once por nombre, ADR-084) antes de un `register`.
   */
  checkDomainAvailability?(domain: string): Promise<DomainAvailability>;

  /**
   * Devuelve la matriz de COSTE mayorista por TLD/operación/años del
   * registrar. El cron de sync (ADR-084 §1) aplica markup y puebla
   * `domain_tld_pricing`. Permite que el sync sea agnóstico al registrar.
   */
  getTldPricing?(): Promise<readonly TldCostEntry[]>;

  /**
   * Sprint 15D Fase 15D.G·2 (ADR-077 A10 additivo) — actualiza los datos del
   * **contacto registrante (WHOIS)** del cliente en el registrar a partir de su
   * perfil (`ClientPublicData`). Modelo "1 titular/cliente": el contacto es
   * compartido por todos sus dominios → un solo `contacts/modify` los propaga.
   * Capability-driven por presencia (opcional, como `checkDomainAvailability?`).
   * Idempotente + verify-after-write. Si el cliente aún no tiene contacto (sin
   * dominios) → `propagated:false` (no-op, no error).
   */
  updateRegistrantContact?(
    client: ClientPublicData,
  ): Promise<RegistrantUpdateResult>;

  /**
   * Sprint 15D Fase 15D.G·2 (ADR-077 A10 additivo / ADR-081 A3.1) — borrado
   * **destructivo** de un dominio en el registrar dentro del período de gracia
   * (con reembolso). Distinto de `deprovision` (no-op: el dominio persiste hasta
   * expirar); esto es una acción admin EXPLÍCITA. Capability-driven por presencia.
   * Fuera de la ventana de gracia el registrar rechaza (`PROVIDER_*`). El
   * orquestador cancela el `service` Aelium por separado (lifecycle canónico).
   */
  deleteDomain?(service: ServiceWithRelations): Promise<void>;

  /**
   * Manifest declarativo del plugin (Sprint 15A — ADR-080).
   * Expone label/version/configSchema/secretsSchema para el loader
   * dinámico, la UI admin (`/admin/settings/plugins`) y el portal RGPD.
   * Ver §12 abajo.
   */
  readonly manifest: PluginManifest;
}

// ────────────────────────────────────────────────────────────────────────────
// 11. Constante de versión (validada por orquestador al cargar plugins)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Versión canónica del contrato. El orquestador rechaza plugins con
 * `contractVersion !== PROVISIONER_PLUGIN_CONTRACT_VERSION` con error
 * explícito + alerta admin.
 */
export const PROVISIONER_PLUGIN_CONTRACT_VERSION = 'v2' as const;

// ────────────────────────────────────────────────────────────────────────────
// 12. PluginManifest (Sprint 15A — ADR-080) — declaración estática del plugin
// ────────────────────────────────────────────────────────────────────────────

/**
 * Versión canónica del manifest. Independiente de `contractVersion` (ADR-080 §8):
 * un plugin puede subir su `manifest.version` (semver del propio plugin) sin
 * tocar `contractVersion` (versión del contrato).
 */
export const PLUGIN_MANIFEST_VERSION = 'v1' as const;

/**
 * Subset acotado de JSON-Schema 7 (ADR-080 §1).
 *
 * Los plugins declaran shapes de `config` y `secrets` con esta gramática.
 * El orquestador valida payloads con Ajv (peer-dep backend) en PATCH
 * `/admin/plugins/:slug`. La UI admin (`@rjsf/core` + tema DS) renderiza
 * el form dinámico desde aquí.
 *
 * NO se admite `additionalProperties: true` ni recursión (objects within
 * objects) en v1 — los plugins reales (Enhance CP, ResellerClub) viven
 * con shapes planos; cualquier necesidad real de anidación dispara ADR
 * para extender el subset.
 */
export interface JsonSchema7 {
  type: 'object';
  properties: Record<string, JsonSchema7Property>;
  required?: readonly string[];
  additionalProperties?: false;
}

export interface JsonSchema7Property {
  type: 'string' | 'number' | 'boolean' | 'integer';
  /** i18n key (no texto literal) — la UI lo resuelve por locale del admin. */
  description?: string;
  /** Hints de UI para `@rjsf/core` (también usados por validación Ajv `format`). */
  format?: 'uri' | 'email' | 'password' | 'uuid';
  enum?: readonly (string | number)[];
  default?: string | number | boolean;
  minLength?: number;
  maxLength?: number;
  /** Pattern PCRE-compatible (ECMA262) — Ajv lo evalúa con `new RegExp`. */
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

/**
 * Categorías canónicas en `/admin/settings`. La página agrupa plugins por
 * esta categoría. Sprint 12 (P2.7 Settings + KB) extiende con categorías
 * no-plugin (`brand`, `numbering`, `kb`) sin tocar la lógica de plugins.
 */
export type PluginSettingsCategory =
  | 'provisioner'
  | 'payment'
  | 'notification'
  | 'ai';

/**
 * Modo de test-connection que el plugin soporta:
 *   - 'getStatus':  el endpoint `POST /admin/plugins/:slug/test-connection`
 *                   reusa `plugin.getStatus()` con un service sintético
 *                   y reporta éxito si no lanza. Default canónico para
 *                   plugins SaaS sin endpoint dedicado.
 *   - 'custom':     el plugin expone un método `testConnection()` propio
 *                   (firma a definir en sub-extensión del contrato cuando
 *                   llegue el primer plugin que lo necesite).
 *   - null:         el plugin no soporta test-connection — la UI oculta
 *                   el botón "Probar conexión".
 */
export type PluginTestConnectionMethod = 'getStatus' | 'custom' | null;

/**
 * PluginManifest — declaración estática que cada plugin expone para que
 * el orquestador, la UI admin y el portal RGPD entiendan su forma sin
 * inspeccionar código.
 *
 * Materializa ADR-080 §1 literalmente. Cualquier cambio breaking a este
 * shape requiere bump `PLUGIN_MANIFEST_VERSION` a `v2` + ADR específico.
 */
export interface PluginManifest {
  /** Slug canónico kebab-case. DEBE coincidir con `ProvisionerPlugin.slug`. */
  readonly slug: string;

  /** Versión semver del plugin (NO del contrato — eso es contractVersion). */
  readonly version: string;

  /** Versión del manifest implementado. Hoy: 'v1'. */
  readonly manifestVersion: 'v1';

  /** Etiqueta visible i18n key (ej. "plugin.enhance_cp.label"). */
  readonly label: string;

  /** Descripción corta i18n key. */
  readonly description: string;

  /** URL a documentación operativa del plugin (admin.md correspondiente). */
  readonly docsUrl: string;

  /** Categoría de settings donde aparece el plugin (ADR-080 §7). */
  readonly settingsCategory: PluginSettingsCategory;

  /**
   * Schema del shape de `config` (campos NO secretos).
   * Validado por Ajv en PATCH `/admin/plugins/:slug`. Renderizado por
   * `@rjsf/core` en `/admin/settings/plugins/[slug]`.
   */
  readonly configSchema: JsonSchema7;

  /**
   * Schema del shape de `secrets` (campos cifrados con `SecretVaultService`).
   * Separado de `configSchema` para que la UI marque visualmente los campos
   * sensibles (input type="password" + nunca se muestra el valor existente)
   * + el portal RGPD (Sprint 12.5) declare qué credenciales del proveedor
   * Aelium maneja en nombre del cliente.
   */
  readonly secretsSchema: JsonSchema7;

  /** Modo de test-connection que el plugin soporta. */
  readonly testConnectionMethod: PluginTestConnectionMethod;

  /**
   * Sprint 15C.II Fase F.3 (GAP-15CII-G4) — TTL (segundos) del cache L1
   * Redis de `service_info` para los servicios de este plugin. Opcional;
   * si se omite, vale el setting global `provisioning.service_info_ttl_seconds`
   * (default 60s). Se aplica un *sanity floor* de 5s — un TTL más bajo
   * martillaría al proveedor sin beneficio real (la mayoría de paneles
   * cambian estado en minutos, no segundos). Plugins cuyo proveedor reporta
   * estado muy estable pueden subirlo (p.ej. 300s); los muy volátiles, a 5s.
   */
  readonly serviceInfoCacheTtlSeconds?: number;

  /**
   * Sprint 15C Fase 15C.E.2 — ADR-080 Amendment B (2026-05-09).
   *
   * Schema declarativo del shape de `Product.provisioner_config` para
   * productos que provisionan a través de este plugin. Renderizado por
   * `@rjsf/core` en el form admin de productos
   * (`/admin/products/new` + `/admin/products/[id]/edit`) cuando el admin
   * selecciona este `provisioner` slug. El JSON resultante se persiste
   * en `products.provisioner_config` (jsonb) y se inyecta como
   * `ProvisionContext.productConfig` en `plugin.provision()`.
   *
   * Opcional. Plugins triviales (`internal`, `manual`) no lo declaran —
   * sus servicios no requieren config per-producto. El form admin esconde
   * la sección sub-form si el manifest del provisioner seleccionado lo
   * omite.
   *
   * Coherente con el patrón Sprint 15A `configSchema`/`secretsSchema`:
   *   - JSON-Schema 7 subset (gramática `JsonSchema7`).
   *   - `additionalProperties: false`.
   *   - Validado por Ajv en `POST/PATCH /admin/products`.
   *
   * Diferencia clave vs `configSchema`:
   *   - `configSchema` configura la INSTALACIÓN del plugin (1 fila por
   *     plugin en `plugin_installs`).
   *   - `productConfigSchema` configura cada PRODUCTO que provisiona vía
   *     el plugin (1 fila por producto en `products.provisioner_config`).
   *
   * Ejemplo `enhance_cp`:
   *   ```ts
   *   {
   *     type: 'object',
   *     properties: {
   *       enhance_plan_id: {
   *         type: 'integer', minimum: 1,
   *         description: 'plugin.enhance_cp.product_config.enhance_plan_id',
   *       },
   *     },
   *     required: ['enhance_plan_id'],
   *     additionalProperties: false,
   *   }
   *   ```
   *
   * El plugin valida el payload runtime en `provision()` (defense-in-depth)
   * — la validación form-side con Ajv es UX, no enforcement. Ej. el plugin
   * `enhance_cp` lanza `ProvisionerPluginError('INVALID_PAYLOAD', false)`
   * si `productConfig.enhance_plan_id` no es entero positivo.
   */
  readonly productConfigSchema?: JsonSchema7;
}

/**
 * Schema vacío canónico — usado por plugins sin config y/o sin secrets
 * (ej. `internal`, `manual`). Evita tener que repetir el shape en cada
 * plugin trivial.
 */
export const EMPTY_PLUGIN_SCHEMA: JsonSchema7 = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
};
