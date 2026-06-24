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

/**
 * Tests unit `DomainsService.listMine` — Sprint 15D Fase 15D.F.4.
 */
describe('DomainsService.listMine — Sprint 15D Fase 15D.F.4', () => {
  const USER = 'user-1';
  let prisma: {
    service: { findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: DomainsService;

  beforeEach(() => {
    prisma = {
      service: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
    };
    service = new DomainsService({} as never, prisma as never);
  });

  it('mapea filas a DomainListItem (fqdn/expires_at/created_at ISO) + meta paginada', async () => {
    prisma.service.findMany.mockResolvedValue([
      {
        id: 'svc-1',
        domain: 'aelium.com',
        status: 'active',
        expires_at: new Date('2027-01-01T00:00:00.000Z'),
        next_due_date: new Date('2026-12-15T00:00:00.000Z'),
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        product: { name: 'Dominios' },
      },
    ]);
    prisma.service.count.mockResolvedValue(1);

    const res = await service.listMine(USER, {});

    expect(res.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(res.data[0]).toEqual({
      id: 'svc-1',
      fqdn: 'aelium.com',
      status: 'active',
      expires_at: '2027-01-01T00:00:00.000Z',
      next_due_date: '2026-12-15T00:00:00.000Z',
      created_at: '2026-06-01T00:00:00.000Z',
      product_name: 'Dominios',
    });
    // Filtra siempre por product.type='domain' + el usuario autenticado.
    const calls = prisma.service.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(calls[0][0].where).toMatchObject({
      user_id: USER,
      product: { type: 'domain' },
    });
  });

  it('expires_at null → null (no rompe el map)', async () => {
    prisma.service.findMany.mockResolvedValue([
      {
        id: 'svc-2',
        domain: 'pending.es',
        status: 'pending',
        expires_at: null,
        next_due_date: null,
        created_at: new Date('2026-06-02T00:00:00.000Z'),
        product: { name: 'Dominios' },
      },
    ]);
    prisma.service.count.mockResolvedValue(1);

    const res = await service.listMine(USER, { page: 1, limit: 20 });
    expect(res.data[0].expires_at).toBeNull();
    expect(res.data[0].next_due_date).toBeNull();
  });

  it('status inválido se ignora (no se inyecta en el where)', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    prisma.service.count.mockResolvedValue(0);

    await service.listMine(USER, { status: 'no-such-status' });
    const calls = prisma.service.findMany.mock.calls as Array<
      [{ where: { status?: unknown } }]
    >;
    expect(calls[0][0].where.status).toBeUndefined();
  });
});
