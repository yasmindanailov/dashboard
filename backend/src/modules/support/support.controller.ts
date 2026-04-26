import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  ParseUUIDPipe,
  UseGuards,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';

import { SupportService } from './support.service';
import {
  CreateChatDto,
  CreateTicketDto,
  CreateMessageDto,
  UpdateConversationDto,
  ConversationListQueryDto,
  EscalateToTicketDto,
} from './dto/support.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';

/**
 * ═══════════════════════════════════════
 * SupportController — Dual-system REST API
 * ═══════════════════════════════════════
 *
 * Two separate sub-APIs sharing the same controller:
 *
 * /support/chats/*    → Real-time chat (widget, WebSocket)
 * /support/tickets/*  → Async tickets (Gmail-like, email)
 *
 * Shared endpoints:
 * /support/conversations/:id/messages  → Add message (works for both)
 * /support/conversations/:id           → Get detail (works for both)
 * /support/conversations/stats         → Stats (filterable by type)
 *
 * Data isolation:
 *   - Admin/Agent: full access
 *   - Client: ONLY their own conversations (user_id = JWT user.id)
 *
 * Ref: DECISIONS.md §9, §43
 */

const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_support'];

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SupportController {
  private readonly logger = new Logger(SupportController.name);

  constructor(private readonly supportService: SupportService) {}

  /* ═══════════════════════════════════════
     CHATS — Real-time conversations
     ═══════════════════════════════════════ */

  @Post('chats')
  @ApiOperation({ summary: 'Create a new chat (from widget)' })
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Conversation))
  createChat(@Req() req: AuthenticatedRequest, @Body() dto: CreateChatDto) {
    const user = req.user;
    return this.supportService.createChat(user.id, dto);
  }

  @Get('chats')
  @ApiOperation({ summary: 'List chats (real-time conversations)' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Conversation))
  findAllChats(
    @Req() req: AuthenticatedRequest,
    @Query() query: ConversationListQueryDto,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    query.type = 'chat' as any;
    if (!isAdmin) query.user_id = user.id;
    return this.supportService.findAll(query);
  }

  /* ═══════════════════════════════════════
     TICKETS — Async conversations (like Gmail)
     ═══════════════════════════════════════ */

  @Post('tickets')
  @ApiOperation({ summary: 'Create a new ticket' })
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Conversation))
  async createTicket(
    @Req() req: AuthenticatedRequest,
    @Query('targetUserId') targetUserId: string | undefined,
    @Body() dto: CreateTicketDto,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);

    if (isAdmin) {
      if (!targetUserId) {
        throw new ForbiddenException(
          'Los agentes deben especificar el cliente destino (targetUserId).',
        );
      }
      return this.supportService.createTicketForClient(
        targetUserId,
        dto,
        user.id,
      );
    }

    return this.supportService.createTicket(user.id, dto);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List tickets (async conversations)' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Conversation))
  findAllTickets(
    @Req() req: AuthenticatedRequest,
    @Query() query: ConversationListQueryDto,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    query.type = 'ticket' as any;
    if (!isAdmin) query.user_id = user.id;
    return this.supportService.findAll(query);
  }

  /* ═══════════════════════════════════════
     ESCALATION — Chat → Ticket
     ═══════════════════════════════════════ */

  @Post('chats/:id/escalate')
  @ApiOperation({ summary: 'Escalate a chat to a ticket (agent only)' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Conversation))
  async escalateToTicket(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: EscalateToTicketDto,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    if (!isAdmin) {
      throw new ForbiddenException('Solo los agentes pueden escalar chats.');
    }
    return this.supportService.escalateToTicket(chatId, dto, user.id);
  }

  /* ═══════════════════════════════════════
     SHARED — Stats, detail, messages
     ═══════════════════════════════════════ */

  @Get('conversations/stats')
  @ApiOperation({ summary: 'Get support statistics (admin only)' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Conversation))
  getStats(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: 'chat' | 'ticket',
  ) {
    const user = req.user;
    if (!ADMIN_ROLES.includes(user.role.slug)) {
      throw new ForbiddenException('Solo los agentes pueden ver estadísticas.');
    }
    return this.supportService.getStats(type);
  }

  @Get('conversations/unread')
  @ApiOperation({
    summary: 'Get unread message count (optionally filtered by type)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Message))
  getUnreadCount(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: 'chat' | 'ticket',
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    return this.supportService.getUnreadCount(
      user.id,
      isAdmin ? 'agent' : 'client',
      type,
    );
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation detail (chat or ticket)' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Conversation))
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    const conversation = await this.supportService.findOne(id, isAdmin);

    if (!isAdmin && conversation.user_id !== user.id) {
      throw new ForbiddenException('No tienes acceso a esta conversación.');
    }

    const role = isAdmin ? 'agent' : 'client';
    await this.supportService.markAsRead(id, user.id, role);
    return conversation;
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Update conversation (status, priority, assign)' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Conversation))
  async updateConversation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    const user = req.user;
    if (!ADMIN_ROLES.includes(user.role.slug)) {
      throw new ForbiddenException(
        'Solo los agentes pueden modificar conversaciones.',
      );
    }
    return this.supportService.updateConversation(id, dto, user.id);
  }

  /* ═══════════════════════════════════════
     MESSAGES — Add to conversation (shared)
     ═══════════════════════════════════════ */

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Add a message to a conversation' })
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Message))
  async addMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    const senderType = isAdmin ? 'agent' : 'client';

    if (!isAdmin && dto.is_internal) {
      throw new ForbiddenException(
        'Los clientes no pueden enviar notas internas.',
      );
    }

    if (!isAdmin) {
      const conversation = await this.supportService.findOne(id, false);
      if (conversation.user_id !== user.id) {
        throw new ForbiddenException('No tienes acceso a esta conversación.');
      }
    }

    return this.supportService.addMessage(id, senderType, user.id, dto);
  }

  @Patch('conversations/:id/messages/read')
  @ApiOperation({ summary: 'Mark all messages as read' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Message))
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    const role = isAdmin ? 'agent' : 'client';

    if (!isAdmin) {
      const conversation = await this.supportService.findOne(id, false);
      if (conversation.user_id !== user.id) {
        throw new ForbiddenException('No tienes acceso a esta conversación.');
      }
    }

    const count = await this.supportService.markAsRead(id, user.id, role);
    return { marked_read: count };
  }

  /* ═══════════════════════════════════════
     LINK GUEST → CLIENT (7.5.2)
     ═══════════════════════════════════════ */

  @Patch('conversations/:id/link-client')
  @ApiOperation({
    summary: 'Link a guest conversation to an existing client (agents only)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Conversation))
  async linkGuestToClient(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { user_id: string },
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    if (!isAdmin) {
      throw new ForbiddenException(
        'Solo agentes pueden vincular conversaciones.',
      );
    }

    return this.supportService.linkGuestToClient(id, body.user_id, user.id);
  }
}
