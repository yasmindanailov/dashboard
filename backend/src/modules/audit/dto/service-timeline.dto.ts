/**
 * Sprint 15C.II Fase F.3 (GAP-15CII-M) — timeline de auditoría per-servicio.
 *
 * Shape de respuesta de `AuditService.getServiceTimeline(serviceId, …)` →
 * expuesto por `GET /admin/services/:id/audit` (admin, sin filtro) y
 * `GET /services/:id/audit` (cliente, whitelist GDPR explícita).
 *
 * El timeline es el UNION ordenado de dos fuentes filtradas por el servicio:
 *   - `audit_change_log` WHERE `entity_type='Service'` AND `entity_id=:id`
 *     (cambios de estado: provision/deprovision, suspend/unsuspend,
 *     `service.action_executed:*`, `reconciled_external_change`, …).
 *   - `audit_access_log` WHERE `metadata->>'resource_id'=:id`
 *     (`read` — lectura staff vía `@AuditAccess('Service')`;
 *      `admin_sso_impersonation` — agente abre el panel del proveedor).
 *
 * Paginación: **keyset/cursor** por `(created_at, id)` DESC — estable bajo
 * inserciones concurrentes (a diferencia de offset). `next_cursor` es opaco
 * (`"<iso8601>|<uuid>"`); `null` cuando no hay más páginas.
 *
 * Doctrina GDPR (ADR-010 + ADR-017): la vista **cliente** NUNCA recibe
 * `changes_before`/`changes_after` crudos (pueden contener notas internas),
 * ni `correlation_id`, ni la IP del staff. Recibe: `action` (la UI lo mapea
 * a etiqueta i18n cliente-segura), el nombre+rol del actor (transparencia —
 * ADR-017: el cliente VE el nombre real del agente), `created_at`, y un
 * `metadata` recortado a un subconjunto cliente-seguro por acción
 * (p.ej. `panel_label` para impersonation, `change_type` para drift visible).
 * Las filas no whitelisteadas se omiten; `reconciled_external_change` solo
 * aparece si su `_meta.gdpr_visible_to_data_subject === true`.
 */

export type ServiceTimelineSource = 'change' | 'access';

export interface ServiceTimelineActor {
  /** UUID del actor humano, o `null` si la acción la ejecutó el sistema. */
  readonly user_id: string | null;
  /** Nombre legible del actor (`first_name last_name` o email), o `null`. */
  readonly name: string | null;
  /** Slug del rol del actor (p.ej. `superadmin`, `agent_support`), o `null`. */
  readonly role: string | null;
}

export interface ServiceTimelineEntry {
  readonly id: string;
  readonly source: ServiceTimelineSource;
  /** Acción cruda (p.ej. `service.suspended`, `read`, `admin_sso_impersonation`). */
  readonly action: string;
  /** Actor de la acción; `null` cuando es el sistema (cron, listener). */
  readonly actor: ServiceTimelineActor | null;
  readonly created_at: string;
  // ── Solo en la vista admin (omitidos para el cliente) ──
  readonly changes_before?: unknown;
  readonly changes_after?: unknown;
  readonly correlation_id?: string | null;
  /** IP del staff (solo filas `access` en vista admin). */
  readonly ip_address?: string;
  /**
   * Metadata: en vista admin = el `metadata` íntegro de la fila access-log
   * (o el `_meta` extraído del `changes_after` en filas change-log).
   * En vista cliente = subconjunto cliente-seguro por acción.
   * Nunca contiene secretos (el `audit-sanitizer` los redacta al escribir).
   */
  readonly metadata?: Record<string, unknown> | null;
}

export interface ServiceTimelinePage {
  readonly items: readonly ServiceTimelineEntry[];
  /** Cursor opaco para la siguiente página, o `null` si no hay más. */
  readonly next_cursor: string | null;
}

export interface GetServiceTimelineOptions {
  /** `true` = vista admin sin filtro; `false` = vista cliente con whitelist GDPR. */
  readonly isAdmin: boolean;
  /** Cursor opaco devuelto por la página anterior (`next_cursor`). */
  readonly cursor?: string | null;
  /** Tamaño de página (clamp 1..100, default 30). */
  readonly limit?: number;
}
