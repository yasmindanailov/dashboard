import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ProvisionerPluginError } from '../../core/provisioning/types';
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
    service = new DomainsService(
      registry as never,
      prisma as never,
      {} as never, // orchestrator no usado por checkAvailability
    );
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
    service = new DomainsService({} as never, prisma as never, {} as never);
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

/**
 * Tests unit `DomainsService.transferQuote` — Sprint 15D.II.T2c.3.
 * Precio de transfer server-side (R5) + DOM-INV-3 same-currency (offered:false).
 */
describe('DomainsService.transferQuote — Sprint 15D.II.T2c.3', () => {
  let registry: { getByCapability: jest.Mock };
  let prisma: { domainTldPricing: { findUnique: jest.Mock } };
  let service: DomainsService;

  function transferRow(overrides: Record<string, unknown> = {}) {
    return {
      active: true,
      cost_amount: new Prisma.Decimal('7.00'),
      cost_currency: 'EUR',
      price_amount: new Prisma.Decimal('9.00'),
      price_currency: 'EUR',
      ...overrides,
    };
  }

  beforeEach(() => {
    registry = {
      getByCapability: jest.fn().mockReturnValue({ slug: 'resellerclub' }),
    };
    prisma = { domainTldPricing: { findUnique: jest.fn() } };
    service = new DomainsService(
      registry as never,
      prisma as never,
      {} as never,
    );
  });

  it('happy: precio activo + margen válido → offered + precio server-side', async () => {
    prisma.domainTldPricing.findUnique.mockResolvedValue(transferRow());
    const res = await service.transferQuote('MiDominio.COM');
    expect(res).toEqual({
      fqdn: 'midominio.com',
      tld: 'com',
      offered: true,
      price: { amount: '9.00', currency: 'EUR' },
    });
    // operación `transfer`, 1 año, EUR.
    const calls = prisma.domainTldPricing.findUnique.mock.calls as Array<
      [
        {
          where: {
            registrar_slug_tld_operation_years_price_currency: {
              tld: string;
              operation: string;
              years: number;
            };
          };
        },
      ]
    >;
    expect(
      calls[0][0].where.registrar_slug_tld_operation_years_price_currency,
    ).toMatchObject({ tld: 'com', operation: 'transfer', years: 1 });
  });

  it('sin fila de precio → offered:false sin precio', async () => {
    prisma.domainTldPricing.findUnique.mockResolvedValue(null);
    const res = await service.transferQuote('midominio.io');
    expect(res).toMatchObject({
      fqdn: 'midominio.io',
      tld: 'io',
      offered: false,
    });
    expect(res.price).toBeUndefined();
  });

  it('DOM-INV-3: cost > price → offered:false (no oferta a pérdida)', async () => {
    prisma.domainTldPricing.findUnique.mockResolvedValue(
      transferRow({ cost_amount: new Prisma.Decimal('12.00') }),
    );
    const res = await service.transferQuote('midominio.com');
    expect(res.offered).toBe(false);
    expect(res.price).toBeUndefined();
  });

  it('fqdn inválido (sin punto) → BadRequestException', async () => {
    await expect(service.transferQuote('sinpunto')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sin registrar → ServiceUnavailableException', async () => {
    registry.getByCapability.mockReturnValue(null);
    await expect(service.transferQuote('x.com')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

/**
 * Tests unit `DomainsService.submitTransferAuthCode` — Sprint 15D.II.T2c.3.
 * Ownership + guarda de estado FSM + delega en `initiateTransferIn` (R12) +
 * traducción de `INVALID_AUTH_CODE` a 400 accionable.
 */
describe('DomainsService.submitTransferAuthCode — Sprint 15D.II.T2c.3', () => {
  const OWNER = 'user-1';
  let prisma: { service: { findUnique: jest.Mock; update: jest.Mock } };
  let orchestrator: { initiateTransferIn: jest.Mock };
  let service: DomainsService;

  function transferService(overrides: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: OWNER,
      status: 'pending',
      metadata: { domain_operation: 'transfer_in', transfer_state: 'pending' },
      product: { type: 'domain' },
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      service: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    orchestrator = {
      initiateTransferIn: jest.fn().mockResolvedValue(undefined),
    };
    service = new DomainsService(
      {} as never,
      prisma as never,
      orchestrator as never,
    );
  });

  it('happy: pending + dueño → llama initiateTransferIn y devuelve submitted', async () => {
    prisma.service.findUnique
      .mockResolvedValueOnce(transferService())
      .mockResolvedValueOnce({
        status: 'provisioning',
        metadata: {
          domain_operation: 'transfer_in',
          transfer_state: 'submitted',
        },
      });

    const res = await service.submitTransferAuthCode(
      'svc-1',
      ' ABC-123 ',
      OWNER,
      false,
    );

    // R12: el auth-code se pasa trim-eado a initiateTransferIn (en memoria).
    expect(orchestrator.initiateTransferIn).toHaveBeenCalledWith(
      'svc-1',
      'ABC-123',
    );
    expect(res).toEqual({
      id: 'svc-1',
      status: 'provisioning',
      transfer_state: 'submitted',
    });
  });

  it('no dueño y no admin → ForbiddenException', async () => {
    prisma.service.findUnique.mockResolvedValue(transferService());
    await expect(
      service.submitTransferAuthCode('svc-1', 'x', 'otro-user', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orchestrator.initiateTransferIn).not.toHaveBeenCalled();
  });

  it('admin puede actuar por cualquier cliente', async () => {
    prisma.service.findUnique
      .mockResolvedValueOnce(transferService())
      .mockResolvedValueOnce({
        status: 'provisioning',
        metadata: { transfer_state: 'submitted' },
      });
    await service.submitTransferAuthCode('svc-1', 'x', 'admin-user', true);
    expect(orchestrator.initiateTransferIn).toHaveBeenCalled();
  });

  it('no es transfer_in → BadRequestException', async () => {
    prisma.service.findUnique.mockResolvedValue(
      transferService({ metadata: { domain_operation: 'register' } }),
    );
    await expect(
      service.submitTransferAuthCode('svc-1', 'x', OWNER, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orchestrator.initiateTransferIn).not.toHaveBeenCalled();
  });

  it('estado submitted → BadRequestException (ya en curso)', async () => {
    prisma.service.findUnique.mockResolvedValue(
      transferService({
        metadata: {
          domain_operation: 'transfer_in',
          transfer_state: 'submitted',
        },
      }),
    );
    await expect(
      service.submitTransferAuthCode('svc-1', 'x', OWNER, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orchestrator.initiateTransferIn).not.toHaveBeenCalled();
  });

  it('reintento (A2.5): desde failed → limpia provider_reference + resetea a pending + reinicia', async () => {
    prisma.service.findUnique
      .mockResolvedValueOnce(
        transferService({
          metadata: {
            domain_operation: 'transfer_in',
            transfer_state: 'failed',
          },
        }),
      )
      .mockResolvedValueOnce({
        status: 'provisioning',
        metadata: { transfer_state: 'submitted' },
      });

    await service.submitTransferAuthCode('svc-1', 'NEW-CODE', OWNER, false);

    // Reset ANTES de reiniciar: provider_reference=null + transfer_state=pending.
    const resetArg = (
      prisma.service.update.mock.calls as Array<
        [
          {
            data: {
              provider_reference: unknown;
              metadata: Record<string, unknown>;
            };
          },
        ]
      >
    )[0][0];
    expect(resetArg.data.provider_reference).toBeNull();
    expect(resetArg.data.metadata.transfer_state).toBe('pending');
    expect(orchestrator.initiateTransferIn).toHaveBeenCalledWith(
      'svc-1',
      'NEW-CODE',
    );
  });

  it('estado pending → NO resetea (no toca provider_reference)', async () => {
    prisma.service.findUnique
      .mockResolvedValueOnce(transferService())
      .mockResolvedValueOnce({
        status: 'provisioning',
        metadata: { transfer_state: 'submitted' },
      });

    await service.submitTransferAuthCode('svc-1', 'CODE', OWNER, false);

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(orchestrator.initiateTransferIn).toHaveBeenCalled();
  });

  it('INVALID_AUTH_CODE del orquestador → 400 con code INVALID_AUTH_CODE', async () => {
    prisma.service.findUnique.mockResolvedValue(transferService());
    orchestrator.initiateTransferIn.mockRejectedValue(
      new ProvisionerPluginError('bad', 'INVALID_AUTH_CODE', false),
    );
    await expect(
      service.submitTransferAuthCode('svc-1', 'bad', OWNER, false),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_AUTH_CODE' },
    });
  });

  it('service no encontrado → NotFoundException', async () => {
    prisma.service.findUnique.mockResolvedValue(null);
    await expect(
      service.submitTransferAuthCode('nope', 'x', OWNER, false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
