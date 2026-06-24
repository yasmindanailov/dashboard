import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ProductPricing, Service } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { OutboxService } from '../../core/outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from './billing.service';
import { ProrationResult } from './billing-calculator.service';

/**
 * SubscriptionPlanChangeService — cambio de plan con prorrateo (ADR-029).
 *
 * Alcance (lo que la doctrina **frozen** congela): cambio de **ciclo dentro del
 * MISMO producto** (mensual ↔ anual…), prorrateo **en crédito sin devolución de
 * dinero**. El cambio entre productos/tiers distintos lo difiere la propia ADR-029
 * a "ADR futuro" — fuera de alcance.
 *
 * - **Preview** (`previewPlanChange`): lectura pura, devuelve el desglose exacto
 *   (R5: transparencia obligatoria — el cliente lo ve ANTES de confirmar).
 * - **Confirm** (`confirmPlanChange`): recalcula server-side (R5), actualiza el
 *   service al nuevo plan + período desde HOY + acumula el SOBRANTE en
 *   `credit_balance_eur`, emite `service.plan_changed` (Outbox, R8). La factura del
 *   prorrateo la genera, idempotente, `GenerateInvoiceOnPlanChangedListener`
 *   (mismo patrón que transfer/restore). **BILL-INV-3:** factura nueva, la anterior
 *   nunca se modifica.
 *
 * Separado de `SubscriptionService` por Regla 15 (responsabilidad única).
 */
@Injectable()
export class SubscriptionPlanChangeService {
  private readonly logger = new Logger(SubscriptionPlanChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Preview del prorrateo (ADR-029 §"Preview obligatorio"). No muta nada.
   */
  async previewPlanChange(
    serviceId: string,
    newPricingId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<PlanChangePreview> {
    const ctx = await this.buildContext(
      serviceId,
      newPricingId,
      userId,
      isAdmin,
    );
    return this.toPreview(ctx);
  }

  /**
   * Confirma el cambio (ADR-029 §"Cambio aplicado al confirmar"):
   *   1. Recalcula el prorrateo server-side (R5 — el importe nunca viene del cliente).
   *   2. `$transaction`: service → nuevo plan (ciclo + importe + período desde HOY)
   *      + acumula `creditRemaining` en `credit_balance_eur` (sin refund) +
   *      `outbox.enqueue('service.plan_changed')` (R8).
   *   3. La factura del prorrateo la genera el listener idempotente al consumir el
   *      evento (BILL-INV-3: nueva factura, la anterior intacta).
   * Audita (R3, best-effort).
   */
  async confirmPlanChange(
    serviceId: string,
    newPricingId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<{ service: Service; proration: PlanChangePreview }> {
    const ctx = await this.buildContext(
      serviceId,
      newPricingId,
      userId,
      isAdmin,
    );
    const {
      service,
      newPricing,
      newAmount,
      proration,
      periodStart,
      periodEnd,
    } = ctx;

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.service.update({
        where: { id: serviceId },
        data: {
          billing_cycle: newPricing.billing_cycle,
          amount: newAmount,
          // ADR-029: el nuevo período empieza HOY (mismo patrón que el checkout:
          // next_due_date = next_invoice_date = hoy + días del nuevo ciclo).
          next_due_date: periodEnd,
          next_invoice_date: periodEnd,
          credit_balance_eur: { increment: proration.creditRemaining },
        },
      });
      await this.outbox.enqueue(tx, 'service.plan_changed', {
        service_id: serviceId,
        user_id: service.user_id,
        product_id: service.product_id,
        old_billing_cycle: service.billing_cycle,
        new_billing_cycle: newPricing.billing_cycle,
        amount_to_pay: proration.totalDue,
        credit_applied: proration.credit,
        credit_remaining: proration.creditRemaining,
        currency: service.currency,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      });
      return u;
    });

    await this.audit.logChange({
      user_id: userId,
      entity_type: 'Service',
      entity_id: serviceId,
      action: 'plan_changed',
      changes_before: {
        billing_cycle: service.billing_cycle,
        amount: Number(service.amount),
      },
      changes_after: {
        billing_cycle: newPricing.billing_cycle,
        amount: newAmount,
        credit_remaining_eur: proration.creditRemaining,
      },
    });

    this.logger.log(
      `Service ${serviceId} plan changed → ${newPricing.billing_cycle} ` +
        `(${newAmount} ${service.currency}); amount_to_pay=${proration.totalDue}, ` +
        `surplus=${proration.creditRemaining} (actor ${userId})`,
    );

    return { service: updated, proration: this.toPreview(ctx) };
  }

  /* ── helpers ── */

  /**
   * Carga + valida el contexto y calcula el prorrateo. Restricciones ADR-029:
   * servicio activo, ownership (salvo admin), mismo producto, cambio de ciclo,
   * misma moneda.
   */
  private async buildContext(
    serviceId: string,
    newPricingId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<PlanChangeContext> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });
    // NotFound (no BadRequest) si no es suyo: no filtrar la existencia de servicios ajenos.
    if (!service || (!isAdmin && service.user_id !== userId)) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (service.status !== 'active') {
      throw new BadRequestException(
        'Solo servicios activos pueden cambiar de plan.',
      );
    }

    const newPricing = await this.prisma.productPricing.findUnique({
      where: { id: newPricingId },
    });
    if (!newPricing) {
      throw new NotFoundException('Plan de precio no encontrado.');
    }
    // ADR-029: solo entre planes del MISMO producto.
    if (newPricing.product_id !== service.product_id) {
      throw new BadRequestException(
        'Solo puedes cambiar entre planes del mismo producto.',
      );
    }
    // ADR-029: solo entre CICLOS (mensual ↔ anual…) — no el ciclo actual.
    if (newPricing.billing_cycle === service.billing_cycle) {
      throw new BadRequestException(
        'Ese es el ciclo actual; elige un ciclo distinto.',
      );
    }
    // Moneda única (el prorrateo no convierte divisa).
    if (newPricing.currency !== service.currency) {
      throw new BadRequestException(
        'No se puede cambiar a un plan en otra moneda.',
      );
    }

    const currentCycleDays = this.billingService.getCycleDays(
      service.billing_cycle,
    );
    const newCycleDays = this.billingService.getCycleDays(
      newPricing.billing_cycle,
    );
    const newAmount = this.applyPricingDiscount(newPricing);

    const now = new Date();
    const currentPeriodStart = new Date(service.next_due_date ?? now);
    currentPeriodStart.setDate(currentPeriodStart.getDate() - currentCycleDays);
    const daysUsed = Math.max(
      0,
      Math.floor(
        (now.getTime() - currentPeriodStart.getTime()) / (24 * 60 * 60 * 1000),
      ),
    );

    const proration = this.billingService.calculateProration({
      currentAmount: Number(service.amount),
      currentCycleDays,
      daysUsed,
      newAmount,
    });

    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + newCycleDays);

    return {
      service,
      newPricing,
      newAmount,
      daysUsed,
      proration,
      periodStart: now,
      periodEnd,
    };
  }

  /** Precio efectivo del plan (aplica su `discount_percentage`, igual que el checkout). */
  private applyPricingDiscount(pricing: ProductPricing): number {
    const base = Number(pricing.price);
    const pct = pricing.discount_percentage
      ? Number(pricing.discount_percentage)
      : 0;
    return pct > 0 ? Math.round(base * (1 - pct / 100) * 100) / 100 : base;
  }

  /** Desglose para la UI (ADR-029 §"Preview obligatorio"). */
  private toPreview(ctx: PlanChangeContext): PlanChangePreview {
    const { service, newPricing, newAmount, daysUsed, proration } = ctx;
    return {
      current_plan: {
        billing_cycle: service.billing_cycle,
        amount: Number(service.amount),
      },
      new_plan: {
        billing_cycle: newPricing.billing_cycle,
        amount: newAmount,
      },
      currency: service.currency,
      days_consumed: daysUsed,
      days_remaining: proration.unusedDays,
      daily_price_current: proration.dailyRate,
      credit_eur: proration.credit,
      amount_to_pay: proration.totalDue,
      credit_remaining_eur: proration.creditRemaining,
      new_period_start: ctx.periodStart.toISOString(),
      new_period_end: ctx.periodEnd.toISOString(),
    };
  }
}

interface PlanChangeContext {
  service: Service;
  newPricing: ProductPricing;
  newAmount: number;
  daysUsed: number;
  proration: ProrationResult;
  periodStart: Date;
  periodEnd: Date;
}

export interface PlanChangePreview {
  current_plan: { billing_cycle: string; amount: number };
  new_plan: { billing_cycle: string; amount: number };
  currency: string;
  days_consumed: number;
  days_remaining: number;
  daily_price_current: number;
  credit_eur: number;
  amount_to_pay: number;
  credit_remaining_eur: number;
  new_period_start: string;
  new_period_end: string;
}
