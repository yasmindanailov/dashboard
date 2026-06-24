import { ProductPricing } from '@prisma/client';

import { PlanChangeContext, PlanChangePreview } from './plan-change.types';

/**
 * Funciones puras de mapeo del cambio de plan (ADR-029). Separadas del servicio
 * por Regla 15 (sin estado, testeables aisladas).
 */

/** Precio efectivo del plan (aplica su `discount_percentage`, igual que el checkout). */
export function applyPricingDiscount(pricing: ProductPricing): number {
  const base = Number(pricing.price);
  const pct = pricing.discount_percentage
    ? Number(pricing.discount_percentage)
    : 0;
  return pct > 0 ? Math.round(base * (1 - pct / 100) * 100) / 100 : base;
}

/** Desglose del prorrateo para la UI (ADR-029 §"Preview obligatorio", R5). */
export function buildPlanChangePreview(
  ctx: PlanChangeContext,
): PlanChangePreview {
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
