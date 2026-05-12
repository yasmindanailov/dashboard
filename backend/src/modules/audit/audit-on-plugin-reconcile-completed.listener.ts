import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { deriveAuditEntityId } from '../../core/provisioning/plugin-audit-id.util';

import { AuditService } from './audit.service';

/**
 * AuditOnPluginReconcileCompletedListener — Sprint 15C.II Fase F.2
 * (ADR-083 §6 Amendment — evento `plugin.reconcile_completed`).
 *
 * Persiste **un rollup por pasada de reconciliación** (cron L3 6h o
 * reconcile-all manual) en `audit_change_log` con `entity_type='Plugin'` +
 * `action='reconcile_completed'`. Es el complemento agregado de
 * `reconciled_external_change` (que registra cada drift individual a nivel
 * `Service`): aquí guardamos "el plugin X corrió una pasada, procesó N
 * servicios, detectó M drifts, K errores, en D ms, gatillada por
 * cron|manual".
 *
 * Motivación (Fase F.2): el admin overview operativo
 * (`<PluginOperationalOverview>`, ADR-083 A4.4) necesita mostrar "última
 * reconciliación hace Xh" con **estado observado**, no inferido del
 * schedule. El cron del plugin solo logueaba a stderr; este audit row es la
 * fuente de verdad persistida que el overview consulta
 * (`findFirst` por `entity_id` + `action`, índice `[entity_type, entity_id]`).
 *
 * Actor: **sistema** (`user_id=null`) — tanto el cron como el reconcile-all
 * manual completan sin actor humano en este punto del pipeline (el "quién
 * gatilló el manual" ya queda en `plugin.reconcile_triggered_manually` que
 * escribe `AdminPluginsService.reconcileAll` con el actor real).
 *
 * NO toca `audit_access_log` ni flags GDPR — un rollup operativo de
 * reconciliación es admin-only por naturaleza (los drifts individuales
 * visibles al cliente ya los maneja
 * `AuditOnServiceReconciledExternalChangeListener`).
 *
 * R7: nunca relanza — el listener no debe romper el cron del plugin.
 *
 * Heredable a 15D RC / 15E Docker / 15G Plesk (cualquier plugin con
 * `supports_reconciliation=true` que emita `plugin.reconcile_completed`).
 */
@Injectable()
export class AuditOnPluginReconcileCompletedListener {
  private readonly logger = new Logger(
    AuditOnPluginReconcileCompletedListener.name,
  );

  constructor(private readonly audit: AuditService) {}

  @OnEvent('plugin.reconcile_completed')
  async onReconcileCompleted(payload: {
    plugin_slug: string;
    trigger: 'cron' | 'manual';
    services_processed: number;
    drifts_detected: number;
    errors: number;
    duration_ms: number;
    completed_at: string;
  }): Promise<void> {
    try {
      await this.audit.logChange({
        user_id: null, // sistema (cron L3 o reconcile-all manual)
        entity_type: 'Plugin',
        entity_id: deriveAuditEntityId(payload.plugin_slug),
        action: 'reconcile_completed',
        changes_before: null,
        changes_after: {
          slug: payload.plugin_slug,
          trigger: payload.trigger,
          services_processed: payload.services_processed,
          drifts_detected: payload.drifts_detected,
          errors: payload.errors,
          duration_ms: payload.duration_ms,
          completed_at: payload.completed_at,
        },
      });
      this.logger.log(
        `audit_change_log: reconcile_completed plugin=${payload.plugin_slug} ` +
          `trigger=${payload.trigger} services=${payload.services_processed} ` +
          `drifts=${payload.drifts_detected} errors=${payload.errors}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to persist reconcile_completed audit for plugin "${payload.plugin_slug}": ` +
          `${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }
}
