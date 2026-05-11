import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

import { NotificationsOnPasswordResetListener } from './notifications-on-password-reset.listener';

/**
 * Tests unit `NotificationsOnPasswordResetListener` — Sprint 15C.II Fase D.
 *
 * Cobertura:
 *   - Filter strict: action_slug ≠ reset_account_password → no-op.
 *   - Filter strict: success=false → no-op.
 *   - Filter strict: payload sin data.password → no-op + warn.
 *   - Happy path: dispatchToUser invocado con shape canónico.
 *   - Service no encontrado: usa service_id como fallback domain.
 *   - Prisma falla: log error, NO relanza (R7).
 *   - dispatchToUser falla: log error, NO relanza (R7).
 */

describe('NotificationsOnPasswordResetListener — Sprint 15C.II Fase D', () => {
  let listener: NotificationsOnPasswordResetListener;
  let dispatchToUser: jest.Mock;
  let serviceFindUnique: jest.Mock;
  let configGet: jest.Mock;

  const PLAINTEXT_PWD = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const ACTOR_USER_ID = '33333333-3333-3333-3333-333333333333';

  const PAYLOAD_OK = {
    service_id: SERVICE_ID,
    user_id: USER_ID,
    actor_user_id: ACTOR_USER_ID,
    provisioner_slug: 'enhance_cp',
    action_slug: 'reset_account_password',
    success: true,
    side_effects: ['service.password_reset'] as readonly string[],
    destructive: false,
    ip: '10.0.0.1',
    data: { password: PLAINTEXT_PWD },
  };

  beforeEach(async () => {
    dispatchToUser = jest.fn().mockResolvedValue(undefined);
    serviceFindUnique = jest.fn();
    configGet = jest
      .fn()
      .mockImplementation((_key: string, fallback: string) => fallback);

    // Silenciar logs durante tests (warns y errors son intencionales).
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsOnPasswordResetListener,
        { provide: NotificationsService, useValue: { dispatchToUser } },
        {
          provide: PrismaService,
          useValue: { service: { findUnique: serviceFindUnique } },
        },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    listener = module.get(NotificationsOnPasswordResetListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Filter strict ─────────────────────────────────────────────────────

  describe('filter strict — solo procesa reset_account_password con éxito + password', () => {
    it('action_slug ≠ reset_account_password → no-op (no llama Prisma ni dispatch)', async () => {
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        action_slug: 'change_package',
      });
      expect(serviceFindUnique).not.toHaveBeenCalled();
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('action_slug=recalculate_provider_metrics → no-op', async () => {
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        action_slug: 'recalculate_provider_metrics',
      });
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('action_slug=list_dns_records → no-op', async () => {
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        action_slug: 'list_dns_records',
      });
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('success=false → no-op (no enviamos email cuando la action falló)', async () => {
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        success: false,
      });
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('payload sin data → no-op + warn', async () => {
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        data: undefined,
      });
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('payload sin data.password → no-op + warn', async () => {
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        data: { other_field: 'x' },
      });
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('data.password no-string (null / number / object) → no-op', async () => {
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        data: { password: null },
      });
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        data: { password: 12345 },
      });
      await listener.handlePasswordReset({
        ...PAYLOAD_OK,
        data: { password: { nested: 'x' } },
      });
      expect(dispatchToUser).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path ────────────────────────────────────────────────────────

  describe('happy path — dispatchToUser con shape canónico', () => {
    it('action correcta + service con domain → dispatch con domain real', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });

      await listener.handlePasswordReset(PAYLOAD_OK);

      expect(serviceFindUnique).toHaveBeenCalledWith({
        where: { id: SERVICE_ID },
        select: { domain: true, label: true },
      });
      expect(dispatchToUser).toHaveBeenCalledTimes(1);
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.password_reset',
        {
          service_id: SERVICE_ID,
          domain: 'mi-cliente.es',
          new_password: PLAINTEXT_PWD,
          panel_url: `http://localhost:3002/dashboard/services/${SERVICE_ID}`,
          provisioner_slug: 'enhance_cp',
        },
        USER_ID,
      );
    });

    it('respeta NEXT_PUBLIC_APP_URL si está configurado', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });
      configGet.mockImplementation((key: string, fallback: string) =>
        key === 'NEXT_PUBLIC_APP_URL' ? 'https://app.aelium.test' : fallback,
      );

      await listener.handlePasswordReset(PAYLOAD_OK);

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.password_reset',
        expect.objectContaining({
          panel_url: `https://app.aelium.test/dashboard/services/${SERVICE_ID}`,
        }),
        USER_ID,
      );
    });

    it('service sin domain pero con label → fallback a label', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: null,
        label: 'Web Demo Carla',
      });

      await listener.handlePasswordReset(PAYLOAD_OK);

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.password_reset',
        expect.objectContaining({ domain: 'Web Demo Carla' }),
        USER_ID,
      );
    });

    it('service no encontrado → fallback a service_id como display', async () => {
      serviceFindUnique.mockResolvedValueOnce(null);

      await listener.handlePasswordReset(PAYLOAD_OK);

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.password_reset',
        expect.objectContaining({ domain: SERVICE_ID }),
        USER_ID,
      );
    });
  });

  // ─── Degradación elegante (R7) ────────────────────────────────────────

  describe('degradación elegante (R7) — errors no rompen el flujo', () => {
    it('Prisma falla → log error + NO relanza', async () => {
      serviceFindUnique.mockRejectedValueOnce(new Error('DB down'));

      await expect(
        listener.handlePasswordReset(PAYLOAD_OK),
      ).resolves.toBeUndefined();
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('dispatchToUser falla → log error + NO relanza', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });
      dispatchToUser.mockRejectedValueOnce(
        new Error('Notifications queue down'),
      );

      await expect(
        listener.handlePasswordReset(PAYLOAD_OK),
      ).resolves.toBeUndefined();
    });
  });
});
