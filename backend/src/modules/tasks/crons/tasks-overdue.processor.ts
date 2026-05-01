import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DlqService } from '../../../core/jobs/dlq.service';
import { RetryService } from '../../../core/jobs/retry.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';
import { TasksOverdueService } from './tasks-overdue.service';

export const TASKS_OVERDUE_QUEUE = 'tasks-overdue';
export const TASKS_OVERDUE_TICK_JOB = 'tasks-overdue-tick';
// Cron pattern: diario a las 02:00 UTC (carga baja, fuera de ventanas de
// alto tráfico operativo). Coherente con el plan canónico Sprint 8 Fase C
// (current.md §10) y el patrón establecido por OutboxDispatchProcessor.
export const TASKS_OVERDUE_CRON_PATTERN = '0 2 * * *';

/**
 * TasksOverdueProcessor — Sprint 8 Fase C (2026-05-01).
 *
 * Tick driver del cron `tasks-overdue` siguiendo el patrón canónico ADR-063
 * + ADR-064 (BullMQ scheduled job con leader election natural via Redis).
 * Sustituye cualquier tentación de usar `@nestjs/schedule` in-process —
 * ADR-056 §13.30 lo prohíbe en código nuevo.
 *
 * El processor delega en `TasksOverdueService.run()` toda la lógica de
 * negocio. Esa separación permite:
 *   - Testeo unitario sin Redis ni BullMQ (`tasks-overdue.service.spec.ts`).
 *   - Disparo manual desde el endpoint admin de smoke testing
 *     (`POST /admin/tasks/cron/overdue`) sin mockear el processor.
 *
 * Hereda los defaults globales del JobsModule (attempts=5, backoff
 * exponencial 30s→480s). Si el tick falla repetidamente entra en DLQ
 * (failed_jobs + alerta superadmin via dlq.job_failed — ADR-063).
 */
@Processor(TASKS_OVERDUE_QUEUE)
export class TasksOverdueProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(TasksOverdueProcessor.name);

  constructor(
    private readonly service: TasksOverdueService,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(TASKS_OVERDUE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.dlq.register(TASKS_OVERDUE_QUEUE);
    this.retry.register(TASKS_OVERDUE_QUEUE, this.queue);

    try {
      await this.queue.upsertJobScheduler(
        TASKS_OVERDUE_TICK_JOB,
        { pattern: TASKS_OVERDUE_CRON_PATTERN },
        {
          name: TASKS_OVERDUE_TICK_JOB,
          opts: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 50 },
          },
        },
      );
      this.logger.log(
        `tasks-overdue scheduled with cron "${TASKS_OVERDUE_CRON_PATTERN}" via BullMQ (ADR-063)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to schedule tasks-overdue tick: ${getErrorMessage(err)}`,
      );
    }
  }

  async process(): Promise<void> {
    await this.service.run();
  }
}
