import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { OutboxWorker } from './outbox.worker';

/**
 * Tests unit del OutboxWorker — Sprint 9 Fase C (ADR-064).
 *
 * Cobertura:
 *  - Listener OK → row marcado como `done` con `processed_at`.
 *  - Listener falla con retry_count < max-1 → `pending` + `next_retry_at`
 *    con backoff exponencial.
 *  - Listener falla con retry_count = max-1 → `failed` + emit `outbox.event_failed`.
 *  - `claimBatch` no se prueba aquí — usa `$queryRaw` y `$transaction`,
 *    cubiertos por E2E `outbox-invoice.spec.ts` contra Postgres real.
 */
describe('OutboxWorker', () => {
  let worker: OutboxWorker;
  let prisma: {
    eventOutbox: {
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let events: { emitAsync: jest.Mock; emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      eventOutbox: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(),
    };
    events = {
      emitAsync: jest.fn(),
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxWorker,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    worker = module.get(OutboxWorker);
  });

  type ProcessEvent = (event: {
    id: string;
    event_type: string;
    payload: Record<string, unknown>;
    retry_count: number;
    max_retries: number;
  }) => Promise<void>;

  /**
   * Acceso al método privado para testing — alternativa a exponerlo public.
   * Justificado: el método encapsula la lógica de retry/backoff que es el
   * núcleo de Fase C; testearlo aisladamente vale más que el coste del cast.
   */
  function processEvent(): ProcessEvent {
    return (
      worker as unknown as { processEvent: ProcessEvent }
    ).processEvent.bind(worker);
  }

  it('listener OK → marca row como done con processed_at + last_error null', async () => {
    events.emitAsync.mockResolvedValue([]);

    await processEvent()({
      id: 'evt-1',
      event_type: 'invoice.paid',
      payload: { invoice_id: 'inv-1' },
      retry_count: 0,
      max_retries: 5,
    });

    expect(events.emitAsync).toHaveBeenCalledWith('invoice.paid', {
      invoice_id: 'inv-1',
    });
    type UpdateArg = {
      where: { id: string };
      data: { status: string; processed_at: Date; last_error: null };
    };
    const calls = prisma.eventOutbox.update.mock.calls as UpdateArg[][];
    expect(calls[0][0].where).toEqual({ id: 'evt-1' });
    expect(calls[0][0].data.status).toBe('done');
    expect(calls[0][0].data.processed_at).toBeInstanceOf(Date);
    expect(calls[0][0].data.last_error).toBeNull();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('listener falla con retry_count=0 → pending + next_retry_at = +30s', async () => {
    events.emitAsync.mockRejectedValue(new Error('SMTP timeout'));
    const before = Date.now();

    await processEvent()({
      id: 'evt-2',
      event_type: 'invoice.paid',
      payload: {},
      retry_count: 0,
      max_retries: 5,
    });

    type UpdateArg = {
      where: { id: string };
      data: {
        status: string;
        retry_count: number;
        last_error: string;
        next_retry_at: Date;
      };
    };
    const calls = prisma.eventOutbox.update.mock.calls as UpdateArg[][];
    expect(calls[0][0].data.status).toBe('pending');
    expect(calls[0][0].data.retry_count).toBe(1);
    expect(calls[0][0].data.last_error).toContain('SMTP timeout');
    const delayMs = calls[0][0].data.next_retry_at.getTime() - before;
    expect(delayMs).toBeGreaterThanOrEqual(30_000);
    expect(delayMs).toBeLessThan(31_000);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('listener falla con retry_count=2 → backoff exponencial = +120s', async () => {
    events.emitAsync.mockRejectedValue(new Error('boom'));
    const before = Date.now();

    await processEvent()({
      id: 'evt-3',
      event_type: 'invoice.paid',
      payload: {},
      retry_count: 2,
      max_retries: 5,
    });

    type UpdateArg = {
      where: { id: string };
      data: { next_retry_at: Date };
    };
    const calls = prisma.eventOutbox.update.mock.calls as UpdateArg[][];
    const delayMs = calls[0][0].data.next_retry_at.getTime() - before;
    // 30s * 2^2 = 120s
    expect(delayMs).toBeGreaterThanOrEqual(120_000);
    expect(delayMs).toBeLessThan(121_000);
  });

  it('listener falla con retry_count=10 → backoff capado a 480s', async () => {
    events.emitAsync.mockRejectedValue(new Error('boom'));
    const before = Date.now();

    await processEvent()({
      id: 'evt-4',
      event_type: 'invoice.paid',
      payload: {},
      retry_count: 10,
      max_retries: 100,
    });

    type UpdateArg = {
      where: { id: string };
      data: { next_retry_at: Date };
    };
    const calls = prisma.eventOutbox.update.mock.calls as UpdateArg[][];
    const delayMs = calls[0][0].data.next_retry_at.getTime() - before;
    expect(delayMs).toBeGreaterThanOrEqual(480_000);
    expect(delayMs).toBeLessThan(481_000);
  });

  it('listener falla con retry_count = max-1 → status=failed + emit outbox.event_failed', async () => {
    events.emitAsync.mockRejectedValue(new Error('listener bug permanente'));

    await processEvent()({
      id: 'evt-5',
      event_type: 'invoice.paid',
      payload: { invoice_id: 'inv-x' },
      retry_count: 4,
      max_retries: 5,
    });

    type UpdateArg = {
      where: { id: string };
      data: { status: string; retry_count: number; last_error: string };
    };
    const calls = prisma.eventOutbox.update.mock.calls as UpdateArg[][];
    expect(calls[0][0].data.status).toBe('failed');
    expect(calls[0][0].data.retry_count).toBe(5);
    expect(calls[0][0].data.last_error).toContain('listener bug permanente');

    expect(events.emit).toHaveBeenCalledWith('outbox.event_failed', {
      event_outbox_id: 'evt-5',
      event_type: 'invoice.paid',
      last_error: expect.any(String) as unknown as string,
      retry_count: 5,
    });
  });

  it('onModuleInit recupera filas atascadas en processing → pending', async () => {
    prisma.eventOutbox.updateMany.mockResolvedValue({ count: 3 });

    await worker.onModuleInit();

    expect(prisma.eventOutbox.updateMany).toHaveBeenCalledWith({
      where: { status: 'processing' },
      data: { status: 'pending' },
    });
  });
});
