import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TaskPriority, SupportInsidePriorityTier } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { TasksService } from './tasks.service';
import { calculateTaskPriority } from '../../core/tasks/priority-helper';
import { calculateTaskDueDate } from '../../core/tasks/sla-helper';

interface ConversationAssignedPayload {
  conversation_id: string;
  agent_id: string;
  agent_name: string;
  assigned_by: string;
}

interface ConversationUnassignedPayload {
  conversation_id: string;
  prev_agent_id: string;
  unassigned_by: string;
}

/**
 * SupportTicketTaskCreatorListener — Sprint 16 Fase 16.B (ADR-079 §2 trigger #1).
 *
 * Consume `conversation.assigned` (emitido por `SupportMessageService`).
 * Crea/reasigna la `Task(source_system='support_ticket', source_id=conversation_id)`.
 *
 * Reglas canónicas (ADR-079 §2 + §3.4 caso especial):
 *
 *   1. Sólo opera sobre conversaciones de tipo `ticket` (no `chat`).
 *   2. Idempotencia vía UNIQUE INDEX parcial — si la task activa ya
 *      existe con el mismo agente, no hace nada.
 *   3. La task hereda `assigned_to` del ticket directamente (NO consulta
 *      `autoAssignTask` — la auto-asignación de tickets vive en module
 *      support, no aquí). Excepción documentada §3.4.
 *   4. `priority` y `due_date` se calculan vía helpers canónicos
 *      según el tier SI del cliente (ADR-079 §3.3 + §3.5).
 *
 * Errores: log warning + no relanza (la operación support ya se confirmó).
 */
@Injectable()
export class SupportTicketTaskCreatorListener {
  private readonly logger = new Logger(SupportTicketTaskCreatorListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  @OnEvent('conversation.assigned')
  async handle(payload: ConversationAssignedPayload): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: payload.conversation_id },
      select: { id: true, type: true, user_id: true },
    });

    if (!conversation) {
      this.logger.warn(
        `conversation ${payload.conversation_id} not found — task not created`,
      );
      return;
    }
    if (conversation.type !== 'ticket') return;
    if (!conversation.user_id) {
      this.logger.warn(
        `ticket ${conversation.id} has no user_id — task not created`,
      );
      return;
    }

    // Tier SI del cliente para priority + due_date canónicos.
    const tier = await this.getClientSITier(conversation.user_id);

    // ¿Existe ya una task activa para este ticket? Si sí, reasignar.
    const existing = await this.prisma.task.findFirst({
      where: {
        source_system: 'support_ticket',
        source_id: conversation.id,
        status: { in: ['pending', 'in_progress'] },
      },
      select: { id: true, assigned_to: true },
    });

    if (existing) {
      if (existing.assigned_to === payload.agent_id) return; // idempotente
      try {
        await this.tasks.assign(
          existing.id,
          { assigned_to: payload.agent_id },
          payload.assigned_by,
          true, // isAdmin = true (listener actúa como sistema)
        );
        this.logger.log(
          `task ${existing.id} reassigned to agent ${payload.agent_id} (ticket ${conversation.id})`,
        );
      } catch (err) {
        this.logger.warn(
          `failed to reassign task ${existing.id}: ${getMsg(err)}`,
        );
      }
      return;
    }

    // Nueva task de bridge.
    const now = new Date();
    const priority: TaskPriority = calculateTaskPriority(
      'support_ticket',
      tier,
    );
    const due_date = calculateTaskDueDate('support_ticket', tier, now);

    try {
      const task = await this.tasks.createFromTrigger({
        source_system: 'support_ticket',
        source_id: conversation.id,
        client_id: conversation.user_id,
        assigned_to: payload.agent_id,
        priority,
        due_date,
      });
      this.logger.log(
        `support_ticket task ${task.id} created for ticket ${conversation.id} → agent ${payload.agent_id} (priority=${priority})`,
      );
    } catch (err) {
      this.logger.warn(
        `failed to create support_ticket task for conversation ${conversation.id}: ${getMsg(err)}`,
      );
    }
  }

  /**
   * Sprint 16 (ADR-079 §2 trigger #1 — preserva ADR-074 EC#8).
   *
   * Cuando el admin desasigna un ticket, cancelamos la task bridge activa.
   * `skipTicketRelease=true` evita que `TasksService.cancel` re-libere el
   * ticket (ya está liberado por la operación que disparó este evento).
   */
  @OnEvent('conversation.unassigned')
  async handleUnassigned(
    payload: ConversationUnassignedPayload,
  ): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: {
        source_system: 'support_ticket',
        source_id: payload.conversation_id,
        status: { in: ['pending', 'in_progress'] },
      },
      select: { id: true },
    });
    if (!existing) return;

    try {
      await this.tasks.cancel(
        existing.id,
        { reason: 'Ticket desasignado' },
        payload.unassigned_by,
        { skipTicketRelease: true },
      );
      this.logger.log(
        `support_ticket task ${existing.id} cancelled — ticket ${payload.conversation_id} desasignado`,
      );
    } catch (err) {
      this.logger.warn(
        `failed to cancel task ${existing.id} on ticket unassign: ${getMsg(err)}`,
      );
    }
  }

  /**
   * Devuelve el `priority_tier` (max|high|standard) de la suscripción Support
   * Inside activa del cliente, o `null` si no tiene SI.
   */
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

function getMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
