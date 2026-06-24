import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { OutboxService } from '../../core/outbox/outbox.service';
import { getErrorMessage } from '../../core/common/utils/error.util';
import { BillingService } from './billing.service';
import { BillingCalculatorService } from './billing-calculator.service';

/**
 * BillingLifecycleWorker — Invoice-centric scheduled jobs.
 *
 * Handles:
 * - Invoice generation (X days before service due date) — 6.4
 * - Overdue detection (pending invoices past due date) — 6.8
 * - Payment retry cycle (overdue → retry) — 6.4
 *
 * Service lifecycle automation (suspend/cancel/pause) is in
 * ServiceLifecycleWorker per ARCHITECTURE.md Regla 15.
 *
 * Refs: DECISIONS.md §12, §21
 */
@Injectable()
export class BillingLifecycleWorker {
  private readonly logger = new Logger('BillingLifecycleWorker');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly billingService: BillingService,
    private readonly calculator: BillingCalculatorService,
  ) {}

  /* ── 6.8 — Overdue detection (daily 01:00) ── */

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async detectOverdueInvoices(): Promise<void> {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: { status: 'pending', due_date: { lt: new Date() } },
    });

    if (overdueInvoices.length === 0) return;
    this.logger.log(`Marking ${overdueInvoices.length} invoices as overdue`);

    for (const invoice of overdueInvoices) {
      try {
        await this.billingService.markAsOverdue(invoice.id);
      } catch (error) {
        this.logger.error(
          `Failed to mark invoice ${invoice.invoice_number} as overdue: ${getErrorMessage(error)}`,
        );
      }
    }
  }

  /* ── 6.4 — Invoice generation (daily 02:00) ── */

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generatePendingInvoices(): Promise<void> {
    const generationDays = await this.calculator.getSettingValue<number>(
      'billing',
      'invoice_generation_days',
      7,
    );
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + generationDays);

    const services = await this.prisma.service.findMany({
      where: {
        status: 'active',
        billing_cycle: { not: 'one_time' },
        next_due_date: { lte: cutoffDate },
        next_invoice_date: { lte: new Date() },
      },
      include: { product: true, billing_profile: true },
    });

    if (services.length === 0) return;
    this.logger.log(
      `Generating invoices for ${services.length} services due within ${generationDays} days`,
    );

    for (const service of services) {
      try {
        const existingInvoice = await this.prisma.invoice.findFirst({
          where: {
            user_id: service.user_id,
            status: { in: ['draft', 'pending'] },
            items: { some: { service_id: service.id } },
          },
        });

        if (existingInvoice) {
          this.logger.debug(
            `Invoice already exists for service ${service.id}, skipping`,
          );
          continue;
        }

        const cycleDays = this.billingService.getCycleDays(
          service.billing_cycle,
        );
        const periodStart = service.next_due_date!;
        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + cycleDays);

        // ADR-029: consumir el crédito sobrante de un cambio de plan antes de
        // cobrar la renovación (sin devolución de dinero). Se aplica como descuento
        // pre-IVA, acotado al importe de la renovación, y se decrementa el saldo en
        // el mismo `update` que avanza `next_invoice_date` (cron de líder único).
        const creditBalance = Number(service.credit_balance_eur);
        const creditToApply =
          creditBalance > 0
            ? Math.min(creditBalance, Number(service.amount))
            : 0;

        await this.billingService.createInvoice({
          user_id: service.user_id,
          billing_profile_id: service.billing_profile_id ?? undefined,
          due_date: service.next_due_date!.toISOString(),
          currency: service.currency,
          discount_amount: creditToApply > 0 ? creditToApply : undefined,
          items: [
            {
              service_id: service.id,
              product_id: service.product_id,
              description: `${service.product.name} — ${service.label || service.domain || 'Servicio'}`,
              quantity: 1,
              unit_price: Number(service.amount),
              period_start: periodStart.toISOString(),
              period_end: periodEnd.toISOString(),
            },
          ],
        });

        const nextInvoiceDate = new Date(service.next_due_date!);
        nextInvoiceDate.setDate(
          nextInvoiceDate.getDate() + cycleDays - generationDays,
        );

        await this.prisma.service.update({
          where: { id: service.id },
          data: {
            next_invoice_date: nextInvoiceDate,
            ...(creditToApply > 0
              ? { credit_balance_eur: { decrement: creditToApply } }
              : {}),
          },
        });

        if (creditToApply > 0) {
          this.logger.log(
            `Service ${service.id}: ${creditToApply} ${service.currency} de ` +
              `crédito (ADR-029) aplicados a la renovación.`,
          );
        }

        this.logger.log(
          `Invoice generated for service ${service.id} (${service.product.name})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to generate invoice for service ${service.id}: ${getErrorMessage(error)}`,
        );
      }
    }
  }

  /* ── 6.4 — Payment retry (every 6 hours) ── */

  @Cron(CronExpression.EVERY_6_HOURS)
  async retryOverduePayments(): Promise<void> {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: { status: 'overdue', next_retry_at: { lte: new Date() } },
    });

    const toRetry = overdueInvoices.filter(
      (inv) => inv.retry_count < inv.max_retries,
    );
    if (toRetry.length === 0) return;

    this.logger.log(`Retrying payment for ${toRetry.length} overdue invoices`);
    const retryIntervalDays = await this.calculator.getSettingValue<number>(
      'billing',
      'retry_interval_days',
      3,
    );

    for (const invoice of toRetry) {
      try {
        const provider = this.billingService.getPaymentProvider();
        const result = await provider.createPayment({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          total: Number(invoice.total),
          currency: invoice.currency,
          user_email: '',
          description: `Reintento de cobro — Factura ${invoice.invoice_number}`,
        });

        if (result.success && provider.name !== 'manual') {
          await this.billingService.markAsPaid(invoice.id, {
            payment_provider: result.provider,
            payment_method: result.payment_method,
            payment_ref: result.external_id,
          });
          this.logger.log(
            `Invoice ${invoice.invoice_number} paid on retry #${invoice.retry_count + 1}`,
          );
        } else {
          const nextRetry = new Date();
          nextRetry.setDate(nextRetry.getDate() + retryIntervalDays);

          await this.prisma.$transaction(async (tx) => {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                retry_count: { increment: 1 },
                next_retry_at: nextRetry,
              },
            });
            await this.outbox.enqueue(tx, 'invoice.failed', {
              invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              user_id: invoice.user_id,
              retry_count: invoice.retry_count + 1,
              max_retries: invoice.max_retries,
            });
          });

          this.logger.warn(
            `Invoice ${invoice.invoice_number} retry #${invoice.retry_count + 1} failed — next retry at ${nextRetry.toISOString()}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Payment retry failed for ${invoice.invoice_number}: ${getErrorMessage(error)}`,
        );
      }
    }
  }
}
