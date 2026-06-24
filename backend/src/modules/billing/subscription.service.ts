import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
    private readonly eventEmitter: EventEmitter2,
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

    if (!service) throw new NotFoundException('Servicio no encontrado.');
    if (service.user_id !== userId)
      throw new BadRequestException('No tienes acceso a este servicio.');
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

    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        status: 'suspended',
        paused_at: new Date(),
        pause_max_date: pauseMaxDate,
        suspended_at: new Date(),
        suspension_reason: 'Pausado voluntariamente por el cliente',
      },
    });

    this.eventEmitter.emit('service.paused', {
      service_id: serviceId,
      user_id: userId,
      pause_max_date: pauseMaxDate,
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

    if (!service) throw new NotFoundException('Servicio no encontrado.');
    if (service.user_id !== userId)
      throw new BadRequestException('No tienes acceso a este servicio.');
    if (service.status !== 'suspended' || !service.paused_at) {
      throw new BadRequestException(
        'Solo servicios pausados pueden reanudarse.',
      );
    }

    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        status: 'active',
        paused_at: null,
        pause_max_date: null,
        suspended_at: null,
        suspension_reason: null,
      },
    });

    this.eventEmitter.emit('service.resumed', {
      service_id: serviceId,
      user_id: userId,
      reason: 'manual_resume',
    });

    this.logger.log(`Service ${serviceId} resumed by user ${userId}`);

    return updated;
  }
}
