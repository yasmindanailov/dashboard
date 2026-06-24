import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AdminDomainsService } from './admin-domains.service';

/**
 * Sprint 15D Fase 15D.G·1 — `AdminDomainsService` (gestión admin de precios).
 */
describe('AdminDomainsService', () => {
  let prisma: {
    domainTldPricing: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    service: { findUnique: jest.Mock };
  };
  let registry: { getByCapability: jest.Mock; get: jest.Mock };
  let pricingSync: { hasExecutor: jest.Mock; runFor: jest.Mock };
  let provisioning: { deprovisionAsAdmin: jest.Mock };
  let plugin: {
    capabilities: { is_domain_registrar: boolean };
    deleteDomain: jest.Mock;
  };
  let service: AdminDomainsService;

  function domainServiceRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'u1',
      domain: 'example.com',
      provider_reference: '700123',
      provisioner_slug: 'resellerclub',
      product: {
        id: 'p',
        slug: 's',
        name: 'Dominios',
        type: 'domain',
        provisioner: 'resellerclub',
        provisioner_config: null,
      },
      ...overrides,
    };
  }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: '11111111-1111-1111-1111-111111111111',
      registrar_slug: 'resellerclub',
      tld: 'com',
      operation: 'register',
      years: 1,
      cost_amount: new Prisma.Decimal('8.00'),
      cost_currency: 'EUR',
      price_amount: new Prisma.Decimal('10.00'),
      price_currency: 'EUR',
      markup_percent: new Prisma.Decimal('25.00'),
      source: 'sync',
      active: true,
      synced_at: new Date('2026-06-24T00:00:00.000Z'),
      updated_at: new Date('2026-06-24T00:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    plugin = {
      capabilities: { is_domain_registrar: true },
      deleteDomain: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      domainTldPricing: {
        findMany: jest.fn().mockResolvedValue([row()]),
        findUnique: jest.fn().mockResolvedValue(row()),
        update: jest
          .fn()
          .mockImplementation((args: { data: object }) =>
            Promise.resolve(row(args.data as Record<string, unknown>)),
          ),
      },
      service: {
        findUnique: jest.fn().mockResolvedValue(domainServiceRow()),
      },
    };
    registry = {
      getByCapability: jest.fn().mockReturnValue({ slug: 'resellerclub' }),
      get: jest.fn().mockReturnValue(plugin),
    };
    pricingSync = {
      hasExecutor: jest.fn().mockReturnValue(true),
      runFor: jest.fn().mockResolvedValue({
        total: 5,
        written: 5,
        skippedManual: 0,
        skippedNotOffered: 0,
        skippedCurrency: 0,
        skippedInvalid: 0,
      }),
    };
    provisioning = {
      deprovisionAsAdmin: jest.fn().mockResolvedValue({
        id: 'svc-1',
        status: 'cancelled',
        cancellation_reason: 'admin_override',
      }),
    };
    service = new AdminDomainsService(
      prisma as never,
      registry as never,
      pricingSync as never,
      provisioning as never,
    );
  });

  it('listPricing mapea decimales a strings + calcula margen efectivo', async () => {
    const rows = await service.listPricing({});
    expect(rows).toHaveLength(1);
    expect(rows[0].cost_amount).toBe('8.00');
    expect(rows[0].price_amount).toBe('10.00');
    expect(rows[0].effective_margin_pct).toBe('25.00'); // (10-8)/8 = 25%
    expect(rows[0].source).toBe('sync');
  });

  it('syncNow resuelve el registrar por capability y delega', async () => {
    const summary = await service.syncNow();
    expect(registry.getByCapability).toHaveBeenCalledWith(
      'is_domain_registrar',
    );
    expect(pricingSync.runFor).toHaveBeenCalledWith('resellerclub');
    expect(summary.written).toBe(5);
  });

  it('syncNow sin registrar instalado → ServiceUnavailable', async () => {
    registry.getByCapability.mockReturnValue(null);
    await expect(service.syncNow()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('setManualPrice fija source=manual + markup null', async () => {
    const result = await service.setManualPrice(row().id, 14.5);
    const updateArg = (
      prisma.domainTldPricing.update.mock.calls as Array<
        [{ data: { source: string; markup_percent: unknown } }]
      >
    )[0][0];
    expect(updateArg.data.source).toBe('manual');
    expect(updateArg.data.markup_percent).toBeNull();
    expect(result.source).toBe('manual');
  });

  it('setManualPrice por debajo del coste → BadRequest (DOM-INV-3)', async () => {
    await expect(service.setManualPrice(row().id, 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.domainTldPricing.update).not.toHaveBeenCalled();
  });

  it('setManualPrice de fila inexistente → NotFound', async () => {
    prisma.domainTldPricing.findUnique.mockResolvedValue(null);
    await expect(service.setManualPrice('x', 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revertToAuto fija source=sync', async () => {
    await service.revertToAuto(row().id);
    const updateArg = (
      prisma.domainTldPricing.update.mock.calls as Array<
        [{ data: { source: string } }]
      >
    )[0][0];
    expect(updateArg.data.source).toBe('sync');
  });

  const ACTOR = { userId: 'admin-1', ipAddress: '1.2.3.4', userAgent: 'x' };

  it('deleteDomain borra en el registrar y cancela el servicio', async () => {
    const res = await service.deleteDomain('svc-1', 'fraude', ACTOR);
    expect(plugin.deleteDomain).toHaveBeenCalledTimes(1);
    expect(provisioning.deprovisionAsAdmin).toHaveBeenCalledWith(
      'svc-1',
      expect.objectContaining({ notes: 'fraude' }),
      'admin-1',
      expect.objectContaining({ ipAddress: '1.2.3.4' }),
    );
    expect(res.status).toBe('cancelled');
  });

  it('deleteDomain de un servicio que no es dominio → BadRequest', async () => {
    prisma.service.findUnique.mockResolvedValue(
      domainServiceRow({ product: { type: 'hosting_web', provisioner: 'x' } }),
    );
    await expect(
      service.deleteDomain('svc-1', 'x', ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(plugin.deleteDomain).not.toHaveBeenCalled();
  });

  it('deleteDomain sin provider_reference → BadRequest', async () => {
    prisma.service.findUnique.mockResolvedValue(
      domainServiceRow({ provider_reference: null }),
    );
    await expect(
      service.deleteDomain('svc-1', 'x', ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deleteDomain si el registrar no lo soporta → ServiceUnavailable', async () => {
    registry.get.mockReturnValue({
      capabilities: { is_domain_registrar: true },
    }); // sin deleteDomain
    await expect(
      service.deleteDomain('svc-1', 'x', ACTOR),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('deleteDomain de servicio inexistente → NotFound', async () => {
    prisma.service.findUnique.mockResolvedValue(null);
    await expect(
      service.deleteDomain('svc-1', 'x', ACTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
