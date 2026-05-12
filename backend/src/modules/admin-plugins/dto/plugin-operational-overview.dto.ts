import type { CircuitBreakerState } from '../../../core/provisioning/circuit-breaker';

/**
 * Sprint 15C.II Fase F.2 (ADR-083 Amendment A4.4) — shape de respuesta del
 * endpoint `GET /api/v1/admin/plugins/:slug/operational-overview`.
 *
 * **Plugin-agnóstico por diseño** (heredable a 15D RC / 15E Docker / 15G
 * Plesk): el backend lo construye desde el manifest + capabilities +
 * circuit breakers + counts de `services` + audit de reconciliación. El
 * frontend `<PluginOperationalOverview slug>` lo renderiza sin conocer
 * detalles de ningún plugin concreto.
 *
 * Notas de fidelidad (decisiones Fase F.2):
 *  - `circuit.*` es estado **in-process** (`CircuitBreakerRegistry.getState()`);
 *    en deploy multi-instancia refleja solo esta instancia. La UI lo etiqueta.
 *  - `reconciliation.last` viene del audit `reconcile_completed` (rollup
 *    emitido por el cron del plugin + por el reconcile-all manual) — estado
 *    **observado**, no inferido. `null` si nunca corrió desde que existe el
 *    evento (Fase F.2 en adelante).
 *  - `reconciliation.next_scheduled_at` se deriva del intervalo declarado por
 *    el plugin al registrar su executor (`ReconcileRegistryService.register`);
 *    `null` si el plugin no soporta reconciliación o no declaró intervalo.
 *  - `recent_drifts` consulta `audit_change_log` (`entity_type='Service'`,
 *    `action='reconciled_external_change'`, ventana 24h vía índice `created_at`),
 *    filtrado por `_meta.plugin_slug`. Cada fila enlazará en el frontend al
 *    detalle del servicio (timeline `/admin/services/[id]/audit` llega en F.3).
 */
export type PluginReconcileChangeType =
  | 'subscription_missing'
  | 'status_divergence'
  | 'plan_divergence';

export type PluginHealthStatus =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'disabled';

export interface PluginOperationalOverview {
  readonly slug: string;
  /** Clave i18n de la etiqueta legible (de `manifest.label`). */
  readonly label: string;
  readonly enabled: boolean;

  readonly health: {
    readonly status: PluginHealthStatus;
    /** Claves i18n que explican el estado (≥1 elemento siempre). */
    readonly reasons: readonly string[];
  };

  /** Estado de los circuit breakers del plugin (in-process). */
  readonly circuit: {
    readonly getServiceInfo: CircuitBreakerState | null;
    readonly executeAction: CircuitBreakerState | null;
  };

  /** Cobertura de secrets requeridos por el manifest. */
  readonly secrets: {
    readonly required: number;
    readonly configured: number;
    /** Nombres de los secrets requeridos que faltan por configurar. */
    readonly missing: readonly string[];
  };

  /** Counts de servicios provisionados por este plugin. */
  readonly services: {
    readonly active: number;
    readonly suspended: number;
  };

  readonly reconciliation: {
    readonly supported: boolean;
    readonly last: {
      readonly completed_at: string;
      readonly trigger: 'cron' | 'manual';
      readonly services_processed: number;
      readonly drifts_detected: number;
      readonly errors: number;
    } | null;
    readonly next_scheduled_at: string | null;
    /** Drifts detectados en las últimas 24h para este plugin. */
    readonly drifts_24h: number;
  };

  /** Hasta 20 drifts más recientes (24h), más nuevos primero. */
  readonly recent_drifts: ReadonlyArray<{
    readonly service_id: string;
    readonly change_type: PluginReconcileChangeType;
    readonly detected_at: string;
  }>;

  /** ISO timestamp de cuándo se computó este overview. */
  readonly generated_at: string;
}
