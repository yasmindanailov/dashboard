import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
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
 *  1. Cada 5s reclama un lote de filas `pending` con `FOR UPDATE SKIP LOCKED`
 *     (seguro frente a múltiples instancias del worker).
 *  2. Marca el lote como `processing`, emite vía `emitAsync` y espera a los
 *     listeners (`@OnEvent` async). Si todos OK → `done` + `processed_at`.
 *  3. Si algún listener falla → incrementa `retry_count`, guarda `last_error`.
 *     Si llegó a `max_retries` → estado `failed` (revisión manual / alerta R7).
 *     Si no → vuelve a `pending` para el siguiente tick.
 *  4. Al arrancar el módulo, recupera filas atascadas en `processing`
 *     (de un proceso que murió mid-emit) devolviéndolas a `pending`.
 *
 * Limitaciones conocidas (cierran en Sprint 9 / migración BullMQ):
 *  - Backoff inmediato (próximo tick) — no exponencial.
 *  - Sin alerta automática al superadmin cuando un evento llega a `failed`
 *    (R7 lo cubrirá cuando el módulo audit/notifications dispatchee outbox).
 */
@Injectable()
export class OutboxWorker implements OnModuleInit {
  private readonly logger = new Logger(OutboxWorker.name);
  private static readonly BATCH_SIZE = 50;
  private static readonly INTERVAL_MS = 5000;
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

  @Interval(OutboxWorker.INTERVAL_MS)
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
      const message = (err as Error).message ?? 'unknown error';
      const newRetryCount = event.retry_count + 1;
      const exhausted = newRetryCount >= event.max_retries;
      await this.prisma.eventOutbox.update({
        where: { id: event.id },
        data: {
          status: exhausted ? 'failed' : 'pending',
          retry_count: newRetryCount,
          last_error: message.slice(0, 1000),
        },
      });
      this.logger.error(
        `Outbox ${event.event_type} (${event.id}) failed attempt ${newRetryCount}/${event.max_retries}: ${message}` +
          (exhausted ? ' — moved to FAILED, manual review required' : ''),
      );
    }
  }
}
