import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnServiceExpiringListener — F4·W3.
 *
 * Consume `service.expiring_soon` (emitido por
 * `ServiceLifecycleWorker.warnExpiringNonRenewedServices` cuando un servicio de
 * HOSTING con auto-renovación desactivada se acerca a `next_due_date`) y lo
 * traduce en notificación al cliente (email + campana) vía
 * `NotificationsService.dispatchToUser` (D12 — nunca `EmailService.send` directo).
 *
 * El `panel_url` apunta al detalle del servicio (donde vive el toggle de
 * auto-renovación → el cliente puede reactivarla). Degradación elegante (R7).
 */
@Injectable()
export class NotificationsOnServiceExpiringListener {
  private readonly logger = new Logger(
    NotificationsOnServiceExpiringListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('service.expiring_soon')
  async handleExpiringSoon(payload: ServiceExpiringPayload): Promise<void> {
    if (!payload.user_id) {
      this.logger.warn(
        'service.expiring_soon sin user_id — notificación omitida.',
      );
      return;
    }
    try {
      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );
      await this.notifications.dispatchToUser(
        'service.expiring_soon',
        {
          service_id: payload.service_id,
          service_name: payload.service_name ?? payload.service_id,
          days_left: payload.days_left ?? 0,
          end_date: payload.end_date ?? '',
          panel_url: `${appUrl}/dashboard/services/${payload.service_id}`,
        },
        payload.user_id,
      );
      this.logger.log(
        `service.expiring_soon dispatched to user=${payload.user_id} (service=${payload.service_id}).`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch service.expiring_soon (service=${payload.service_id} ` +
          `user=${payload.user_id}): ${getErrorMessage(err)}`,
      );
    }
  }
}

interface ServiceExpiringPayload {
  service_id: string;
  user_id: string;
  service_name?: string;
  days_left?: number;
  end_date?: string;
}
