import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Conversation, Message, MessageSender, Prisma } from '@prisma/client';
import { CreateMessageDto, UpdateConversationDto } from './dto/support.dto';

/**
 * ═══════════════════════════════════════
 * SupportMessageService — Message operations and conversation updates
 * ═══════════════════════════════════════
 *
 * Responsibilities:
 *   - addMessage (add message to any conversation)
 *   - updateConversation (status, priority, assign, resolve, close)
 *   - markAsRead (mark messages as read)
 *
 * Ref: DECISIONS.md §9, ARCHITECTURE.md Regla 15
 * ═══════════════════════════════════════
 */
@Injectable()
export class SupportMessageService {
  private readonly logger = new Logger(SupportMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Add a message to an existing conversation (works for both chats and tickets).
   */
  async addMessage(
    conversationId: string,
    senderType: 'client' | 'agent' | 'system' | 'ai',
    senderId: string | null,
    dto: CreateMessageDto,
  ): Promise<Message> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation)
      throw new NotFoundException('Conversación no encontrada.');

    if (conversation.status === 'closed') {
      throw new BadRequestException(
        'No se pueden enviar mensajes en una conversación cerrada.',
      );
    }

    /* Sprint 16 (ADR-079 amendment): el agente NO puede escribir en un
       ticket `resolved`. Razones canónicas:
         1. `resolved` = "agente terminó, espera decisión del cliente". Si
            el agente quiere añadir algo, está cambiando de opinión sobre el
            cierre — eso es reapertura formal, no continuación.
         2. Permitir escritura aquí bypassa el flujo canónico
            `conversation.reactivated` que crea NUEVA task bridge (la
            antigua sigue inmutable `completed`). Sin esto, el agente
            dejaría mensajes huérfanos sin task asociada.
         3. La única vía válida es pulsar "Reabrir" (modal con nota
            obligatoria → evento `conversation.reactivated`).
       El cliente SÍ puede escribir en `resolved` — es su flujo natural
       de responder/objetar; cada respuesta del cliente reactiva el ticket. */
    if (
      conversation.status === 'resolved' &&
      conversation.type === 'ticket' &&
      senderType === 'agent'
    ) {
      throw new BadRequestException(
        'Este ticket está resuelto. Para volver a actuar, pulsa "Reabrir" desde el detalle del ticket.',
      );
    }

    /* Sprint 16 (ADR-079 amendment A3): los chats tienen un único estado
       terminal — `resolved`. A diferencia de los tickets (donde `resolved`
       es transitorio y permite respuesta del cliente), un chat resuelto es
       inmutable: no se reabre, no se cierra adicional, no se escribe en él.
       Si el cliente necesita continuar, abre una nueva conversación de
       chat. Esta asimetría es intencional: el feedback en chat es
       inmediato, no hay ventana de "espera confirmación" como en tickets. */
    if (
      conversation.status === 'resolved' &&
      conversation.type === 'chat'
    ) {
      throw new BadRequestException(
        'Este chat está cerrado. Si necesitas seguir hablando, abre una nueva conversación.',
      );
    }

    // 7.H4: Block client messages on escalated chats
    if (
      conversation.type === 'chat' &&
      conversation.status === 'resolved' &&
      senderType === 'client'
    ) {
      const escalatedTicket = await this.prisma.conversation.findFirst({
        where: { escalated_from_id: conversationId },
        select: { id: true },
      });
      if (escalatedTicket) {
        throw new BadRequestException(
          'Este chat fue escalado a un ticket. Por favor, continúa la conversación desde tus tickets de soporte.',
        );
      }
    }

    const message = await this.prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_type: senderType,
        sender_id: senderId,
        body: dto.body,
        attachments: dto.attachments ?? undefined,
        is_internal: dto.is_internal ?? false,
      },
    });

    // Auto-update status. Sprint 16 (ADR-079 §3.2 + amendment ticket
    // lifecycle): si el cliente responde a un ticket en `resolved` (estado
    // transitorio "esperando confirmación"), se considera REACTIVACIÓN —
    // el ticket vuelve a `waiting_agent` y se emite `conversation.reactivated`
    // para que el listener de tasks cree una nueva task bridge (ADR-079
    // §3.2: tasks `completed` son inmutables, nunca se reabren — siempre
    // task nueva). El estado `closed` sigue siendo terminal-inmutable y
    // bloquea mensajes (línea 50).
    let reactivatedFromResolved = false;
    if (
      !dto.is_internal &&
      !['closed', 'resolved'].includes(conversation.status)
    ) {
      const statusUpdate: Prisma.ConversationUpdateInput = {
        updated_at: new Date(),
      };

      if (senderType === 'client') {
        statusUpdate.status = 'waiting_agent';
      } else if (senderType === 'agent') {
        statusUpdate.status = 'waiting_client';
        if (!conversation.first_response_at) {
          statusUpdate.first_response_at = new Date();
        }
      }

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: statusUpdate,
      });
    } else if (
      !dto.is_internal &&
      conversation.status === 'resolved' &&
      conversation.type === 'ticket' &&
      senderType === 'client'
    ) {
      // Reactivación: cliente responde a TICKET resolved → vuelve a waiting_agent.
      // Esta rama NO aplica a chats — los chats `resolved` son terminales
      // absolutos; el cliente que vuelve a escribir recibe el 400 anterior
      // y debe abrir nueva conversación.
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'waiting_agent',
          resolved_at: null,
          resolution_note: null,
          resolved_by_id: null,
          updated_at: new Date(),
        },
      });
      reactivatedFromResolved = true;
    }

    this.logger.log(
      `Message added to ${conversation.type} ${conversationId} by ${senderType} (${senderId || 'system'})`,
    );

    /* Sprint 16 (ADR-079 amendment A3): enriquecemos el payload con el
       mensaje completo + nombre del remitente. Permite al
       `SupportWebsocketListener` reenviar como `message:new` a la room
       de la conversación cuando el envío llegó vía REST (página detalle
       /admin/support/[id]) — sin esto, los clientes con widget WS no
       reciben mensajes del agente en tiempo real. El gateway ya broadcastea
       directamente cuando el envío llega vía socket, así que el listener
       debe filtrar para evitar doble emisión: usaremos un flag interno. */
    let senderName = 'Sistema';
    if (senderId) {
      const u = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { first_name: true, last_name: true },
      });
      if (u) senderName = `${u.first_name} ${u.last_name}`;
    } else if (conversation.guest_name) {
      senderName = conversation.guest_name;
    }

    this.eventEmitter.emit('message.created', {
      conversation_id: conversationId,
      message_id: message.id,
      sender_type: senderType,
      sender_id: senderId,
      is_internal: message.is_internal,
      user_id: conversation.user_id,
      type: conversation.type,
      message: { ...message, sender_name: senderName },
    });

    // Sprint 16 (ADR-079 amendment): emitir conversation.reactivated cuando
    // un ticket `resolved` vuelve a vivo por respuesta del cliente. El
    // listener `SupportTicketTaskCreatorListener` lo consume y crea una
    // NUEVA task bridge (las tasks `completed` son inmutables).
    if (reactivatedFromResolved && conversation.user_id) {
      this.eventEmitter.emit('conversation.reactivated', {
        conversation_id: conversationId,
        agent_id: conversation.assigned_agent_id ?? null,
        reason: 'client_replied' as const,
      });
    }

    // 7.H19: Auto-create structured ClientNote when agent sends internal note
    if (
      dto.is_internal &&
      senderType === 'agent' &&
      conversation.user_id &&
      senderId
    ) {
      try {
        // Sprint 16 (ADR-079 §3.8): mensaje interno del agente al cliente
        // → ClientNote con source_system='ticket', triggered_by_action
        // 'manual_entry' (no es transición canónica resolved/closed; es un
        // apunte manual durante la conversación) y categoría 'support'.
        await this.prisma.clientNote.create({
          data: {
            user_id: conversation.user_id,
            author_id: senderId,
            source_system: 'ticket',
            source_id: conversationId,
            triggered_by_action: 'manual_entry',
            body: dto.body,
            category: 'support',
            is_pinned: false,
          },
        });
      } catch (e) {
        this.logger.warn(`Failed to auto-create ClientNote: ${e}`);
      }
    }

    return message;
  }

  /**
   * Update conversation metadata (status, priority, assign agent, resolve/close).
   */
  async updateConversation(
    id: string,
    dto: UpdateConversationDto,
    actorId: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!conversation)
      throw new NotFoundException('Conversación no encontrada.');

    const data: Prisma.ConversationUpdateInput = {};

    if (dto.priority) data.priority = dto.priority;
    if (dto.category) data.category = dto.category;
    if (dto.tags !== undefined) data.tags = dto.tags;

    // Agent assignment
    if (dto.assigned_agent_id !== undefined) {
      if (dto.assigned_agent_id) {
        const agent = await this.prisma.user.findUnique({
          where: { id: dto.assigned_agent_id },
          include: { role: true },
        });
        if (!agent) throw new NotFoundException('Agente no encontrado.');

        const agentRoles = ['superadmin', 'agent_full', 'agent_support'];
        if (!agentRoles.includes(agent.role.slug)) {
          throw new BadRequestException(
            'El usuario asignado no tiene rol de agente.',
          );
        }

        data.assigned_agent_id = dto.assigned_agent_id;

        await this.prisma.message.create({
          data: {
            conversation_id: id,
            sender_type: 'system',
            body: `Conversación asignada a ${agent.first_name} ${agent.last_name}`,
            is_internal: true,
          },
        });

        this.eventEmitter.emit('conversation.assigned', {
          conversation_id: id,
          agent_id: dto.assigned_agent_id,
          agent_name: `${agent.first_name} ${agent.last_name}`,
          assigned_by: actorId,
        });
      } else {
        // Sprint 8 Fase B.10.fix2 (2026-04-30) — ADR-074 EC#8: emitir
        // `conversation.unassigned` para que `SupportTicketTaskBridgeListener`
        // cancele la task bridge activa. Sin este evento, desasignar el
        // ticket dejaba la task asignada al agente fantasma — incoherente.
        data.assigned_agent_id = null;
        if (conversation.assigned_agent_id) {
          await this.prisma.message.create({
            data: {
              conversation_id: id,
              sender_type: 'system',
              body: 'Conversación desasignada — vuelve a la cola.',
              is_internal: true,
            },
          });
          this.eventEmitter.emit('conversation.unassigned', {
            conversation_id: id,
            prev_agent_id: conversation.assigned_agent_id,
            unassigned_by: actorId,
          });
        }
      }
    }

    // Status transitions
    if (dto.status && dto.status !== conversation.status) {
      /* Sprint 16 (ADR-079 amendment A3): los chats tienen un único estado
         terminal — `resolved`. NO admiten `closed` (no es necesario, el
         feedback es inmediato) ni `open` (reabrir desde resolved — los
         chats resueltos son inmutables; el cliente abre conversación
         nueva si necesita continuar). Las transiciones no canónicas se
         rechazan a nivel de service para defender en profundidad
         (frontend ya no expone esos botones). */
      if (conversation.type === 'chat') {
        if (dto.status === 'closed') {
          throw new BadRequestException(
            'Los chats no admiten estado "cerrado". Usa "resolver" — es el único estado terminal canónico.',
          );
        }
        if (dto.status === 'open' && conversation.status === 'resolved') {
          throw new BadRequestException(
            'Un chat resuelto es terminal. Si el cliente necesita continuar, debe abrir una nueva conversación.',
          );
        }
      }

      data.status = dto.status;

      if (
        ['resolved', 'closed', 'open'].includes(dto.status) &&
        !dto.resolution_note?.trim()
      ) {
        const actionLabel =
          dto.status === 'open'
            ? 'reabrir'
            : dto.status === 'closed'
              ? 'cerrar'
              : 'resolver';
        throw new BadRequestException(
          `Se requiere una nota del agente al ${actionLabel} una conversación.`,
        );
      }

      /* Sprint 16 (ADR-079 amendment A3): los system messages del switch
         se crean con `prisma.message.create` directo (no `addMessage`),
         lo que los dejaba sin emitir `message.created` → no llegaban al
         cliente WS en tiempo real, solo al refrescar. Helper canónico que
         persiste el system message + emite el evento para que el listener
         `SupportWebsocketListener` lo reenvíe vía `message:new` a la room. */
      const emitSystemMessage = async (body: string) => {
        const sysMsg = await this.prisma.message.create({
          data: {
            conversation_id: id,
            sender_type: 'system',
            body,
            is_internal: false,
          },
        });
        this.eventEmitter.emit('message.created', {
          conversation_id: id,
          message_id: sysMsg.id,
          sender_type: 'system',
          sender_id: null,
          is_internal: false,
          user_id: conversation.user_id,
          type: conversation.type,
          message: { ...sysMsg, sender_name: 'Sistema' },
        });
      };

      switch (dto.status) {
        case 'resolved':
          data.resolved_at = new Date();
          data.resolved_by_id = actorId;
          data.resolution_note = dto.resolution_note!.trim();
          /* Sprint 16 (ADR-079 amendment A3): el system message visible
             para el cliente NO incluye la nota del agente. La nota es
             interna (auditoría + `client_notes`); el cliente solo ve la
             transición de estado. */
          await emitSystemMessage(`✅ Conversación resuelta.`);
          break;
        case 'closed':
          data.closed_at = new Date();
          if (!conversation.resolved_at) data.resolved_at = new Date();
          data.resolved_by_id = actorId;
          data.resolution_note = dto.resolution_note!.trim();
          await emitSystemMessage(`🔒 Conversación cerrada.`);
          break;
        case 'open':
          data.resolved_at = null;
          data.closed_at = null;
          data.resolution_note = null;
          data.resolved_by_id = null;
          await emitSystemMessage(`🔄 Conversación reabierta.`);
          break;
      }
    }

    const updated = await this.prisma.conversation.update({
      where: { id },
      data,
      include: { messages: { orderBy: { created_at: 'desc' }, take: 1 } },
    });

    /* Sprint 16 (ADR-079 amendment): cuando admin reabre un ticket
       (closed/resolved → open), emitimos `conversation.reactivated` para
       que el listener cree una NUEVA task bridge (las tasks `completed`/
       `cancelled` son inmutables — ADR-079 §3.2). Si el ticket conserva
       agente asignado, la nueva task hereda ese agente; si está sin
       asignar, queda en cola pública (`assigned_to=null`).
       Reemplaza el patrón legacy ADR-074 EC#3 que reusaba
       `conversation.assigned` para esta misma intención — semántica más
       limpia. */
    if (dto.status === 'open' && conversation.status !== 'open') {
      this.eventEmitter.emit('conversation.reactivated', {
        conversation_id: id,
        agent_id: updated.assigned_agent_id ?? null,
        reason: 'admin_reopened' as const,
      });
    }

    /* Sprint 16 (ADR-079 amendments A1+A3): cuando una conversación pasa
       a `resolved`, emitimos `conversation.resolved` para que ambos
       listeners reaccionen:
         - `SupportConversationEventsListener.handleResolved` envía notif
           al cliente con CTA al ticket (FILTRA `type='ticket'` internamente
           — los chats no requieren push porque el cliente ya está
           conectado por WS al hilo y se entera de inmediato).
         - `SupportWebsocketListener.handleConversationResolved` broadcastea
           `conversation:updated` a la room — esto APLICA a ambos tipos
           para que el widget cliente vea el cambio de estado en tiempo
           real (input bloqueado + banner si fue escalación). */
    if (
      dto.status === 'resolved' &&
      conversation.status !== 'resolved' &&
      conversation.user_id
    ) {
      this.eventEmitter.emit('conversation.resolved', {
        conversation_id: id,
        user_id: conversation.user_id,
        sequence_number: updated.sequence_number ?? null,
        subject: updated.subject,
        type: conversation.type,
      });
    }

    /* 7.H22 → Sprint 16 (ADR-079 §3.8 + amendment A3): auto-create
       ClientNote canónico al resolver/cerrar/reabrir una conversación.
       `source_system` se infiere del tipo de la conversación:
         - `type='ticket'` → `source_system='ticket'` (categoría `support`).
         - `type='chat'`   → `source_system='chat'`   (categoría `support`).
       `triggered_by_action` traza la acción exacta:
         - ticket: 'ticket.resolved' | 'ticket.closed' | 'manual_entry'.
         - chat:   'chat.resolved' (único terminal canónico de chats). */
    if (
      ['resolved', 'closed', 'open'].includes(dto.status || '') &&
      dto.resolution_note?.trim() &&
      conversation.user_id
    ) {
      try {
        const isChat = conversation.type === 'chat';
        const triggeredBy = isChat
          ? 'chat.resolved'
          : dto.status === 'open'
            ? 'manual_entry'
            : dto.status === 'resolved'
              ? 'ticket.resolved'
              : 'ticket.closed';
        await this.prisma.clientNote.create({
          data: {
            user_id: conversation.user_id,
            author_id: actorId,
            source_system: isChat ? 'chat' : 'ticket',
            source_id: id,
            triggered_by_action: triggeredBy,
            body: dto.resolution_note.trim(),
            category: 'support',
            is_pinned: false,
          },
        });
      } catch (e) {
        this.logger.warn(`Failed to auto-create ClientNote: ${e}`);
      }
    }

    return updated;
  }

  /**
   * Mark messages as read for a specific reader.
   */
  async markAsRead(
    conversationId: string,
    readerId: string,
    readerType: 'client' | 'agent',
  ): Promise<number> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation)
      throw new NotFoundException('Conversación no encontrada.');

    const senderTypesToMark: MessageSender[] =
      readerType === 'agent'
        ? [MessageSender.client, MessageSender.ai]
        : [MessageSender.agent, MessageSender.system];

    const result = await this.prisma.message.updateMany({
      where: {
        conversation_id: conversationId,
        sender_type: { in: senderTypesToMark },
        read_at: null,
      },
      data: { read_at: new Date() },
    });

    return result.count;
  }

  /**
   * Sprint 16 (ADR-079 amendment): el cliente confirma la resolución de un
   * ticket en estado `resolved` → cierra explícito (`→closed`). Validaciones:
   *   - El ticket debe ser de tipo `ticket` y pertenecer al cliente.
   *   - Sólo aplica si `status === 'resolved'` (no se puede confirmar
   *     algo que ya está cerrado o que sigue abierto).
   * Persiste system message + actualiza estado. No emite ningún evento de
   * task — la task previa ya está `completed`, no se crea una nueva.
   */
  async confirmResolutionByClient(
    conversationId: string,
    clientId: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation)
      throw new NotFoundException('Conversación no encontrada.');
    if (conversation.user_id !== clientId) {
      throw new BadRequestException('Esta conversación no es tuya.');
    }
    if (conversation.type !== 'ticket') {
      throw new BadRequestException(
        'Solo los tickets pueden confirmarse como resueltos.',
      );
    }
    if (conversation.status !== 'resolved') {
      throw new BadRequestException(
        'Solo se pueden confirmar tickets en estado "resuelto".',
      );
    }

    const now = new Date();
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'closed',
        closed_at: now,
      },
    });

    await this.prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_type: 'system',
        body: '✅ Cliente confirmó la resolución del ticket. Cerrado.',
        is_internal: false,
      },
    });

    this.logger.log(
      `Ticket ${conversationId} confirmed-resolved by client ${clientId}`,
    );

    return updated;
  }
}
