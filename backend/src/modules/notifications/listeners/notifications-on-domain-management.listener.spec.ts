import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { NotificationsService } from '../notifications.service';

import { NotificationsOnDomainManagementListener } from './notifications-on-domain-management.listener';

/**
 * Tests unit `NotificationsOnDomainManagementListener` — Sprint 15D Fase 15D.F.1.
 *
 * Cobertura:
 *   - nameservers_changed / lock_changed → dispatchToUser con fqdn + panel_url.
 *   - fqdn ausente → fallback a service_id.
 *   - respeta NEXT_PUBLIC_APP_URL.
 *   - sin user_id → omite (no dispatch).
 *   - degradación elegante (R7): dispatch falla → log, NO relanza.
 */
describe('NotificationsOnDomainManagementListener — Sprint 15D Fase 15D.F.1', () => {
  let listener: NotificationsOnDomainManagementListener;
  let dispatchToUser: jest.Mock;
  let configGet: jest.Mock;

  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    dispatchToUser = jest.fn().mockResolvedValue(undefined);
    configGet = jest
      .fn()
      .mockImplementation((_key: string, fallback: string) => fallback);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsOnDomainManagementListener,
        { provide: NotificationsService, useValue: { dispatchToUser } },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    listener = module.get(NotificationsOnDomainManagementListener);
  });

  afterEach(() => jest.restoreAllMocks());

  const base = {
    service_id: SERVICE_ID,
    user_id: USER_ID,
    fqdn: 'example.com',
  };
  const PANEL = `http://localhost:3002/dashboard/services/${SERVICE_ID}`;

  it('domain.nameservers_changed → dispatch con fqdn + panel_url', async () => {
    await listener.handleNameserversChanged({ ...base });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.nameservers_changed',
      { service_id: SERVICE_ID, fqdn: 'example.com', panel_url: PANEL },
      USER_ID,
    );
  });

  it('domain.lock_changed → dispatch con fqdn + panel_url', async () => {
    await listener.handleLockChanged({ ...base });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.lock_changed',
      { service_id: SERVICE_ID, fqdn: 'example.com', panel_url: PANEL },
      USER_ID,
    );
  });

  it('fqdn ausente → fallback a service_id', async () => {
    await listener.handleLockChanged({
      service_id: SERVICE_ID,
      user_id: USER_ID,
      fqdn: null,
    });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.lock_changed',
      expect.objectContaining({ fqdn: SERVICE_ID }),
      USER_ID,
    );
  });

  it('respeta NEXT_PUBLIC_APP_URL', async () => {
    configGet.mockImplementation((key: string, fallback: string) =>
      key === 'NEXT_PUBLIC_APP_URL' ? 'https://app.aelium.test' : fallback,
    );
    await listener.handleNameserversChanged({ ...base });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.nameservers_changed',
      expect.objectContaining({
        panel_url: `https://app.aelium.test/dashboard/services/${SERVICE_ID}`,
      }),
      USER_ID,
    );
  });

  it('sin user_id → omite (no dispatch)', async () => {
    await listener.handleNameserversChanged({
      service_id: SERVICE_ID,
      user_id: '',
      fqdn: 'example.com',
    });
    expect(dispatchToUser).not.toHaveBeenCalled();
  });

  it('dispatch falla → log + NO relanza (R7)', async () => {
    dispatchToUser.mockRejectedValueOnce(new Error('queue down'));
    await expect(
      listener.handleLockChanged({ ...base }),
    ).resolves.toBeUndefined();
  });
});
