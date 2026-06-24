jest.mock('../../core/provisioning/plugin-utils', () => ({
  executeActionWithCacheInvalidation: jest.fn(),
}));

import { executeActionWithCacheInvalidation } from '../../core/provisioning/plugin-utils';
import { DomainNsLifecycleService } from './domain-ns-lifecycle.service';

/**
 * Sprint 15D Fase 15D.F.3 — guardas de `switchToAeliumIfParked`
 * (ADR-082 Amendment "dominio-solo aparca en el registrar").
 */
describe('DomainNsLifecycleService.switchToAeliumIfParked', () => {
  const execMock = executeActionWithCacheInvalidation as jest.Mock;

  const AELIUM = ['ns1.aelium.net', 'ns2.aelium.net'];
  const PARKING = ['dns1.resellerclub.com', 'dns2.resellerclub.com'];

  let prisma: {
    service: { findUnique: jest.Mock; update: jest.Mock };
  };
  let registry: { get: jest.Mock };
  let settings: { getJson: jest.Mock };
  let service: DomainNsLifecycleService;

  beforeEach(() => {
    execMock.mockReset();
    execMock.mockResolvedValue({ success: true });

    prisma = {
      service: { findUnique: jest.fn(), update: jest.fn() },
    };
    registry = {
      get: jest
        .fn()
        .mockReturnValue({ capabilities: { is_domain_registrar: true } }),
    };
    settings = {
      getJson: jest
        .fn()
        .mockImplementation((_cat: string, key: string) =>
          Promise.resolve(
            key === 'registrar_parking_nameservers' ? PARKING : AELIUM,
          ),
        ),
    };

    service = new DomainNsLifecycleService(
      prisma as never,
      registry as never,
      {} as never,
      {} as never,
      {} as never,
      settings as never,
      {} as never,
    );
  });

  function domainRow(metadata: Record<string, unknown>) {
    return {
      id: 'dom-1',
      user_id: 'u1',
      domain: 'example.com',
      provider_reference: '700123',
      provisioner_slug: 'resellerclub',
      metadata,
      product: {
        id: 'p',
        slug: 's',
        name: 'n',
        type: 'domain',
        provisioner: 'resellerclub',
        provisioner_config: null,
      },
    };
  }

  it('NS == parking → conmuta a Aelium + persiste metadata.nameservers', async () => {
    prisma.service.findUnique.mockResolvedValue(
      domainRow({ nameservers: PARKING }),
    );

    await service.switchToAeliumIfParked('dom-1');

    expect(execMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'modify_nameservers',
      { nameservers: AELIUM },
      expect.objectContaining({ actorUserId: null, actorIsAdmin: true }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    const updateArg = (
      prisma.service.update.mock.calls as Array<
        [
          {
            where: { id: string };
            data: { metadata: { nameservers: string[] } };
          },
        ]
      >
    )[0][0];
    expect(updateArg.where).toEqual({ id: 'dom-1' });
    expect(updateArg.data.metadata.nameservers).toEqual(AELIUM);
  });

  it('NS ya == Aelium → no-op (F1/F2)', async () => {
    prisma.service.findUnique.mockResolvedValue(
      domainRow({ nameservers: AELIUM }),
    );

    await service.switchToAeliumIfParked('dom-1');

    expect(execMock).not.toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('NS custom (no parking) → no-clobber, no-op', async () => {
    prisma.service.findUnique.mockResolvedValue(
      domainRow({ nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'] }),
    );

    await service.switchToAeliumIfParked('dom-1');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('plugin no es registrar → no-op (defensivo)', async () => {
    registry.get.mockReturnValue({
      capabilities: { is_domain_registrar: false },
    });
    prisma.service.findUnique.mockResolvedValue(
      domainRow({ nameservers: PARKING }),
    );

    await service.switchToAeliumIfParked('dom-1');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('dominio sin provider_reference → no-op', async () => {
    prisma.service.findUnique.mockResolvedValue({
      ...domainRow({ nameservers: PARKING }),
      provider_reference: null,
    });

    await service.switchToAeliumIfParked('dom-1');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('modify_nameservers no exitoso → fail-soft (no persiste metadata)', async () => {
    execMock.mockResolvedValue({
      success: false,
      message: 'action.provider_error',
    });
    prisma.service.findUnique.mockResolvedValue(
      domainRow({ nameservers: PARKING }),
    );

    await service.switchToAeliumIfParked('dom-1');

    expect(execMock).toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
  });
});
