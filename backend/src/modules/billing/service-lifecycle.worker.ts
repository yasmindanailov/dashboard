import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BillingCalculatorService } from './billing-calculator.service';

/**
 * ServiceLifecycleWorker — Scheduled jobs for service status automation.
 *
 * Handles:
 * - Auto-suspension after exhausted payment retries (6.5)
 * - Auto-cancellation after suspension period (6.5)
 * - Auto-resume of paused services past max date (6.7)
 *
 * Ref: DECISIONS.md §12, §21 | ARCHITECTURE.md Regla 15
 */
@Injectable()
export class ServiceLifecycleWorker {
  private readonly logger = new Logger('ServiceLifecycleWorker');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly calculator: BillingCalculatorService,
  ) {}

  /* ── 6.5 — Auto-suspension (daily 03:00) ── */

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async autoSuspendServices(): Promise<void> {
    const suspensionDays = await this.calculator.getSettingValue<number>(
      'billing',
      'suspension_days',
      7,
    );
    const cutoff = new Date(Date.now() - suspensionDays * 86400_000);

    const exhaustedInvoices = await this.prisma.invoice.findMany({
      where: { status: 'overdue', due_date: { lte: cutoff } },
      include: { items: true },
    });

    const toSuspend = exhaustedInvoices.filter(
      (inv) => inv.retry_count >= inv.max_retries,
    );
    if (toSuspend.length === 0) return;

    this.logger.log(
      `Auto-suspending services for ${toSuspend.length} exhausted invoices`,
    );

    for (const invoice of toSuspend) {
      const serviceIds = invoice.items
        .filter((i) => i.service_id)
        .map((i) => i.service_id!);

      for (const serviceId of serviceIds) {
        try {
          await this.prisma.service.update({
            where: { id: serviceId },
            data: {
              status: 'suspended',
              suspended_at: new Date(),
              suspension_reason: `Impago — Factura ${invoice.invoice_number}`,
            },
          });

          this.eventEmitter.emit('service.suspended', {
            service_id: serviceId,
            invoice_id: invoice.id,
            reason: 'payment_exhausted',
          });

          this.logger.warn(
            `Service ${serviceId} suspended due to unpaid invoice ${invoice.invoice_number}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to suspend service ${serviceId}: ${error.message}`,
          );
        }
      }
    }
  }

  /* ── 6.5 — Auto-cancellation (daily 04:00) ── */

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async autoCancelServices(): Promise<void> {
    const cancellationDays = await this.calculator.getSettingValue<number>(
      'billing',
      'cancellation_days',
      30,
    );
    const cutoff = new Date(Date.now() - cancellationDays * 86400_000);

    const suspendedServices = await this.prisma.service.findMany({
      where: { status: 'suspended', suspended_at: { lte: cutoff } },
    });

    if (suspendedServices.length === 0) return;

    this.logger.log(
      `Auto-cancelling ${suspendedServices.length} services suspended > ${cancellationDays} days`,
    );

    for (const service of suspendedServices) {
      try {
        await this.prisma.service.update({
          where: { id: service.id },
          data: {
            status: 'cancelled',
            cancelled_at: new Date(),
            cancellation_reason: `Cancelación automática — suspendido por impago > ${cancellationDays} días`,
          },
        });

        this.eventEmitter.emit('service.cancelled', {
          service_id: service.id,
          user_id: service.user_id,
          reason: 'auto_cancellation_unpaid',
        });

        this.logger.warn(
          `Service ${service.id} auto-cancelled after ${cancellationDays} days suspended`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to cancel service ${service.id}: ${error.message}`,
        );
      }
    }
  }

  /* ── 6.7 — Pause expiration (daily 05:00) ── */

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async checkPauseExpiration(): Promise<void> {
    const expiredPauses = await this.prisma.service.findMany({
      where: {
        status: 'suspended',
        paused_at: { not: null },
        pause_max_date: { lte: new Date() },
      },
    });

    if (expiredPauses.length === 0) return;

    this.logger.log(
      `Resuming ${expiredPauses.length} services with expired pause`,
    );

    for (const service of expiredPauses) {
      try {
        await this.prisma.service.update({
          where: { id: service.id },
          data: {
            status: 'active',
            paused_at: null,
            pause_max_date: null,
            suspended_at: null,
            suspension_reason: null,
          },
        });

        this.eventEmitter.emit('service.resumed', {
          service_id: service.id,
          user_id: service.user_id,
          reason: 'pause_expired',
        });

        this.logger.log(`Service ${service.id} resumed after pause expiration`);
      } catch (error) {
        this.logger.error(
          `Failed to resume service ${service.id}: ${error.message}`,
        );
      }
    }
  }
}
