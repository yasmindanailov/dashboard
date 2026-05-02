import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { TasksService } from '../tasks.service';

interface SlotReleasedPayload {
  slot_id: string;
  subscription_id: string;
  client_id: string;
  reason?: string;
}

/**
 * TasksOnSlotReleasedListener — Sprint 16 Fase 16.B (ADR-079 §2 trigger #2).
 *
 * Cuando un slot Support Inside se libera (cliente lo libera manualmente o
 * subscription cancelada), cancelamos la task `support_inside_slot` activa
 * vinculada al slot. Mantiene coherencia: la task ES el trabajo del agente
 * sobre el slot; si el slot deja de existir operativamente, la tarea
 * pierde sentido.
 */
@Injectable()
export class TasksOnSlotReleasedListener {
  private readonly logger = new Logger(TasksOnSlotReleasedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  @OnEvent('support_inside.slot_released')
  async handle(payload: SlotReleasedPayload): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: {
        source_system: 'support_inside_slot',
        source_id: payload.slot_id,
        status: { in: ['pending', 'in_progress'] },
      },
      select: { id: true },
    });
    if (!existing) return;

    try {
      await this.tasks.cancel(
        existing.id,
        { reason: `Slot liberado (${payload.reason ?? 'manual'})` },
        // Actor "system" — el cron / la operación que liberó el slot
        // puede haber sido el propio cliente o el cron, no un staff
        // concreto. Usamos el `client_id` para que la auditoría tenga
        // referencia (no se loguea en audit canónico hasta Sprint 9 Fase E).
        payload.client_id,
      );
      this.logger.log(
        `support_inside_slot task ${existing.id} cancelled — slot ${payload.slot_id} released`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to cancel slot task ${existing.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
