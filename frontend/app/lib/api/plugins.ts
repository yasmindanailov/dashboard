// ── Admin / Plugins (Sprint 15A — ADR-080) ──
//
// Endpoints `/api/v1/admin/plugins` para que el superadmin gestione la
// configuración de los plugins de provisioning (enabled, config, secrets
// cifrados, test-connection). Solo accesible vía Server Components +
// Server Actions con cookies httpOnly Modelo A (ADR-078). NO se exponen
// estos tipos al cliente.

export type PluginSettingsCategory =
  | 'provisioner'
  | 'payment'
  | 'notification'
  | 'ai';

export type PluginTestConnectionMethod = 'getStatus' | 'custom' | null;

export type PluginCircuitState = 'closed' | 'open' | 'half-open';

/**
 * Sprint 15C.II Fase F.11.1 (R3 frozen §A.11.10.8.2) — agregado canónico
 * de salud del plugin in-process del service, expuesto en
 * `GET /admin/services/:id/plugin-health`.
 *
 * Doctrina:
 *   - `operational` — todos los breakers cerrados (o sin breakers
 *     registrados — operaciones cross-cutting nunca invocadas).
 *   - `degraded`   — al menos un breaker `half-open`, ninguno `open`.
 *   - `down`       — al menos un breaker `open`.
 *
 * El badge dice "estado en esta instancia" — el breaker es in-process
 * (ADR-080 §5). Read-only — no crea breakers ni invoca al plugin.
 */
export type PluginHealthState = 'operational' | 'degraded' | 'down';

export interface PluginHealthBreaker {
  /** Operación sin prefijo del slug (`getServiceInfo`, `executeAction`, ...). */
  operation: string;
  state: PluginCircuitState;
}

export interface PluginHealthSummary {
  pluginSlug: string;
  state: PluginHealthState;
  breakers: PluginHealthBreaker[];
}

/**
 * Sprint 15C.II Fase F.11.3 (§A.11.10.8.2) — cross-link Service↔billing.
 * Endpoint unificado `GET /billing/services/:id/cross-link` (cliente +
 * admin con isAdmin derivado del role). Devuelve la próxima renovación
 * del Service + la última factura asociada (vía InvoiceItem.service_id).
 *
 * Capability-driven por presencia: el card del frontend NO se renderiza
 * cuando `nextDueDate === null && lastInvoice === null` (service legacy
 * sin invoice asociada y sin renovación programada).
 *
 * Decimals serializados como string desde Prisma (`amount`, `total`) —
 * el frontend los formatea con `Intl.NumberFormat`.
 */
export type InvoiceStatus =
  | 'draft'
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'refunded';

export interface ServiceBillingCrossLink {
  nextDueDate: string | null;
  amount: string | null;
  currency: string;
  lastInvoice: {
    id: string;
    invoice_number: string;
    status: InvoiceStatus;
    total: string;
    due_date: string;
    paid_at: string | null;
  } | null;
}

/* ── Cambio de plan con prorrateo (ADR-029) ── */

export interface PlanChangeOption {
  id: string;
  billing_cycle: string;
  price: number;
  currency: string;
}

export interface PlanChangeOptions {
  product_name: string;
  current: { billing_cycle: string; amount: number; currency: string };
  options: PlanChangeOption[];
}

export interface PlanChangePreview {
  current_plan: { billing_cycle: string; amount: number };
  new_plan: { billing_cycle: string; amount: number };
  currency: string;
  days_consumed: number;
  days_remaining: number;
  daily_price_current: number;
  credit_eur: number;
  amount_to_pay: number;
  credit_remaining_eur: number;
  new_period_start: string;
  new_period_end: string;
}

/**
 * Subset acotado de JSON-Schema 7 que el backend declara en
 * `core/provisioning/types.ts §12`. Mantener sincronizado al añadir
 * formats/keywords nuevos al backend.
 */
export interface PluginJsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'integer';
  // Sprint 15C.II Fase B fix-up (2026-05-10): el plugin manifest declara
  // `title` y `description` por property; ambos son i18n keys que el frontend
  // resuelve via translateSchema() + el widget DS los renderiza como
  // <label> + helperText respectivamente.
  title?: string; // i18n key (rjsf usa esto como label)
  description?: string; // i18n key (rjsf lo mapea a options.help → DS Input helperText)
  format?: 'uri' | 'email' | 'password' | 'uuid';
  enum?: ReadonlyArray<string | number>;
  default?: string | number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

export interface PluginJsonSchema {
  type: 'object';
  properties: Record<string, PluginJsonSchemaProperty>;
  required?: ReadonlyArray<string>;
  additionalProperties?: false;
}

export interface PluginManifest {
  slug: string;
  version: string;
  manifestVersion: 'v1';
  label: string;
  description: string;
  docsUrl: string;
  settingsCategory: PluginSettingsCategory;
  configSchema: PluginJsonSchema;
  secretsSchema: PluginJsonSchema;
  testConnectionMethod: PluginTestConnectionMethod;
  /**
   * Sprint 15C Fase 15C.E.2 — ADR-080 Amendment B (2026-05-09).
   *
   * Schema declarativo del shape de `Product.provisioner_config` para
   * productos que provisionan a través de este plugin. Renderizado por
   * `@rjsf/core` en el form admin de productos. Opcional — plugins
   * triviales (`internal`, `manual`) lo omiten.
   *
   * Ver canonical en `backend/src/core/provisioning/types.ts §12`.
   */
  productConfigSchema?: PluginJsonSchema;
}

export interface PluginCircuitStateSummary {
  getServiceInfo: PluginCircuitState | null;
  executeAction: PluginCircuitState | null;
}

/** Item devuelto por `GET /admin/plugins` (lista). */
export interface AdminPluginListItem {
  slug: string;
  manifest: PluginManifest | null;
  enabled: boolean;
  updated_at: string | null;
  circuit_state: PluginCircuitStateSummary;
}

/**
 * Detalle devuelto por `GET /admin/plugins/:slug`.
 * `secrets` es un mapa `{ <field>: '***' | null }` — '***' si está seteado,
 * null si no. Los plaintexts NUNCA salen del backend (R12 + ADR-080 §3).
 */
export interface AdminPluginDetail {
  slug: string;
  manifest: PluginManifest;
  enabled: boolean;
  installed_at: string | null;
  updated_at: string | null;
  config: Record<string, unknown>;
  secrets: Record<string, '***' | null>;
  circuit_state: PluginCircuitStateSummary;
}

/**
 * Sprint 15C.II Fase F.3 (GAP-15CII-M) — timeline de auditoría per-servicio.
 * Espejo de `ServiceTimelinePage`/`ServiceTimelineEntry` del backend
 * (`modules/audit/dto/service-timeline.dto.ts`). En vista cliente,
 * `changes_*`/`correlation_id`/`ip_address` vienen `undefined` (recorte GDPR)
 * y `metadata` es un subconjunto cliente-seguro por acción.
 */
export type ServiceTimelineSource = 'change' | 'access';

export interface ServiceTimelineActor {
  user_id: string | null;
  name: string | null;
  role: string | null;
}

export interface ServiceTimelineEntry {
  id: string;
  source: ServiceTimelineSource;
  action: string;
  actor: ServiceTimelineActor | null;
  created_at: string;
  changes_before?: unknown;
  changes_after?: unknown;
  correlation_id?: string | null;
  ip_address?: string;
  metadata?: Record<string, unknown> | null;
}

export interface ServiceTimelinePage {
  items: ServiceTimelineEntry[];
  next_cursor: string | null;
}

export type PluginHealthStatus =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'disabled';

export type PluginReconcileChangeType =
  | 'subscription_missing'
  | 'status_divergence'
  | 'plan_divergence';

/**
 * Devuelto por `GET /admin/plugins/:slug/operational-overview` — Sprint 15C.II
 * Fase F.2 (ADR-083 Amendment A4.4). Shape plugin-agnóstico; espejo de
 * `PluginOperationalOverview` del backend
 * (`modules/admin-plugins/dto/plugin-operational-overview.dto.ts`).
 * `circuit.*` es estado in-process — la UI lo etiqueta como tal.
 */
export interface PluginOperationalOverview {
  slug: string;
  /** i18n key (de `manifest.label`). */
  label: string;
  enabled: boolean;
  health: {
    status: PluginHealthStatus;
    /** i18n keys que explican el estado (≥1). */
    reasons: string[];
  };
  circuit: PluginCircuitStateSummary;
  secrets: {
    required: number;
    configured: number;
    missing: string[];
  };
  services: {
    active: number;
    suspended: number;
  };
  reconciliation: {
    supported: boolean;
    /**
     * Sprint 15C.II Fase F.9 (R9 frozen §A.11.10.6.2 Amendment III): el
     * backend deriva este flag de `reconcileRegistry.hasReconcileOneExecutor(slug)`.
     * El frontend lo lee para gatear el CTA "Reconciliar contra el proveedor"
     * (AdminDriftBanner + filas drift de PluginOperationalOverview). Espejo
     * del DTO backend `plugin-operational-overview.dto.ts`. Coherente con
     * capability-driven por presencia A6/A7 — NO en PluginManifest.
     */
    supports_reconcile_one: boolean;
    last: {
      completed_at: string;
      trigger: 'cron' | 'manual';
      services_processed: number;
      drifts_detected: number;
      errors: number;
    } | null;
    next_scheduled_at: string | null;
    drifts_24h: number;
  };
  recent_drifts: Array<{
    service_id: string;
    change_type: PluginReconcileChangeType;
    detected_at: string;
  }>;
  generated_at: string;
}

/** Body de `PATCH /admin/plugins/:slug`. Todos los campos opcionales. */
export interface AdminPluginUpdateBody {
  enabled?: boolean;
  config?: Record<string, unknown>;
  /** plaintexts — el backend los cifra antes de persistir. */
  secrets?: Record<string, string>;
}

export interface AdminPluginUpdateResponse {
  slug: string;
  enabled: boolean;
  updated_at: string;
}

export interface AdminPluginTestConnectionResponse {
  success: boolean;
  message: string;
  checked_at: string;
}

