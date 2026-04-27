import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service';

/**
 * RetryService — reintento manual de jobs en DLQ (R13 + ADR-063).
 *
 * Llamado desde `POST /api/v1/admin/jobs/:id/retry` (Sprint 9 Fase F).
 *
 *  1. Lee la fila `failed_jobs` por id.
 *  2. Reencola el job en su cola original con un `jobId` único de retry
 *     y `attempts=5` reseteado.
 *  3. Marca la fila como `retrying` y guarda audit (`retried_at` + `retried_by`).
 *
 * El nuevo job usa los defaults globales del `JobsModule` (backoff exponencial).
 * Si vuelve a fallar, el `DlqService` creará una fila NUEVA en `failed_jobs`
 * (correlación via `payload`) — no sobrescribe la original. Esto preserva
 * audit trail completo de cada intento de reintento manual.
 *
 * Las colas se obtienen de un mapa `queueName → Queue` que se popula en
 * `register()` desde cada módulo (mismo patrón que `DlqService`).
 */
@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registra una instancia de Queue para reencolar. Idempotente.
   * Cada módulo que use `dlqService.register()` debe también llamar
   * `retryService.register()` con la misma cola.
   */
  register(queueName: string, queue: Queue): void {
    if (this.queues.has(queueName)) return;
    this.queues.set(queueName, queue);
  }

  async retry(
    failedJobId: string,
    actorId: string,
  ): Promise<{ retried: true }> {
    const failed = await this.prisma.failedJob.findUnique({
      where: { id: failedJobId },
    });
    if (!failed) {
      throw new NotFoundException(`Failed job ${failedJobId} no encontrado`);
    }
    if (failed.status !== 'failed') {
      throw new BadRequestException(
        `Job ya está en estado ${failed.status} — no se puede reintentar`,
      );
    }

    const queue = this.queues.get(failed.queue);
    if (!queue) {
      throw new BadRequestException(
        `Cola "${failed.queue}" no registrada en RetryService`,
      );
    }

    await queue.add(failed.name, failed.payload as Prisma.InputJsonValue, {
      jobId: `retry-${failed.id}`,
      attempts: this.config.get<number>('JOBS_DEFAULT_RETRIES') ?? 5,
    });

    await this.prisma.failedJob.update({
      where: { id: failedJobId },
      data: {
        status: 'retrying',
        retried_at: new Date(),
        retried_by: actorId,
      },
    });

    this.logger.log(
      `Retry enqueued: failed_job=${failedJobId} queue=${failed.queue} actor=${actorId}`,
    );

    return { retried: true };
  }
}
