import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BillingService } from './billing.service';
import { BillingCalculatorService } from './billing-calculator.service';

/**
 * BillingLifecycleWorker — Scheduled jobs for the billing engine.
 *
 * Handles:
 * - Invoice generation (X days before service due date)
 * - Payment retry cycle (overdue → retry → suspend)
 * - Auto-suspension after grace period
 * - Auto-cancellation after suspension period
 * - Auto-resume of paused services past max date
 *
 * All timings are configurable via the `settings` table (category: 'billing').
 * Refs: DECISIONS.md §12, §21
 */
@Injectable()
export class BillingLifecycleWorker {
  private readonly logger = new Logger(BillingLifecycleWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly billingService: BillingService,
    private readonly calculator: BillingCalculatorService,
  ) {}

  /* ═══════════════════════════════════════
     6.4 — INVOICE GENERATION
     Runs daily at 02:00. Generates invoices for services
     whose next_due_date is within X days from now.
     ═══════════════════════════════════════ */

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generatePendingInvoices(): Promise<void> {
    const generationDays = await this.calculator.getSettingValue<number>(
      'billing', 'invoice_generation_days', 7,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + generationDays);

    // Find active services with upcoming due dates that don't have a pending/draft invoice
    const services = await this.prisma.service.findMany({
      where: {
        status: 'active',
        billing_cycle: { not: 'one_time' },
        next_due_date: { lte: cutoffDate },
        next_invoice_date: { lte: new Date() },
      },
      include: {
        product: true,
        billing_profile: true,
      },
    });

    if (services.length === 0) return;

    this.logger.log(`Generating invoices for ${services.length} services due within ${generationDays} days`);

    for (const service of services) {
      try {
        // Check if an invoice already exists for this period
        const existingInvoice = await this.prisma.invoice.findFirst({
          where: {
            user_id: service.user_id,
            status: { in: ['draft', 'pending'] },
            items: {
              some: { service_id: service.id },
            },
          },
        });

        if (existingInvoice) {
          this.logger.debug(`Invoice already exists for service ${service.id}, skipping`);
          continue;
        }

        const cycleDays = this.billingService.getCycleDays(service.billing_cycle);
        const periodStart = service.next_due_date!;
        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + cycleDays);

        await this.billingService.createInvoice({
          user_id: service.user_id,
          billing_profile_id: service.billing_profile_id ?? undefined,
          due_date: service.next_due_date!.toISOString(),
          currency: service.currency,
          items: [{
            service_id: service.id,
            product_id: service.product_id,
            description: `${service.product.name} — ${service.label || service.domain || 'Servicio'}`,
            quantity: 1,
            unit_price: Number(service.amount),
            period_start: periodStart.toISOString(),
            period_end: periodEnd.toISOString(),
          }],
        });

        // Advance service's next_invoice_date
        const nextInvoiceDate = new Date(service.next_due_date!);
        nextInvoiceDate.setDate(nextInvoiceDate.getDate() + cycleDays - generationDays);

        await this.prisma.service.update({
          where: { id: service.id },
          data: { next_invoice_date: nextInvoiceDate },
        });

        this.logger.log(`Invoice generated for service ${service.id} (${service.product.name})`);
      } catch (error) {
        this.logger.error(`Failed to generate invoice for service ${service.id}: ${error.message}`);
      }
    }
  }

  /* ═══════════════════════════════════════
     6.4 — PAYMENT RETRY
     Runs every 6 hours. Retries payment for overdue invoices
     that haven't exceeded max retries.
     ═══════════════════════════════════════ */

  @Cron(CronExpression.EVERY_6_HOURS)
  async retryOverduePayments(): Promise<void> {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: 'overdue',
        next_retry_at: { lte: new Date() },
        retry_count: { lt: this.prisma.invoice.fields.max_retries ? undefined : 99 },
      },
    });

    // Filter in-memory: retry_count < max_retries (Prisma can't compare two fields)
    const toRetry = overdueInvoices.filter((inv) => inv.retry_count < inv.max_retries);

    if (toRetry.length === 0) return;

    this.logger.log(`Retrying payment for ${toRetry.length} overdue invoices`);

    const retryIntervalDays = await this.calculator.getSettingValue<number>(
      'billing', 'retry_interval_days', 3,
    );

    for (const invoice of toRetry) {
      try {
        // Attempt payment via active provider
        const provider = this.billingService.getPaymentProvider();
        const result = await provider.createPayment({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          total: Number(invoice.total),
          currency: invoice.currency,
          user_email: '', // TODO: resolve from user
          description: `Reintento de cobro — Factura ${invoice.invoice_number}`,
        });

        if (result.success && provider.name !== 'manual') {
          await this.billingService.markAsPaid(invoice.id, {
            payment_provider: result.provider,
            payment_method: result.payment_method,
            payment_ref: result.external_id,
          });
          this.logger.log(`Invoice ${invoice.invoice_number} paid on retry #${invoice.retry_count + 1}`);
        } else {
          // Increment retry count and schedule next retry
          const nextRetry = new Date();
          nextRetry.setDate(nextRetry.getDate() + retryIntervalDays);

          await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              retry_count: { increment: 1 },
              next_retry_at: nextRetry,
            },
          });

          this.logger.warn(
            `Invoice ${invoice.invoice_number} retry #${invoice.retry_count + 1} failed — next retry at ${nextRetry.toISOString()}`,
          );

          // Emit failed event
          this.eventEmitter.emit('invoice.failed', {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            user_id: invoice.user_id,
            retry_count: invoice.retry_count + 1,
            max_retries: invoice.max_retries,
          });
        }
      } catch (error) {
        this.logger.error(`Payment retry failed for ${invoice.invoice_number}: ${error.message}`);
      }
    }
  }

  /* ═══════════════════════════════════════
     6.5 — AUTO-SUSPENSION
     Runs daily at 03:00. Suspends services linked to
     invoices that have exhausted all payment retries.
     ═══════════════════════════════════════ */

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async autoSuspendServices(): Promise<void> {
    const suspensionDays = await this.calculator.getSettingValue<number>(
      'billing', 'suspension_days', 7,
    );

    // Find overdue invoices where retries are exhausted
    const exhaustedInvoices = await this.prisma.invoice.findMany({
      where: {
        status: 'overdue',
        due_date: { lte: new Date(Date.now() - suspensionDays * 24 * 60 * 60 * 1000) },
      },
      include: { items: true },
    });

    const toSuspend = exhaustedInvoices.filter((inv) => inv.retry_count >= inv.max_retries);

    if (toSuspend.length === 0) return;

    this.logger.log(`Auto-suspending services for ${toSuspend.length} exhausted invoices`);

    for (const invoice of toSuspend) {
      const serviceIds = invoice.items
        .filter((item) => item.service_id)
        .map((item) => item.service_id!);

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

          this.logger.warn(`Service ${serviceId} suspended due to unpaid invoice ${invoice.invoice_number}`);
        } catch (error) {
          this.logger.error(`Failed to suspend service ${serviceId}: ${error.message}`);
        }
      }
    }
  }

  /* ═══════════════════════════════════════
     6.5 — AUTO-CANCELLATION
     Runs daily at 04:00. Cancels services that have been
     suspended for longer than the cancellation period.
     ═══════════════════════════════════════ */

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async autoCancelServices(): Promise<void> {
    const cancellationDays = await this.calculator.getSettingValue<number>(
      'billing', 'cancellation_days', 30,
    );

    const cutoff = new Date(Date.now() - cancellationDays * 24 * 60 * 60 * 1000);

    const suspendedServices = await this.prisma.service.findMany({
      where: {
        status: 'suspended',
        suspended_at: { lte: cutoff },
      },
    });

    if (suspendedServices.length === 0) return;

    this.logger.log(`Auto-cancelling ${suspendedServices.length} services suspended > ${cancellationDays} days`);

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

        this.logger.warn(`Service ${service.id} auto-cancelled after ${cancellationDays} days suspended`);
      } catch (error) {
        this.logger.error(`Failed to cancel service ${service.id}: ${error.message}`);
      }
    }
  }

  /* ═══════════════════════════════════════
     6.7 — PAUSE EXPIRATION CHECK
     Runs daily at 05:00. Resumes services whose pause
     period has expired (pause_max_date passed).
     ═══════════════════════════════════════ */

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

    this.logger.log(`Resuming ${expiredPauses.length} services with expired pause`);

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
        this.logger.error(`Failed to resume service ${service.id}: ${error.message}`);
      }
    }
  }

  /* ═══════════════════════════════════════
     6.8 — OVERDUE DETECTION (grace period)
     Runs daily at 01:00. Finds pending invoices past
     their due date + grace period → marks as overdue.
     ═══════════════════════════════════════ */

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async detectOverdueInvoices(): Promise<void> {
    // Pending invoices past due_date (grace_period_days is per-product,
    // handled at invoice generation time — the due_date already includes grace)
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: 'pending',
        due_date: { lt: new Date() },
      },
    });

    if (overdueInvoices.length === 0) return;

    this.logger.log(`Marking ${overdueInvoices.length} invoices as overdue`);

    for (const invoice of overdueInvoices) {
      try {
        await this.billingService.markAsOverdue(invoice.id);
      } catch (error) {
        this.logger.error(`Failed to mark invoice ${invoice.invoice_number} as overdue: ${error.message}`);
      }
    }
  }
}
