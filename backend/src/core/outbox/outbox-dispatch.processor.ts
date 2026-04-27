import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DlqService } from '../jobs/dlq.service';
import { RetryService } from '../jobs/retry.service';
import { OutboxWorker } from './outbox.worker';
import { getErrorMessage } from '../common/utils/error.util';

export const OUTBOX_DISPATCH_QUEUE = 'outbox-dispatch';
export const OUTBOX_TICK_JOB = 'outbox-tick';
export const OUTBOX_TICK_INTERVAL_MS = 5_000;

/**
 * OutboxDispatchProcessor — Sprint 9 Fase C (ADR-064).
 *
 * Sustituye el `@Interval(5s)` que el `OutboxWorker` usaba en P0.2 por un
 * job BullMQ scheduled (`repeat: { every: 5000 }`). Beneficios:
 *   - Leader election natural via Redis: con N instancias, sólo una ejecuta
 *     el tick — prerequisito de escalado horizontal (ADR-056 §13.30+).
 *   - Trazabilidad: el tick es un job BullMQ visible en `/admin/jobs/failed`
 *     si fallara — coherente con resto de colas (Sprint 9 Fase F).
 *   - DLQ: si el tick fallara repetidamente, queda en `failed_jobs` con
 *     alerta superadmin (R7+R13).
 *
 * El tick **siempre** debe completar OK; los fallos individuales de eventos
 * los gestiona `OutboxWorker.processEvent()` actualizando la fila en
 * `event_outbox`. Sólo errores estructurales (DB caída, bug en `claimBatch`)
 * harían fallar el job al worker.
 */
@Processor(OUTBOX_DISPATCH_QUEUE)
export class OutboxDispatchProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(OutboxDispatchProcessor.name);

  constructor(
    private readonly outboxWorker: OutboxWorker,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(OUTBOX_DISPATCH_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Registro en infra cross-cutting (ADR-063).
    this.dlq.register(OUTBOX_DISPATCH_QUEUE);
    this.retry.register(OUTBOX_DISPATCH_QUEUE, this.queue);

    // Programa el tick repetitivo. `upsertJobScheduler` es idempotente por
    // id — re-arranques o hot-reloads no duplican el scheduler.
    try {
      await this.queue.upsertJobScheduler(
        OUTBOX_TICK_JOB,
        { every: OUTBOX_TICK_INTERVAL_MS },
        {
          name: OUTBOX_TICK_JOB,
          opts: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 50 },
          },
        },
      );
      this.logger.log(
        `Outbox dispatch scheduled every ${OUTBOX_TICK_INTERVAL_MS}ms via BullMQ (ADR-064)`,
      );
    } catch (err) {
      // No tirar: si Redis está caído al boot, el resto del backend debe
      // seguir vivo. La cola se reintenta cuando Redis vuelva (BullMQ lazy).
      this.logger.error(
        `Failed to schedule outbox tick: ${getErrorMessage(err)}`,
      );
    }
  }

  async process(): Promise<void> {
    await this.outboxWorker.dispatch();
  }
}
