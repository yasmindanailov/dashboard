import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { TasksService } from './tasks.service';
import { TaskTypeDto, TaskPriorityDto, TaskStatusDto } from './dto/task.dto';

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
 * SupportTicketTaskCreatorListener — Sprint 8 Fase B.10 (2026-04-30) — ADR-074.
 *
 * Consume `conversation.assigned` (emitido por
 * `SupportMessageService.updateConversation` cuando `assigned_agent_id`
 * cambia). Crea o reasigna la `Task(type=support_ticket)` vinculada al
 * ticket — el bloque de trabajo del agente.
 *
 * Reglas canónicas (§ADR-074):
 *
 *   1. Sólo opera sobre conversaciones de tipo `ticket`. Chats no
 *      generan tasks (su flujo es respuesta directa por mensajes).
 *   2. Si la conversación ya tiene una task activa
 *      (`status in pending|in_progress` con `conversation_id` poblado),
 *      la reasigna en lugar de crear duplicada. Si la task está
 *      cerrada (caso ticket reabierto), crea una nueva.
 *   3. La task hereda subject como title, priority del ticket,
 *      client_id desde `conversation.user_id`. Sin description (el
 *      "trabajo" vive en los mensajes del ticket).
 *   4. La auto-asignación del ticket al crearlo (cuando llega sin
 *      `assigned_to`) la realiza el propio módulo support antes de
 *      emitir el evento — este listener no la implementa.
 *
 * Errores: si la conversación no existe en BD (delete entre el emit y
 * el handle, caso rarísimo) o el agente no es asignable, el listener
 * loguea warning y NO relanza — la operación support principal ya se
 * confirmó. Sin retry: el caso es benigno.
 */
@Injectable()
export class SupportTicketTaskCreatorListener {
  private readonly logger = new Logger(SupportTicketTaskCreatorListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  @OnEvent('conversation.assigned')
  async handle(payload: ConversationAssignedPayload): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: payload.conversation_id },
      select: {
        id: true,
        type: true,
        subject: true,
        priority: true,
        user_id: true,
      },
    });

    if (!conversation) {
      this.logger.warn(
        `conversation ${payload.conversation_id} not found — task not created`,
      );
      return;
    }

    if (conversation.type !== 'ticket') {
      // Chats no generan tasks. Salimos silenciosamente — el evento
      // `conversation.assigned` también se emite en chats para que el
      // agente reciba la notificación, pero ahí no aplica el bridge.
      return;
    }

    if (!conversation.user_id) {
      this.logger.warn(
        `ticket ${conversation.id} has no user_id — task not created (anonymous chat escalated unexpectedly)`,
      );
      return;
    }

    // ¿Existe ya una task activa vinculada? Reasignar en lugar de duplicar.
    const existing = await this.prisma.task.findFirst({
      where: {
        conversation_id: conversation.id,
        status: { in: ['pending', 'in_progress'] },
      },
      select: { id: true, assigned_to: true },
    });

    if (existing) {
      if (existing.assigned_to === payload.agent_id) {
        // Idempotente: el agente ya es el dueño. Nada que hacer.
        return;
      }
      try {
        await this.tasksService.update(
          existing.id,
          { assigned_to: payload.agent_id },
          payload.assigned_by,
          true, // isAdmin = true: el listener actúa como sistema
        );
        this.logger.log(
          `support_ticket task ${existing.id} reassigned to agent ${payload.agent_id} (ticket ${conversation.id})`,
        );
      } catch (err) {
        this.logger.warn(
          `failed to reassign task ${existing.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    // Nueva task de bridge.
    const subject = conversation.subject?.trim() ?? 'Ticket de soporte';
    const reasonPrefix = 'Soporte: ';
    const reasonMaxBody = 100 - reasonPrefix.length;
    const reason = `${reasonPrefix}${subject.substring(0, reasonMaxBody)}`;

    try {
      const task = await this.tasksService.create(
        {
          type: TaskTypeDto.support_ticket,
          title: subject,
          priority: this.mapPriority(conversation.priority),
          client_id: conversation.user_id,
          assigned_to: payload.agent_id,
          conversation_id: conversation.id,
          reason,
        },
        payload.assigned_by,
      );
      this.logger.log(
        `support_ticket task ${task.id} created for ticket ${conversation.id} → agent ${payload.agent_id}`,
      );
    } catch (err) {
      this.logger.warn(
        `failed to create support_ticket task for conversation ${conversation.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Sprint 8 Fase B.10.fix2 (2026-04-30) — ADR-074 EC#8.
   *
   * Cuando el admin desasigna un ticket (admin pulsa "Sin asignar" en
   * el sidebar de support), `support-message.service` emite
   * `conversation.unassigned`. Aquí cancelamos la task bridge activa
   * vinculada para mantener coherencia: la tarea ES el trabajo del
   * agente sobre el ticket; si el ticket pierde dueño, la tarea no
   * tiene sentido.
   *
   * Ciclo evitado con `skipTicketRelease: true` — el cancel ya viene
   * desde la liberación, no debe re-disparar `updateConversation`.
   */
  @OnEvent('conversation.unassigned')
  async handleUnassigned(
    payload: ConversationUnassignedPayload,
  ): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: {
        conversation_id: payload.conversation_id,
        status: { in: ['pending', 'in_progress'] },
      },
      select: { id: true },
    });
    if (!existing) return; // sin task activa, nada que hacer

    try {
      await this.tasksService.update(
        existing.id,
        { status: TaskStatusDto.cancelled },
        payload.unassigned_by,
        true, // isAdmin = true: el listener actúa como sistema
        { skipTicketRelease: true },
      );
      this.logger.log(
        `support_ticket task ${existing.id} cancelled — ticket ${payload.conversation_id} desasignado`,
      );
    } catch (err) {
      this.logger.warn(
        `failed to cancel task ${existing.id} on ticket unassign: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** El enum `ConversationPriority` se mapea 1:1 con `TaskPriorityDto`. */
  private mapPriority(p: string | null | undefined): TaskPriorityDto {
    switch (p) {
      case 'low':
        return TaskPriorityDto.low;
      case 'high':
        return TaskPriorityDto.high;
      case 'critical':
        return TaskPriorityDto.critical;
      default:
        return TaskPriorityDto.medium;
    }
  }
}
