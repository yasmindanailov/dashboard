import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { NotificationsService } from '../notifications.service';

import { NotificationsOnDomainLifecycleListener } from './notifications-on-domain-lifecycle.listener';

/**
 * Tests unit `NotificationsOnDomainLifecycleListener` — Sprint 15D Fase 15D.E.
 *
 * Cobertura:
 *   - los 4 eventos → dispatchToUser con fqdn + panel_url (+ days_left / new_expires_at).
 *   - fqdn ausente → fallback a service_id.
 *   - respeta NEXT_PUBLIC_APP_URL.
 *   - degradación elegante (R7): dispatch falla → log, NO relanza.
 */
describe('NotificationsOnDomainLifecycleListener — Sprint 15D Fase 15D.E', () => {
  let listener: NotificationsOnDomainLifecycleListener;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsOnDomainLifecycleListener,
        { provide: NotificationsService, useValue: { dispatchToUser } },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    listener = module.get(NotificationsOnDomainLifecycleListener);
  });

  afterEach(() => jest.restoreAllMocks());

  const base = {
    service_id: SERVICE_ID,
    user_id: USER_ID,
    fqdn: 'example.com',
  };
  const PANEL = `http://localhost:3002/dashboard/services/${SERVICE_ID}`;

  it('domain.renewed → dispatch con new_expires_at + panel_url', async () => {
    await listener.handleRenewed({
      ...base,
      new_expires_at: '2027-07-01T00:00:00.000Z',
    });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.renewed',
      {
        service_id: SERVICE_ID,
        fqdn: 'example.com',
        panel_url: PANEL,
        new_expires_at: '2027-07-01T00:00:00.000Z',
      },
      USER_ID,
    );
  });

  it('domain.expiring_soon → dispatch con days_left', async () => {
    await listener.handleExpiringSoon({ ...base, days_left: 14 });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.expiring_soon',
      expect.objectContaining({ fqdn: 'example.com', days_left: 14 }),
      USER_ID,
    );
  });

  it('domain.expired → dispatch con fqdn + panel_url', async () => {
    await listener.handleExpired({ ...base });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.expired',
      { service_id: SERVICE_ID, fqdn: 'example.com', panel_url: PANEL },
      USER_ID,
    );
  });

  it('domain.entered_redemption → dispatch', async () => {
    await listener.handleEnteredRedemption({ ...base });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.entered_redemption',
      expect.objectContaining({ fqdn: 'example.com' }),
      USER_ID,
    );
  });

  it('fqdn ausente → fallback a service_id', async () => {
    await listener.handleExpired({
      service_id: SERVICE_ID,
      user_id: USER_ID,
      fqdn: null,
    });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.expired',
      expect.objectContaining({ fqdn: SERVICE_ID }),
      USER_ID,
    );
  });

  it('respeta NEXT_PUBLIC_APP_URL', async () => {
    configGet.mockImplementation((key: string, fallback: string) =>
      key === 'NEXT_PUBLIC_APP_URL' ? 'https://app.aelium.test' : fallback,
    );
    await listener.handleExpired({ ...base });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'domain.expired',
      expect.objectContaining({
        panel_url: `https://app.aelium.test/dashboard/services/${SERVICE_ID}`,
      }),
      USER_ID,
    );
  });

  it('dispatch falla → log + NO relanza (R7)', async () => {
    dispatchToUser.mockRejectedValueOnce(new Error('queue down'));
    await expect(listener.handleRenewed({ ...base })).resolves.toBeUndefined();
  });
});
