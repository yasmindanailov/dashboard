import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AuditService } from './audit.service';

/**
 * AuditAdminSsoImpersonationListener — Sprint 15C Fase 15C.F
 * (ADR-083 §4 decisión 14 + §6 evento canónico + dossier §6 paso 14).
 *
 * Persiste en `audit_access_log` cada apertura de panel del proveedor
 * por un agente Aelium sobre un servicio AJENO al agente. Shape
 * pensado para que el portal de transparencia del cliente afectado
 * (`/dashboard/transparency`, ADR-017 + ADR-010 RGPD) lo exponga al
 * usuario data subject:
 *
 *   "Aelium agente <X> abrió el panel de tu servicio <Y> el <fecha>
 *    desde IP <Z>."
 *
 * Doctrina canónica:
 *   - El emisor (`getSsoUrlWithAudit`, `core/provisioning/plugin-utils.ts`)
 *     ya filtra `actorIsAdmin && service.user_id !== actorUserId`. Por
 *     tanto este listener confía en que cualquier evento que recibe ES
 *     impersonation real (NO admin abriendo su propio servicio).
 *   - `metadata.target_user_id` = `service.user_id` (CLIENTE afectado, NO
 *     el agente). Es la pista que `AuditController.myAccessLog` usa para
 *     filtrar por ownership y que el cliente vea solo "accesos a SUS
 *     datos". Esquivar este invariante rompe el portal de transparencia.
 *   - `user_id` (columna `audit_access_log.user_id`) = AGENTE que abrió
 *     el panel — coherente con el resto de filas (quien hizo la acción).
 *   - Flag `gdpr_visible_to_data_subject` se persiste literal en metadata
 *     para que el portal pueda discriminar UX (etiqueta "Apertura de
 *     panel" vs el `read` genérico). Hoy el filter del controller es por
 *     `action`, pero mantener el flag explícito facilita auditorías
 *     técnicas + posibles consumidores futuros (notificaciones push al
 *     cliente, retention extendida, etc.).
 *
 * Trade-off documentado vs `AuditAuthListener`:
 *   - Allí los listeners aceptan no tener `ip_address` (pasan `'system'`)
 *     porque el bus de eventos no garantiza request context. Aquí SÍ
 *     tenemos contexto: el wrapper se invoca dentro de un controller
 *     HTTP con `ctx.ipAddress` + `ctx.userAgent` propagados desde
 *     `provisioning.service.getSsoForUser` → el evento llega completo.
 *   - Si el evento llegase sin IP (defensivo: futuro caller no-HTTP),
 *     fallback a string vacío como en el resto de listeners async.
 */
@Injectable()
export class AuditAdminSsoImpersonationListener {
  private readonly logger = new Logger(AuditAdminSsoImpersonationListener.name);

  constructor(private readonly audit: AuditService) {}

  @OnEvent('service.admin_sso_impersonation')
  async onAdminSsoImpersonation(payload: {
    service_id: string;
    user_id: string;
    agent_user_id: string;
    agent_ip: string;
    agent_user_agent: string | null;
    provisioner_slug: string;
    panel_label: string;
    opened_at: string;
    gdpr_visible_to_data_subject: boolean;
  }): Promise<void> {
    await this.audit.logAccess({
      user_id: payload.agent_user_id,
      action: 'admin_sso_impersonation',
      ip_address: payload.agent_ip,
      user_agent: payload.agent_user_agent,
      resource: 'Service',
      metadata: {
        // Filtro canónico del portal transparency — el cliente afectado
        // verá esta entrada cuando llame `GET /audit/access`.
        target_user_id: payload.user_id,
        resource_type: 'Service',
        resource_id: payload.service_id,
        provisioner_slug: payload.provisioner_slug,
        panel_label: payload.panel_label,
        opened_at: payload.opened_at,
        gdpr_visible_to_data_subject: payload.gdpr_visible_to_data_subject,
      },
    });
    this.logger.log(
      `admin SSO impersonation logged: agent=${payload.agent_user_id} ` +
        `target=${payload.user_id} service=${payload.service_id} ` +
        `panel=${payload.panel_label}`,
    );
  }
}
