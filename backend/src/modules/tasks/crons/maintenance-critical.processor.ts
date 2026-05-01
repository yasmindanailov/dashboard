import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DlqService } from '../../../core/jobs/dlq.service';
import { RetryService } from '../../../core/jobs/retry.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';
import { MaintenanceCriticalService } from './maintenance-critical.service';

export const MAINTENANCE_CRITICAL_QUEUE = 'maintenance-critical';
export const MAINTENANCE_CRITICAL_TICK_JOB = 'maintenance-critical-tick';
// Cron pattern: diario a las 08:00 UTC. Llega antes que la cola
// `tasks-unassigned-overdue` (09:00) para que el superadmin tenga
// contexto operativo completo cuando empieza la jornada.
export const MAINTENANCE_CRITICAL_CRON_PATTERN = '0 8 * * *';

/**
 * MaintenanceCriticalProcessor — Sprint 8 Fase C (2026-05-01).
 *
 * BullMQ tick driver. Delega en `MaintenanceCriticalService.run()` para
 * permitir testeo unitario y disparo manual desde el endpoint admin
 * (`POST /admin/tasks/cron/maintenance-critical`).
 */
@Processor(MAINTENANCE_CRITICAL_QUEUE)
export class MaintenanceCriticalProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(MaintenanceCriticalProcessor.name);

  constructor(
    private readonly service: MaintenanceCriticalService,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(MAINTENANCE_CRITICAL_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.dlq.register(MAINTENANCE_CRITICAL_QUEUE);
    this.retry.register(MAINTENANCE_CRITICAL_QUEUE, this.queue);

    try {
      await this.queue.upsertJobScheduler(
        MAINTENANCE_CRITICAL_TICK_JOB,
        { pattern: MAINTENANCE_CRITICAL_CRON_PATTERN },
        {
          name: MAINTENANCE_CRITICAL_TICK_JOB,
          opts: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 50 },
          },
        },
      );
      this.logger.log(
        `maintenance-critical scheduled with cron "${MAINTENANCE_CRITICAL_CRON_PATTERN}" via BullMQ (ADR-063)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to schedule maintenance-critical tick: ${getErrorMessage(err)}`,
      );
    }
  }

  async process(): Promise<void> {
    await this.service.run();
  }
}
