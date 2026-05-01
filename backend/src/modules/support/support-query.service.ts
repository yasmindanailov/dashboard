import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '@prisma/client';
import { ConversationListQueryDto } from './dto/support.dto';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';

/**
 * SupportQueryService — Read operations and statistics.
 * Responsibilities: findAll, findOne, getUnreadCount, getStats
 * Ref: DECISIONS.md §9, ARCHITECTURE.md Regla 15
 */
@Injectable()
export class SupportQueryService {
  private readonly logger = new Logger(SupportQueryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List conversations with pagination and filters.
   * ALWAYS filtered by type (chat or ticket).
   */
  async findAll(
    query: ConversationListQueryDto,
  ): Promise<PaginatedResult<any>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ConversationWhereInput = {
      type: query.type,
    };

    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;
    if (query.assigned_agent_id)
      where.assigned_agent_id = query.assigned_agent_id;
    if (query.user_id) where.user_id = query.user_id;
    if (query.channel) where.channel = query.channel;

    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        {
          messages: {
            some: { body: { contains: query.search, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: {
          messages: {
            orderBy: { created_at: 'desc' },
            take: 1,
          },
          user: {
            select: { first_name: true, last_name: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { updated_at: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    // 7.H7: For chats, re-sort to prioritize actionable statuses
    if (query.type === 'chat') {
      const statusWeight: Record<string, number> = {
        waiting_agent: 0,
        open: 1,
        waiting_client: 2,
        resolved: 3,
        closed: 4,
      };
      data.sort((a, b) => {
        const wa = statusWeight[a.status] ?? 5;
        const wb = statusWeight[b.status] ?? 5;
        if (wa !== wb) return wa - wb;
        if (a.priority !== b.priority) {
          const prio: Record<string, number> = {
            urgent: 4,
            high: 3,
            normal: 2,
            low: 1,
          };
          return (prio[b.priority] ?? 0) - (prio[a.priority] ?? 0);
        }
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
    }

    return paginate(data, total, page, limit);
  }

  /**
   * Get single conversation with all messages, enriched with sender names.
   */
  async findOne(id: string, includeInternal = true) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          where: includeInternal ? undefined : { is_internal: false },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    // 7.H13: Resolve sender names from User table (batch query for efficiency)
    const senderIds = [
      ...new Set(
        conversation.messages
          .map((m) => m.sender_id)
          .filter((id): id is string => id !== null),
      ),
    ];

    let senderMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, first_name: true, last_name: true },
      });
      senderMap = Object.fromEntries(
        users.map((u) => [u.id, `${u.first_name} ${u.last_name}`]),
      );
    }

    // Enrich messages with sender_name
    const enrichedMessages = conversation.messages.map((msg) => ({
      ...msg,
      sender_name:
        msg.sender_type === 'system'
          ? 'Sistema'
          : msg.sender_type === 'ai'
            ? 'Asistente IA'
            : msg.sender_id
              ? senderMap[msg.sender_id] || 'Usuario'
              : msg.sender_type === 'client' && conversation.guest_name
                ? conversation.guest_name
                : 'Anónimo',
    }));

    // 7.H14: Compute last agent response time
    const lastAgentMessage = [...conversation.messages]
      .reverse()
      .find((m) => m.sender_type === 'agent');

    // 7.H17: Resolve who resolved/closed the conversation
    let resolved_by_name: string | null = null;
    if (conversation.resolved_by_id) {
      const resolver = await this.prisma.user.findUnique({
        where: { id: conversation.resolved_by_id },
        select: { first_name: true, last_name: true },
      });
      if (resolver)
        resolved_by_name = `${resolver.first_name} ${resolver.last_name}`;
    }

    // 7.H21: Resolve client name for the conversation header.
    // Sub-fase 8.D.12.6: enriquecemos con `support_inside_subscription`
    // del owner activo (si existe) para que el header muestre el badge
    // tier+SLA. Single query con `include` — sin N+1.
    let client_name: string | null = null;
    let client_email: string | null = null;
    let client_support_inside: {
      product_slug: string;
      product_name: string;
      priority_tier: 'standard' | 'high' | 'max';
      response_sla_hours: number;
      channels_active: ('webchat' | 'email' | 'phone' | 'whatsapp')[];
    } | null = null;
    if (conversation.user_id) {
      const client = await this.prisma.user.findUnique({
        where: { id: conversation.user_id },
        select: {
          first_name: true,
          last_name: true,
          email: true,
          support_inside_subscription: {
            select: {
              status: true,
              product: {
                select: {
                  slug: true,
                  name: true,
                  support_inside_config: {
                    select: {
                      priority_tier: true,
                      response_sla_hours: true,
                      channels_active: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (client) {
        client_name = `${client.first_name} ${client.last_name}`;
        client_email = client.email;
        const sub = client.support_inside_subscription;
        if (
          sub &&
          sub.status === 'active' &&
          sub.product.support_inside_config
        ) {
          client_support_inside = {
            product_slug: sub.product.slug,
            product_name: sub.product.name,
            priority_tier: sub.product.support_inside_config.priority_tier,
            response_sla_hours:
              sub.product.support_inside_config.response_sla_hours,
            channels_active: sub.product.support_inside_config.channels_active,
          };
        }
      }
    } else if (conversation.guest_name) {
      client_name = conversation.guest_name;
      client_email = conversation.guest_email;
    }
    // Resolve assigned agent name for client sidebar
    let assigned_agent_name: string | null = null;
    if (conversation.assigned_agent_id) {
      const agent = await this.prisma.user.findUnique({
        where: { id: conversation.assigned_agent_id },
        select: { first_name: true, last_name: true },
      });
      if (agent) assigned_agent_name = `${agent.first_name} ${agent.last_name}`;
    }

    return {
      ...conversation,
      messages: enrichedMessages,
      last_agent_response_at: lastAgentMessage?.created_at || null,
      resolved_by_name,
      client_name,
      client_email,
      client_support_inside,
      assigned_agent_name,
    };
  }

  /**
   * Get unread message count for a user.
   */
  async getUnreadCount(
    userId: string,
    role: 'client' | 'agent',
    type?: 'chat' | 'ticket',
  ): Promise<number> {
    const typeFilter = type ? { type } : {};

    if (role === 'client') {
      return this.prisma.message.count({
        where: {
          conversation: { user_id: userId, ...typeFilter },
          sender_type: { in: ['agent', 'system'] },
          read_at: null,
          is_internal: false,
        },
      });
    }

    return this.prisma.message.count({
      where: {
        sender_type: { in: ['client', 'ai'] },
        read_at: null,
        conversation: { status: { notIn: ['closed'] }, ...typeFilter },
      },
    });
  }

  /**
   * Get conversation stats for the admin dashboard.
   */
  async getStats(type?: 'chat' | 'ticket') {
    const typeFilter = type ? { type } : {};

    const [total, unassigned, statusGroups] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where: typeFilter }),
      this.prisma.conversation.count({
        where: {
          ...typeFilter,
          assigned_agent_id: null,
          status: { notIn: ['closed', 'resolved'] },
        },
      }),
      this.prisma.conversation.groupBy({
        by: ['status'],
        where: typeFilter,
        orderBy: { status: 'asc' },
        _count: true,
      }),
    ]);

    // Build a status→count map from the groupBy result
    const countByStatus: Record<string, number> = {};
    for (const group of statusGroups) {
      countByStatus[group.status] =
        typeof group._count === 'number' ? group._count : 0;
    }

    const recentConversations = await this.prisma.conversation.findMany({
      where: {
        ...typeFilter,
        first_response_at: { not: null },
        created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { created_at: true, first_response_at: true },
    });

    let avgMinutes: number | null = null;
    if (recentConversations.length > 0) {
      const totalMinutes = recentConversations.reduce((sum: number, c) => {
        const diff = c.first_response_at!.getTime() - c.created_at.getTime();
        return sum + diff / (1000 * 60);
      }, 0);
      avgMinutes = Math.round(totalMinutes / recentConversations.length);
    }

    return {
      total_conversations: total,
      open_count: countByStatus['open'] ?? 0,
      waiting_agent_count: countByStatus['waiting_agent'] ?? 0,
      unassigned_count: unassigned,
      avg_first_response_minutes: avgMinutes,
      waiting_client_count: countByStatus['waiting_client'] ?? 0,
      resolved_count: countByStatus['resolved'] ?? 0,
      closed_count: countByStatus['closed'] ?? 0,
    };
  }
}
