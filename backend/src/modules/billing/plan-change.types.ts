import { ProductPricing, Service } from '@prisma/client';

import { ProrationResult } from './billing-calculator.service';

/** Contexto interno (cargado + validado) de un cambio de plan (ADR-029). */
export interface PlanChangeContext {
  service: Service;
  newPricing: ProductPricing;
  newAmount: number;
  daysUsed: number;
  proration: ProrationResult;
  periodStart: Date;
  periodEnd: Date;
}

/** Desglose del prorrateo para la UI (ADR-029 §"Preview obligatorio", R5). */
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

/** Un plan (ciclo) al que el servicio puede cambiar. */
export interface PlanChangeOption {
  id: string;
  billing_cycle: string;
  price: number;
  currency: string;
}

/** Planes disponibles para cambiar (ciclos del mismo producto, misma moneda). */
export interface PlanChangeOptions {
  product_name: string;
  current: { billing_cycle: string; amount: number; currency: string };
  options: PlanChangeOption[];
}
