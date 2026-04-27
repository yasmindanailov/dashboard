import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { Job, Queue, QueueEvents } from 'bullmq';
import { PrismaService } from '../database/prisma.service';

/**
 * DlqService — Dead Letter Queue persistente (R13 + ADR-063).
 *
 * Cada módulo que registra una cola BullMQ debe llamar `dlqService.register(queueName)`
 * en su `OnModuleInit`. El DlqService:
 *
 *  1. Crea un `QueueEvents` listener para esa cola.
 *  2. Cuando un job falla y agotó `attempts`, lee el payload original via
 *     `Job.fromId()` y persiste fila en tabla `failed_jobs` (post-mortem
 *     permanente, sobrevive a reinicios de Redis).
 *  3. Emite evento `dlq.job_failed` consumido por `notifications-dlq.listener`
 *     (Sprint 9 Fase D) para alertar al superadmin (R7).
 *
 * El listener se cierra limpiamente en `OnModuleDestroy` para no filtrar
 * conexiones Redis durante graceful shutdown (ADR-055 §Graceful shutdown).
 */
@Injectable()
export class DlqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlqService.name);
  private readonly queueEvents = new Map<string, QueueEvents>();
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    // Las colas se registran de forma diferida vía `register()` desde cada módulo.
    // No hacemos nada aquí — el constructor ya inicializó las maps vacías.
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, qe] of this.queueEvents) {
      try {
        await qe.close();
      } catch (err) {
        this.logger.warn(
          `Error closing QueueEvents for "${name}": ${(err as Error).message}`,
        );
      }
    }
    for (const [name, q] of this.queues) {
      try {
        await q.close();
      } catch (err) {
        this.logger.warn(
          `Error closing Queue handle for "${name}": ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Registra una cola para captura DLQ. Idempotente — registrar la misma cola
   * dos veces no duplica listeners.
   */
  register(queueName: string): void {
    if (this.queueEvents.has(queueName)) return;

    const url = this.config.getOrThrow<string>('REDIS_URL');
    const prefix = this.config.get<string>('BULLMQ_PREFIX') ?? 'aelium-jobs';
    const connection = { url, db: 1 };

    const qe = new QueueEvents(queueName, { connection, prefix });
    const queue = new Queue(queueName, { connection, prefix });

    qe.on('failed', ({ jobId, failedReason, prev }) => {
      void this.handleFailed(queueName, jobId, failedReason, prev);
    });

    this.queueEvents.set(queueName, qe);
    this.queues.set(queueName, queue);
    this.logger.log(`DLQ listener registered for queue "${queueName}"`);
  }

  /**
   * Persiste el job failed en la tabla `failed_jobs` y emite alerta.
   * Solo actúa cuando el job ha agotado todos sus retries — un fallo intermedio
   * no debe llenar la tabla de post-mortem.
   */
  private async handleFailed(
    queueName: string,
    jobId: string,
    failedReason: string,
    prev: string | undefined,
  ): Promise<void> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) return;

      const job = await Job.fromId(queue, jobId);
      if (!job) {
        this.logger.warn(
          `Job ${jobId} no longer in queue "${queueName}"; cannot persist DLQ row`,
        );
        return;
      }

      const attemptsMax = job.opts.attempts ?? 5;
      // BullMQ emite `failed` también en fallos intermedios. Solo persistimos
      // cuando el job agotó retries — el contador `attemptsMade` ya refleja
      // el intento actual incluido.
      if (job.attemptsMade < attemptsMax) return;

      // Idempotencia: si ya hay un row para este (queue, bull_job_id), no duplicar.
      const existing = await this.prisma.failedJob.findFirst({
        where: { queue: queueName, bull_job_id: jobId },
        select: { id: true },
      });
      if (existing) return;

      const stack = job.stacktrace?.[0];
      const failed = await this.prisma.failedJob.create({
        data: {
          bull_job_id: jobId,
          queue: queueName,
          name: job.name,
          payload: (job.data ?? {}) as Prisma.InputJsonValue,
          last_error: failedReason || prev || 'unknown',
          stack_trace: stack ?? null,
          attempts_made: job.attemptsMade,
        },
        select: { id: true, queue: true, name: true, attempts_made: true },
      });

      this.events.emit('dlq.job_failed', {
        failed_job_id: failed.id,
        queue: failed.queue,
        name: failed.name,
        last_error: failedReason || prev || 'unknown',
        attempts_made: failed.attempts_made,
      });

      this.logger.error(
        `Job "${queueName}:${job.name}" entered DLQ after ${job.attemptsMade} attempts: ${failedReason}`,
      );
    } catch (err) {
      // No relanzar: el listener QueueEvents debe sobrevivir errores de BD.
      this.logger.error(
        `DLQ handler failed for ${queueName}:${jobId}: ${(err as Error).message}`,
      );
    }
  }
}
