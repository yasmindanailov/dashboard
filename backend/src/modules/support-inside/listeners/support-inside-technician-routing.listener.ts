import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { eligibleAssigneeRoles } from '../../../core/tasks/auto-assign';

/**
 * SupportInsideTechnicianRoutingListener — Rediseño UI F3·E8 (iteración 2026-06-29).
 *
 * Cuando un cliente con Support Inside activo abre un ticket o un chat, la
 * conversación se **dirige a su técnico asignado** (decisión Yasmin: "tu
 * técnico" es el punto de contacto del cliente SI). Mismo patrón que
 * `SupportInsidePriorityListener` (escucha `conversation.created`, R1).
 *
 * Doctrina:
 *   - Solo si `user_id != null` (los chats guest no tienen suscripción) y la
 *     suscripción SI está `active` con `assigned_technician_id`.
 *   - El técnico debe seguir siendo **elegible** (activo + rol de soporte —
 *     `eligibleAssigneeRoles('support_inside_slot')`). Si no, NO se enruta →
 *     cae a la cola (fallback básico; el "técnico no puede" fino se pulirá
 *     después — el admin ve todas las conversaciones en el panel).
 *   - **Compare-and-swap**: solo asigna si `assigned_agent_id` sigue `null`
 *     (no pisa una asignación manual que ocurriera entre el create y este
 *     listener — EC-T8-47, espejo del listener de prioridad).
 *   - Emite `conversation.assigned` → dispara la cadena canónica: campana al
 *     técnico (`SupportEmailListener`) + task bridge si es ticket
 *     (`SupportTicketTaskCreatorListener`, que ignora los chats) + WS.
 *   - Degradación elegante (R7 + R13): no relanza; P2025 (conversación borrada)
 *     se ignora.
 */
@Injectable()
export class SupportInsideTechnicianRoutingListener {
  private readonly logger = new Logger(
    SupportInsideTechnicianRoutingListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent('conversation.created')
  async handleConversationCreated(payload: {
    conversation_id: string;
    user_id: string | null;
    type: string;
    is_guest?: boolean;
  }): Promise<void> {
    if (!payload.user_id || payload.is_guest) return;

    try {
      const subscription =
        await this.prisma.supportInsideSubscription.findUnique({
          where: { client_id: payload.user_id },
          select: {
            status: true,
            assigned_technician_id: true,
            technician: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                status: true,
                role: { select: { slug: true } },
              },
            },
          },
        });

      const technician = subscription?.technician;
      if (
        !subscription ||
        subscription.status !== 'active' ||
        !technician ||
        technician.status !== 'active' ||
        !eligibleAssigneeRoles('support_inside_slot').includes(
          technician.role.slug,
        )
      ) {
        // Sin técnico elegible → la conversación queda en la cola (comportamiento actual).
        return;
      }

      // Compare-and-swap: solo si sigue sin asignar (no pisa asignación manual).
      const result = await this.prisma.conversation.updateMany({
        where: { id: payload.conversation_id, assigned_agent_id: null },
        data: { assigned_agent_id: technician.id },
      });
      if (result.count !== 1) {
        this.logger.debug(
          `technician-routing: conversation=${payload.conversation_id} ya asignada — skip.`,
        );
        return;
      }

      // Dispara la cadena canónica (campana al técnico + task bridge si ticket + WS).
      this.events.emit('conversation.assigned', {
        conversation_id: payload.conversation_id,
        agent_id: technician.id,
        agent_name: `${technician.first_name} ${technician.last_name}`,
        assigned_by: technician.id,
      });

      this.logger.log(
        `technician-routing: conversation=${payload.conversation_id} (${payload.type}) client=${payload.user_id} → técnico=${technician.id}`,
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return;
      }
      this.logger.error(
        `technician-routing listener falló para conversation ${payload.conversation_id}: ${getErrorMessage(err)}`,
      );
    }
  }
}
