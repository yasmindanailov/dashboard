import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../core/database/prisma.service';
import type { SuspensionReason } from '../../../core/provisioning/types';
import { NotificationsService } from '../notifications.service';

import { NotificationsOnServiceSuspendedListener } from './notifications-on-service-suspended.listener';

/**
 * Tests unit `NotificationsOnServiceSuspendedListener` — Sprint 15C.II Fase F
 * (ADR-077 Amendment A4).
 *
 * Cobertura:
 *   - notify_client=false → no-op.
 *   - notify_client ausente/true → dispatch.
 *   - reason='overdue_payment' → reason_label + is_overdue_payment=true + billing_url.
 *   - reason='scheduled_maintenance' → is_maintenance=true.
 *   - reason='other' → reason_label undefined (no se filtra al cliente la nota interna).
 *   - Service sin domain → fallback label → service_id.
 *   - Respeta NEXT_PUBLIC_APP_URL.
 *   - Degradación elegante (R7): Prisma/dispatch falla → log, NO relanza.
 */

describe('NotificationsOnServiceSuspendedListener — Sprint 15C.II Fase F', () => {
  let listener: NotificationsOnServiceSuspendedListener;
  let dispatchToUser: jest.Mock;
  let serviceFindUnique: jest.Mock;
  let configGet: jest.Mock;

  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const ACTOR_USER_ID = '33333333-3333-3333-3333-333333333333';

  function payload(
    over: Partial<{
      reason: SuspensionReason;
      notify_client: boolean;
    }> = {},
  ) {
    return {
      service_id: SERVICE_ID,
      user_id: USER_ID,
      provisioner_slug: 'enhance_cp',
      reason: 'overdue_payment' as SuspensionReason,
      actor_user_id: ACTOR_USER_ID,
      suspended_at: '2026-05-12T10:00:00.000Z',
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
      .mockImplementation((_key: string, fallback: string) => fallback);

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsOnServiceSuspendedListener,
        { provide: NotificationsService, useValue: { dispatchToUser } },
        {
          provide: PrismaService,
          useValue: { service: { findUnique: serviceFindUnique } },
        },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    listener = module.get(NotificationsOnServiceSuspendedListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── notify_client toggle ──────────────────────────────────────────────

  it('notify_client=false → no-op (no Prisma, no dispatch)', async () => {
    await listener.handleServiceSuspended(payload({ notify_client: false }));
    expect(serviceFindUnique).not.toHaveBeenCalled();
    expect(dispatchToUser).not.toHaveBeenCalled();
  });

  it('notify_client ausente (default ON) → dispatch', async () => {
    await listener.handleServiceSuspended(payload());
    expect(dispatchToUser).toHaveBeenCalledTimes(1);
  });

  // ─── reason → variables del template ───────────────────────────────────

  it('reason=overdue_payment → reason_label + is_overdue_payment=true + billing_url', async () => {
    await listener.handleServiceSuspended(
      payload({ reason: 'overdue_payment' }),
    );
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.suspended',
      expect.objectContaining({
        service_id: SERVICE_ID,
        domain: 'mi-cliente.es',
        reason_label: 'Falta de pago',
        is_overdue_payment: true,
        is_maintenance: false,
        billing_url: 'http://localhost:3002/dashboard/billing',
        support_url: 'http://localhost:3002/dashboard/support',
      }),
      USER_ID,
    );
  });

  it('reason=scheduled_maintenance → is_maintenance=true', async () => {
    await listener.handleServiceSuspended(
      payload({ reason: 'scheduled_maintenance' }),
    );
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.suspended',
      expect.objectContaining({
        reason_label: 'Mantenimiento programado',
        is_overdue_payment: false,
        is_maintenance: true,
      }),
      USER_ID,
    );
  });

  it('reason=other → reason_label undefined (la nota interna NUNCA llega al cliente)', async () => {
    await listener.handleServiceSuspended(payload({ reason: 'other' }));
    const [, vars] = dispatchToUser.mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(vars.reason_label).toBeUndefined();
    expect(vars.is_overdue_payment).toBe(false);
    expect(vars.is_maintenance).toBe(false);
  });

  it('reason=gdpr_restriction → reason_label "Restricción del tratamiento (RGPD)"', async () => {
    await listener.handleServiceSuspended(
      payload({ reason: 'gdpr_restriction' }),
    );
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.suspended',
      expect.objectContaining({
        reason_label: 'Restricción del tratamiento (RGPD)',
      }),
      USER_ID,
    );
  });

  // ─── fallbacks + config ────────────────────────────────────────────────

  it('service sin domain pero con label → fallback a label', async () => {
    serviceFindUnique.mockResolvedValueOnce({
      domain: null,
      label: 'Web Demo',
    });
    await listener.handleServiceSuspended(payload());
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.suspended',
      expect.objectContaining({ domain: 'Web Demo' }),
      USER_ID,
    );
  });

  it('service no encontrado → fallback a service_id como display', async () => {
    serviceFindUnique.mockResolvedValueOnce(null);
    await listener.handleServiceSuspended(payload());
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.suspended',
      expect.objectContaining({ domain: SERVICE_ID }),
      USER_ID,
    );
  });

  it('respeta NEXT_PUBLIC_APP_URL', async () => {
    configGet.mockImplementation((key: string, fallback: string) =>
      key === 'NEXT_PUBLIC_APP_URL' ? 'https://app.aelium.test' : fallback,
    );
    await listener.handleServiceSuspended(payload());
    expect(dispatchToUser).toHaveBeenCalledWith(
      'service.suspended',
      expect.objectContaining({
        billing_url: 'https://app.aelium.test/dashboard/billing',
        support_url: 'https://app.aelium.test/dashboard/support',
      }),
      USER_ID,
    );
  });

  // ─── Degradación elegante (R7) ─────────────────────────────────────────

  it('Prisma falla → log error + NO relanza', async () => {
    serviceFindUnique.mockRejectedValueOnce(new Error('DB down'));
    await expect(
      listener.handleServiceSuspended(payload()),
    ).resolves.toBeUndefined();
    expect(dispatchToUser).not.toHaveBeenCalled();
  });

  it('dispatchToUser falla → log error + NO relanza', async () => {
    dispatchToUser.mockRejectedValueOnce(new Error('queue down'));
    await expect(
      listener.handleServiceSuspended(payload()),
    ).resolves.toBeUndefined();
  });
});
