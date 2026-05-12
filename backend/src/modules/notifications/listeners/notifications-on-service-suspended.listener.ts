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

const CANONICAL_REASONS = new Set<SuspensionReason>([
  'overdue_payment',
  'abuse_investigation',
  'scheduled_maintenance',
  'gdpr_restriction',
  'other',
]);

/**
 * Normaliza el `reason` del payload a la taxonomía canónica `SuspensionReason`.
 * `ProvisioningService.suspendAsAdmin` (Fase F) ya emite uno de los 5 valores
 * canónicos; pero el emisor histórico `ServiceLifecycleWorker.autoSuspendServices`
 * (suspensión por impago vencido — Sprint 6.5) emite `reason: 'payment_exhausted'`
 * con un `invoice_id`. Mapeamos esa forma legacy a `'overdue_payment'` (es
 * semánticamente lo mismo — impago) para que el cliente reciba el CTA correcto
 * ("regulariza tu pago"). Cualquier `reason` desconocido sin `invoice_id` cae a
 * `'other'`. Heredable: cuando se unifique el flujo de suspensión por impago
 * (DC.NEW-15CII-BILLING-SUSPEND-UNIFY — que el worker llame a `suspendAsAdmin`),
 * este normalizador se simplifica.
 */
function normalizeReason(
  rawReason: unknown,
  hasInvoiceId: boolean,
): SuspensionReason {
  if (
    typeof rawReason === 'string' &&
    CANONICAL_REASONS.has(rawReason as SuspensionReason)
  ) {
    return rawReason as SuspensionReason;
  }
  return hasInvoiceId ? 'overdue_payment' : 'other';
}

/**
 * NotificationsOnServiceSuspendedListener — Sprint 15C.II Fase F (ADR-077 A4).
 *
 * Consume `service.suspended`. Dos emisores hoy (ver §A4.4/A4.5 ADR-077 +
 * `_events.md`):
 *   1. `ProvisioningService.suspendAsAdmin` (Fase F) — admin suspende vía
 *      `POST /admin/services/:id/suspend`. Payload canónico
 *      `{service_id, user_id, provisioner_slug, reason, actor_user_id, suspended_at, notify_client}`.
 *   2. `ServiceLifecycleWorker.autoSuspendServices` (Sprint 6.5) — cron diario
 *      03:00 suspende por impago vencido (retries agotados). Payload legacy
 *      `{service_id, invoice_id, reason: 'payment_exhausted'}` (sin `user_id`).
 * Este listener tolera ambas formas (deriva `user_id` del service si falta;
 * normaliza `reason` legacy → `overdue_payment`). Si `notify_client !== false`
 * (default ON — el emisor #2 no lo trae → notifica), despacha la plantilla
 * `service.suspended` (email + campana) al dueño.
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
    user_id?: string;
    provisioner_slug?: string | null;
    /** Canónico (suspendAsAdmin): un `SuspensionReason`. Legacy (autoSuspendServices): `'payment_exhausted'`. Normalizado por `normalizeReason`. */
    reason?: string;
    actor_user_id?: string;
    suspended_at?: string;
    invoice_id?: string;
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
      // El payload canónico (suspendAsAdmin) trae `user_id`. El legacy
      // (autoSuspendServices) no — lo derivamos del service.
      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        select: { domain: true, label: true, user_id: true },
      });
      const userId = payload.user_id ?? service?.user_id;
      if (!userId) {
        this.logger.warn(
          `service.suspended without user_id and service=${payload.service_id} not found — skipping email.`,
        );
        return;
      }
      const displayDomain =
        service?.domain ?? service?.label ?? payload.service_id;
      const reason = normalizeReason(
        payload.reason,
        Boolean(payload.invoice_id),
      );

      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );

      await this.notifications.dispatchToUser(
        'service.suspended',
        {
          service_id: payload.service_id,
          domain: displayDomain,
          reason_label: SUSPENSION_REASON_LABEL_ES[reason],
          is_overdue_payment: reason === 'overdue_payment',
          is_maintenance: reason === 'scheduled_maintenance',
          billing_url: `${appUrl}/dashboard/billing`,
          support_url: `${appUrl}/dashboard/support`,
        },
        userId,
      );

      this.logger.log(
        `service.suspended email dispatched to user=${userId} ` +
          `(service=${payload.service_id} reason=${reason} ` +
          `plugin=${payload.provisioner_slug ?? 'none'})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch service.suspended email ` +
          `(service=${payload.service_id} user=${payload.user_id ?? '?'}): ` +
          `${getErrorMessage(err)}`,
      );
    }
  }
}
