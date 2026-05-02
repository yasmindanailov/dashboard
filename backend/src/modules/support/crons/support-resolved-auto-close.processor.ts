import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DlqService } from '../../../core/jobs/dlq.service';
import { RetryService } from '../../../core/jobs/retry.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';
import { SupportResolvedAutoCloseService } from './support-resolved-auto-close.service';

export const SUPPORT_RESOLVED_AUTO_CLOSE_QUEUE = 'support-resolved-auto-close';
export const SUPPORT_RESOLVED_AUTO_CLOSE_TICK_JOB =
  'support-resolved-auto-close-tick';
// Cron pattern: diario a las 02:30 UTC (carga baja, evita colisión con
// `tasks-overdue` 02:00). Coherente con ADR-063 (BullMQ scheduled jobs).
export const SUPPORT_RESOLVED_AUTO_CLOSE_CRON_PATTERN = '30 2 * * *';

/**
 * SupportResolvedAutoCloseProcessor — Sprint 16 (ADR-079 amendment).
 *
 * BullMQ scheduled job que dispara el auto-cierre de tickets `resolved`
 * inactivos. Delega en `SupportResolvedAutoCloseService.run()` la lógica de
 * negocio. Sigue el patrón canónico ADR-063 + ADR-064 (leader election
 * natural via Redis). Inheirita defaults globales JobsModule (attempts=5,
 * backoff exponencial 30s→480s).
 */
@Processor(SUPPORT_RESOLVED_AUTO_CLOSE_QUEUE)
export class SupportResolvedAutoCloseProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(
    SupportResolvedAutoCloseProcessor.name,
  );

  constructor(
    private readonly service: SupportResolvedAutoCloseService,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(SUPPORT_RESOLVED_AUTO_CLOSE_QUEUE)
    private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.dlq.register(SUPPORT_RESOLVED_AUTO_CLOSE_QUEUE);
    this.retry.register(SUPPORT_RESOLVED_AUTO_CLOSE_QUEUE, this.queue);

    try {
      await this.queue.upsertJobScheduler(
        SUPPORT_RESOLVED_AUTO_CLOSE_TICK_JOB,
        { pattern: SUPPORT_RESOLVED_AUTO_CLOSE_CRON_PATTERN },
        {
          name: SUPPORT_RESOLVED_AUTO_CLOSE_TICK_JOB,
          opts: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 50 },
          },
        },
      );
      this.logger.log(
        `support-resolved-auto-close scheduled with cron "${SUPPORT_RESOLVED_AUTO_CLOSE_CRON_PATTERN}" via BullMQ (ADR-063)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to schedule support-resolved-auto-close tick: ${getErrorMessage(err)}`,
      );
    }
  }

  async process(): Promise<void> {
    await this.service.run();
  }
}
