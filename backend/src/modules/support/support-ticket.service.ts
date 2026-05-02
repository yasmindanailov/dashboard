import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Conversation, Message } from '@prisma/client';
import { CreateTicketDto, EscalateToTicketDto } from './dto/support.dto';

type ConversationWithMessages = Conversation & { messages: Message[] };

/**
 * ═══════════════════════════════════════
 * SupportTicketService — Ticket creation and escalation
 * ═══════════════════════════════════════
 *
 * Responsibilities:
 *   - createTicket (client creates async ticket)
 *   - createTicketForClient (admin creates for client)
 *   - escalateToTicket (chat → ticket escalation)
 *
 * Ref: DECISIONS.md §9, §43, ARCHITECTURE.md Regla 15
 * ═══════════════════════════════════════
 */
@Injectable()
export class SupportTicketService {
  private readonly logger = new Logger(SupportTicketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Client creates a new ticket (async, like Gmail).
   * type = 'ticket', category required.
   */
  async createTicket(
    userId: string,
    dto: CreateTicketDto,
  ): Promise<ConversationWithMessages> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, first_name: true, last_name: true, email: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    if (dto.service_id) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.service_id, user_id: userId },
      });
      if (!service)
        throw new BadRequestException('El servicio no pertenece al usuario.');
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'ticket',
        user_id: userId,
        subject: dto.subject,
        priority: dto.priority ?? 'normal',
        category: dto.category,
        status: 'open',
        channel: 'web',
        service_id: dto.service_id,
        is_ai_filtered: false,
        messages: {
          create: {
            sender_type: 'client',
            sender_id: userId,
            body: dto.body,
            is_internal: false,
          },
        },
      },
      include: { messages: { orderBy: { created_at: 'asc' } } },
    });

    const result = await this.assignSequenceAndRefetch(conversation.id);

    this.logger.log(
      `Ticket ${result.id} (TK-${String(result.sequence_number).padStart(5, '0')}) created by ${userId}: "${dto.subject}" [${dto.category}]`,
    );
    this.emitCreated(
      result,
      userId,
      `${user.first_name} ${user.last_name}`,
      user.email,
      dto.subject,
    );

    return result;
  }

  /**
   * Admin creates a ticket targeted at a specific client.
   * Used for WDIFY communication, proactive support, etc.
   */
  async createTicketForClient(
    targetUserId: string,
    dto: CreateTicketDto,
    agentId: string,
  ): Promise<ConversationWithMessages> {
    const client = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, first_name: true, last_name: true, email: true },
    });
    if (!client) throw new NotFoundException('Cliente destino no encontrado.');

    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, first_name: true, last_name: true },
    });
    if (!agent) throw new NotFoundException('Agente no encontrado.');

    if (dto.service_id) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.service_id, user_id: targetUserId },
      });
      if (!service)
        throw new BadRequestException(
          'El servicio no pertenece al cliente destino.',
        );
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'ticket',
        user_id: targetUserId,
        assigned_agent_id: agentId,
        subject: dto.subject,
        priority: dto.priority ?? 'normal',
        category: dto.category,
        status: 'waiting_client',
        channel: 'web',
        service_id: dto.service_id,
        is_ai_filtered: false,
        messages: {
          create: {
            sender_type: 'agent',
            sender_id: agentId,
            body: dto.body,
            is_internal: false,
          },
        },
      },
      include: { messages: { orderBy: { created_at: 'asc' } } },
    });

    const result = await this.assignSequenceAndRefetch(conversation.id);

    this.logger.log(
      `Ticket TK-${String(result.sequence_number).padStart(5, '0')} created by agent ${agentId} for client ${targetUserId}`,
    );
    this.emitCreated(
      result,
      targetUserId,
      `${client.first_name} ${client.last_name}`,
      client.email,
      dto.subject,
    );

    /* Sprint 8 Fase B.10.fix2 (2026-04-30) — ADR-074 EC#7: ticket que
       NACE asignado debe disparar el bridge. Antes, sólo
       `updateConversation` emitía `conversation.assigned` cuando el
       agente CAMBIABA — un ticket creado con agente desde el inicio
       quedaba sin task vinculada (silent gap). Ahora emitimos en la
       creación si el ticket nace con agente. */
    if (result.assigned_agent_id) {
      this.eventEmitter.emit('conversation.assigned', {
        conversation_id: result.id,
        agent_id: result.assigned_agent_id,
        agent_name: `${agent.first_name} ${agent.last_name}`,
        assigned_by: agentId,
      });
    }

    return result;
  }

  /**
   * Escalate a chat to a ticket.
   * Ref: DECISIONS.md §9, §43
   */
  async escalateToTicket(
    chatId: string,
    dto: EscalateToTicketDto,
    agentId: string,
  ): Promise<ConversationWithMessages> {
    const chat = await this.prisma.conversation.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          where: { is_internal: false },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!chat) throw new NotFoundException('Chat no encontrado.');
    if (chat.type !== 'chat')
      throw new BadRequestException(
        'Solo se pueden escalar chats, no tickets.',
      );

    // Guard: prevent double-escalation (7.H2)
    const existingEscalation = await this.prisma.conversation.findFirst({
      where: { escalated_from_id: chatId },
      select: { id: true },
    });
    if (existingEscalation) {
      throw new BadRequestException(
        `Este chat ya fue escalado al ticket ${existingEscalation.id}.`,
      );
    }

    // Build context summary from chat history
    const contextLines = chat.messages.map((m) => {
      const sender =
        m.sender_type === 'client'
          ? 'Cliente'
          : m.sender_type === 'agent'
            ? 'Agente'
            : 'Sistema';
      const time = m.created_at.toLocaleString('es-ES');
      return `[${time}] ${sender}: ${m.body}`;
    });

    /* Sprint 16 (ADR-079 amendment A3): la "Nota del agente" se omite del
       system message visible. La nota es interna — vive en `client_notes`
       con `source_system='chat'` + `triggered_by_action='chat.resolved'`
       (auditoría completa) y en `chat.resolution_note` (consulta admin).
       El cliente sólo ve la transcripción + transición. */
    const contextBlock = [
      `── Contexto del chat escalado ──`,
      `Chat ID: ${chatId}`,
      `Creado: ${chat.created_at.toLocaleString('es-ES')}`,
      ``,
      ...contextLines,
      ``,
      `── Fin del contexto del chat ──`,
    ]
      .filter(Boolean)
      .join('\n');

    // Create the ticket
    const ticket = await this.prisma.conversation.create({
      data: {
        type: 'ticket',
        user_id: chat.user_id,
        assigned_agent_id: agentId,
        subject: dto.subject || `[Escalado] ${chat.subject}`,
        priority: dto.priority ?? chat.priority,
        category: dto.category || 'escalated_chat',
        status: 'open',
        channel: 'web',
        service_id: chat.service_id,
        escalated_from_id: chatId,
        is_ai_filtered: false,
        messages: {
          create: {
            sender_type: 'system',
            sender_id: null,
            body: contextBlock,
            is_internal: false,
          },
        },
      },
      include: { messages: { orderBy: { created_at: 'asc' } } },
    });

    const result = await this.assignSequenceAndRefetch(ticket.id);

    /* Sprint 16 (ADR-079 amendment A3): system message en el chat origen +
       emit `message.created` para que llegue al cliente WS en tiempo real
       (sin esto, el cliente solo lo veía al refrescar). */
    const escalationSysMsg = await this.prisma.message.create({
      data: {
        conversation_id: chatId,
        sender_type: 'system',
        body: `Esta conversación ha sido escalada a un ticket para un seguimiento más detallado. Tu agente seguirá atendiéndote.`,
        is_internal: false,
      },
    });
    this.eventEmitter.emit('message.created', {
      conversation_id: chatId,
      message_id: escalationSysMsg.id,
      sender_type: 'system',
      sender_id: null,
      is_internal: false,
      user_id: chat.user_id,
      type: 'chat',
      message: { ...escalationSysMsg, sender_name: 'Sistema' },
    });

    // Mark chat as resolved (estado terminal único del chat — ADR-079 A3).
    const chatResolutionNote =
      dto.agent_notes?.trim() ||
      `Escalado a ticket TK-${String(result.sequence_number).padStart(5, '0')}`;
    await this.prisma.conversation.update({
      where: { id: chatId },
      data: {
        status: 'resolved',
        resolved_at: new Date(),
        resolved_by_id: agentId,
        resolution_note: chatResolutionNote,
      },
    });

    /* Sprint 16 (ADR-079 amendment A3): emit `conversation.resolved` para
       que `SupportWebsocketListener` broadcastee `conversation:updated` a
       la room — cliente con widget verá el cambio de estado en vivo y
       refrescará la conversación para traer `escalated_to` enriquecido. */
    if (chat.user_id) {
      this.eventEmitter.emit('conversation.resolved', {
        conversation_id: chatId,
        user_id: chat.user_id,
        sequence_number: null,
        subject: chat.subject,
        type: 'chat' as const,
      });
    }

    /* Sprint 16 (ADR-079 §3.8 + amendment A3): la escalación cierra el
       chat con `chat.resolved`. Persistimos ClientNote canónico
       — espejo del que `support-message.service.updateConversation` haría
       si la transición pasase por allí. Mantiene trazabilidad uniforme:
       toda transición terminal del chat genera nota con `source_system='chat'`
       + `triggered_by_action='chat.resolved'` + categoría `support`. */
    if (chat.user_id) {
      try {
        await this.prisma.clientNote.create({
          data: {
            user_id: chat.user_id,
            author_id: agentId,
            source_system: 'chat',
            source_id: chatId,
            triggered_by_action: 'chat.resolved',
            body: chatResolutionNote,
            category: 'support',
            is_pinned: false,
          },
        });
      } catch (e) {
        this.logger.warn(
          `Failed to auto-create ClientNote on chat escalation: ${e}`,
        );
      }
    }

    this.logger.log(
      `Chat ${chatId} escalated to ticket TK-${String(result.sequence_number).padStart(5, '0')} by agent ${agentId}`,
    );

    if (chat.user_id) {
      const client = await this.prisma.user.findUnique({
        where: { id: chat.user_id },
        select: { first_name: true, last_name: true, email: true },
      });
      if (client) {
        this.emitCreated(
          result,
          chat.user_id,
          `${client.first_name} ${client.last_name}`,
          client.email,
          result.subject || '',
        );
      }
    }

    /* Sprint 8 Fase B.10.fix2 (2026-04-30) — ADR-074 EC#7: el ticket
       escalado nace asignado al agente que escaló. Emitimos
       `conversation.assigned` para disparar la creación de la task
       bridge — sin esto, la escalación creaba ticket asignado pero el
       sistema de tareas no lo reflejaba. */
    if (result.assigned_agent_id) {
      const agent = await this.prisma.user.findUnique({
        where: { id: result.assigned_agent_id },
        select: { first_name: true, last_name: true },
      });
      if (agent) {
        this.eventEmitter.emit('conversation.assigned', {
          conversation_id: result.id,
          agent_id: result.assigned_agent_id,
          agent_name: `${agent.first_name} ${agent.last_name}`,
          assigned_by: agentId,
        });
      }
    }

    return result;
  }

  /* ── Private helpers ── */

  private async assignSequenceAndRefetch(
    conversationId: string,
  ): Promise<ConversationWithMessages> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE conversations SET sequence_number = nextval('conversation_ticket_seq') WHERE id = $1::uuid`,
      conversationId,
    );
    return this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { messages: { orderBy: { created_at: 'asc' } } },
    });
  }

  private emitCreated(
    conv: ConversationWithMessages,
    userId: string,
    userName: string,
    email: string,
    subject: string,
  ) {
    this.eventEmitter.emit('conversation.created', {
      conversation_id: conv.id,
      type: 'ticket',
      user_id: userId,
      user_name: userName,
      user_email: email,
      subject,
      channel: 'web',
    });
  }
}
