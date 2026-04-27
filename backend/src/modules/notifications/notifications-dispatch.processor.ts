import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../core/database/prisma.service';
import { DlqService } from '../../core/jobs/dlq.service';
import { RetryService } from '../../core/jobs/retry.service';
import { getErrorMessage } from '../../core/common/utils/error.util';
import { NotificationTemplateService } from './notification-template.service';
import {
  NOTIFICATION_CHANNELS,
  NotificationChannelInterface,
  NotificationRecipient,
} from './interfaces/notification-channel.interface';

export const NOTIFICATIONS_DISPATCH_QUEUE = 'notifications-dispatch';
export const DISPATCH_NOTIFICATION_JOB = 'dispatch-notification';

export interface DispatchNotificationJobPayload {
  eventType: string;
  payload: Record<string, unknown>;
  recipient_user_ids: string[];
}

/**
 * NotificationsDispatchProcessor — Sprint 9 Fase D (ADR-065).
 *
 * Para cada job:
 *   1. Resuelve los `recipients` completos desde DB (user_id → email + nombre + locale).
 *   2. Para cada recipient × cada canal disponible:
 *      a. Render plantilla `(eventType, channel, recipient.locale)`.
 *      b. Si plantilla no existe → omite canal.
 *      c. `channel.send(rendered, recipient)`.
 *   3. Si TODAS las entregas fallan → throw → BullMQ reintenta con backoff
 *      exponencial. Si una falla y otra OK → log warning, no throw.
 *
 * Hereda los defaults globales del JobsModule (attempts=5, backoff
 * exponencial 30s→480s, removeOnFail:false). DLQ persistente en
 * `failed_jobs` + emit `dlq.job_failed` (R7+R13).
 */
@Processor(NOTIFICATIONS_DISPATCH_QUEUE)
export class NotificationsDispatchProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(NotificationsDispatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: NotificationTemplateService,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(NOTIFICATIONS_DISPATCH_QUEUE) private readonly queue: Queue,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannelInterface[],
  ) {
    super();
  }

  onModuleInit(): void {
    this.dlq.register(NOTIFICATIONS_DISPATCH_QUEUE);
    this.retry.register(NOTIFICATIONS_DISPATCH_QUEUE, this.queue);
  }

  async process(job: Job<DispatchNotificationJobPayload>): Promise<void> {
    const { eventType, payload, recipient_user_ids } = job.data;

    const users = await this.prisma.user.findMany({
      where: { id: { in: recipient_user_ids }, status: 'active' },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        language: true,
      },
    });

    if (users.length === 0) {
      this.logger.warn(
        `Job ${job.id} (${eventType}): no active recipients found for ids=${recipient_user_ids.join(',')}`,
      );
      return;
    }

    let totalAttempts = 0;
    let totalSuccess = 0;
    const errors: string[] = [];

    for (const user of users) {
      const recipient: NotificationRecipient = {
        user_id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        language: user.language,
      };

      // Plantillas pueden referenciar tanto el payload del evento
      // (`{{invoice_number}}`) como datos del recipient
      // (`{{recipient.first_name}}`).
      const renderContext = { ...payload, recipient };

      // Metadata estandarizada que cada canal puede usar (ej. campana
      // persiste `action_url` y `event` para que el frontend trace el
      // origen). Convención: el listener emisor pasa `action_url`
      // relativo en el payload si quiere link directo.
      const channelMetadata: Record<string, unknown> = { event: eventType };
      if (typeof payload.action_url === 'string') {
        channelMetadata.action_url = payload.action_url;
      }

      for (const channel of this.channels) {
        const available = await channel.isAvailableFor(recipient);
        if (!available) continue;

        const rendered = await this.templates.render(
          eventType,
          channel.name,
          recipient.language,
          renderContext,
        );
        if (!rendered) continue;
        rendered.metadata = channelMetadata;

        totalAttempts += 1;
        try {
          const result = await channel.send(rendered, recipient);
          if (result.delivered) {
            totalSuccess += 1;
            this.logger.log(
              `Delivered ${eventType} via ${channel.name} → user=${user.id}${result.external_id ? ` ext=${result.external_id}` : ''}`,
            );
          } else {
            errors.push(
              `${channel.name}/${user.id}: ${result.message ?? 'undelivered'}`,
            );
          }
        } catch (err) {
          errors.push(`${channel.name}/${user.id}: ${getErrorMessage(err)}`);
        }
      }
    }

    if (totalAttempts === 0) {
      this.logger.debug(
        `${eventType}: no template+channel combo applicable to recipients — nothing to send`,
      );
      return;
    }

    if (totalSuccess === 0) {
      // Todas las entregas fallaron → throw para que BullMQ reintente.
      throw new Error(
        `All ${totalAttempts} deliveries failed for ${eventType}: ${errors.join('; ')}`,
      );
    }

    if (errors.length > 0) {
      this.logger.warn(
        `${eventType}: ${totalSuccess}/${totalAttempts} delivered. Errors: ${errors.join('; ')}`,
      );
    }
  }
}
