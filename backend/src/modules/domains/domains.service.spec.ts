import { ServiceUnavailableException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DomainsService } from './domains.service';

/**
 * Tests unit `DomainsService.checkAvailability` — Sprint 15D Fase 15D.F.2.
 *
 * Cobertura:
 *   - happy: TLD disponible con precio → purchasable + precio server-side.
 *   - no disponible / premium → purchasable:false (premium bloqueado v1).
 *   - error del registrar por-TLD → error:true SIN tumbar el lote.
 *   - sin registrar (capability) → ServiceUnavailableException.
 *   - TLDs solicitados se intersecan con los tarifados (lo no-tarifado no se vende).
 *   - sin TLDs tarifados → results vacío.
 */
describe('DomainsService.checkAvailability — Sprint 15D Fase 15D.F.2', () => {
  let registry: { getByCapability: jest.Mock };
  let prisma: { domainTldPricing: { findMany: jest.Mock } };
  let checkDomainAvailability: jest.Mock;
  let service: DomainsService;

  function pricingRow(tld: string, amount: string) {
    return {
      tld,
      price_amount: new Prisma.Decimal(amount),
      price_currency: 'EUR',
    };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    checkDomainAvailability = jest.fn();
    registry = {
      getByCapability: jest.fn().mockReturnValue({
        slug: 'resellerclub',
        checkDomainAvailability,
      }),
    };
    prisma = { domainTldPricing: { findMany: jest.fn() } };
    service = new DomainsService(registry as never, prisma as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('happy: disponible+tarifado → purchasable + precio; .es ocupado → no purchasable', async () => {
    prisma.domainTldPricing.findMany.mockResolvedValue([
      pricingRow('com', '10.00'),
      pricingRow('es', '6.00'),
    ]);
    checkDomainAvailability.mockImplementation((fqdn: string) =>
      Promise.resolve({
        domain: fqdn,
        available: !fqdn.endsWith('.es'),
        premium: false,
      }),
    );

    const res = await service.checkAvailability({ sld: 'aeliumtest' });

    expect(res.sld).toBe('aeliumtest');
    const com = res.results.find((r) => r.tld === 'com');
    const es = res.results.find((r) => r.tld === 'es');
    expect(com).toMatchObject({
      fqdn: 'aeliumtest.com',
      available: true,
      premium: false,
      purchasable: true,
      price: { amount: '10.00', currency: 'EUR' },
    });
    expect(es).toMatchObject({ available: false, purchasable: false });
    expect(es?.price).toBeUndefined();
  });

  it('premium → bloqueado v1 (purchasable:false, sin precio)', async () => {
    prisma.domainTldPricing.findMany.mockResolvedValue([
      pricingRow('com', '10.00'),
    ]);
    checkDomainAvailability.mockResolvedValue({
      domain: 'super.com',
      available: true,
      premium: true,
    });

    const res = await service.checkAvailability({ sld: 'super' });

    expect(res.results[0]).toMatchObject({
      premium: true,
      purchasable: false,
    });
    expect(res.results[0].price).toBeUndefined();
  });

  it('error del registrar por-TLD → error:true sin tumbar el resto del lote', async () => {
    prisma.domainTldPricing.findMany.mockResolvedValue([
      pricingRow('com', '10.00'),
      pricingRow('net', '12.00'),
    ]);
    checkDomainAvailability.mockImplementation((fqdn: string) =>
      fqdn.endsWith('.net')
        ? Promise.reject(new Error('RC down'))
        : Promise.resolve({ domain: fqdn, available: true, premium: false }),
    );

    const res = await service.checkAvailability({ sld: 'x' });

    expect(res.results.find((r) => r.tld === 'com')?.purchasable).toBe(true);
    expect(res.results.find((r) => r.tld === 'net')).toMatchObject({
      error: true,
      available: false,
      purchasable: false,
    });
  });

  it('sin registrar (capability) → ServiceUnavailableException', async () => {
    registry.getByCapability.mockReturnValue(null);
    await expect(
      service.checkAvailability({ sld: 'x' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('TLDs solicitados se intersecan con los tarifados', async () => {
    prisma.domainTldPricing.findMany.mockResolvedValue([
      pricingRow('com', '10.00'),
    ]);
    checkDomainAvailability.mockResolvedValue({
      domain: 'x.com',
      available: true,
      premium: false,
    });

    // pide com (tarifado) + io (no tarifado) → solo com se consulta.
    const res = await service.checkAvailability({
      sld: 'x',
      tlds: ['.com', 'io'],
    });

    expect(res.results).toHaveLength(1);
    expect(res.results[0].tld).toBe('com');
    expect(checkDomainAvailability).toHaveBeenCalledTimes(1);
  });

  it('sin TLDs tarifados → results vacío (no llama al registrar)', async () => {
    prisma.domainTldPricing.findMany.mockResolvedValue([]);
    const res = await service.checkAvailability({ sld: 'x' });
    expect(res.results).toEqual([]);
    expect(checkDomainAvailability).not.toHaveBeenCalled();
  });
});
