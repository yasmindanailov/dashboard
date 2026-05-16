import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

import { NotificationsOnServiceQuotaThresholdCrossedListener } from './notifications-on-service-quota-threshold-crossed.listener';

/**
 * Tests unit `NotificationsOnServiceQuotaThresholdCrossedListener` — Sprint
 * 15C.II Fase F.8 (dossier §A.11.10.5.1 R6).
 *
 * Cobertura:
 *   - Dispatch con variables canónicas (domain del service + URLs del
 *     ConfigService + formatos MB/GB + pct truncado).
 *   - Fallback de domain: si el service no tiene domain → label → service_id.
 *   - R7 — degradación elegante: error del Prisma/dispatch loguea + no
 *     relanza.
 *   - El listener confía en el detector upstream (edge-trigger) — NO
 *     aplica anti-spam adicional.
 */
describe('NotificationsOnServiceQuotaThresholdCrossedListener — Sprint 15C.II Fase F.8', () => {
  let listener: NotificationsOnServiceQuotaThresholdCrossedListener;
  let dispatchToUser: jest.Mock;
  let serviceFindUnique: jest.Mock;
  let configGet: jest.Mock;

  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const APP_URL = 'https://aelium.example';

  function payload(over: Partial<Record<string, unknown>> = {}) {
    return {
      service_id: SERVICE_ID,
      user_id: USER_ID,
      plugin_slug: 'enhance_cp',
      resource: 'disk' as const,
      used_pct: 87.4,
      threshold_pct: 85,
      used_mb: 8740,
      total_mb: 10000,
      detected_at: '2026-05-16T12:00:00.000Z',
      ...over,
    };
  }

  beforeEach(async () => {
    dispatchToUser = jest.fn().mockResolvedValue(undefined);
    serviceFindUnique = jest.fn().mockResolvedValue({
      domain: 'mi-cliente.es',
      label: null,
    });
    configGet = jest
      .fn()
      .mockImplementation((_key: string, fallback: string) =>
        _key === 'NEXT_PUBLIC_APP_URL' ? APP_URL : fallback,
      );

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsOnServiceQuotaThresholdCrossedListener,
        { provide: NotificationsService, useValue: { dispatchToUser } },
        {
          provide: PrismaService,
          useValue: { service: { findUnique: serviceFindUnique } },
        },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    listener = module.get(NotificationsOnServiceQuotaThresholdCrossedListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Dispatch canónico ────────────────────────────────────────────────

  it('despacha con variables canónicas (domain + URLs + formatos GB)', async () => {
    await listener.handle(payload());
    expect(dispatchToUser).toHaveBeenCalledTimes(1);
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.quota_threshold_crossed',
      {
        service_id: SERVICE_ID,
        domain: 'mi-cliente.es',
        used_pct: '87.4',
        used_mb_label: '8.54 GB', // 8740 MB → 8.54 GB
        total_mb_label: '9.77 GB', // 10000 MB → 9.77 GB
        service_url: `${APP_URL}/dashboard/services/${SERVICE_ID}`,
        support_url: `${APP_URL}/dashboard/support`,
      },
      USER_ID,
    );
  });

  it('métricas <1024 MB → formato MB sin decimales', async () => {
    await listener.handle(
      payload({ used_mb: 512, total_mb: 1024, used_pct: 50 }),
    );
    const arg = dispatchToUser.mock.calls[0][1] as Record<string, string>;
    expect(arg.used_mb_label).toBe('512 MB');
    expect(arg.total_mb_label).toBe('1.00 GB'); // 1024 MB = 1.00 GB
  });

  // ─── Fallback domain ──────────────────────────────────────────────────

  it('service sin domain → fallback label', async () => {
    serviceFindUnique.mockResolvedValueOnce({
      domain: null,
      label: 'Tienda de Juan',
    });
    await listener.handle(payload());
    const arg = dispatchToUser.mock.calls[0][1] as Record<string, string>;
    expect(arg.domain).toBe('Tienda de Juan');
  });

  it('service sin domain ni label → fallback service_id', async () => {
    serviceFindUnique.mockResolvedValueOnce({ domain: null, label: null });
    await listener.handle(payload());
    const arg = dispatchToUser.mock.calls[0][1] as Record<string, string>;
    expect(arg.domain).toBe(SERVICE_ID);
  });

  it('service no existe → findUnique returns null → fallback service_id', async () => {
    serviceFindUnique.mockResolvedValueOnce(null);
    await listener.handle(payload());
    const arg = dispatchToUser.mock.calls[0][1] as Record<string, string>;
    expect(arg.domain).toBe(SERVICE_ID);
  });

  // ─── R7 — degradación elegante ────────────────────────────────────────

  it('R7 — Prisma findUnique lanza → log error, NO relanza', async () => {
    serviceFindUnique.mockRejectedValueOnce(new Error('DB down'));
    await expect(listener.handle(payload())).resolves.toBeUndefined();
    expect(dispatchToUser).not.toHaveBeenCalled();
  });

  it('R7 — dispatchToUser lanza → log error, NO relanza', async () => {
    dispatchToUser.mockRejectedValueOnce(new Error('Queue saturated'));
    await expect(listener.handle(payload())).resolves.toBeUndefined();
  });

  // ─── ConfigService fallback ───────────────────────────────────────────

  it('NEXT_PUBLIC_APP_URL ausente → URLs usan el default localhost', async () => {
    configGet.mockImplementation((_key: string, fallback: string) => fallback);
    await listener.handle(payload());
    const arg = dispatchToUser.mock.calls[0][1] as Record<string, string>;
    expect(arg.service_url).toBe(
      `http://localhost:3002/dashboard/services/${SERVICE_ID}`,
    );
    expect(arg.support_url).toBe('http://localhost:3002/dashboard/support');
  });
});
