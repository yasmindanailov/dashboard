import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnServiceCancellationScheduledListener — audit 2026-06-25 GL-2 / H2.3.
 *
 * Consume `service.cancellation_scheduled`, emitido por el cron
 * `ServiceLifecycleWorker.notifyUpcomingCancellations`
 * ([modules/billing/service-lifecycle.worker.ts](../../billing/service-lifecycle.worker.ts))
 * cuando un servicio suspendido por impago está a `cancellation_notice_days`
 * (default 7) de ser cancelado automáticamente. La cancelación es IRREVERSIBLE
 * (destruye el recurso en el proveedor vía `plugin.deprovision()`), así que este
 * aviso da al cliente margen para regularizar el pago y evitarla — completa la
 * decisión GL-2 "destruir CON aviso previo".
 *
 * Doctrina canónica (heredada de Fase D/E L11+L12):
 *   - NO invoca `EmailService.send` directamente (ADR-065 — ningún listener de
 *     negocio bypassa el orquestador notifications).
 *   - Usa `NotificationsService.dispatchToUser('service.cancellation_scheduled',
 *     payload, user_id)`. El dispatcher resuelve recipient (email + language +
 *     first_name), renderiza la plantilla seedeada `service.cancellation_scheduled`
 *     (Handlebars con escape XSS automático EC-T8-17) y entrega vía
 *     `EmailChannel` + `InAppChannel`.
 *   - Siempre se despacha (es un trigger del cron, sin toggle de admin — espejo
 *     de `domain.expiring_soon`). El motivo es siempre impago, así que el CTA es
 *     "Regulariza el pago" → `/dashboard/billing`, con soporte como secundario.
 *
 * Degradación elegante (R7): cualquier excepción del dispatch se loguea y se
 * traga. El cron ya marcó el edge-trigger (`metadata.cancellation_notice_sent_at`)
 * antes de emitir, así que perder el email NO desencadena re-avisos diarios.
 */
@Injectable()
export class NotificationsOnServiceCancellationScheduledListener {
  private readonly logger = new Logger(
    NotificationsOnServiceCancellationScheduledListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('service.cancellation_scheduled')
  async handleCancellationScheduled(payload: {
    service_id: string;
    user_id: string;
    scheduled_cancellation_date: string;
  }): Promise<void> {
    if (!payload.user_id) {
      this.logger.warn(
        `service.cancellation_scheduled sin user_id (service=${payload.service_id}) — aviso omitido.`,
      );
      return;
    }

    try {
      // Necesitamos `domain` para el subject + body. Query mínima (el dispatcher
      // carga email/first_name/language del user pero no el service).
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
        'service.cancellation_scheduled',
        {
          service_id: payload.service_id,
          domain: displayDomain,
          cancellation_date: formatEsDate(payload.scheduled_cancellation_date),
          billing_url: `${appUrl}/dashboard/billing`,
          support_url: `${appUrl}/dashboard/support`,
        },
        payload.user_id,
      );

      this.logger.log(
        `service.cancellation_scheduled email dispatched to user=${payload.user_id} ` +
          `(service=${payload.service_id}).`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch service.cancellation_scheduled email ` +
          `(service=${payload.service_id} user=${payload.user_id}): ` +
          `${getErrorMessage(err)}`,
      );
    }
  }
}

/**
 * Formatea una fecha ISO a español legible (ej. "15 de julio de 2026"). En UTC
 * para que coincida con el cálculo determinista del cron (`suspended_at +
 * cancellation_days`) y los tests no dependan de la zona del servidor. Si la
 * cadena no es parseable, la devuelve tal cual (fail-soft).
 */
function formatEsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
