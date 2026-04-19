import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BillingService } from './billing.service';

/**
 * SubscriptionService — Manages service lifecycle actions.
 *
 * Handles:
 * - Pause/resume subscription (§21)
 * - Plan change with proration (§21)
 * - Grace period enforcement (§12)
 *
 * Refs: DECISIONS.md §12, §21
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly billingService: BillingService,
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
    if (service.user_id !== userId) throw new BadRequestException('No tienes acceso a este servicio.');
    if (service.status !== 'active') {
      throw new BadRequestException('Solo servicios activos pueden pausarse.');
    }

    // Check if product allows pausing
    if (!service.product.client_can_pause) {
      throw new BadRequestException('Este producto no permite pausar la suscripción.');
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

    this.logger.log(`Service ${serviceId} paused by user ${userId} until ${pauseMaxDate.toISOString()}`);

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
    if (service.user_id !== userId) throw new BadRequestException('No tienes acceso a este servicio.');
    if (service.status !== 'suspended' || !service.paused_at) {
      throw new BadRequestException('Solo servicios pausados pueden reanudarse.');
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

  /* ═══════════════════════════════════════
     CHANGE PLAN (with proration)
     ═══════════════════════════════════════ */

  /**
   * Preview plan change proration.
   * Ref: DECISIONS.md §21
   */
  async previewPlanChange(serviceId: string, newPricingId: string) {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: { product: true },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado.');
    if (service.status !== 'active') {
      throw new BadRequestException('Solo servicios activos pueden cambiar de plan.');
    }

    const newPricing = await this.prisma.productPricing.findUnique({
      where: { id: newPricingId },
    });
    if (!newPricing) throw new NotFoundException('Plan de precio no encontrado.');

    // Calculate days used in current period
    const now = new Date();
    const currentCycleDays = this.billingService.getCycleDays(service.billing_cycle);
    const periodStart = new Date(service.next_due_date!);
    periodStart.setDate(periodStart.getDate() - currentCycleDays);
    const daysUsed = Math.floor((now.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000));

    const proration = this.billingService.calculateProration({
      currentAmount: Number(service.amount),
      currentCycleDays,
      daysUsed: Math.max(0, daysUsed),
      newAmount: Number(newPricing.price),
    });

    return {
      current: {
        billing_cycle: service.billing_cycle,
        amount: Number(service.amount),
        days_used: daysUsed,
        days_total: currentCycleDays,
      },
      new: {
        billing_cycle: newPricing.billing_cycle,
        amount: Number(newPricing.price),
      },
      proration,
    };
  }
}
