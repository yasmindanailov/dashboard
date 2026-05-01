import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DlqService } from '../../../core/jobs/dlq.service';
import { RetryService } from '../../../core/jobs/retry.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';
import { TasksUnassignedOverdueService } from './tasks-unassigned-overdue.service';

export const TASKS_UNASSIGNED_OVERDUE_QUEUE = 'tasks-unassigned-overdue';
export const TASKS_UNASSIGNED_OVERDUE_TICK_JOB =
  'tasks-unassigned-overdue-tick';
// Cron pattern: diario a las 09:00 UTC. Coincide con el inicio del día
// laboral europeo — la alerta llega al superadmin justo cuando empieza
// a operar (ADR-072 §"Doctrina permanente"). Coherente con el plan
// canónico Sprint 8 Fase C (current.md §10).
export const TASKS_UNASSIGNED_OVERDUE_CRON_PATTERN = '0 9 * * *';

/**
 * TasksUnassignedOverdueProcessor — Sprint 8 Fase C (2026-05-01) + ADR-072.
 *
 * BullMQ tick driver. Misma estructura que `TasksOverdueProcessor`: delega
 * en `TasksUnassignedOverdueService.run()` la lógica de negocio para
 * permitir testeo unitario y disparo manual desde el endpoint admin.
 */
@Processor(TASKS_UNASSIGNED_OVERDUE_QUEUE)
export class TasksUnassignedOverdueProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(TasksUnassignedOverdueProcessor.name);

  constructor(
    private readonly service: TasksUnassignedOverdueService,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(TASKS_UNASSIGNED_OVERDUE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.dlq.register(TASKS_UNASSIGNED_OVERDUE_QUEUE);
    this.retry.register(TASKS_UNASSIGNED_OVERDUE_QUEUE, this.queue);

    try {
      await this.queue.upsertJobScheduler(
        TASKS_UNASSIGNED_OVERDUE_TICK_JOB,
        { pattern: TASKS_UNASSIGNED_OVERDUE_CRON_PATTERN },
        {
          name: TASKS_UNASSIGNED_OVERDUE_TICK_JOB,
          opts: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 50 },
          },
        },
      );
      this.logger.log(
        `tasks-unassigned-overdue scheduled with cron "${TASKS_UNASSIGNED_OVERDUE_CRON_PATTERN}" via BullMQ (ADR-072)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to schedule tasks-unassigned-overdue tick: ${getErrorMessage(err)}`,
      );
    }
  }

  async process(): Promise<void> {
    await this.service.run();
  }
}
