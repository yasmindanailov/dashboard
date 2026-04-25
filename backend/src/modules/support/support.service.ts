import { Injectable } from '@nestjs/common';

import { SupportChatService } from './support-chat.service';
import { SupportTicketService } from './support-ticket.service';
import { SupportMessageService } from './support-message.service';
import { SupportQueryService } from './support-query.service';

import {
  CreateChatDto,
  CreateGuestChatDto,
  CreateTicketDto,
  CreateMessageDto,
  UpdateConversationDto,
  ConversationListQueryDto,
  EscalateToTicketDto,
} from './dto/support.dto';

/**
 * ═══════════════════════════════════════
 * SupportService — Facade (public API)
 * ═══════════════════════════════════════
 *
 * Delegates to domain-specific sub-services:
 *   - SupportChatService    → chat creation, guest, linking
 *   - SupportTicketService  → ticket creation, escalation
 *   - SupportMessageService → messages, updates, read status
 *   - SupportQueryService   → list, detail, stats, unread
 *
 * The controller and gateway inject SupportService only.
 * Sub-services are internal implementation details.
 *
 * Ref: ARCHITECTURE.md Regla 15, DECISIONS.md §9
 * ═══════════════════════════════════════
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly chat: SupportChatService,
    private readonly ticket: SupportTicketService,
    private readonly message: SupportMessageService,
    private readonly query: SupportQueryService,
  ) {}

  // ── Chat ──
  createChat(userId: string, dto: CreateChatDto) {
    return this.chat.createChat(userId, dto);
  }

  createGuestChat(dto: CreateGuestChatDto, guestSessionHash: string) {
    return this.chat.createGuestChat(dto, guestSessionHash);
  }

  linkGuestToClient(
    conversationId: string,
    targetUserId: string,
    agentId: string,
  ) {
    return this.chat.linkGuestToClient(conversationId, targetUserId, agentId);
  }

  // ── Ticket ──
  createTicket(userId: string, dto: CreateTicketDto) {
    return this.ticket.createTicket(userId, dto);
  }

  createTicketForClient(
    targetUserId: string,
    dto: CreateTicketDto,
    agentId: string,
  ) {
    return this.ticket.createTicketForClient(targetUserId, dto, agentId);
  }

  escalateToTicket(chatId: string, dto: EscalateToTicketDto, agentId: string) {
    return this.ticket.escalateToTicket(chatId, dto, agentId);
  }

  // ── Messages ──
  addMessage(
    conversationId: string,
    senderType: 'client' | 'agent' | 'system' | 'ai',
    senderId: string | null,
    dto: CreateMessageDto,
  ) {
    return this.message.addMessage(conversationId, senderType, senderId, dto);
  }

  updateConversation(id: string, dto: UpdateConversationDto, actorId: string) {
    return this.message.updateConversation(id, dto, actorId);
  }

  markAsRead(
    conversationId: string,
    readerId: string,
    readerType: 'client' | 'agent',
  ) {
    return this.message.markAsRead(conversationId, readerId, readerType);
  }

  // ── Query ──
  findAll(query: ConversationListQueryDto) {
    return this.query.findAll(query);
  }

  findOne(id: string, includeInternal = true) {
    return this.query.findOne(id, includeInternal);
  }

  getUnreadCount(
    userId: string,
    role: 'client' | 'agent',
    type?: 'chat' | 'ticket',
  ) {
    return this.query.getUnreadCount(userId, role, type);
  }

  getStats(type?: 'chat' | 'ticket') {
    return this.query.getStats(type);
  }
}
