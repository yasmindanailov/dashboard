import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TaskPriority, SupportInsidePriorityTier } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { ClientsService } from '../clients.service';
import { calculateTaskPriority } from '../../../core/tasks/priority-helper';
import { calculateTaskDueDate } from '../../../core/tasks/sla-helper';
import { autoAssignTask } from '../../../core/tasks/auto-assign';

interface ServiceActivatedPayload {
  service_id: string;
  user_id: string;
  correlation_id?: string;
}

/**
 * ClientLifecycleTaskCreatorListener — Sprint 16 Fase 16.B (ADR-079 §2 trigger #4).
 *
 * Consume `service.activated` (orquestador post-provision OK). Detecta si
 * es el PRIMER servicio del cliente vía `clientsService.isFirstService` y,
 * si lo es, crea una task `client_lifecycle` (llamada de bienvenida).
 *
 * Reglas canónicas:
 *  - 1 task `client_lifecycle` por cliente en su vida (UNIQUE INDEX parcial
 *    por (`source_system`, `source_id`) con `source_id=client_id` la
 *    enforza si la task previa sigue activa; si se completó, no
 *    re-creamos por construcción del helper `isFirstService`).
 *  - Auto-asignación canónica (cualquier rol staff válido — ADR-079 §3.4).
 *  - SLA = 48h (ADR-079 §3.5).
 *  - Priority = medium (no priorizada por tier SI — ADR-079 §3.3).
 *
 * Errores: log warning + no relanza (la activación del service ya se
 * confirmó; perder la task de bienvenida no es bloqueante).
 */
@Injectable()
export class ClientLifecycleTaskCreatorListener {
  private readonly logger = new Logger(ClientLifecycleTaskCreatorListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly clients: ClientsService,
  ) {}

  @OnEvent('service.activated')
  async handle(payload: ServiceActivatedPayload): Promise<void> {
    try {
      const isFirst = await this.clients.isFirstService(
        payload.user_id,
        payload.service_id,
      );
      if (!isFirst) return;

      const tier = await this.getClientSITier(payload.user_id);
      const now = new Date();
      const priority: TaskPriority = calculateTaskPriority(
        'client_lifecycle',
        tier,
      );
      const due_date = calculateTaskDueDate('client_lifecycle', tier, now);
      const assigned_to = await autoAssignTask(this.prisma, 'client_lifecycle');

      const task = await this.tasks.createFromTrigger({
        source_system: 'client_lifecycle',
        source_id: payload.user_id,
        client_id: payload.user_id,
        assigned_to,
        priority,
        due_date,
      });

      this.logger.log(
        `client_lifecycle task ${task.id} created for client ${payload.user_id} (first service ${payload.service_id})`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to create client_lifecycle task for client ${payload.user_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async getClientSITier(
    clientId: string,
  ): Promise<SupportInsidePriorityTier | null> {
    const sub = await this.prisma.supportInsideSubscription.findUnique({
      where: { client_id: clientId },
      select: {
        status: true,
        product: {
          select: {
            support_inside_config: { select: { priority_tier: true } },
          },
        },
      },
    });
    if (!sub || sub.status !== 'active') return null;
    return sub.product.support_inside_config?.priority_tier ?? null;
  }
}
