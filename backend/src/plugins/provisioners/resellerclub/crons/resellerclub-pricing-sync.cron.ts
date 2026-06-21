import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { getErrorMessage } from '../../../../core/common/utils/error.util';

import { ResellerclubProvisionerPlugin } from '../resellerclub.plugin';

/**
 * Sprint 15D Fase 15D.E — `ResellerclubPricingSyncCron` (`sync-resellerclub-pricing`).
 *
 * **El writer de `domain_tld_pricing`** (hasta ahora la tabla solo se leía en el
 * checkout, 15D.B — sin productor). Materializa ADR-084 §1 + ADR-081 §8:
 *
 *   1. `plugin.getTldPricing()` → matriz de COSTE mayorista por TLD×operación×años
 *      (ADR-081 A1.1, lee `reseller-price`).
 *   2. Aplica `markup_percent` (config del plugin, default 25 %) → precio de venta.
 *   3. **Upsert** en `domain_tld_pricing` con `source='sync'`; **nunca** sobreescribe
 *      filas `source='manual'` (override del admin — ADR-084 §1).
 *
 * **Fail-safe de moneda (ADR-084 A1.2 — moneda única v1):** si el coste viene en una
 * moneda ≠ `default_currency`, la fila se OMITE + se alerta (`system.error`), nunca se
 * tarifa mal. *(En v1 el plugin etiqueta el coste con `default_currency`, así que el
 * guard es defensivo; queda correcto cuando `getTldPricing` lea la moneda real de la
 * cuenta RC — confirmación empírica diferida, DC.NEW-62.)*
 *
 * Diario @04:00 UTC (fuera de la ventana de generación de facturas, 02:00). Fail-soft:
 * un error en una fila no aborta el resto; un error de top-level se loguea (R7), el
 * cron sigue vivo. NO depende de `ReconcileRegistryModule`.
 */
@Injectable()
export class ResellerclubPricingSyncCron {
  private readonly logger = new Logger(ResellerclubPricingSyncCron.name);

  private static readonly SLUG = 'resellerclub';

  constructor(
    private readonly prisma: PrismaService,
    private readonly plugin: ResellerclubProvisionerPlugin,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('0 4 * * *', { name: 'syncResellerclubPricing', timeZone: 'UTC' })
  async handleScheduled(): Promise<void> {
    try {
      const summary = await this.runOnce();
      this.logger.log(
        `syncResellerclubPricing done: written=${summary.written} ` +
          `skipped_manual=${summary.skippedManual} ` +
          `skipped_not_offered=${summary.skippedNotOffered} ` +
          `skipped_currency=${summary.skippedCurrency} ` +
          `skipped_invalid=${summary.skippedInvalid}`,
      );
    } catch (err) {
      this.logger.error(
        `syncResellerclubPricing failed at top level: ${getErrorMessage(err)}`,
      );
    }
  }

  /** Una pasada. Público para trigger manual (admin) + tests deterministas. */
  async runOnce(): Promise<PricingSyncSummary> {
    const { config } = await this.plugin.getApiClient();
    const entries = await this.plugin.getTldPricing();

    // tlds_offered llega con punto ('.com'); el pricing usa el TLD sin punto.
    const offered = new Set(
      config.tldsOffered.map((t) => t.replace(/^\./, '').toLowerCase()),
    );

    const summary: PricingSyncSummary = {
      total: entries.length,
      written: 0,
      skippedManual: 0,
      skippedNotOffered: 0,
      skippedCurrency: 0,
      skippedInvalid: 0,
    };

    for (const entry of entries) {
      try {
        await this.syncEntry(entry, config, offered, summary);
      } catch (err) {
        summary.skippedInvalid++;
        this.logger.error(
          `syncEntry .${entry.tld}/${entry.operation}/${entry.years}a failed: ${getErrorMessage(err)}`,
        );
      }
    }
    return summary;
  }

  private async syncEntry(
    entry: PricingEntry,
    config: { markupPercent: number; defaultCurrency: string },
    offered: Set<string>,
    summary: PricingSyncSummary,
  ): Promise<void> {
    const tld = entry.tld.toLowerCase();
    if (!offered.has(tld)) {
      summary.skippedNotOffered++;
      return;
    }

    // Fail-safe de moneda (A1.2): coste en moneda ≠ venta → omitir + alertar.
    if (entry.cost.currency !== config.defaultCurrency) {
      summary.skippedCurrency++;
      this.emitCurrencyMismatch(entry, config.defaultCurrency);
      return;
    }

    const costAmount = Number(entry.cost.amount);
    if (!Number.isFinite(costAmount) || costAmount < 0) {
      summary.skippedInvalid++;
      this.logger.warn(
        `syncEntry .${tld}/${entry.operation}/${entry.years}a: coste inválido ` +
          `("${entry.cost.amount}") — fila omitida.`,
      );
      return;
    }

    const priceAmount = round2(costAmount * (1 + config.markupPercent / 100));
    const where = {
      registrar_slug_tld_operation_years_price_currency: {
        registrar_slug: ResellerclubPricingSyncCron.SLUG,
        tld,
        operation: entry.operation,
        years: entry.years,
        price_currency: config.defaultCurrency,
      },
    };

    // No sobreescribir overrides manuales del admin (ADR-084 §1).
    const existing = await this.prisma.domainTldPricing.findUnique({ where });
    if (existing && existing.source === 'manual') {
      summary.skippedManual++;
      return;
    }

    const syncedAt = new Date();
    await this.prisma.domainTldPricing.upsert({
      where,
      create: {
        registrar_slug: ResellerclubPricingSyncCron.SLUG,
        tld,
        operation: entry.operation,
        years: entry.years,
        cost_amount: new Prisma.Decimal(entry.cost.amount),
        cost_currency: config.defaultCurrency,
        price_amount: new Prisma.Decimal(priceAmount),
        price_currency: config.defaultCurrency,
        markup_percent: new Prisma.Decimal(config.markupPercent),
        source: 'sync',
        active: true,
        synced_at: syncedAt,
      },
      update: {
        cost_amount: new Prisma.Decimal(entry.cost.amount),
        cost_currency: config.defaultCurrency,
        price_amount: new Prisma.Decimal(priceAmount),
        markup_percent: new Prisma.Decimal(config.markupPercent),
        active: true,
        synced_at: syncedAt,
      },
    });
    summary.written++;
  }

  /**
   * Alerta superadmin del desajuste de moneda (R7 + ADR-084 A1.2). Vía
   * EventEmitter2 (global) — el plugin NO importa `ErrorLogModule` (que arrastra
   * `AuthModule`, rompería R4). `module` no empieza por "Notifications" → el
   * listener anti-loop lo deja pasar y notifica a los superadmins.
   */
  private emitCurrencyMismatch(
    entry: PricingEntry,
    expectedCurrency: string,
  ): void {
    this.events.emit('system.error', {
      error_log_id: '',
      level: 'error',
      module: 'provisioning.resellerclub.pricing-sync',
      message:
        `Pricing sync: .${entry.tld}/${entry.operation} en ${entry.cost.currency} ` +
        `≠ moneda de venta ${expectedCurrency} — fila omitida (no se tarifa mal, ADR-084 A1.2).`,
      correlation_id: null,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

interface PricingEntry {
  readonly tld: string;
  readonly operation: 'register' | 'renew' | 'transfer' | 'restore';
  readonly years: number;
  readonly cost: { readonly amount: string; readonly currency: string };
}

export interface PricingSyncSummary {
  total: number;
  written: number;
  skippedManual: number;
  skippedNotOffered: number;
  skippedCurrency: number;
  skippedInvalid: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
