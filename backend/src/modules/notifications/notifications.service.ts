import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { SettingsService } from '../../core/settings/settings.service';
import {
  NOTIFICATIONS_DISPATCH_QUEUE,
  DISPATCH_NOTIFICATION_JOB,
  type DispatchNotificationJobPayload,
} from './notifications-dispatch.processor';

const NOTIFICATION_SELECT = {
  id: true,
  channel: true,
  title: true,
  body: true,
  action_url: true,
  read_at: true,
  sent_at: true,
  metadata: true,
  created_at: true,
} satisfies Prisma.NotificationSelect;

/**
 * NotificationsService — orquestador (ADR-065 + ADR-042).
 *
 * API canónica de envío:
 *   - `dispatchToUser(eventType, payload, userId)` — un destinatario.
 *   - `dispatchToSuperadmins(eventType, payload)` — todos los superadmins
 *     activos (alertas operativas R7 — `outbox.event_failed`,
 *     `dlq.job_failed`, `system.error`).
 *
 * API canónica de consulta (Sprint 9.5):
 *   - `findUnreadForUser(userId)` — campana del Topbar.
 *   - `findAllForUser(userId, query)` — histórico paginado.
 *   - `markAsRead(id, userId)` y `markAllAsRead(userId)` — interacción cliente.
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
    private readonly settings: SettingsService,
    @InjectQueue(NOTIFICATIONS_DISPATCH_QUEUE)
    private readonly queue: Queue,
  ) {}

  // ─── Dispatch ──────────────────────────────────────────────────

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

  // ─── Query (Sprint 9.5 — campana + histórico) ──────────────────

  /**
   * Campana del Topbar — devuelve hasta `notifications.unread_max_in_dropdown`
   * (default 50) notificaciones canal `internal` no leídas, ordenadas por
   * más reciente. El controller no necesita paginar.
   */
  async findUnreadForUser(userId: string): Promise<{
    data: Array<
      Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>
    >;
    unread_count: number;
  }> {
    const limit = await this.settings.getNumber(
      'notifications',
      'unread_max_in_dropdown',
      50,
    );
    const where: Prisma.NotificationWhereInput = {
      user_id: userId,
      channel: 'internal',
      read_at: null,
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: Math.min(limit, 200),
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data: items, unread_count: total };
  }

  /**
   * Histórico paginado del usuario. Incluye leídas y no leídas, todas
   * canal `internal`. El cliente puede filtrar por `unread_only=true`.
   */
  async findAllForUser(
    userId: string,
    query: { page?: number; limit?: number; unread_only?: boolean },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const where: Prisma.NotificationWhereInput = {
      user_id: userId,
      channel: 'internal',
      ...(query.unread_only ? { read_at: null } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  /**
   * Marca una notificación como leída. Idempotente: si ya estaba leída,
   * no actualiza `read_at` (preserva el timestamp original).
   *
   * Ownership: 404 si la fila no existe O no pertenece al caller. NUNCA
   * 403 — la existencia se oculta intencionadamente para no filtrar ids
   * ajenos vía probing.
   */
  async markAsRead(id: string, userId: string): Promise<{ read: true }> {
    const result = await this.prisma.notification.updateMany({
      where: { id, user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
    if (result.count === 0) {
      const existing = await this.prisma.notification.findFirst({
        where: { id, user_id: userId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Notification ${id} no encontrada`);
      }
    }
    return { read: true };
  }

  /**
   * Marca como leídas todas las no leídas del usuario. Devuelve cuántas
   * pasaron a leído (útil para cliente: refrescar contador).
   */
  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { user_id: userId, read_at: null, channel: 'internal' },
      data: { read_at: new Date() },
    });
    return { updated: result.count };
  }
}
