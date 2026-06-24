import { ProvisionerPluginError } from '../../core/provisioning/types';

import { DomainRegistrantService } from './domain-registrant.service';

/**
 * Sprint 15D Fase 15D.G·2 — `DomainRegistrantService` (perfil de titular + auto-push).
 */
describe('DomainRegistrantService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    clientProfile: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let registry: { getByCapability: jest.Mock };
  let plugin: { updateRegistrantContact: jest.Mock };
  let service: DomainRegistrantService;

  const userRow = {
    id: 'u1',
    email: 'carla@aelium.test',
    first_name: 'Carla',
    last_name: 'Pérez',
    language: 'es',
    client_profile: {
      company_name: 'Aelium',
      tax_id: '12345678Z',
      phone: '600111222',
      address_line1: 'Calle Mayor 1',
      address_line2: null,
      city: 'Madrid',
      state: 'Madrid',
      postal_code: '28013',
      country: 'ES',
    },
  };

  beforeEach(() => {
    const tx = {
      user: { update: jest.fn().mockResolvedValue({}) },
      clientProfile: { upsert: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(userRow),
        update: jest.fn(),
      },
      clientProfile: { upsert: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    plugin = {
      updateRegistrantContact: jest.fn().mockResolvedValue({
        propagated: true,
        domainsAffected: 2,
        nameChanged: true,
      }),
    };
    registry = { getByCapability: jest.fn().mockReturnValue(plugin) };
    service = new DomainRegistrantService(prisma as never, registry as never);
  });

  it('getRegistrant mapea User + ClientProfile', async () => {
    const p = await service.getRegistrant('u1');
    expect(p.first_name).toBe('Carla');
    expect(p.email).toBe('carla@aelium.test');
    expect(p.company_name).toBe('Aelium');
    expect(p.country).toBe('ES');
  });

  it('updateRegistrant persiste (tx) y propaga al registrar', async () => {
    const res = await service.updateRegistrant('u1', { last_name: 'Gómez' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(plugin.updateRegistrantContact).toHaveBeenCalledTimes(1);
    expect(res.registrarSync).toEqual({
      propagated: true,
      domainsAffected: 2,
      nameChanged: true,
      error: null,
    });
  });

  it('sin registrar instalado → registrarSync no-op (perfil igualmente guardado)', async () => {
    registry.getByCapability.mockReturnValue(null);
    const res = await service.updateRegistrant('u1', { city: 'Sevilla' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // se guardó
    expect(res.registrarSync.propagated).toBe(false);
    expect(res.registrarSync.error).toBeNull();
  });

  it('propagación falla (REGISTRANT_INELIGIBLE) → perfil guardado + error reportado', async () => {
    plugin.updateRegistrantContact.mockRejectedValue(
      new ProvisionerPluginError(
        'Completa tu dirección.',
        'REGISTRANT_INELIGIBLE',
        false,
        undefined,
        'resellerclub',
      ),
    );
    const res = await service.updateRegistrant('u1', { phone: '' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // se guardó igualmente
    expect(res.registrarSync.propagated).toBe(false);
    expect(res.registrarSync.error).toBe('Completa tu dirección.');
  });
});
