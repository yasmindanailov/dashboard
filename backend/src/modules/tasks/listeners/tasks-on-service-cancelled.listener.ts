import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { TasksService } from '../tasks.service';

interface ServiceCancelledPayload {
  service_id: string;
  user_id: string;
  reason?: string;
}

/**
 * TasksOnServiceCancelledListener — Sprint 16 Fase 16.B (ADR-079 §2 trigger #3).
 *
 * Cuando un servicio se cancela (admin manual o cron auto-cancel por impago),
 * cancelamos la task `provisioning_manual` activa vinculada al service.
 * Si el agente ya completó el setup, no hay task activa y este listener
 * sale silenciosamente.
 */
@Injectable()
export class TasksOnServiceCancelledListener {
  private readonly logger = new Logger(TasksOnServiceCancelledListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  @OnEvent('service.cancelled')
  async handle(payload: ServiceCancelledPayload): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: {
        source_system: 'provisioning_manual',
        source_id: payload.service_id,
        status: { in: ['pending', 'in_progress'] },
      },
      select: { id: true },
    });
    if (!existing) return;

    try {
      await this.tasks.cancel(
        existing.id,
        { reason: `Service cancelado (${payload.reason ?? 'manual'})` },
        payload.user_id,
      );
      this.logger.log(
        `provisioning_manual task ${existing.id} cancelled — service ${payload.service_id} cancelled`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to cancel service-task ${existing.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
