import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { SupportService } from './support.service';
import { PrismaService } from '../../core/database/prisma.service';
import {
  SupportGatewayAuth,
  ConnectedUserInfo,
} from './support-gateway-auth.helper';

/**
 * SupportGateway — WebSocket real-time communication for support.
 *
 * Rooms: conversation:<id>, agent:inbox, user:<id>, guest:<hash>
 * Auth: JWT (primary) or guest cookie (fallback)
 * Ref: DECISIONS.md §9, §38
 */
@WebSocketGateway({
  namespace: '/support',
  cors: { origin: '*', credentials: true },
})
export class SupportGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SupportGateway.name);
  private readonly auth: SupportGatewayAuth;
  private connectedUsers = new Map<string, ConnectedUserInfo>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly supportService: SupportService,
    private readonly prisma: PrismaService,
  ) {
    this.auth = new SupportGatewayAuth(jwtService, prisma);
  }

  /* ═══ CONNECTION LIFECYCLE ═══ */

  async handleConnection(client: Socket) {
    // Attempt 1: JWT
    const auth = client.handshake.auth as { token?: string } | undefined;
    const token =
      auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (token) {
      const userInfo = await this.auth.authenticateWithJwt(client, token);
      if (userInfo) {
        this.connectedUsers.set(client.id, userInfo);
        // socket.io Socket.join() declara Promise<void> en typings pero es
        // síncrono en runtime. void evita warning de no-floating-promises.
        void client.join(`user:${userInfo.userId}`);
        if (userInfo.isAdmin) void client.join('agent:inbox');
        const unread = await this.supportService.getUnreadCount(
          userInfo.userId,
          userInfo.isAdmin ? 'agent' : 'client',
        );
        client.emit('unread:update', { count: unread });
        return;
      }
    }

    // Attempt 2: Guest cookie
    const guestToken = this.auth.extractGuestTokenFromCookie(client);
    if (guestToken) {
      const userInfo = await this.auth.authenticateAsGuest(client, guestToken);
      if (userInfo) {
        this.connectedUsers.set(client.id, userInfo);
        void client.join(`guest:${userInfo.guestSessionHash}`);
        return;
      }
    }

    this.logger.warn(`Connection rejected: no valid auth (${client.id})`);
    client.disconnect(true);
  }

  handleDisconnect(client: Socket) {
    const userInfo = this.connectedUsers.get(client.id);
    if (userInfo) {
      // Broadcast typing:stop to all conversation rooms (7.H3)
      for (const room of Array.from(client.rooms || [])) {
        if (room.startsWith('conversation:')) {
          client.to(room).emit('typing:stop', {
            conversationId: room.replace('conversation:', ''),
            userId: userInfo.userId,
            role: userInfo.isAdmin ? 'agent' : 'client',
          });
        }
      }
      this.connectedUsers.delete(client.id);
    }
  }

  /* ═══ JOIN / LEAVE ═══ */

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) return;

    // Access control
    if (userInfo.isGuest) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: data.conversationId },
        select: { guest_session_hash: true },
      });
      if (!conv || conv.guest_session_hash !== userInfo.guestSessionHash)
        return;
    } else if (!userInfo.isAdmin) {
      try {
        const conv = await this.supportService.findOne(
          data.conversationId,
          false,
        );
        if (conv.user_id !== userInfo.userId) return;
      } catch {
        return;
      }
    }

    void client.join(`conversation:${data.conversationId}`);

    if (!userInfo.isGuest) {
      const role: 'agent' | 'client' = userInfo.isAdmin ? 'agent' : 'client';
      await this.supportService.markAsRead(
        data.conversationId,
        userInfo.userId,
        role,
      );
    }
  }

  @SubscribeMessage('conversation:leave')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    void client.leave(`conversation:${data.conversationId}`);
  }

  /* ═══ SEND MESSAGE ═══ */

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; body: string; is_internal?: boolean },
  ) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo || !data.body?.trim()) return;

    // Guest flow
    if (userInfo.isGuest) {
      if (data.is_internal) return;
      const conv = await this.prisma.conversation.findUnique({
        where: { id: data.conversationId },
        select: { guest_session_hash: true },
      });
      if (!conv || conv.guest_session_hash !== userInfo.guestSessionHash)
        return;

      try {
        const message = await this.supportService.addMessage(
          data.conversationId,
          'client',
          null,
          { body: data.body.trim(), is_internal: false },
        );
        this.server
          .to(`conversation:${data.conversationId}`)
          .emit('message:new', {
            conversationId: data.conversationId,
            message: { ...message, sender_name: userInfo.userName },
          });
        this.server.to('agent:inbox').emit('conversation:updated', {
          conversationId: data.conversationId,
          status: 'waiting_agent',
        });
      } catch {
        client.emit('error', { message: 'Error al enviar el mensaje.' });
      }
      return;
    }

    // Authenticated user flow
    const senderType = userInfo.isAdmin ? 'agent' : 'client';
    if (!userInfo.isAdmin && data.is_internal) return;
    if (!userInfo.isAdmin) {
      try {
        const conv = await this.supportService.findOne(
          data.conversationId,
          false,
        );
        if (conv.user_id !== userInfo.userId) return;
      } catch {
        return;
      }
    }

    try {
      const message = await this.supportService.addMessage(
        data.conversationId,
        senderType,
        userInfo.userId,
        { body: data.body.trim(), is_internal: data.is_internal ?? false },
      );

      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('message:new', {
          conversationId: data.conversationId,
          message: { ...message, sender_name: userInfo.userName },
        });

      if (senderType === 'agent' && !data.is_internal) {
        const conv = await this.supportService.findOne(
          data.conversationId,
          false,
        );
        if (conv.user_id) {
          const unread = await this.supportService.getUnreadCount(
            conv.user_id,
            'client',
          );
          this.server
            .to(`user:${conv.user_id}`)
            .emit('unread:update', { count: unread });
        }
      }

      if (senderType === 'client') {
        this.server.to('agent:inbox').emit('conversation:updated', {
          conversationId: data.conversationId,
          status: 'waiting_agent',
        });
      }
    } catch {
      client.emit('error', { message: 'Error al enviar el mensaje.' });
    }
  }

  /* ═══ TYPING ═══ */

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) return;

    const event = data.isTyping ? 'typing:start' : 'typing:stop';
    client.to(`conversation:${data.conversationId}`).emit(event, {
      conversationId: data.conversationId,
      userId: userInfo.userId,
      role: userInfo.isAdmin ? 'agent' : userInfo.isGuest ? 'guest' : 'client',
    });
  }

  /* ═══ MARK AS READ ═══ */

  @SubscribeMessage('messages:read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo || userInfo.isGuest) return;

    const role: 'agent' | 'client' = userInfo.isAdmin ? 'agent' : 'client';
    await this.supportService.markAsRead(
      data.conversationId,
      userInfo.userId,
      role,
    );

    client.to(`conversation:${data.conversationId}`).emit('messages:read', {
      conversationId: data.conversationId,
      readBy: userInfo.userId,
      role,
    });
  }

  /* ═══ SERVER-SIDE EMITTERS ═══ */

  broadcastNewConversation(
    conversationId: string,
    subject: string,
    channel: string,
  ) {
    this.server
      ?.to('agent:inbox')
      .emit('conversation:new', { conversationId, subject, channel });
  }

  broadcastConversationUpdate(
    conversationId: string,
    update: Record<string, unknown>,
  ) {
    this.server
      ?.to(`conversation:${conversationId}`)
      .emit('conversation:updated', {
        conversationId,
        ...update,
      });
  }

  async broadcastUnreadCount(userId: string, role: 'client' | 'agent') {
    const count = await this.supportService.getUnreadCount(userId, role);
    this.server?.to(`user:${userId}`).emit('unread:update', { count });
  }
}
