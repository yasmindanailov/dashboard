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

    // Auto-update status (skip for internal notes and already resolved/closed)
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
    }

    this.logger.log(
      `Message added to ${conversation.type} ${conversationId} by ${senderType} (${senderId || 'system'})`,
    );

    this.eventEmitter.emit('message.created', {
      conversation_id: conversationId,
      message_id: message.id,
      sender_type: senderType,
      sender_id: senderId,
      is_internal: message.is_internal,
      user_id: conversation.user_id,
      type: conversation.type,
    });

    // 7.H19: Auto-create structured ClientNote when agent sends internal note
    if (
      dto.is_internal &&
      senderType === 'agent' &&
      conversation.user_id &&
      senderId
    ) {
      try {
        await this.prisma.clientNote.create({
          data: {
            user_id: conversation.user_id,
            author_id: senderId,
            conversation_id: conversationId,
            body: dto.body,
            category: 'conversation',
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

      switch (dto.status) {
        case 'resolved':
          data.resolved_at = new Date();
          data.resolved_by_id = actorId;
          data.resolution_note = dto.resolution_note!.trim();
          await this.prisma.message.create({
            data: {
              conversation_id: id,
              sender_type: 'system',
              body: `✅ Conversación resuelta.\n📝 Nota: ${dto.resolution_note!.trim()}`,
              is_internal: false,
            },
          });
          break;
        case 'closed':
          data.closed_at = new Date();
          if (!conversation.resolved_at) data.resolved_at = new Date();
          data.resolved_by_id = actorId;
          data.resolution_note = dto.resolution_note!.trim();
          await this.prisma.message.create({
            data: {
              conversation_id: id,
              sender_type: 'system',
              body: `🔒 Conversación cerrada.\n📝 Nota: ${dto.resolution_note!.trim()}`,
              is_internal: false,
            },
          });
          break;
        case 'open':
          data.resolved_at = null;
          data.closed_at = null;
          data.resolution_note = null;
          data.resolved_by_id = null;
          await this.prisma.message.create({
            data: {
              conversation_id: id,
              sender_type: 'system',
              body: `🔄 Conversación reabierta.\n📝 Motivo: ${dto.resolution_note!.trim()}`,
              is_internal: false,
            },
          });
          break;
      }
    }

    const updated = await this.prisma.conversation.update({
      where: { id },
      data,
      include: { messages: { orderBy: { created_at: 'desc' }, take: 1 } },
    });

    /* Sprint 8 Fase B.10.fix2 (2026-04-30) — ADR-074 EC#3: cuando un
       ticket se REABRE (closed/resolved → open) y conserva agente
       asignado, re-emitimos `conversation.assigned` para que el listener
       cree una nueva task bridge. La task previa quedó completed (al
       cerrar el ticket vía bridge) o cancelled (vía liberación) — el
       agente vuelve a tener trabajo activo y el sistema lo refleja como
       tarea pendiente. Idempotente: si el listener encuentra task
       activa con mismo agente, no hace nada. */
    if (
      dto.status === 'open' &&
      conversation.status !== 'open' &&
      updated.assigned_agent_id
    ) {
      const agent = await this.prisma.user.findUnique({
        where: { id: updated.assigned_agent_id },
        select: { first_name: true, last_name: true },
      });
      if (agent) {
        this.eventEmitter.emit('conversation.assigned', {
          conversation_id: id,
          agent_id: updated.assigned_agent_id,
          agent_name: `${agent.first_name} ${agent.last_name}`,
          assigned_by: actorId,
        });
      }
    }

    // 7.H22: Auto-create ClientNote for resolution/reopen notes
    if (
      ['resolved', 'closed', 'open'].includes(dto.status || '') &&
      dto.resolution_note?.trim() &&
      conversation.user_id
    ) {
      try {
        const noteCategory = dto.status === 'open' ? 'general' : 'solution';
        await this.prisma.clientNote.create({
          data: {
            user_id: conversation.user_id,
            author_id: actorId,
            conversation_id: id,
            body: dto.resolution_note.trim(),
            category: noteCategory,
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
}
