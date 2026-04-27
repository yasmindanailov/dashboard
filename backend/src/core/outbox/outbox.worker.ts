import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';

interface OutboxRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
}

/**
 * OutboxWorker — despacha eventos persistidos en `event_outbox` vía
 * EventEmitter2 con semántica at-least-once. Implementa R8 + ADR-033.
 *
 * Estrategia:
 *  1. `dispatch()` reclama un lote de filas `pending` elegibles
 *     (`next_retry_at IS NULL OR next_retry_at <= now()`) con
 *     `FOR UPDATE SKIP LOCKED` (seguro multi-instancia).
 *  2. Marca el lote como `processing`, emite vía `emitAsync` y espera a los
 *     listeners (`@OnEvent` async). Si todos OK → `done` + `processed_at`.
 *  3. Si algún listener falla → incrementa `retry_count`, guarda `last_error`
 *     y programa `next_retry_at` con backoff exponencial 30s→480s (ADR-055
 *     + ADR-064). Si alcanza `max_retries` → estado `failed` y emit del
 *     evento `outbox.event_failed` para alerta superadmin (R7 + ADR-033 §7).
 *  4. `onModuleInit()` recupera filas atascadas en `processing`
 *     (de un proceso que murió mid-emit) devolviéndolas a `pending`.
 *
 * Quien invoca `dispatch()` es el `OutboxDispatchProcessor` (Sprint 9 Fase C),
 * que lo programa via cola BullMQ `outbox-dispatch` con `repeat: { every: 5s }`.
 * La migración a BullMQ habilita leader election natural en escenarios
 * multi-instancia (ADR-056 §13.30+, ADR-064).
 */
@Injectable()
export class OutboxWorker implements OnModuleInit {
  private readonly logger = new Logger(OutboxWorker.name);
  private static readonly BATCH_SIZE = 50;
  private static readonly BACKOFF_INITIAL_MS = 30_000;
  private static readonly BACKOFF_CAP_MS = 480_000;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    const recovered = await this.prisma.eventOutbox.updateMany({
      where: { status: 'processing' },
      data: { status: 'pending' },
    });
    if (recovered.count > 0) {
      this.logger.warn(
        `Recovered ${recovered.count} outbox events stuck in 'processing' (likely from previous crash)`,
      );
    }
  }

  /**
   * Tick del dispatcher. Invocado por `OutboxDispatchProcessor` (BullMQ
   * scheduled job, repeat every 5s — ADR-064). El guard `isProcessing`
   * previene reentrancy si dos jobs se solapan en la misma instancia.
   */
  async dispatch(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const claimed = await this.claimBatch();
      for (const event of claimed) {
        await this.processEvent(event);
      }
    } catch (err) {
      this.logger.error(
        `Outbox dispatch tick failed: ${(err as Error).message}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async claimBatch(): Promise<OutboxRow[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, event_type, payload, retry_count, max_retries
        FROM event_outbox
        WHERE status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= now())
        ORDER BY created_at ASC
        LIMIT ${OutboxWorker.BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      await tx.eventOutbox.updateMany({
        where: { id: { in: ids } },
        data: { status: 'processing' },
      });
      return rows;
    });
  }

  private async processEvent(event: OutboxRow): Promise<void> {
    try {
      await this.eventEmitter.emitAsync(event.event_type, event.payload);
      await this.prisma.eventOutbox.update({
        where: { id: event.id },
        data: { status: 'done', processed_at: new Date(), last_error: null },
      });
    } catch (err) {
      const message = ((err as Error).message ?? 'unknown error').slice(
        0,
        1000,
      );
      const newRetryCount = event.retry_count + 1;
      const exhausted = newRetryCount >= event.max_retries;

      if (exhausted) {
        await this.prisma.eventOutbox.update({
          where: { id: event.id },
          data: {
            status: 'failed',
            retry_count: newRetryCount,
            last_error: message,
          },
        });
        // Emit alerta operativa (cumple R7 + cierra ADR-033 §7).
        // Consumidor: `notifications-outbox.listener` (Sprint 9 Fase D).
        // Hasta entonces el evento queda huérfano; el row Outbox persiste
        // como `failed` y es recuperable manualmente.
        this.eventEmitter.emit('outbox.event_failed', {
          event_outbox_id: event.id,
          event_type: event.event_type,
          last_error: message,
          retry_count: newRetryCount,
        });
        this.logger.error(
          `Outbox ${event.event_type} (${event.id}) failed attempt ${newRetryCount}/${event.max_retries}: ${message} — moved to FAILED, manual review required`,
        );
      } else {
        const delayMs = Math.min(
          OutboxWorker.BACKOFF_INITIAL_MS * 2 ** event.retry_count,
          OutboxWorker.BACKOFF_CAP_MS,
        );
        const nextRetryAt = new Date(Date.now() + delayMs);
        await this.prisma.eventOutbox.update({
          where: { id: event.id },
          data: {
            status: 'pending',
            retry_count: newRetryCount,
            last_error: message,
            next_retry_at: nextRetryAt,
          },
        });
        this.logger.warn(
          `Outbox ${event.event_type} (${event.id}) failed attempt ${newRetryCount}/${event.max_retries}: ${message} — retry in ${delayMs}ms`,
        );
      }
    }
  }
}
