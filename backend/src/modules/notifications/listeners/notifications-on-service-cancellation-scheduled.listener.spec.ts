import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

import { NotificationsOnServiceCancellationScheduledListener } from './notifications-on-service-cancellation-scheduled.listener';

/**
 * Tests unit `NotificationsOnServiceCancellationScheduledListener` — audit GL-2 / H2.3.
 *
 * Cobertura:
 *   - Happy path: dispatchToUser con shape canónico (domain real + fecha humana
 *     es-ES + billing_url + support_url).
 *   - Fallback domain → label → service_id.
 *   - Respeta NEXT_PUBLIC_APP_URL.
 *   - user_id ausente → no-op (no Prisma, no dispatch).
 *   - Degradación elegante (R7): Prisma falla / dispatch falla → log, NO relanza.
 */

describe('NotificationsOnServiceCancellationScheduledListener — H2.3', () => {
  let listener: NotificationsOnServiceCancellationScheduledListener;
  let dispatchToUser: jest.Mock;
  let serviceFindUnique: jest.Mock;
  let configGet: jest.Mock;

  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  // 2026-07-15 a medianoche UTC → "15 de julio de 2026" en es-ES (UTC).
  const SCHEDULED_ISO = '2026-07-15T00:00:00.000Z';

  const PAYLOAD_BASE = {
    service_id: SERVICE_ID,
    user_id: USER_ID,
    scheduled_cancellation_date: SCHEDULED_ISO,
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
        NotificationsOnServiceCancellationScheduledListener,
        { provide: NotificationsService, useValue: { dispatchToUser } },
        {
          provide: PrismaService,
          useValue: { service: { findUnique: serviceFindUnique } },
        },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    listener = module.get(NotificationsOnServiceCancellationScheduledListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('happy path — dispatchToUser con shape canónico', () => {
    it('service con domain → dispatch con domain real + fecha humana es-ES + billing/support URLs', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });

      await listener.handleCancellationScheduled({ ...PAYLOAD_BASE });

      expect(serviceFindUnique).toHaveBeenCalledWith({
        where: { id: SERVICE_ID },
        select: { domain: true, label: true },
      });
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancellation_scheduled',
        {
          service_id: SERVICE_ID,
          domain: 'mi-cliente.es',
          cancellation_date: '15 de julio de 2026',
          billing_url: 'http://localhost:3002/dashboard/billing',
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

      await listener.handleCancellationScheduled({ ...PAYLOAD_BASE });

      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancellation_scheduled',
        expect.objectContaining({
          billing_url: 'https://app.aelium.test/dashboard/billing',
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
      await listener.handleCancellationScheduled({ ...PAYLOAD_BASE });
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancellation_scheduled',
        expect.objectContaining({ domain: 'Web Demo' }),
        USER_ID,
      );
    });

    it('service no encontrado → fallback a service_id como display', async () => {
      serviceFindUnique.mockResolvedValueOnce(null);
      await listener.handleCancellationScheduled({ ...PAYLOAD_BASE });
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancellation_scheduled',
        expect.objectContaining({ domain: SERVICE_ID }),
        USER_ID,
      );
    });

    it('fecha no parseable → la pasa tal cual (fail-soft)', async () => {
      serviceFindUnique.mockResolvedValueOnce({
        domain: 'mi-cliente.es',
        label: null,
      });
      await listener.handleCancellationScheduled({
        ...PAYLOAD_BASE,
        scheduled_cancellation_date: 'no-es-fecha',
      });
      expect(dispatchToUser).toHaveBeenCalledWith(
        'service.cancellation_scheduled',
        expect.objectContaining({ cancellation_date: 'no-es-fecha' }),
        USER_ID,
      );
    });
  });

  describe('guardas y degradación elegante (R7)', () => {
    it('user_id ausente → no-op (no Prisma, no dispatch)', async () => {
      await listener.handleCancellationScheduled({
        ...PAYLOAD_BASE,
        user_id: '',
      });
      expect(serviceFindUnique).not.toHaveBeenCalled();
      expect(dispatchToUser).not.toHaveBeenCalled();
    });

    it('Prisma falla → log error + NO relanza', async () => {
      serviceFindUnique.mockRejectedValueOnce(new Error('DB down'));
      await expect(
        listener.handleCancellationScheduled({ ...PAYLOAD_BASE }),
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
        listener.handleCancellationScheduled({ ...PAYLOAD_BASE }),
      ).resolves.toBeUndefined();
    });
  });
});
