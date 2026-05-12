import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import type { SuspensionReason } from '../../../core/provisioning/types';
import { NotificationsService } from '../notifications.service';

/**
 * Etiquetas localizadas (ES) de la taxonomía canónica `SuspensionReason`
 * — cliente-seguras. Para `other` se omite la etiqueta (`undefined`): el
 * email no muestra la línea "Motivo:" y la nota interna NUNCA viaja al
 * cliente; el email dirige a soporte para los detalles.
 *
 * Mantener sincronizado con el i18n del frontend
 * (`frontend/app/_shared/i18n/translations-es.ts` → `service.suspension_reason.*`)
 * y con la taxonomía en `core/provisioning/types.ts` (`SuspensionReason`).
 */
const SUSPENSION_REASON_LABEL_ES: Record<SuspensionReason, string | undefined> =
  {
    overdue_payment: 'Falta de pago',
    abuse_investigation: 'Revisión de seguridad en curso',
    scheduled_maintenance: 'Mantenimiento programado',
    gdpr_restriction: 'Restricción del tratamiento (RGPD)',
    other: undefined,
  };

/**
 * NotificationsOnServiceSuspendedListener — Sprint 15C.II Fase F (2026-05-11).
 *
 * Consume `service.suspended` emitido por `ProvisioningService.suspendAsAdmin`
 * ([modules/provisioning/provisioning.service.ts](../../provisioning/provisioning.service.ts))
 * cuando un admin suspende un servicio vía `POST /admin/services/:id/suspend`
 * (o, en el futuro, el cron `billing-suspend-on-overdue` — Sprint 8 Fase 8.1).
 * Si `notify_client !== false` (toggle "Notificar al cliente" del modal admin,
 * default ON), despacha la plantilla `service.suspended` (email + campana) al
 * dueño del servicio.
 *
 * Doctrina canónica (heredada de Fase D/E L11+L12):
 *   - NO invoca `EmailService.send` directamente (ADR-065).
 *   - Usa `NotificationsService.dispatchToUser('service.suspended', payload, user_id)`.
 *   - La plantilla muestra al cliente la **etiqueta localizada del motivo
 *     canónico** (`reason_label`) — NUNCA la `internal_note` del admin (esa
 *     vive solo en `audit_change_log` + `services.suspension_reason`). Para
 *     `reason='other'` no hay etiqueta — el email dirige a soporte.
 *   - El CTA ramifica por el motivo (este listener pasa los flags
 *     `is_overdue_payment` / `is_maintenance` + las URLs; la plantilla
 *     Handlebars ramifica con `{{#if}}`):
 *       · `overdue_payment` → "Regulariza el pago" → `/dashboard/billing`.
 *       · `scheduled_maintenance` → sin CTA ("volverá a estar disponible").
 *       · resto (`abuse_investigation` / `gdpr_restriction` / `other`) →
 *         "Contactar con soporte" → `/dashboard/support`.
 *   - Heredable a 15E Docker + 15G Plesk (15D RC no aplica — `supports_suspend=false`).
 *
 * Degradación elegante (R7): cualquier excepción del dispatch se loguea y se
 * traga. La suspensión ya se ejecutó (status `suspended` persistido + audit);
 * perder el email NO debe deshacer el side effect.
 */
@Injectable()
export class NotificationsOnServiceSuspendedListener {
  private readonly logger = new Logger(
    NotificationsOnServiceSuspendedListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('service.suspended')
  async handleServiceSuspended(payload: {
    service_id: string;
    user_id: string;
    provisioner_slug: string | null;
    reason: SuspensionReason;
    actor_user_id: string;
    suspended_at: string;
    notify_client?: boolean;
  }): Promise<void> {
    if (payload.notify_client === false) {
      this.logger.log(
        `service.suspended with notify_client=false (service=${payload.service_id}) ` +
          `— skipping client email by admin choice.`,
      );
      return;
    }

    try {
      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        select: { domain: true, label: true },
      });
      const displayDomain =
        service?.domain ?? service?.label ?? payload.service_id;

      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );

      await this.notifications.dispatchToUser(
        'service.suspended',
        {
          service_id: payload.service_id,
          domain: displayDomain,
          reason_label: SUSPENSION_REASON_LABEL_ES[payload.reason],
          is_overdue_payment: payload.reason === 'overdue_payment',
          is_maintenance: payload.reason === 'scheduled_maintenance',
          billing_url: `${appUrl}/dashboard/billing`,
          support_url: `${appUrl}/dashboard/support`,
        },
        payload.user_id,
      );

      this.logger.log(
        `service.suspended email dispatched to user=${payload.user_id} ` +
          `(service=${payload.service_id} reason=${payload.reason} ` +
          `plugin=${payload.provisioner_slug ?? 'none'})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch service.suspended email ` +
          `(service=${payload.service_id} user=${payload.user_id}): ` +
          `${getErrorMessage(err)}`,
      );
    }
  }
}
