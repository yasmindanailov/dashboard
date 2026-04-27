import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';
import {
  OutboxDispatchProcessor,
  OUTBOX_DISPATCH_QUEUE,
} from './outbox-dispatch.processor';

/**
 * OutboxModule — implementa Outbox Pattern (R8 + ADR-033).
 *
 * Sprint 9 Fase C (ADR-064): el dispatch del worker corre como repeat job
 * BullMQ (cola `outbox-dispatch`) en lugar del `@Interval(5s)` previo —
 * habilita leader election natural multi-instancia (ADR-056 §13.30+).
 *
 * @Global porque cualquier módulo de negocio que emita eventos críticos
 * (billing, futuros service/partner/checkout) debe poder inyectar
 * `OutboxService.enqueue()` dentro de sus transacciones sin importarlo
 * explícitamente cada vez.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: OUTBOX_DISPATCH_QUEUE })],
  providers: [OutboxService, OutboxWorker, OutboxDispatchProcessor],
  exports: [OutboxService],
})
export class OutboxModule {}
