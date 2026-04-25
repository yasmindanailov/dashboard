import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Conversation, Message } from '@prisma/client';
import { CreateChatDto, CreateGuestChatDto } from './dto/support.dto';

/**
 * ═══════════════════════════════════════
 * SupportChatService — Chat creation and guest management
 * ═══════════════════════════════════════
 *
 * Responsibilities:
 *   - createChat (authenticated client via widget)
 *   - createGuestChat (anonymous visitor from landing)
 *   - linkGuestToClient (manual agent linking — 7.5.2)
 *
 * Ref: DECISIONS.md §9, ARCHITECTURE.md Regla 15
 * ═══════════════════════════════════════
 */
@Injectable()
export class SupportChatService {
  private readonly logger = new Logger(SupportChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Client creates a new chat from the floating widget.
   * type = 'chat', no category.
   */
  async createChat(
    userId: string,
    dto: CreateChatDto,
  ): Promise<Conversation & { messages: Message[] }> {
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
        type: 'chat',
        user_id: userId,
        subject: dto.subject,
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

    this.logger.log(
      `Chat ${conversation.id} created by ${userId}: "${dto.subject}"`,
    );

    this.eventEmitter.emit('conversation.created', {
      conversation_id: conversation.id,
      type: 'chat',
      user_id: userId,
      user_name: `${user.first_name} ${user.last_name}`,
      user_email: user.email,
      subject: dto.subject,
      channel: 'web',
    });

    return conversation;
  }

  /**
   * Anonymous visitor creates a new chat from the landing page.
   * Ref: ROADMAP.md 7.4.1-7.4.2, DECISIONS.md §38
   */
  async createGuestChat(
    dto: CreateGuestChatDto,
    guestSessionHash: string,
  ): Promise<Conversation & { messages: Message[] }> {
    const subject =
      dto.body.length > 80 ? dto.body.substring(0, 77) + '...' : dto.body;

    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'chat',
        user_id: null,
        subject,
        status: 'open',
        channel: 'landing',
        guest_name: dto.guest_name.trim(),
        guest_email: dto.guest_email || null,
        guest_session_hash: guestSessionHash,
        is_ai_filtered: false,
        messages: {
          create: {
            sender_type: 'client',
            sender_id: null,
            body: dto.body,
            is_internal: false,
          },
        },
      },
      include: { messages: { orderBy: { created_at: 'asc' } } },
    });

    this.logger.log(
      `Guest chat ${conversation.id} created by "${dto.guest_name}" (email: ${dto.guest_email || 'N/A'})`,
    );

    this.eventEmitter.emit('conversation.created', {
      conversation_id: conversation.id,
      type: 'chat',
      user_id: null,
      user_name: dto.guest_name.trim(),
      user_email: dto.guest_email || null,
      subject,
      channel: 'landing',
      is_guest: true,
    });

    return conversation;
  }

  /**
   * Agent manually links a guest conversation to an existing client.
   * Ref: ROADMAP.md 7.5.2
   */
  async linkGuestToClient(
    conversationId: string,
    targetUserId: string,
    agentId: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, user_id: true, guest_name: true, guest_email: true },
    });

    if (!conversation)
      throw new NotFoundException('Conversación no encontrada.');
    if (conversation.user_id) {
      throw new BadRequestException(
        'Esta conversación ya está vinculada a un usuario.',
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        status: true,
      },
    });
    if (!targetUser)
      throw new NotFoundException('Usuario destino no encontrado.');

    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { first_name: true, last_name: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.conversation.update({
        where: { id: conversationId },
        data: { user_id: targetUserId, guest_session_hash: null },
      });

      await tx.message.create({
        data: {
          conversation_id: conversationId,
          sender_type: 'system',
          body: `Conversación vinculada manualmente a ${targetUser.first_name} ${targetUser.last_name} (${targetUser.email}) por ${agent?.first_name || ''} ${agent?.last_name || ''}`.trim(),
          is_internal: false,
        },
      });

      return updated;
    });

    this.logger.log(
      `Guest conversation ${conversationId} linked to user ${targetUserId} by agent ${agentId}`,
    );

    return result;
  }
}
