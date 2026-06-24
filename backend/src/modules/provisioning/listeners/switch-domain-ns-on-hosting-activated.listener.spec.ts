import { SwitchDomainNsOnHostingActivatedListener } from './switch-domain-ns-on-hosting-activated.listener';

/**
 * Sprint 15D Fase 15D.F.3 — detección del listener
 * (ADR-082 Amendment "dominio-solo aparca en el registrar").
 */
describe('SwitchDomainNsOnHostingActivatedListener', () => {
  let prisma: {
    service: { findUnique: jest.Mock; findFirst: jest.Mock };
  };
  let nsLifecycle: { switchToAeliumIfParked: jest.Mock };
  let listener: SwitchDomainNsOnHostingActivatedListener;

  beforeEach(() => {
    prisma = {
      service: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    nsLifecycle = {
      switchToAeliumIfParked: jest.fn().mockResolvedValue(undefined),
    };
    listener = new SwitchDomainNsOnHostingActivatedListener(
      prisma as never,
      nsLifecycle as never,
    );
  });

  const payload = {
    service_id: 'host-1',
    user_id: 'u1',
    correlation_id: 'c1',
  };

  it('hosting activado con dominio Aelium hermano → delega el switch', async () => {
    prisma.service.findUnique.mockResolvedValue({
      domain: 'Example.COM',
      user_id: 'u1',
      product: { type: 'hosting_web' },
    });
    prisma.service.findFirst.mockResolvedValue({ id: 'dom-1' });

    await listener.handle(payload);

    const whereArg = (
      prisma.service.findFirst.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >
    )[0][0].where;
    expect(whereArg).toMatchObject({
      user_id: 'u1',
      status: 'active',
      product: { type: 'domain' },
      domain: { equals: 'example.com', mode: 'insensitive' },
    });
    expect(nsLifecycle.switchToAeliumIfParked).toHaveBeenCalledWith('dom-1');
  });

  it('servicio no-hosting (el propio dominio activándose) → no-op', async () => {
    prisma.service.findUnique.mockResolvedValue({
      domain: 'example.com',
      user_id: 'u1',
      product: { type: 'domain' },
    });

    await listener.handle({ ...payload, service_id: 'dom-1' });

    expect(prisma.service.findFirst).not.toHaveBeenCalled();
    expect(nsLifecycle.switchToAeliumIfParked).not.toHaveBeenCalled();
  });

  it('hosting sin dominio Aelium hermano (F3 BYOD externo) → no-op', async () => {
    prisma.service.findUnique.mockResolvedValue({
      domain: 'external.com',
      user_id: 'u1',
      product: { type: 'hosting_web' },
    });
    prisma.service.findFirst.mockResolvedValue(null);

    await listener.handle(payload);

    expect(nsLifecycle.switchToAeliumIfParked).not.toHaveBeenCalled();
  });

  it('hosting sin domain (FQDN nulo) → no-op', async () => {
    prisma.service.findUnique.mockResolvedValue({
      domain: null,
      user_id: 'u1',
      product: { type: 'hosting_web' },
    });

    await listener.handle(payload);

    expect(prisma.service.findFirst).not.toHaveBeenCalled();
    expect(nsLifecycle.switchToAeliumIfParked).not.toHaveBeenCalled();
  });
});
