import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  DeprovisionReasonDto,
  SuspensionReasonDto,
} from '../provisioning/dto/provisioning.dto';
import { ServiceLifecycleWorker } from './service-lifecycle.worker';

/**
 * Tests unit ServiceLifecycleWorker — Sprint 15C.II Fase F.5 (`DC.44`
 * billing-suspend-unify).
 *
 * Foco: `autoSuspendServices` delega en `ProvisioningService.suspendAsAdmin`
 * (punto único de transición de estado) en vez de hacer su propio
 * `prisma.service.update` — con actor sistema (`actorUserId: null` +
 * `actorLabel: 'system:billing-overdue-cron'`) y `allowUnsupported: true`
 * (para que los plugins `internal`/`manual` se sigan suspendiendo del lado de
 * Aelium). Tolera fallos por servicio (catch + log — ej. servicio ya cancelado
 * → 409).
 */
describe('ServiceLifecycleWorker — Fase F.5 (autoSuspendServices → suspendAsAdmin)', () => {
  let prisma: {
    invoice: { findMany: jest.Mock };
    service: { findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let calculator: { getSettingValue: jest.Mock };
  let provisioning: {
    suspendAsAdmin: jest.Mock;
    deprovisionAsAdmin: jest.Mock;
  };
  // R8 (GL-17): `checkPauseExpiration` persiste `service.resumed` vía Outbox.
  let outbox: { enqueue: jest.Mock };
  let worker: ServiceLifecycleWorker;

  beforeEach(() => {
    prisma = {
      invoice: { findMany: jest.fn() },
      service: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      // `tx === prisma` en el mock → `tx.service.update` sigue siendo el mismo
      // jest.fn y `outbox.enqueue` se invoca con `(prisma, ...)`.
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    calculator = { getSettingValue: jest.fn().mockResolvedValue(7) };
    provisioning = {
      suspendAsAdmin: jest.fn().mockResolvedValue({}),
      deprovisionAsAdmin: jest.fn().mockResolvedValue({}),
    };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    worker = new ServiceLifecycleWorker(
      prisma as never,
      new EventEmitter2(),
      calculator as never,
      provisioning as never,
      outbox as never,
    );
  });

  function overdueInvoice(over: Record<string, unknown> = {}) {
    return {
      id: 'inv-1',
      invoice_number: 'INV-2026-1',
      retry_count: 5,
      max_retries: 3,
      items: [{ service_id: 'svc-1' }, { service_id: null }],
      ...over,
    };
  }

  it('suspende vía suspendAsAdmin (actor sistema + allowUnsupported), con el motivo canónico overdue_payment y el nº de factura en la nota; NO toca prisma.service.update', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([overdueInvoice()]);

    await worker.autoSuspendServices();

    expect(provisioning.suspendAsAdmin).toHaveBeenCalledTimes(1);
    // Sprint 15C.II F.6: el `internal_note` lleva el body self-descriptive
    // que aterriza en `ClientNote.body` vía `createFromServiceLifecycleAction`.
    expect(provisioning.suspendAsAdmin).toHaveBeenCalledWith(
      'svc-1',
      {
        reason: SuspensionReasonDto.overdue_payment,
        internal_note:
          'Suspendido automáticamente por impago — Factura INV-2026-1',
        notify_client: true,
      },
      null,
      undefined,
      { actorLabel: 'system:billing-overdue-cron', allowUnsupported: true },
    );
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('ignora los invoice items sin service_id', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([
      overdueInvoice({ items: [{ service_id: null }, { service_id: null }] }),
    ]);

    await worker.autoSuspendServices();

    expect(provisioning.suspendAsAdmin).not.toHaveBeenCalled();
  });

  it('no suspende facturas que aún tienen reintentos pendientes (retry_count < max_retries)', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([
      overdueInvoice({ retry_count: 1, max_retries: 3 }),
    ]);

    await worker.autoSuspendServices();

    expect(provisioning.suspendAsAdmin).not.toHaveBeenCalled();
  });

  it('auto-cancela vía deprovisionAsAdmin (actor sistema → destruye el recurso); NO toca prisma.service.update (GL-2)', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      {
        id: 'svc-9',
        user_id: 'user-9',
        status: 'suspended',
        suspended_at: new Date(0),
      },
    ]);

    await worker.autoCancelServices();

    expect(provisioning.deprovisionAsAdmin).toHaveBeenCalledTimes(1);
    expect(provisioning.deprovisionAsAdmin).toHaveBeenCalledWith(
      'svc-9',
      expect.objectContaining({
        reason: DeprovisionReasonDto.cancelled,
        notify_client: true,
      }),
      null,
      undefined,
      { actorLabel: 'system:billing-cancellation-cron' },
    );
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('si suspendAsAdmin lanza para un servicio (ej. ya cancelado → 409), lo registra y sigue con el resto', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([
      overdueInvoice({
        items: [{ service_id: 'svc-cancelled' }, { service_id: 'svc-ok' }],
      }),
    ]);
    provisioning.suspendAsAdmin
      .mockRejectedValueOnce(new Error('SERVICE_NOT_SUSPENDABLE'))
      .mockResolvedValueOnce({});

    await expect(worker.autoSuspendServices()).resolves.toBeUndefined();

    expect(provisioning.suspendAsAdmin).toHaveBeenCalledTimes(2);
    expect(provisioning.suspendAsAdmin).toHaveBeenNthCalledWith(
      2,
      'svc-ok',
      expect.objectContaining({ reason: SuspensionReasonDto.overdue_payment }),
      null,
      undefined,
      expect.objectContaining({ allowUnsupported: true }),
    );
  });

  it('sin facturas exhaustas → no hace nada', async () => {
    prisma.invoice.findMany.mockResolvedValueOnce([]);

    await worker.autoSuspendServices();

    expect(provisioning.suspendAsAdmin).not.toHaveBeenCalled();
  });

  // ── 6.7 — checkPauseExpiration (R8 / GL-17: service.resumed vía Outbox) ──

  it('checkPauseExpiration: reanuda pausas expiradas y persiste service.resumed vía Outbox en la MISMA tx que la transición a active', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      { id: 'svc-paused', user_id: 'user-7' },
    ]);

    await worker.checkPauseExpiration();

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-paused' },
      data: {
        status: 'active',
        paused_at: null,
        pause_max_date: null,
        suspended_at: null,
        suspension_reason: null,
      },
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'service.resumed',
      expect.objectContaining({
        service_id: 'svc-paused',
        user_id: 'user-7',
        reason: 'pause_expired',
      }),
    );
  });

  it('checkPauseExpiration: sin pausas expiradas → no toca BD ni Outbox', async () => {
    prisma.service.findMany.mockResolvedValueOnce([]);

    await worker.checkPauseExpiration();

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('checkPauseExpiration: aísla el fallo de un servicio (la tx/outbox lanza) y sigue con el resto', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      { id: 'svc-bad', user_id: 'user-1' },
      { id: 'svc-ok', user_id: 'user-2' },
    ]);
    // El enqueue dentro de la $transaction del primer servicio rechaza; el
    // try/catch por-servicio debe loguear y continuar con el segundo.
    outbox.enqueue
      .mockRejectedValueOnce(new Error('outbox down'))
      .mockResolvedValueOnce(undefined);

    await expect(worker.checkPauseExpiration()).resolves.toBeUndefined();

    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
    expect(outbox.enqueue).toHaveBeenLastCalledWith(
      prisma,
      'service.resumed',
      expect.objectContaining({
        service_id: 'svc-ok',
        reason: 'pause_expired',
      }),
    );
  });
});

/**
 * Tests unit `notifyUpcomingCancellations` — audit 2026-06-25 GL-2 / H2.3
 * (aviso previo de cancelación irreversible).
 *
 * Foco: el cron avisa UNA vez (edge-trigger por `metadata.cancellation_notice_sent_at`
 * vs `suspended_at`) a los servicios suspendidos por impago en la ventana
 * DISJUNTA `(now-cancellation_days, now-(cancellation_days-notice_days)]`,
 * EXCLUYENDO pausas voluntarias (`paused_at: null`), y emite
 * `service.cancellation_scheduled` con la fecha determinista de cancelación.
 */
describe('ServiceLifecycleWorker — H2.3 (notifyUpcomingCancellations → service.cancellation_scheduled)', () => {
  const NOW = new Date('2026-06-25T00:00:00.000Z');
  const DAY = 86_400_000;

  let prisma: {
    invoice: { findMany: jest.Mock };
    service: { findMany: jest.Mock; update: jest.Mock };
  };
  let calculator: { getSettingValue: jest.Mock };
  let provisioning: {
    suspendAsAdmin: jest.Mock;
    deprovisionAsAdmin: jest.Mock;
  };
  let emitter: EventEmitter2;
  let emitSpy: jest.SpyInstance;
  // `service.cancellation_scheduled` es una alerta (emit directo); `outbox` aquí
  // es un stub no invocado — sólo satisface el 5º parámetro del constructor.
  let outbox: { enqueue: jest.Mock };
  let worker: ServiceLifecycleWorker;

  function setSettings(cancellationDays: number, noticeDays: number) {
    calculator.getSettingValue.mockImplementation(
      (_cat: string, key: string, def: number) =>
        Promise.resolve(
          key === 'cancellation_days'
            ? cancellationDays
            : key === 'cancellation_notice_days'
              ? noticeDays
              : def,
        ),
    );
  }

  beforeEach(() => {
    prisma = {
      invoice: { findMany: jest.fn() },
      service: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    calculator = { getSettingValue: jest.fn() };
    setSettings(30, 7);
    provisioning = {
      suspendAsAdmin: jest.fn(),
      deprovisionAsAdmin: jest.fn(),
    };
    emitter = new EventEmitter2();
    emitSpy = jest.spyOn(emitter, 'emit');
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    worker = new ServiceLifecycleWorker(
      prisma as never,
      emitter,
      calculator as never,
      provisioning as never,
      outbox as never,
    );
  });

  /** Suspendido por impago hace 25 días → dentro de la ventana [23,30). */
  function suspendedService(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      suspended_at: new Date(NOW.getTime() - 25 * DAY),
      metadata: null,
      ...over,
    };
  }

  it('consulta solo servicios suspendidos en la ventana de aviso, EXCLUYENDO pausas voluntarias (paused_at: null)', async () => {
    await worker.runCancellationNotices(NOW);

    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: {
        status: 'suspended',
        paused_at: null,
        NOT: { suspension_reason: { startsWith: 'not_renewed' } },
        suspended_at: {
          lte: new Date(NOW.getTime() - (30 - 7) * DAY),
          gt: new Date(NOW.getTime() - 30 * DAY),
        },
      },
      select: { id: true, user_id: true, suspended_at: true, metadata: true },
    });
  });

  it('emite service.cancellation_scheduled (fecha determinista = suspended_at + cancellation_days) y marca el edge-trigger', async () => {
    const suspendedAt = new Date(NOW.getTime() - 25 * DAY);
    prisma.service.findMany.mockResolvedValueOnce([
      suspendedService({ suspended_at: suspendedAt }),
    ]);

    const summary = await worker.runCancellationNotices(NOW);

    expect(summary).toEqual({ checked: 1, notified: 1, errors: 0 });
    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { metadata: { cancellation_notice_sent_at: NOW.toISOString() } },
    });
    expect(emitSpy).toHaveBeenCalledWith('service.cancellation_scheduled', {
      service_id: 'svc-1',
      user_id: 'user-1',
      scheduled_cancellation_date: new Date(
        suspendedAt.getTime() + 30 * DAY,
      ).toISOString(),
    });
  });

  it('preserva otras claves de metadata al marcar el flag', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      suspendedService({ metadata: { foo: 'bar' } }),
    ]);

    await worker.runCancellationNotices(NOW);

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: {
        metadata: {
          foo: 'bar',
          cancellation_notice_sent_at: NOW.toISOString(),
        },
      },
    });
  });

  it('NO re-avisa si ya se avisó en esta suspensión (sent_at >= suspended_at)', async () => {
    const suspendedAt = new Date(NOW.getTime() - 25 * DAY);
    prisma.service.findMany.mockResolvedValueOnce([
      suspendedService({
        suspended_at: suspendedAt,
        metadata: {
          cancellation_notice_sent_at: new Date(
            suspendedAt.getTime() + DAY,
          ).toISOString(),
        },
      }),
    ]);

    const summary = await worker.runCancellationNotices(NOW);

    expect(summary.notified).toBe(0);
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalledWith(
      'service.cancellation_scheduled',
      expect.anything(),
    );
  });

  it('RE-avisa tras una re-suspensión (flag obsoleto de un ciclo anterior: sent_at < suspended_at)', async () => {
    const suspendedAt = new Date(NOW.getTime() - 25 * DAY);
    prisma.service.findMany.mockResolvedValueOnce([
      suspendedService({
        suspended_at: suspendedAt,
        metadata: {
          cancellation_notice_sent_at: new Date(
            suspendedAt.getTime() - 60 * DAY,
          ).toISOString(),
        },
      }),
    ]);

    const summary = await worker.runCancellationNotices(NOW);

    expect(summary.notified).toBe(1);
    expect(emitSpy).toHaveBeenCalledWith(
      'service.cancellation_scheduled',
      expect.objectContaining({ service_id: 'svc-1' }),
    );
  });

  it('clampa el lead si cancellation_notice_days >= cancellation_days (sin ventana vacía)', async () => {
    setSettings(30, 40);

    await worker.runCancellationNotices(NOW);

    // noticeDays clamped a 30 → noticeCutoff = now (now - 0d).
    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: {
        status: 'suspended',
        paused_at: null,
        NOT: { suspension_reason: { startsWith: 'not_renewed' } },
        suspended_at: { lte: NOW, gt: new Date(NOW.getTime() - 30 * DAY) },
      },
      select: { id: true, user_id: true, suspended_at: true, metadata: true },
    });
  });

  it('tolera el fallo de un servicio (update lanza) y sigue con el resto', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      suspendedService({ id: 'svc-bad' }),
      suspendedService({ id: 'svc-ok', user_id: 'user-2' }),
    ]);
    prisma.service.update
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({});

    const summary = await worker.runCancellationNotices(NOW);

    expect(summary).toEqual({ checked: 2, notified: 1, errors: 1 });
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      'service.cancellation_scheduled',
      expect.objectContaining({ service_id: 'svc-ok' }),
    );
  });

  it('sin servicios en la ventana → no emite nada', async () => {
    const summary = await worker.runCancellationNotices(NOW);

    expect(summary).toEqual({ checked: 0, notified: 0, errors: 0 });
    expect(emitSpy).not.toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
  });
});

/**
 * Tests unit F4·W3 — `runNonRenewedSuspension`: suspende los servicios de
 * HOSTING con auto-renovación OFF y periodo vencido (reason `not_renewed`,
 * actor sistema), excluye dominios (expiran en el registrador) y respeta una
 * factura abierta (deja el dunning por impago). Punto único de transición
 * (`suspendAsAdmin`), tolerante a fallos por servicio.
 */
describe('ServiceLifecycleWorker — F4·W3 (runNonRenewedSuspension)', () => {
  const NOW = new Date('2026-07-02T00:00:00Z');
  let prisma: {
    service: { findMany: jest.Mock };
    invoice: { findFirst: jest.Mock };
  };
  let provisioning: {
    suspendAsAdmin: jest.Mock;
    deprovisionAsAdmin: jest.Mock;
  };
  let worker: ServiceLifecycleWorker;

  beforeEach(() => {
    prisma = {
      service: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    provisioning = {
      suspendAsAdmin: jest.fn().mockResolvedValue({ alreadySuspended: false }),
      deprovisionAsAdmin: jest.fn(),
    };
    worker = new ServiceLifecycleWorker(
      prisma as never,
      new EventEmitter2(),
      { getSettingValue: jest.fn() } as never,
      provisioning as never,
      { enqueue: jest.fn() } as never,
    );
  });

  it('suspende hosting activo con auto_renew=false y periodo vencido (excluye dominios en la query; reason not_renewed + actor sistema)', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      { id: 'svc-h', user_id: 'u1' },
    ]);

    const summary = await worker.runNonRenewedSuspension(NOW);

    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        auto_renew: false,
        next_due_date: { lte: NOW },
        product: { type: { not: 'domain' } },
      },
      select: { id: true, user_id: true },
    });
    expect(provisioning.suspendAsAdmin).toHaveBeenCalledWith(
      'svc-h',
      expect.objectContaining({
        reason: SuspensionReasonDto.not_renewed,
        notify_client: true,
      }),
      null,
      undefined,
      { actorLabel: 'system:auto-renew-off-cron', allowUnsupported: true },
    );
    expect(summary).toEqual({ checked: 1, suspended: 1, errors: 0 });
  });

  it('NO suspende si hay una factura abierta (deja el dunning por impago)', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      { id: 'svc-h', user_id: 'u1' },
    ]);
    prisma.invoice.findFirst.mockResolvedValueOnce({ id: 'inv-open' });

    const summary = await worker.runNonRenewedSuspension(NOW);

    expect(provisioning.suspendAsAdmin).not.toHaveBeenCalled();
    expect(summary).toEqual({ checked: 1, suspended: 0, errors: 0 });
  });

  it('no cuenta como suspendido si el servicio ya estaba suspendido (idempotente)', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      { id: 'svc-h', user_id: 'u1' },
    ]);
    provisioning.suspendAsAdmin.mockResolvedValueOnce({
      alreadySuspended: true,
    });

    const summary = await worker.runNonRenewedSuspension(NOW);

    expect(summary).toEqual({ checked: 1, suspended: 0, errors: 0 });
  });

  it('tolera el fallo de un servicio y sigue con el resto', async () => {
    prisma.service.findMany.mockResolvedValueOnce([
      { id: 'a', user_id: 'u1' },
      { id: 'b', user_id: 'u2' },
    ]);
    provisioning.suspendAsAdmin
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ alreadySuspended: false });

    const summary = await worker.runNonRenewedSuspension(NOW);

    expect(summary).toEqual({ checked: 2, suspended: 1, errors: 1 });
  });
});
