// ─── Services API (Sprint 11 Fase 11.D — ADR-070 + ADR-077) ─────────
//
// Cliente: 4 endpoints (`GET /services`, `GET /services/:id`,
// `POST /services/:id/sso`, `POST /services/:id/actions/:slug`).
// Admin: 3 endpoints (`GET /admin/services`, `POST /admin/services/:id/reprovision`,
// `POST /admin/services/:id/deprovision`).
//
// Shapes alineados con `backend/src/core/provisioning/types.ts` (ADR-077 §1+§2).

export interface ServiceListItem {
  id: string;
  user_id: string;
  status: string;
  label: string | null;
  domain: string | null;
  provisioner_slug: string | null;
  provider_reference: string | null;
  created_at: string;
  product: {
    id: string;
    slug: string;
    name: string;
    type: string;
    provisioner: string;
  };
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

export interface ServiceListResponse {
  data: ServiceListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ServiceInfoCapabilities {
  has_sso_panel: boolean;
  panel_label?: string;
  has_metrics: boolean;
  has_metrics_history: boolean;
  requires_server: boolean;
  provision_mode: 'sync' | 'async';
  completes_via_task: boolean;
  supports_reconciliation: boolean;
  /**
   * Sprint 15C Fase A — ADR-077 Amendment A1 + ADR-082 §3.
   * `true` si el plugin gestiona la zona DNS authoritative del service.
   * Frontend ramifica por este flag (NUNCA por slug) — Sprint 15C Fase G
   * añade el link "Gestionar DNS" condicional en `/dashboard/services/[id]`.
   */
  has_dns_management: boolean;
  /**
   * Sprint 15C.II Fase F — ADR-077 Amendment A4. `true` si el plugin soporta
   * suspender / reactivar el servicio sin desprovisionarlo. La UI admin
   * ramifica por este flag (NUNCA por slug) para ofrecer "Suspender / Reanudar
   * servicio" en `AdminServiceOperationsCard`. Implícitamente, los plugins con
   * `supports_suspend=true` exponen las inline actions `suspend_service` (si
   * `status='active'`) / `unsuspend_service` (si `status='suspended'`) en
   * `availableActions` — ocultas en `ActionsBar` (`INTERNAL_HELPER_SLUGS`),
   * operadas desde la card de operaciones admin.
   */
  supports_suspend: boolean;
  hasSsoPanel: boolean;
  inlineActions: ServiceAction[];
}

/**
 * Sprint 15C.II Fase F — ADR-077 Amendment A4. Taxonomía canónica del motivo
 * de una suspensión administrativa (cliente-segura — la UI muestra la etiqueta
 * localizada `service.suspension_reason.<reason>`, NUNCA la nota interna del
 * admin). DEBE coincidir con el tipo `SuspensionReason` del backend.
 */
export type SuspensionReason =
  | 'overdue_payment'
  | 'abuse_investigation'
  | 'scheduled_maintenance'
  | 'gdpr_restriction'
  | 'other';

export interface ServiceAction {
  slug: string;
  label: string;
  description?: string;
  confirmRequired: boolean;
  confirmationText?: string;
  destructive: boolean;
  /**
   * Sprint 15C Fase 15C.E (ADR-077 Amendment A3 + ADR-083 Amendment A3).
   *
   * Si `true`, la acción solo es invocable por usuarios con rol staff
   * (`superadmin` / `agent_full` / `agent_billing` / `agent_support`).
   * Backend wrapper enforce HTTP 403 + audit + evento
   * `service.action_admin_only_violation` (defense-in-depth).
   *
   * Frontend filtra `actions` por `!a.adminOnly || isAdmin` antes de
   * renderizar — el cliente no-admin ni siquiera ve el botón.
   *
   * Ortogonal a `destructive`. Default `false` (client-callable).
   */
  adminOnly?: boolean;
  payloadSchema?: Record<string, unknown>;
}

export interface ServiceMetrics {
  diskUsedMb?: number;
  diskTotalMb?: number;
  bandwidthUsedMb?: number;
  bandwidthTotalMb?: number;
  ramUsedMb?: number;
  ramTotalMb?: number;
  cpuUsagePercent?: number;
  emailAccountsUsed?: number;
  emailAccountsTotal?: number;
  databasesUsed?: number;
  databasesTotal?: number;
  custom?: Record<string, string | number>;
  fetchedAt: string;
}

/**
 * Sprint 15C.II Fase E — ADR-077 Amendment A5. Pista de recuperación
 * canónica que el plugin emite cuando `status` ∈ {`unknown`, `failed`,
 * `suspended`, `expired`} (drift). La UI ramifica por este valor para
 * ofrecer el CTA de remediación correcto — NUNCA matchea `statusReason`
 * por string (eso es i18n display, no contrato de comportamiento).
 *   - `reprovision`     → recurso ausente en el proveedor → botón "Re-aprovisionar".
 *   - `reconcile`       → metadata local divergió → re-sync del cron L3 manual.
 *   - `contact_support` → drift no auto-remediable → sin CTA accionable.
 */
export type ServiceRecoveryHint =
  | 'reprovision'
  | 'reconcile'
  | 'contact_support'
  // 15D.G·2 (dominios): expirado renovable → 'renew'; en redención → 'restore'.
  | 'renew'
  | 'restore';

/**
 * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7. Estado canónico del
 * certificado SSL/TLS del recurso. La UI ramifica por este valor (NUNCA
 * por matching de strings sobre `issuer` ni por aritmética de fechas en
 * cliente — eso vive server-side en el plugin).
 */
export type ServiceSslStatus = 'valid' | 'expiring_soon' | 'expired' | 'none';

/**
 * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7. Sub-shape del campo
 * opcional `ServiceInfo.ssl?`. Read-only — Aelium no gestiona el cert
 * (DH-INV-6 — el proveedor es authoritative); este shape solo existe
 * para que la UI exponga el estado al cliente / admin.
 */
export interface ServiceSslSummary {
  status: ServiceSslStatus;
  /** ISO-8601. Solo presente si `status !== 'none'`. */
  expiresAt?: string;
  /** Si el proveedor renueva automáticamente; `undefined` si no determinable. */
  autoRenew?: boolean;
  /** Display-only. La UI NUNCA ramifica comportamiento por este valor. */
  issuer?: string;
}

/**
 * Sprint 15C.II Fase F.10 — ADR-077 Amendment A9 (2026-05-18).
 *
 * Representa una "aplicación instalada" dentro del recurso del proveedor
 * (típicamente una website/hosting): WordPress, Joomla, futuros CMS.
 * Espejo del shape del backend (`backend/src/core/provisioning/types.ts`).
 *
 * Shape mínimo contractual genérico. Los detalles per-kind (WordPressInfo,
 * JoomlaInfo, ...) son plugin-internal y viven en endpoints/actions
 * plugin-internos invocados on-demand cuando F.10.x stats UI lo requiera
 * (DC.NEW-51).
 *
 * Capability-driven por presencia (mismo molde A5/A6/A7/A8): plugins que
 * NO soporten apps instalables OMITEN `ServiceInfo.apps`. El frontend
 * renderiza `<AppShortcutsCard>` solo si `info.apps !== undefined &&
 * info.apps.length > 0` — NUNCA ramifica por `provisioner_slug` (ADR-070).
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
   * Valores actuales (Sprint 15C.II Fase F.10): `'wordpress'` | `'joomla'`.
   * Valores futuros (heredabilidad): `'nodejs'`, `'drupal'`, etc. — sin
   * amendment del contrato.
   */
  kind: string;
  /**
   * i18n key (translatable en el frontend).
   * Ejemplos: `'plugin.enhance_cp.apps.wordpress'`, `'plugin.enhance_cp.apps.joomla'`.
   */
  label: string;
  /**
   * Subdirectorio si la app NO está instalada en la raíz. Permite
   * multi-instancia (WP en `/` + WP en `/blog` → 2 entries diferenciadas).
   */
  path?: string;
  /** Versión instalada de la app (informativo, display-only). */
  version?: string;
  /**
   * Acciones disponibles per-instalación. Sprint 15C.II Fase F.10 declara
   * una sola acción canónica: `'open_app_admin'` (slug fijo + payload
   * `{ appId }` — discriminator interno del plugin por kind).
   *
   * Si `actions` está vacío (ej. WP sin default user configurado), el
   * frontend renderiza el atajo DISABLED con tooltip + CTA al panel.
   */
  actions: readonly ServiceAction[];
}

/**
 * Sprint 15D (ADR-077 Amendment A11). Estado de gestión de un dominio,
 * capability-driven por presencia (`ServiceInfo.domain?`): solo los services de
 * un registrar (`is_domain_registrar`) lo exponen. Read-only — el registrar es
 * authoritative; la UI lo muestra y ofrece acciones curadas (`availableActions`:
 * modify_nameservers / toggle_privacy / toggle_registrar_lock / get_auth_code).
 * El `lifecycle` (expired/redemption/...) es estado OPERACIONAL, NO `status`.
 */
export interface DomainInfo {
  fqdn: string;
  nameservers: readonly string[];
  /** ISO-8601. Caducidad reportada por el registrar. */
  expiresAt?: string;
  lifecycle: 'active' | 'expired' | 'redemption' | 'pending_delete';
  whoisPrivacy: boolean;
  registrarLock: boolean;
  /** `true` si se puede obtener el código de autorización (EPP) ahora. */
  authCodeAvailable: boolean;
  autoRenew?: boolean;
  /** Resumen de contactos (sin PII). */
  contacts?: {
    registrantName?: string;
    hasAdmin: boolean;
    hasTech: boolean;
    hasBilling: boolean;
  };
}

export interface ServiceInfo {
  status:
    | 'active'
    | 'suspended'
    | 'expired'
    | 'pending'
    | 'failed'
    | 'cancelled'
    | 'unknown';
  statusReason?: string;
  /**
   * Sprint 15C.II Fase E — ADR-077 Amendment A5. Solo relevante si `status`
   * es de drift. Si presente, indica la clase de remediación que la UI debe
   * ofrecer al admin. Ver `ServiceRecoveryHint`.
   */
  recoveryHint?: ServiceRecoveryHint;
  display: {
    primary: string;
    secondary?: string;
    expiresAt?: string;
    autoRenew?: boolean;
  };
  metrics?: ServiceMetrics;
  /**
   * Sprint 15C.II Fase F.7 — ADR-077 Amendment A7. Solo presente si el
   * plugin puede leer el estado del cert SSL/TLS. Si ausente, la UI no
   * renderiza la card SSL. La presencia del campo es la señal de
   * capability — no se añade flag nuevo a `ServiceInfoCapabilities`.
   */
  ssl?: ServiceSslSummary;
  /**
   * Sprint 15C.II Fase F.10 — ADR-077 Amendment A9. Apps CMS instaladas
   * dentro del recurso del proveedor (websites con WordPress / Joomla /
   * etc.). Capability-driven por presencia (mismo molde A5/A6/A7/A8).
   */
  apps?: readonly AppPresence[];
  /**
   * Sprint 15D (ADR-077 Amendment A11). Presente solo para services de un
   * registrar de dominios (`is_domain_registrar`). Capability-driven por
   * presencia (mismo molde A5/A7/A9). Si ausente → no es un dominio (o el
   * registro aún no se completó) y la UI no renderiza la gestión de dominio.
   */
  domain?: DomainInfo;
  capabilities: ServiceInfoCapabilities;
  availableActions: readonly ServiceAction[];
  fetchedAt: string;
}

export interface ServiceDetailResponse {
  service: {
    id: string;
    user_id: string;
    status: string;
    provisioner_slug: string | null;
    /**
     * Sprint 15C.II Fase C round 2 — `product.provisioner` expuesto al
     * frontend para que la UI admin pueda mostrar el "effective slug"
     * cuando `service.provisioner_slug` es null. El wrapper canónico
     * provisioning resuelve el plugin con
     * `service.provisioner_slug ?? service.product.provisioner` — si el
     * service no tiene su propio slug (típicamente porque el pipeline
     * provisioning no llegó a marcarlo, caso `not_yet_provisioned`),
     * el plugin del producto SÍ se invoca. Sin este campo la UI
     * admin mostraba "—" — información engañosa para el operador.
     * Cliente NO lo usa (su UI no muestra esta info técnica).
     */
    product_provisioner: string;
    product_slug: string;
    product_name: string;
    product_type: string;
    created_at: string;
    /**
     * Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10) —
     * cancelación explícita expuesta al frontend. Backend la persiste
     * en `service.cancellation_reason` (text libre — viene de
     * `provisioning_failed:CODE` para fail permanente, o text admin
     * para cancelación manual). El frontend admin la muestra cruda;
     * el frontend cliente solo la usa para chequear si renderizar el
     * banner terminal "Servicio cancelado" (sin mostrar el reason
     * técnico — viola UI_SPEC §1.2 P5 "voz Aelium").
     */
    cancellation_reason: string | null;
    cancelled_at: string | null;
    /**
     * Sprint 15C.II Fase F (ADR-077 Amendment A4) — suspensión canónica.
     * `suspension_reason` es la cadena combinada `"<reason>"` o
     * `"<reason>: <internal_note>"` (mismo patrón que `cancellation_reason`):
     * el frontend admin muestra la cadena completa; el frontend cliente solo
     * la parte `<reason>` (etiqueta localizada `service.suspension_reason.*`).
     * Ambos `null` cuando el service no está suspendido.
     */
    suspended_at: string | null;
    suspension_reason: string | null;
    /**
     * Sprint 15C.II Fase C round 7 (smoke real Yasmin 2026-05-10) —
     * datos canónicos del cliente para que la UI admin muestre info
     * legible (nombre + email) en lugar de UUIDs crudos. Estándar
     * industria Stripe/Vercel admin: información primaria visible,
     * IDs secundarios con copy-to-clipboard. Cliente NO consume estos
     * campos en su propia página `/dashboard/services/[id]` (su nombre
     * y email son trivialmente conocidos por sí mismo).
     */
    client_name: string;
    client_email: string;
    /**
     * Domain canónico del service (FQDN). Puede ser null para
     * productos no-hosting (ej. `support_inside`). Cuando presente,
     * la UI admin lo muestra como identificador primario del service
     * (ADR-082 DH-INV-2 — hosting service SIEMPRE tiene FQDN).
     */
    domain: string | null;
    /**
     * Sprint 15C.II Fase F.4.1 — `true` cuando el estado de suspensión
     * registrado en Aelium (`services.status`, autoritativo para el
     * lifecycle administrativo) no coincide con el que reporta el
     * proveedor (dimensión operativa — DH-INV-6). Lo calcula el
     * orquestador (`getInfoForUser`). La UI admin lo usa para mostrar el
     * `<AdminProviderStateDesyncBanner>` con el botón "Realinear estado
     * del proveedor con Aelium" (`POST /admin/services/:id/resync-provider-state`).
     * El cliente no lo consume.
     */
    provider_state_desync: boolean;
    /**
     * Sprint 15C.II Fase F.8 — umbral de alerta de cuota de disco que el
     * frontend usa para colorear la barra de almacenamiento del `MetricsBar`
     * (ámbar ≥threshold, rojo ≥95% hardcoded). El orquestador lo lee de
     * `plugin_installs.config.quota_alert_threshold_pct` cuando el plugin
     * declara `has_metrics`. `null` cuando el plugin no es relevante o el
     * setting no está editado → el frontend cae al comportamiento legacy
     * (sin coloreo). Heredable a todo plugin con `has_metrics`.
     */
    quota_alert_threshold_pct: number | null;
    /**
     * Sprint 15D.II.T2c.3 — estado de la FSM de transfer-in
     * (`services.metadata.transfer_state`). `null`/ausente si el service no es un
     * transfer-in (capability-driven por presencia). El detalle de dominio cliente
     * lo usa para mostrar el formulario del código EPP (`pending`/`awaiting_auth`)
     * o el aviso "transferencia en curso" (`submitted`). NO es secreto.
     */
    transfer_state?: string | null;
  };
  info: ServiceInfo;
}

export interface SsoUrl {
  url: string;
  expiresAt: string;
  panelLabel: string;
  opensIn: 'new_tab';
}

export interface ActionResult {
  success: boolean;
  message?: string;
  sideEffects?: readonly string[];
  data?: Record<string, unknown>;
}

/* ═══════════════════════════════════════
   Sprint 15C.II Fase F.9 (ADR-077 Amendment A8 + §A.11.10.6.2 R1..R6 frozen)
   — shapes per-servicio del flujo reconcile-single. Espejo del backend
   `backend/src/core/provisioning/types.ts §9.5`. Duplicación canónica por
   R4 (frontend vive en otro paquete que el backend).
   ═══════════════════════════════════════ */

export type ServiceDriftType =
  | 'subscription_missing'
  | 'status_divergence'
  | 'plan_divergence';

export interface ServiceDrift {
  readonly type: ServiceDriftType;
  readonly before: unknown;
  readonly after: unknown;
  readonly applied: boolean;
  readonly message?: string;
}

export interface ServiceReconcileResult {
  readonly driftsDetected: readonly ServiceDrift[];
  readonly driftsApplied: readonly ServiceDrift[];
  /**
   * Server devuelve ISO 8601 string; el action lo re-hidrata a Date para
   * el consumidor frontend (espejo del re-hidrato en backend
   * ProvisioningCacheService.getCachedServiceReconcileResult).
   */
  readonly reconciledAt: Date;
}

