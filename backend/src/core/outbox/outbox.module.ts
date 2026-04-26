import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

/**
 * OutboxModule — implementa Outbox Pattern (R8 + ADR-033).
 *
 * @Global porque cualquier módulo de negocio que emita eventos críticos
 * (billing, futuros service/partner/checkout) debe poder inyectar
 * `OutboxService.enqueue()` dentro de sus transacciones sin importarlo
 * explícitamente cada vez.
 */
@Global()
@Module({
  providers: [OutboxService, OutboxWorker],
  exports: [OutboxService],
})
export class OutboxModule {}
