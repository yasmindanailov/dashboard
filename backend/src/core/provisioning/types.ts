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
  country_code: string | null;
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
   * Plano, sin secretos.
   */
  metadata: Record<string, string | number | boolean>;

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
 *
 * Extensible: futuras clases de remediación se añaden a esta unión + se
 * documentan en ADR-077 Amendment A5 + el frontend las ramifica
 * explícitamente (`AdminDriftBanner`).
 */
export type ServiceRecoveryHint =
  | 'reprovision'
  | 'reconcile'
  | 'contact_support';

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
  | 'NETWORK_ERROR'; // retriable=true

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
