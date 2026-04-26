import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * OutboxService — persiste eventos críticos en `event_outbox` dentro de la
 * misma transacción que el cambio de estado. Un worker (OutboxWorker) los
 * despacha vía EventEmitter2 después.
 *
 * Patrón de uso (R8 + ADR-033):
 *
 *   await this.prisma.$transaction(async (tx) => {
 *     await tx.invoice.update({ where: { id }, data: { status: 'paid' } });
 *     await this.outbox.enqueue(tx, 'invoice.paid', { invoice_id: id, ... });
 *   });
 *
 * Si el proceso muere entre commit y emit, el evento persiste en outbox y
 * será reprocesado al arrancar el worker.
 */
@Injectable()
export class OutboxService {
  /**
   * Encola un evento dentro de una transacción Prisma activa. La fila queda
   * en `status='pending'` hasta que el worker la dispache.
   */
  async enqueue<P extends Record<string, unknown>>(
    tx: Prisma.TransactionClient,
    eventType: string,
    payload: P,
  ): Promise<void> {
    await tx.eventOutbox.create({
      data: {
        event_type: eventType,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
