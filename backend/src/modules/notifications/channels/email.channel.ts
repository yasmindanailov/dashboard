import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../../core/email/email.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';
import {
  NotificationChannelInterface,
  NotificationRecipient,
  RenderedNotification,
  DeliveryResult,
} from '../interfaces/notification-channel.interface';

/**
 * EmailChannel — envuelve `core/email/EmailService` (ADR-065).
 *
 * Único call site canónico de `EmailService.send()` desde el dominio
 * `notifications`. Todo otro envío de email post Fase D pasa por
 * `NotificationsService.dispatch(...)` y este plugin lo entrega.
 */
@Injectable()
export class EmailChannel implements NotificationChannelInterface {
  readonly name = 'email' as const;
  readonly label = 'Email';
  private readonly logger = new Logger(EmailChannel.name);

  constructor(private readonly emailService: EmailService) {}

  isAvailableFor(recipient: NotificationRecipient): boolean {
    return Boolean(recipient.email);
  }

  async send(
    rendered: RenderedNotification,
    recipient: NotificationRecipient,
  ): Promise<DeliveryResult> {
    try {
      const ok = await this.emailService.send({
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.body,
      });
      if (!ok) {
        return {
          delivered: false,
          channel: 'email',
          message: 'Email transport returned false',
        };
      }
      return { delivered: true, channel: 'email' };
    } catch (err) {
      const message = getErrorMessage(err);
      this.logger.warn(
        `Email delivery failed for ${recipient.email} (${rendered.event_type}): ${message}`,
      );
      throw err;
    }
  }
}
