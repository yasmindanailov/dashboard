import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

import { NotificationsOnServiceUnsuspendedListener } from './notifications-on-service-unsuspended.listener';

/**
 * Tests unit `NotificationsOnServiceUnsuspendedListener` — Sprint 15C.II Fase F
 * (ADR-077 Amendment A4).
 *
 * Cobertura:
 *   - Siempre dispatch (no hay toggle de supresión — reactivar es buena noticia).
 *   - Happy path: dispatchToUser('service.unsuspended', { domain, panel_url }).
 *   - Service sin domain → fallback label → service_id.
 *   - Respeta NEXT_PUBLIC_APP_URL.
 *   - Degradación elegante (R7): Prisma/dispatch falla → log, NO relanza.
 */

describe('NotificationsOnServiceUnsuspendedListener — Sprint 15C.II Fase F', () => {
  let listener: NotificationsOnServiceUnsuspendedListener;
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
    actor_user_id: ACTOR_USER_ID,
    previous_suspension_reason: 'overdue_payment: nota interna',
  };

  beforeEach(async () => {
    dispatchToUser = jest.fn().mockResolvedValue(undefined);
    serviceFindUnique = jest
      .fn()
      .mockResolvedValue({ domain: 'mi-cliente.es', label: null });
    configGet = jest
      .fn()
      .mockImplementation((_key: string, fallback: string) => fallback);

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsOnServiceUnsuspendedListener,
        { provide: NotificationsService, useValue: { dispatchToUser } },
        {
          provide: PrismaService,
          useValue: { service: { findUnique: serviceFindUnique } },
        },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    listener = module.get(NotificationsOnServiceUnsuspendedListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('happy path → dispatch service.unsuspended con domain real + panel_url', async () => {
    await listener.handleServiceUnsuspended({ ...PAYLOAD_BASE });
    expect(serviceFindUnique).toHaveBeenCalledWith({
      where: { id: SERVICE_ID },
      select: { domain: true, label: true },
    });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.unsuspended',
      {
        service_id: SERVICE_ID,
        domain: 'mi-cliente.es',
        panel_url: `http://localhost:3002/dashboard/services/${SERVICE_ID}`,
      },
      USER_ID,
    );
  });

  it('service sin domain pero con label → fallback a label', async () => {
    serviceFindUnique.mockResolvedValueOnce({
      domain: null,
      label: 'Web Demo',
    });
    await listener.handleServiceUnsuspended({ ...PAYLOAD_BASE });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.unsuspended',
      expect.objectContaining({ domain: 'Web Demo' }),
      USER_ID,
    );
  });

  it('service no encontrado → fallback a service_id como display', async () => {
    serviceFindUnique.mockResolvedValueOnce(null);
    await listener.handleServiceUnsuspended({ ...PAYLOAD_BASE });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.unsuspended',
      expect.objectContaining({ domain: SERVICE_ID }),
      USER_ID,
    );
  });

  it('respeta NEXT_PUBLIC_APP_URL', async () => {
    configGet.mockImplementation((key: string, fallback: string) =>
      key === 'NEXT_PUBLIC_APP_URL' ? 'https://app.aelium.test' : fallback,
    );
    await listener.handleServiceUnsuspended({ ...PAYLOAD_BASE });
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.unsuspended',
      expect.objectContaining({
        panel_url: `https://app.aelium.test/dashboard/services/${SERVICE_ID}`,
      }),
      USER_ID,
    );
  });

  it('Prisma falla → log error + NO relanza', async () => {
    serviceFindUnique.mockRejectedValueOnce(new Error('DB down'));
    await expect(
      listener.handleServiceUnsuspended({ ...PAYLOAD_BASE }),
    ).resolves.toBeUndefined();
    expect(dispatchToUser).not.toHaveBeenCalled();
  });

  it('dispatchToUser falla → log error + NO relanza', async () => {
    dispatchToUser.mockRejectedValueOnce(new Error('queue down'));
    await expect(
      listener.handleServiceUnsuspended({ ...PAYLOAD_BASE }),
    ).resolves.toBeUndefined();
  });
});
