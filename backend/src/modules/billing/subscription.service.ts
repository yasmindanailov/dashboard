import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { OutboxService } from '../../core/outbox/outbox.service';

/**
 * SubscriptionService — Manages service lifecycle actions.
 *
 * Handles:
 * - Pause/resume subscription (§21)
 * - Grace period enforcement (§12)
 *
 * El cambio de plan con prorrateo (ADR-029) vive en
 * `SubscriptionPlanChangeService` (Regla 15 — responsabilidad única).
 *
 * Refs: DECISIONS.md §12, §21
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    // R8 (audit 2026-06-25 GL-17): `service.paused`/`service.resumed` se
    // persisten vía Outbox en la misma tx del cambio de status (antes `emit()`
    // directo fuera de tx). `OutboxModule` es @Global → no requiere import.
    private readonly outbox: OutboxService,
  ) {}

  /* ═══════════════════════════════════════
     PAUSE SUBSCRIPTION
     ═══════════════════════════════════════ */

  /**
   * Pause a service. The client voluntarily freezes their subscription.
   * Same mechanics as suspension — data preserved for X days.
   * Ref: DECISIONS.md §21
   */
  async pauseService(serviceId: string, userId: string): Promise<any> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: { product: true },
    });

    // HIGH-2: NotFound (no BadRequest) si no es suyo — no filtrar la existencia de
    // servicios ajenos. El userId viene del JWT (subscription.controller), nunca de
    // un query param.
    if (!service || service.user_id !== userId) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (service.status !== 'active') {
      throw new BadRequestException('Solo servicios activos pueden pausarse.');
    }

    // Check if product allows pausing
    if (!service.product.client_can_pause) {
      throw new BadRequestException(
        'Este producto no permite pausar la suscripción.',
      );
    }

    // Calculate max pause date from product settings
    const pauseDays = service.product.pause_max_days ?? 30;
    const pauseMaxDate = new Date();
    pauseMaxDate.setDate(pauseMaxDate.getDate() + pauseDays);

    // R8 (GL-17): la transición de status y el evento `service.paused` se
    // persisten en la misma tx → dispatch at-least-once vía OutboxWorker.
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.service.update({
        where: { id: serviceId },
        data: {
          status: 'suspended',
          paused_at: new Date(),
          pause_max_date: pauseMaxDate,
          suspended_at: new Date(),
          suspension_reason: 'Pausado voluntariamente por el cliente',
        },
      });
      await this.outbox.enqueue(tx, 'service.paused', {
        service_id: serviceId,
        user_id: userId,
        pause_max_date: pauseMaxDate.toISOString(),
      });
      return u;
    });

    this.logger.log(
      `Service ${serviceId} paused by user ${userId} until ${pauseMaxDate.toISOString()}`,
    );

    return updated;
  }

  /* ═══════════════════════════════════════
     RESUME SUBSCRIPTION
     ═══════════════════════════════════════ */

  async resumeService(serviceId: string, userId: string): Promise<any> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });

    // HIGH-2: NotFound si no es suyo (no filtrar existencia). userId del JWT.
    if (!service || service.user_id !== userId) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (service.status !== 'suspended' || !service.paused_at) {
      throw new BadRequestException(
        'Solo servicios pausados pueden reanudarse.',
      );
    }

    // R8 (GL-17): transición de status + evento `service.resumed` en la misma tx.
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.service.update({
        where: { id: serviceId },
        data: {
          status: 'active',
          paused_at: null,
          pause_max_date: null,
          suspended_at: null,
          suspension_reason: null,
        },
      });
      await this.outbox.enqueue(tx, 'service.resumed', {
        service_id: serviceId,
        user_id: userId,
        reason: 'manual_resume',
      });
      return u;
    });

    this.logger.log(`Service ${serviceId} resumed by user ${userId}`);

    return updated;
  }
}
