import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  NotificationChannelInterface,
  NotificationRecipient,
  RenderedNotification,
  DeliveryResult,
} from '../interfaces/notification-channel.interface';

/**
 * InAppChannel — campana del dashboard (ADR-065 + ADR-042).
 *
 * Persiste una fila en `notifications` (channel='internal'). El frontend
 * la lee desde `GET /api/v1/notifications/unread` (Sprint 9.5) y la
 * muestra en el `NotificationBell` del Topbar.
 *
 * Estado de lectura: `read_at NULL` = unread; `read_at NOT NULL` = read.
 * No hay enum `status` separado — preservamos el shape original de
 * `notifications` (decisión Sprint 9 §3.4).
 */
@Injectable()
export class InAppChannel implements NotificationChannelInterface {
  readonly name = 'internal' as const;
  readonly label = 'Campana';

  constructor(private readonly prisma: PrismaService) {}

  isAvailableFor(): boolean {
    return true;
  }

  async send(
    rendered: RenderedNotification,
    recipient: NotificationRecipient,
  ): Promise<DeliveryResult> {
    const meta = rendered.metadata;
    const actionUrl =
      meta && typeof meta.action_url === 'string' ? meta.action_url : null;

    const row = await this.prisma.notification.create({
      data: {
        user_id: recipient.user_id,
        channel: 'internal',
        title: rendered.subject,
        body: rendered.body,
        ...(actionUrl ? { action_url: actionUrl } : {}),
        ...(meta ? { metadata: meta as Prisma.InputJsonValue } : {}),
        sent_at: new Date(),
      },
      select: { id: true },
    });
    return {
      delivered: true,
      channel: 'internal',
      external_id: row.id,
    };
  }
}
