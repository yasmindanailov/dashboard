import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AuditService } from './audit.service';

/**
 * AuditOnServiceReconciledExternalChangeListener — Sprint 15C Fase 15C.H
 * (ADR-083 §6 decisión 24 + dossier §6.6).
 *
 * Persiste cada divergencia detectada por `EnhanceReconciliationCron` en
 * `audit_change_log` (R3: registro inmutable de cambios sensibles). El
 * actor del cambio es **el sistema** (`user_id=null`) — quien tomó la
 * acción NO es un usuario humano sino el cron L3 reconciliando con
 * Enhance.
 *
 * Doctrina del flag GDPR (per change_type):
 *   - `subscription_missing`: visible al cliente (afecta su servicio
 *     directamente — la suscripción dejó de existir en el proveedor).
 *   - `status_divergence`:    visible al cliente (cambia el `Service.status`
 *     que ve en su panel + lifecycle billing posiblemente afectado).
 *   - `plan_divergence`:      SOLO admin (billing implication, NO debe
 *     ver el cliente todavía — admin investiga y decide ajuste de
 *     factura / nota de crédito antes de exponerlo).
 *
 * El flag se persiste en `changes_after._meta.gdpr_visible_to_data_subject`
 * para que sprints futuros (12.5 Portal RGPD) puedan filtrar este audit
 * change_log y exponerlo en `/dashboard/transparency`. NO bridge actual a
 * `audit_access_log` — el flujo canónico de exposición al cliente vendrá
 * con el portal RGPD ampliado.
 *
 * Trade-off vs `AuditAdminSsoImpersonationListener` (Fase F):
 *   - Allí persistimos en `audit_access_log` con `metadata.target_user_id`
 *     porque el portal de transparencia ya consulta access_log y la
 *     exposición es inmediata (los clientes ven impersonations al instante).
 *   - Aquí persistimos en `audit_change_log` porque el shape semántico es
 *     "cambio detectado en el proveedor externo", NO "lectura realizada por
 *     un agente". Además el portal de transparencia v1 (Sprint 12.5) ya está
 *     diseñado para añadir change_log como segunda fuente.
 */
@Injectable()
export class AuditOnServiceReconciledExternalChangeListener {
  private readonly logger = new Logger(
    AuditOnServiceReconciledExternalChangeListener.name,
  );

  constructor(private readonly audit: AuditService) {}

  @OnEvent('service.reconciled_external_change')
  async onReconciledExternalChange(payload: {
    service_id: string;
    user_id: string;
    plugin_slug: string;
    change_type:
      | 'subscription_missing'
      | 'status_divergence'
      | 'plan_divergence';
    expected: unknown;
    actual: unknown;
    detected_at: string;
  }): Promise<void> {
    const gdprVisible = computeGdprVisibility(payload.change_type);

    await this.audit.logChange({
      user_id: null, // sistema (cron L3) — no hay actor humano
      entity_type: 'Service',
      entity_id: payload.service_id,
      action: 'reconciled_external_change',
      changes_before: {
        value: payload.expected as Record<string, unknown> | string | number,
      },
      changes_after: {
        value: payload.actual as Record<string, unknown> | string | number,
        // _meta es interno — encapsula el flag GDPR + contexto del listener.
        // El sufijo `_meta` evita choque con campos legítimos que el plugin
        // pueda añadir a `actual` en el futuro.
        _meta: {
          plugin_slug: payload.plugin_slug,
          change_type: payload.change_type,
          target_user_id: payload.user_id,
          gdpr_visible_to_data_subject: gdprVisible,
          detected_at: payload.detected_at,
        },
      },
    });

    this.logger.log(
      `audit_change_log: reconciled_external_change ` +
        `service=${payload.service_id} change=${payload.change_type} ` +
        `gdpr_visible=${gdprVisible}`,
    );
  }
}

/**
 * Materializa la doctrina del flag GDPR (ADR-083 §6 decisión 24 +
 * doctrina ADR-010 RGPD): qué cambios son visibles al cliente
 * data-subject vs cuáles son admin-only.
 */
function computeGdprVisibility(
  change_type: 'subscription_missing' | 'status_divergence' | 'plan_divergence',
): boolean {
  switch (change_type) {
    case 'subscription_missing':
      return true; // afecta directamente al servicio del cliente
    case 'status_divergence':
      return true; // cambia el Service.status que ve el cliente
    case 'plan_divergence':
      return false; // billing implication — admin investiga primero
  }
}
