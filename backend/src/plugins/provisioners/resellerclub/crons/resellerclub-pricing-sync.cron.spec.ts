// `unbound-method` da falsos positivos en specs Jest con
// `expect(mock.method).toHaveBeenCalled()`. Deshabilitado a nivel de archivo.

import { ResellerclubPricingSyncCron } from './resellerclub-pricing-sync.cron';

/**
 * Tests unit `ResellerclubPricingSyncCron` — Fase 15D.E (writer de domain_tld_pricing).
 *
 * Cobertura:
 *   - markup aplicado sobre el coste → precio de venta, upsert source='sync'.
 *   - fail-safe moneda (A1.2): coste en moneda ≠ venta → omite + system.error.
 *   - preserva overrides manuales (source='manual' no se sobreescribe).
 *   - TLD fuera de tlds_offered → omitido.
 *   - coste inválido (no numérico) → omitido.
 */
describe('ResellerclubPricingSyncCron — Fase 15D.E', () => {
  let prisma: {
    domainTldPricing: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let plugin: { getApiClient: jest.Mock; getTldPricing: jest.Mock };
  let events: { emit: jest.Mock };
  let cron: ResellerclubPricingSyncCron;

  const CONFIG = {
    markupPercent: 25,
    defaultCurrency: 'EUR',
    tldsOffered: ['.com', '.es'],
  };

  beforeEach(() => {
    prisma = {
      domainTldPricing: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    plugin = {
      getApiClient: jest.fn().mockResolvedValue({ client: {}, config: CONFIG }),
      getTldPricing: jest.fn().mockResolvedValue([]),
    };
    events = { emit: jest.fn() };
    cron = new ResellerclubPricingSyncCron(
      prisma as never,
      plugin as never,
      events as never,
    );
  });

  function costEntry(
    tld: string,
    operation: string,
    amount: string,
    currency = 'EUR',
  ) {
    return { tld, operation, years: 1, cost: { amount, currency } };
  }

  it('markup 25% sobre coste 8.00 → precio 10.00, upsert source=sync', async () => {
    plugin.getTldPricing.mockResolvedValue([
      costEntry('com', 'register', '8.00'),
    ]);

    const summary = await cron.runOnce();

    expect(summary.written).toBe(1);
    const arg = (
      prisma.domainTldPricing.upsert.mock.calls as Array<
        [{ create: { price_amount: { toString(): string }; source: string } }]
      >
    )[0][0];
    expect(arg.create.price_amount.toString()).toBe('10');
    expect(arg.create.source).toBe('sync');
  });

  it('fail-safe moneda: coste en USD ≠ EUR → omite + emite system.error', async () => {
    plugin.getTldPricing.mockResolvedValue([
      costEntry('com', 'register', '8.00', 'USD'),
    ]);

    const summary = await cron.runOnce();

    expect(summary.written).toBe(0);
    expect(summary.skippedCurrency).toBe(1);
    expect(prisma.domainTldPricing.upsert).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'system.error',
      expect.objectContaining({
        module: 'provisioning.resellerclub.pricing-sync',
      }),
    );
  });

  it('preserva override manual: source=manual → no sobreescribe', async () => {
    plugin.getTldPricing.mockResolvedValue([
      costEntry('com', 'register', '8.00'),
    ]);
    prisma.domainTldPricing.findUnique.mockResolvedValue({ source: 'manual' });

    const summary = await cron.runOnce();

    expect(summary.skippedManual).toBe(1);
    expect(prisma.domainTldPricing.upsert).not.toHaveBeenCalled();
  });

  it('sobreescribe fila sync existente (upsert update)', async () => {
    plugin.getTldPricing.mockResolvedValue([costEntry('com', 'renew', '9.00')]);
    prisma.domainTldPricing.findUnique.mockResolvedValue({ source: 'sync' });

    const summary = await cron.runOnce();

    expect(summary.written).toBe(1);
    expect(prisma.domainTldPricing.upsert).toHaveBeenCalledTimes(1);
  });

  it('TLD fuera de tlds_offered → omitido', async () => {
    plugin.getTldPricing.mockResolvedValue([
      costEntry('io', 'register', '40.00'),
    ]);

    const summary = await cron.runOnce();

    expect(summary.skippedNotOffered).toBe(1);
    expect(prisma.domainTldPricing.upsert).not.toHaveBeenCalled();
  });

  it('coste inválido (no numérico) → omitido', async () => {
    plugin.getTldPricing.mockResolvedValue([
      costEntry('com', 'register', 'N/A'),
    ]);

    const summary = await cron.runOnce();

    expect(summary.skippedInvalid).toBe(1);
    expect(prisma.domainTldPricing.upsert).not.toHaveBeenCalled();
  });
});
