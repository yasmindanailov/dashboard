import { Logger } from '@nestjs/common';

import { NotificationsOnDomainTransferListener } from './notifications-on-domain-transfer.listener';

/**
 * Sprint 15D.II.T3 — notificaciones de la FSM de transfer-in. Despacha email +
 * campana al cliente con `panel_url` al detalle del dominio; degradación elegante (R7).
 */
describe('NotificationsOnDomainTransferListener — Sprint 15D.II.T3', () => {
  let notifications: { dispatchToUser: jest.Mock };
  let config: { get: jest.Mock };
  let listener: NotificationsOnDomainTransferListener;

  const base = { service_id: 'svc-1', user_id: 'user-1', fqdn: 'movein.com' };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    notifications = { dispatchToUser: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn().mockReturnValue('http://localhost:3002') };
    listener = new NotificationsOnDomainTransferListener(
      notifications as never,
      config as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('initiated → dispatch con panel_url al detalle del dominio', async () => {
    await listener.handleInitiated(base);
    expect(notifications.dispatchToUser).toHaveBeenCalledWith(
      'domain.transfer_initiated',
      expect.objectContaining({
        fqdn: 'movein.com',
        panel_url: 'http://localhost:3002/dashboard/domains/svc-1',
      }),
      'user-1',
    );
  });

  it('completed → dispatch', async () => {
    await listener.handleCompleted(base);
    expect(notifications.dispatchToUser).toHaveBeenCalledWith(
      'domain.transfer_completed',
      expect.objectContaining({ fqdn: 'movein.com' }),
      'user-1',
    );
  });

  it('failed → dispatch con el motivo', async () => {
    await listener.handleFailed({ ...base, reason: 'cancelled' });
    expect(notifications.dispatchToUser).toHaveBeenCalledWith(
      'domain.transfer_failed',
      expect.objectContaining({ reason: 'cancelled' }),
      'user-1',
    );
  });

  it('sin user_id → no despacha', async () => {
    await listener.handleInitiated({ ...base, user_id: '' });
    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });

  it('error del dispatch → no lanza (R7)', async () => {
    notifications.dispatchToUser.mockRejectedValue(new Error('smtp down'));
    await expect(listener.handleCompleted(base)).resolves.toBeUndefined();
  });
});
