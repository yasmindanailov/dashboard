// `unbound-method` da falsos positivos en specs Jest con
// `expect(mock.method).toHaveBeenCalled()`. Deshabilitado a nivel de archivo.

import { DomainExpiryWarningsCron } from './domain-expiry-warnings.cron';

/**
 * Tests unit `DomainExpiryWarningsCron` — Fase 15D.E.
 *
 * Cobertura:
 *   - ventana activa: 20d→30, 10d→14, 1d→1 → emite domain.expiring_soon + persiste
 *     domain_expiry_warned_window.
 *   - edge-trigger: ya avisado en la ventana → no emite ni escribe.
 *   - transición de ventana (30→14) → re-emite.
 *   - fail-soft: un servicio que falla no aborta el resto.
 */
describe('DomainExpiryWarningsCron — Fase 15D.E', () => {
  const NOW = new Date('2026-06-22T00:00:00.000Z');
  const DAY_MS = 24 * 60 * 60 * 1000;

  let prisma: { service: { findMany: jest.Mock; update: jest.Mock } };
  let events: { emit: jest.Mock };
  let cron: DomainExpiryWarningsCron;

  beforeEach(() => {
    prisma = {
      service: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    events = { emit: jest.fn() };
    cron = new DomainExpiryWarningsCron(prisma as never, events as never);
  });

  function row(daysLeft: number, warnedWindow?: number, id = 'svc-1') {
    return {
      id,
      user_id: 'user-1',
      domain: 'example.com',
      expires_at: new Date(NOW.getTime() + daysLeft * DAY_MS),
      metadata:
        warnedWindow === undefined
          ? {}
          : { domain_expiry_warned_window: warnedWindow },
    };
  }

  it.each([
    [20, 30],
    [10, 14],
    [5, 7],
    [1, 1],
  ])(
    'expira en %id → ventana %i: emite domain.expiring_soon + persiste warned_window',
    async (daysLeft, window) => {
      prisma.service.findMany.mockResolvedValue([row(daysLeft)]);

      const summary = await cron.runOnce(NOW);

      expect(summary.warned).toBe(1);
      expect(events.emit).toHaveBeenCalledWith(
        'domain.expiring_soon',
        expect.objectContaining({
          service_id: 'svc-1',
          fqdn: 'example.com',
          days_left: daysLeft,
        }),
      );
      const arg = (
        prisma.service.update.mock.calls as Array<
          [{ data: { metadata: { domain_expiry_warned_window: number } } }]
        >
      )[0][0];
      expect(arg.data.metadata.domain_expiry_warned_window).toBe(window);
    },
  );

  it('edge-trigger: ya avisado en la ventana 30 → no emite ni escribe', async () => {
    prisma.service.findMany.mockResolvedValue([row(20, 30)]);

    const summary = await cron.runOnce(NOW);

    expect(summary.warned).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('transición de ventana 30→14 → re-emite', async () => {
    prisma.service.findMany.mockResolvedValue([row(10, 30)]);

    const summary = await cron.runOnce(NOW);

    expect(summary.warned).toBe(1);
    expect(events.emit).toHaveBeenCalledWith(
      'domain.expiring_soon',
      expect.objectContaining({ days_left: 10 }),
    );
  });

  it('fail-soft: un servicio que falla no aborta el resto', async () => {
    prisma.service.findMany.mockResolvedValue([
      row(20, undefined, 'svc-boom'),
      row(10, undefined, 'svc-ok'),
    ]);
    prisma.service.update
      .mockRejectedValueOnce(new Error('db boom'))
      .mockResolvedValueOnce({});

    const summary = await cron.runOnce(NOW);

    expect(summary.checked).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.warned).toBe(1);
  });
});
