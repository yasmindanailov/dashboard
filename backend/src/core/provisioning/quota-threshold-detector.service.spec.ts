import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

import { QuotaThresholdDetectorService } from './quota-threshold-detector.service';
import type { ServiceMetrics } from './types';

/**
 * Tests unit `QuotaThresholdDetectorService` — Sprint 15C.II Fase F.8
 * (dossier §A.11.10.5.1 R1/R2/R5/R6).
 *
 * Cobertura — los 7 escenarios del DoD F.8 (refinado):
 *   1. M8 — sin `diskTotalMb` → `noop_no_total`.
 *   2. M8 — `diskTotalMb=0` → `noop_no_total` (edge defensivo).
 *   3. M4 — boundary inclusivo `pct === threshold` → `crossed_up`.
 *   4. above + no fila previa → `crossed_up` con emit.
 *   5. above + fila previa `crossed_up` → `no_transition` SIN re-emit
 *      (DoD literal F.8 — "cruza umbral dos pasadas seguidas → un solo email").
 *   6. below + fila previa `crossed_up` → `crossed_down` SIN emit.
 *   7. above + fila previa `crossed_down` → `crossed_up` con emit (re-cross).
 *   8. tx failure → `tx_failed`, error logueado, no relanza.
 */
describe('QuotaThresholdDetectorService — Sprint 15C.II Fase F.8', () => {
  let detector: QuotaThresholdDetectorService;
  let txContext: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  let prismaTransaction: jest.Mock;
  let eventEmit: jest.Mock;

  const SERVICE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const PLUGIN_SLUG = 'enhance_cp';
  const THRESHOLD = 85;

  function metrics(
    diskUsedMb: number,
    diskTotalMb: number | undefined,
  ): ServiceMetrics {
    const m: ServiceMetrics = { fetchedAt: '2026-05-16T12:00:00.000Z' };
    if (diskUsedMb !== undefined) m.diskUsedMb = diskUsedMb;
    if (diskTotalMb !== undefined) m.diskTotalMb = diskTotalMb;
    return m;
  }

  beforeEach(async () => {
    txContext = {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'new-alert-id' }),
    };
    // El detector llama `this.prisma.$transaction(async (tx) => ...)` con
    // un `tx` mock que expone `serviceQuotaAlert.{findFirst,create}`.
    prismaTransaction = jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({ serviceQuotaAlert: txContext });
      });
    eventEmit = jest.fn();

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaThresholdDetectorService,
        {
          provide: PrismaService,
          useValue: { $transaction: prismaTransaction },
        },
        { provide: EventEmitter2, useValue: { emit: eventEmit } },
      ],
    }).compile();

    detector = module.get(QuotaThresholdDetectorService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── M8 — sin total → no-op ───────────────────────────────────────────

  it('M8 — sin diskTotalMb → noop_no_total (no tx, no emit)', async () => {
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(5000, undefined),
      thresholdPct: THRESHOLD,
    });
    expect(result.action).toBe('noop_no_total');
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(eventEmit).not.toHaveBeenCalled();
  });

  it('M8 — diskTotalMb=0 → noop_no_total (edge defensivo)', async () => {
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(0, 0),
      thresholdPct: THRESHOLD,
    });
    expect(result.action).toBe('noop_no_total');
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  // ─── M4 — boundary inclusivo ──────────────────────────────────────────

  it('M4 — pct EXACTAMENTE igual al threshold → crossed_up (umbral inclusivo)', async () => {
    txContext.findFirst.mockResolvedValueOnce(null);
    // 8500 / 10000 = 85 exactos
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(8500, 10000),
      thresholdPct: 85,
    });
    expect(result.action).toBe('crossed_up');
    expect(txContext.create).toHaveBeenCalledTimes(1);
    expect(eventEmit).toHaveBeenCalledTimes(1);
  });

  // ─── crossed_up nuevo ─────────────────────────────────────────────────

  it('above + sin fila previa → crossed_up con emit (variables coherentes)', async () => {
    txContext.findFirst.mockResolvedValueOnce(null);
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(8700, 10000),
      thresholdPct: THRESHOLD,
    });
    expect(result.action).toBe('crossed_up');
    expect(result.pct).toBeCloseTo(87, 5);
    // Insert canónico
    expect(txContext.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `expect.objectContaining` retorna `any` por su firma Jest.
      data: expect.objectContaining({
        service_id: SERVICE_ID,
        resource: 'disk',
        kind: 'crossed_up',
      }),
    });
    // Emit canónico (shape R5)
    expect(eventEmit).toHaveBeenCalledWith(
      'service.quota_threshold_crossed',
      expect.objectContaining({
        service_id: SERVICE_ID,
        user_id: USER_ID,
        plugin_slug: PLUGIN_SLUG,
        resource: 'disk',
        used_pct: 87,
        threshold_pct: THRESHOLD,
        used_mb: 8700,
        total_mb: 10000,
        detected_at: expect.any(String) as unknown,
      }),
    );
  });

  // ─── DoD F.8 anti-spam ────────────────────────────────────────────────

  it('above + última fila crossed_up → no_transition SIN re-emit (DoD F.8 anti-spam)', async () => {
    txContext.findFirst.mockResolvedValueOnce({ kind: 'crossed_up' });
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(9200, 10000),
      thresholdPct: THRESHOLD,
    });
    expect(result.action).toBe('no_transition');
    expect(txContext.create).not.toHaveBeenCalled();
    expect(eventEmit).not.toHaveBeenCalled();
  });

  // ─── crossed_down sin emit ────────────────────────────────────────────

  it('below + última fila crossed_up → crossed_down SIN emit (solo state)', async () => {
    txContext.findFirst.mockResolvedValueOnce({ kind: 'crossed_up' });
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(7000, 10000),
      thresholdPct: THRESHOLD,
    });
    expect(result.action).toBe('crossed_down');
    expect(txContext.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `expect.objectContaining` retorna `any` por su firma Jest.
      data: expect.objectContaining({
        service_id: SERVICE_ID,
        resource: 'disk',
        kind: 'crossed_down',
      }),
    });
    expect(eventEmit).not.toHaveBeenCalled();
  });

  it('below + sin fila previa → no_transition (sin acción, ya estamos below baseline)', async () => {
    txContext.findFirst.mockResolvedValueOnce(null);
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(5000, 10000),
      thresholdPct: THRESHOLD,
    });
    expect(result.action).toBe('no_transition');
    expect(txContext.create).not.toHaveBeenCalled();
    expect(eventEmit).not.toHaveBeenCalled();
  });

  // ─── re-cross above tras crossed_down → nuevo email ───────────────────

  it('above + última fila crossed_down → crossed_up con emit (re-cross genera 2º email)', async () => {
    txContext.findFirst.mockResolvedValueOnce({ kind: 'crossed_down' });
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(8800, 10000),
      thresholdPct: THRESHOLD,
    });
    expect(result.action).toBe('crossed_up');
    expect(txContext.create).toHaveBeenCalledTimes(1);
    expect(eventEmit).toHaveBeenCalledTimes(1);
  });

  // ─── M2 — Serializable failure ────────────────────────────────────────

  it('M2 — falla la $transaction (conflict serializable) → tx_failed sin relanzar', async () => {
    prismaTransaction.mockRejectedValueOnce(
      new Error('Could not serialize access due to read/write dependencies'),
    );
    const result = await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(8700, 10000),
      thresholdPct: THRESHOLD,
    });
    expect(result.action).toBe('tx_failed');
    expect(eventEmit).not.toHaveBeenCalled();
  });

  // ─── M2 — isolation level se pasa al $transaction ─────────────────────

  it('M2 — $transaction se invoca con isolationLevel: Serializable', async () => {
    txContext.findFirst.mockResolvedValueOnce(null);
    await detector.detectAndNotify({
      serviceId: SERVICE_ID,
      userId: USER_ID,
      pluginSlug: PLUGIN_SLUG,
      metrics: metrics(8700, 10000),
      thresholdPct: THRESHOLD,
    });
    expect(prismaTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  // ─── R7 — emit fail después de persist NO relanza ─────────────────────

  it('R7 — emit del evento lanza error tras persist → result intacto + error logueado, sin relanzar', async () => {
    txContext.findFirst.mockResolvedValueOnce(null);
    eventEmit.mockImplementationOnce(() => {
      throw new Error('EventBus down');
    });
    // No debe relanzar — la fila ya está persistida; perder el email es
    // aceptable según R7.
    await expect(
      detector.detectAndNotify({
        serviceId: SERVICE_ID,
        userId: USER_ID,
        pluginSlug: PLUGIN_SLUG,
        metrics: metrics(8700, 10000),
        thresholdPct: THRESHOLD,
      }),
    ).resolves.toEqual(expect.objectContaining({ action: 'crossed_up' }));
  });
});
