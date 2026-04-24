import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/* ═══════════════════════════════════════
   Billing Calculator — Pure calculation logic
   Extracted from billing.service.ts per Regla 15.

   Handles:
   - Invoice item totals (subtotal, tax, discount)
   - Proration credit for cycle changes (DECISIONS.md §21)
   - Cycle-to-days mapping
   - Settings helpers
   ═══════════════════════════════════════ */

export interface CalculatedItem {
  service_id?: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  setup_fee: number;
  discount_pct?: number;
  total: number;
  period_start?: Date;
  period_end?: Date;
}

export interface InvoiceTotals {
  calculatedItems: CalculatedItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
}

export interface ProrationResult {
  dailyRate: number;
  unusedDays: number;
  credit: number;
  newCharge: number;
  totalDue: number;
}

@Injectable()
export class BillingCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate invoice item totals with tax.
   * Applies per-item discount percentages and setup fees.
   */
  async calculateInvoiceTotals(
    items: Array<{
      service_id?: string;
      product_id?: string;
      description: string;
      quantity?: number;
      unit_price: number;
      setup_fee?: number;
      discount_pct?: number;
      period_start?: string;
      period_end?: string;
    }>,
    taxRateOverride?: number,
    discountAmount = 0,
  ): Promise<InvoiceTotals> {
    const taxRate = taxRateOverride ?? (await this.getSettingValue<number>('billing', 'default_tax_rate', 21));

    const calculatedItems: CalculatedItem[] = items.map((item) => {
      const qty = item.quantity ?? 1;
      const baseTotal = qty * item.unit_price;
      const setupFee = item.setup_fee ?? 0;
      const discountPct = item.discount_pct ?? 0;
      const discountAmt = baseTotal * (discountPct / 100);
      const itemTotal = baseTotal - discountAmt + setupFee;

      return {
        service_id: item.service_id,
        product_id: item.product_id,
        description: item.description,
        quantity: qty,
        unit_price: item.unit_price,
        setup_fee: setupFee,
        discount_pct: item.discount_pct,
        total: Math.round(itemTotal * 100) / 100,
        period_start: item.period_start ? new Date(item.period_start) : undefined,
        period_end: item.period_end ? new Date(item.period_end) : undefined,
      };
    });

    const subtotal = calculatedItems.reduce((sum, item) => sum + item.total, 0);
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
    const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

    return { calculatedItems, subtotal, taxAmount, total, taxRate };
  }

  /**
   * Calculate proration credit when switching billing cycles.
   * Returns the credit amount for unused days.
   *
   * DECISIONS.md §21:
   * - Daily price = plan price / days in period
   * - Credit = unused days × daily price
   * - Credit is deducted from new plan — never refunded
   */
  calculateProration(params: {
    currentAmount: number;
    currentCycleDays: number;
    daysUsed: number;
    newAmount: number;
  }): ProrationResult {
    const { currentAmount, currentCycleDays, daysUsed, newAmount } = params;

    const dailyRate = currentAmount / currentCycleDays;
    const unusedDays = Math.max(0, currentCycleDays - daysUsed);
    const credit = Math.round(unusedDays * dailyRate * 100) / 100;
    const totalDue = Math.max(0, Math.round((newAmount - credit) * 100) / 100);

    return {
      dailyRate: Math.round(dailyRate * 100) / 100,
      unusedDays,
      credit,
      newCharge: newAmount,
      totalDue,
    };
  }

  /**
   * Get the number of days in a billing cycle.
   */
  getCycleDays(cycle: string): number {
    const map: Record<string, number> = {
      monthly: 30,
      quarterly: 90,
      semiannual: 180,
      annual: 365,
      one_time: 0,
    };
    return map[cycle] ?? 30;
  }

  /**
   * Read a setting value from the settings table with a fallback default.
   */
  async getSettingValue<T>(category: string, key: string, defaultValue: T): Promise<T> {
    const setting = await this.prisma.setting.findUnique({
      where: { category_key: { category, key } },
    });

    if (!setting) return defaultValue;

    const val = setting.value as { value?: T };
    return val.value ?? defaultValue;
  }
}
