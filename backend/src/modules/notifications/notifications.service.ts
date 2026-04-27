import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../core/database/prisma.service';
import {
  NOTIFICATIONS_DISPATCH_QUEUE,
  DISPATCH_NOTIFICATION_JOB,
  type DispatchNotificationJobPayload,
} from './notifications-dispatch.processor';

/**
 * NotificationsService — orquestador (ADR-065 + ADR-042).
 *
 * API canónica:
 *   - `dispatchToUser(eventType, payload, userId)` — un destinatario.
 *   - `dispatchToSuperadmins(eventType, payload)` — todos los superadmins
 *     activos (alertas operativas R7 — `outbox.event_failed`,
 *     `dlq.job_failed`, futuros `system.error`).
 *
 * Encola el envío en `notifications-dispatch` (BullMQ). El processor
 * resuelve los recipients completos, hace lookup de plantillas y delega
 * en cada canal disponible. Cumple R2 (envío >200ms va a la cola).
 *
 * Regla canónica nueva (ADR-065): ningún listener de negocio invoca
 * `EmailService.send()` directamente. Toda notificación pasa por aquí.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_DISPATCH_QUEUE)
    private readonly queue: Queue,
  ) {}

  async dispatchToUser(
    eventType: string,
    payload: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    const job: DispatchNotificationJobPayload = {
      eventType,
      payload,
      recipient_user_ids: [userId],
    };
    await this.queue.add(DISPATCH_NOTIFICATION_JOB, job);
  }

  async dispatchToSuperadmins(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const superadmins = await this.prisma.user.findMany({
      where: { role: { slug: 'superadmin' }, status: 'active' },
      select: { id: true },
    });
    if (superadmins.length === 0) {
      this.logger.warn(
        `No active superadmins for ${eventType} — alert dropped silently`,
      );
      return;
    }
    const job: DispatchNotificationJobPayload = {
      eventType,
      payload,
      recipient_user_ids: superadmins.map((s) => s.id),
    };
    await this.queue.add(DISPATCH_NOTIFICATION_JOB, job);
  }
}
