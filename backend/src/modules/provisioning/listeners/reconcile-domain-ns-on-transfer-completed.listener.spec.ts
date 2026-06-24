import { Logger } from '@nestjs/common';

import { ReconcileDomainNsOnTransferCompletedListener } from './reconcile-domain-ns-on-transfer-completed.listener';

/**
 * Sprint 15D.II.T3 — zona DNS al completar un transfer-in (ADR-082 A5).
 * Si hay hosting hermano activo → conmuta a Aelium; sin hosting → aparca (no-op);
 * fail-soft.
 */
describe('ReconcileDomainNsOnTransferCompletedListener — Sprint 15D.II.T3', () => {
  let prisma: { service: { findUnique: jest.Mock; findFirst: jest.Mock } };
  let nsLifecycle: { switchToAeliumIfParked: jest.Mock };
  let listener: ReconcileDomainNsOnTransferCompletedListener;

  const PAYLOAD = {
    service_id: 'svc-dom',
    user_id: 'user-1',
    fqdn: 'movein.com',
  };

  function domainRow(over: Record<string, unknown> = {}) {
    return {
      domain: 'movein.com',
      user_id: 'user-1',
      product: { type: 'domain' },
      ...over,
    };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    prisma = { service: { findUnique: jest.fn(), findFirst: jest.fn() } };
    nsLifecycle = {
      switchToAeliumIfParked: jest.fn().mockResolvedValue(undefined),
    };
    listener = new ReconcileDomainNsOnTransferCompletedListener(
      prisma as never,
      nsLifecycle as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('con hosting hermano activo → conmuta a Aelium (switchToAeliumIfParked)', async () => {
    prisma.service.findUnique.mockResolvedValue(domainRow());
    prisma.service.findFirst.mockResolvedValue({ id: 'svc-host' });

    await listener.handle(PAYLOAD);

    expect(nsLifecycle.switchToAeliumIfParked).toHaveBeenCalledWith('svc-dom');
  });

  it('sin hosting hermano → no-op (aparca en el registrar)', async () => {
    prisma.service.findUnique.mockResolvedValue(domainRow());
    prisma.service.findFirst.mockResolvedValue(null);

    await listener.handle(PAYLOAD);

    expect(nsLifecycle.switchToAeliumIfParked).not.toHaveBeenCalled();
  });

  it('service no es de tipo dominio → no-op (no busca hosting)', async () => {
    prisma.service.findUnique.mockResolvedValue(
      domainRow({ product: { type: 'hosting_web' } }),
    );

    await listener.handle(PAYLOAD);

    expect(prisma.service.findFirst).not.toHaveBeenCalled();
    expect(nsLifecycle.switchToAeliumIfParked).not.toHaveBeenCalled();
  });

  it('fallo del prisma → fail-soft (no lanza, no conmuta)', async () => {
    prisma.service.findUnique.mockRejectedValue(new Error('db down'));

    await expect(listener.handle(PAYLOAD)).resolves.toBeUndefined();
    expect(nsLifecycle.switchToAeliumIfParked).not.toHaveBeenCalled();
  });
});
