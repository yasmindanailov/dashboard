import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { DlqService } from '../../core/jobs/dlq.service';
import { RetryService } from '../../core/jobs/retry.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

import {
  PROVISIONING_DISPATCH_JOB,
  PROVISIONING_DISPATCH_QUEUE,
  ProvisioningOrchestratorService,
} from './provisioning-orchestrator.service';

export interface ProvisioningDispatchJobPayload {
  service_id: string;
  correlation_id: string;
}

/**
 * Sprint 11 Fase 11.B (2026-05-01) — Processor BullMQ del orquestador.
 *
 * Patrón canónico ADR-063 + ADR-064: cola con DLQ + retries con backoff
 * exponencial [30s, 90s, 270s] + leader election natural via Redis.
 *
 * El processor delega TODA la lógica en
 * `ProvisioningOrchestratorService.provisionService()` para mantenerlo
 * fino y testeable sin Redis (ver tests unit del service).
 *
 * Si el orquestador relanza un error (señal "retriable"), BullMQ reintenta
 * automáticamente. Si el orquestador no relanza, el job termina como
 * `completed` aunque el provisioning haya fallado de forma no-retriable
 * (en ese caso el orquestador ya emitió `service.provisioning_failed` y
 * marcó `services.status='cancelled'`).
 */
@Processor(PROVISIONING_DISPATCH_QUEUE)
export class ProvisioningDispatchProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ProvisioningDispatchProcessor.name);

  constructor(
    private readonly orchestrator: ProvisioningOrchestratorService,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(PROVISIONING_DISPATCH_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit(): void {
    this.dlq.register(PROVISIONING_DISPATCH_QUEUE);
    this.retry.register(PROVISIONING_DISPATCH_QUEUE, this.queue);
    this.logger.log(
      `${PROVISIONING_DISPATCH_QUEUE} processor ready (DLQ + retries registered).`,
    );
  }

  async process(job: Job<ProvisioningDispatchJobPayload>): Promise<void> {
    if (job.name !== PROVISIONING_DISPATCH_JOB) {
      this.logger.warn(`Unknown job name "${job.name}" — skipping.`);
      return;
    }

    const { service_id, correlation_id } = job.data;

    try {
      await this.orchestrator.provisionService(service_id, correlation_id);
    } catch (err) {
      // Re-throw para que BullMQ aplique backoff y reintente.
      // Si el orquestador NO relanzó, el error es genuinamente retriable
      // (network, timeout) — log y propagación al harness BullMQ.
      this.logger.warn(
        `Job ${job.id} (service ${service_id}) will retry: ${getErrorMessage(err)}`,
      );
      throw err;
    }
  }
}
