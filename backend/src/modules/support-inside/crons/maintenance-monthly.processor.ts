import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DlqService } from '../../../core/jobs/dlq.service';
import { RetryService } from '../../../core/jobs/retry.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';
import { MaintenanceMonthlyService } from './maintenance-monthly.service';

export const MAINTENANCE_MONTHLY_QUEUE = 'maintenance-monthly';
export const MAINTENANCE_MONTHLY_TICK_JOB = 'maintenance-monthly-tick';
// Sub-fase 8.D.12.1 (2026-05-01): cron diario a las 06:00 UTC. Cada día
// el service filtra slots con `anniversary_day = EXTRACT(DAY FROM NOW())`
// — distribuye carga a lo largo del mes (ADR-034 §recurrencia) en lugar
// de concentrar todo el día 1.
//
// Antes (Fase D.7): `0 6 1 * *` (todos día 1) — drift respecto a ADR-034
// detectado en auditoría 2026-05-01. Reescrito en sub-fase 8.D.12.1.
export const MAINTENANCE_MONTHLY_CRON_PATTERN = '0 6 * * *';

/**
 * MaintenanceMonthlyProcessor — Sprint 8 Fase D (2026-05-01).
 *
 * BullMQ tick driver. Mismo patrón que TasksOverdueProcessor / etc.
 * (Sprint 8 Fase C) — delega en MaintenanceMonthlyService.run() para
 * permitir testeo unitario y disparo manual desde el endpoint admin.
 *
 * Cumple ADR-063 (BullMQ canónico) + ADR-064 (leader election natural via
 * Redis — prerequisito de escalado horizontal ADR-056 §13.30+).
 */
@Processor(MAINTENANCE_MONTHLY_QUEUE)
export class MaintenanceMonthlyProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(MaintenanceMonthlyProcessor.name);

  constructor(
    private readonly service: MaintenanceMonthlyService,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(MAINTENANCE_MONTHLY_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.dlq.register(MAINTENANCE_MONTHLY_QUEUE);
    this.retry.register(MAINTENANCE_MONTHLY_QUEUE, this.queue);

    try {
      await this.queue.upsertJobScheduler(
        MAINTENANCE_MONTHLY_TICK_JOB,
        { pattern: MAINTENANCE_MONTHLY_CRON_PATTERN },
        {
          name: MAINTENANCE_MONTHLY_TICK_JOB,
          opts: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 50 },
          },
        },
      );
      this.logger.log(
        `maintenance-monthly scheduled with cron "${MAINTENANCE_MONTHLY_CRON_PATTERN}" via BullMQ (ADR-063)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to schedule maintenance-monthly tick: ${getErrorMessage(err)}`,
      );
    }
  }

  async process(): Promise<void> {
    await this.service.run();
  }
}
