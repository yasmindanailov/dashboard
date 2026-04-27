import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';

interface OutboxFailedPayload {
  event_outbox_id: string;
  event_type: string;
  last_error: string;
  retry_count: number;
}

/**
 * NotificationsOutboxListener — consume `outbox.event_failed` (cierra
 * ADR-033 §7 + Sprint 9 Fase D).
 *
 * Cuando una fila de `event_outbox` agota `max_retries`, el `OutboxWorker`
 * la marca como `failed` y emite este evento. Aquí lo recogemos y
 * notificamos a los superadmins via campana + email (R7).
 */
@Injectable()
export class NotificationsOutboxListener {
  private readonly logger = new Logger(NotificationsOutboxListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('outbox.event_failed')
  async handleOutboxFailed(payload: OutboxFailedPayload): Promise<void> {
    try {
      await this.notifications.dispatchToSuperadmins(
        'outbox.event_failed',
        payload as unknown as Record<string, unknown>,
      );
    } catch (err) {
      // CRÍTICO: este listener NO debe relanzar — si falla el dispatch,
      // log y degradamos silenciosamente. Si throw, el OutboxWorker
      // entraría en bucle (este listener escucha un evento operativo,
      // no un evento Outbox crítico).
      this.logger.error(
        `Failed to alert superadmins about outbox failure (${payload.event_outbox_id}): ${getErrorMessage(err)}`,
      );
    }
  }
}
