import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';

interface DlqJobFailedPayload {
  failed_job_id: string;
  queue: string;
  name: string;
  last_error: string;
  attempts_made: number;
}

/**
 * NotificationsDlqListener — consume `dlq.job_failed` (cierra ADR-055
 * §Monitoring + Sprint 9 Fase D).
 *
 * Cuando un job BullMQ agota `attempts`, el `DlqService` lo persiste en
 * `failed_jobs` y emite este evento. Aquí lo recogemos y notificamos
 * a los superadmins via campana + email (R7+R13).
 *
 * Guard explícito: este listener NO puede emitir errores que generen
 * un nuevo `dlq.job_failed` — bucle infinito. Si el dispatch falla, log.
 */
@Injectable()
export class NotificationsDlqListener {
  private readonly logger = new Logger(NotificationsDlqListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('dlq.job_failed')
  async handleDlqFailed(payload: DlqJobFailedPayload): Promise<void> {
    try {
      await this.notifications.dispatchToSuperadmins(
        'dlq.job_failed',
        payload as unknown as Record<string, unknown>,
      );
    } catch (err) {
      this.logger.error(
        `Failed to alert superadmins about DLQ job (${payload.failed_job_id}): ${getErrorMessage(err)}`,
      );
    }
  }
}
