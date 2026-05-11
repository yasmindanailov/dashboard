import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

import { NotificationsOnServiceCancelledListener } from './notifications-on-service-cancelled.listener';

/**
 * Tests unit `NotificationsOnServiceCancelledListener` — Sprint 15C.II Fase E.
 *
 * Cobertura:
 *   - notify_client=false explícito → no-op (no Prisma, no dispatch).
 *   - notify_client ausente (default) → dispatch.
 *   - notify_client=true → dispatch.
 *   - Happy path: dispatchToUser con shape canónico (domain real + support_url).
 *   - Service sin domain → fallback a label → fallback a service_id.
 *   - Respeta NEXT_PUBLIC_APP_URL.
 *   - Degradación elegante (R7): Prisma falla / dispatch falla → log, NO relanza.
 */

describe('NotificationsOnServiceCancelledListener — Sprint 15C.II Fase E', () => {
  let listener: NotificationsOnServiceCancelledListener;
  let dispatchToUser: jest.Mock;
  let serviceFindUnique: jest.Mock;
  let configGet: jest.Mock;

  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const ACTOR_USER_ID = '33333333-3333-3333-3333-333333333333';

  const PAYLOAD_BASE = {
    service_id: SERVICE_ID,
    user_id: USER_ID,
    provisioner_slug: 'enhance_cp',
    reason: 'cancelled',
    actor_user_id: ACTOR_USER_ID,
  };

  beforeEach(async () => {
    dispatchToUser = jest.fn().mockResolvedValue(undefined);
    serviceFindUnique = jest.fn();
    configGet = jest
      .fn()
      .mockImplementation((_key: string, fallback: string) => fallback);

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsOnServiceCancelledListener,
        { provide: NotificationsService, useValue: { dispatchToUser } },
        {
          provide: PrismaService,
          useValue: { service: { findUnique: serviceFindUnique } },
        },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    listener = module.get(NotificationsOnServiceCancelledListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── notify_client toggle ──────────────────────────────────────────────

  describe('notify_client toggle', () => {
    it('notify_client=false → no-op (no Prisma, no dispatch)', async () => {
      await listener.handleServiceCancelled({
        ...PAYLOAD_BASE,
        notify_client: false,
      });
      expect(serviceFindUnique).not.toHaveBeenCalled();
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('notify_client ausente (default ON) → dispatch', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });
      await listener.handleServiceCancelled({ ...PAYLOAD_BASE });
      expect(dispatchToUser).toHaveBeenCalledTimes(1);
    });

    it('notify_client=true explícito → dispatch', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });
      await listener.handleServiceCancelled({
        ...PAYLOAD_BASE,
        notify_client: true,
      });
      expect(dispatchToUser).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Happy path ────────────────────────────────────────────────────────

  describe('happy path — dispatchToUser con shape canónico', () => {
    it('service con domain → dispatch service.cancelled con domain real + support_url', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });

      await listener.handleServiceCancelled({ ...PAYLOAD_BASE });

      expect(serviceFindUnique).toHaveBeenCalledWith({
        where: { id: SERVICE_ID },
        select: { domain: true, label: true },
      });
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancelled',
        {
          service_id: SERVICE_ID,
          domain: 'mi-cliente.es',
          support_url: 'http://localhost:3002/dashboard/support',
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

      await listener.handleServiceCancelled({ ...PAYLOAD_BASE });

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancelled',
        expect.objectContaining({
          support_url: 'https://app.aelium.test/dashboard/support',
        }),
        USER_ID,
      );
    });

    it('service sin domain pero con label → fallback a label', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: null,
        label: 'Web Demo',
      });
      await listener.handleServiceCancelled({ ...PAYLOAD_BASE });
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancelled',
        expect.objectContaining({ domain: 'Web Demo' }),
        USER_ID,
      );
    });

    it('service no encontrado → fallback a service_id como display', async () => {
      serviceFindUnique.mockResolvedValueOnce(null);
      await listener.handleServiceCancelled({ ...PAYLOAD_BASE });
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancelled',
        expect.objectContaining({ domain: SERVICE_ID }),
        USER_ID,
      );
    });
  });

  // ─── Degradación elegante (R7) ────────────────────────────────────────

  describe('degradación elegante (R7)', () => {
    it('Prisma falla → log error + NO relanza', async () => {
      serviceFindUnique.mockRejectedValueOnce(new Error('DB down'));
      await expect(
        listener.handleServiceCancelled({ ...PAYLOAD_BASE }),
      ).resolves.toBeUndefined();
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('dispatchToUser falla → log error + NO relanza', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });
      dispatchToUser.mockRejectedValueOnce(new Error('queue down'));
      await expect(
        listener.handleServiceCancelled({ ...PAYLOAD_BASE }),
      ).resolves.toBeUndefined();
    });
  });
});
