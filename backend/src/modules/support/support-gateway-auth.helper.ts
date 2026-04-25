import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from '../../core/database/prisma.service';
import {
  hashGuestToken,
  GUEST_TOKEN_COOKIE_NAME,
} from '../../core/common/utils/guest-token.util';

/**
 * ═══════════════════════════════════════
 * SupportGatewayAuth — WebSocket authentication helper
 * ═══════════════════════════════════════
 *
 * Handles dual authentication for the SupportGateway:
 *   1. JWT token (primary — dashboard users)
 *   2. Guest session token from cookie (fallback — landing visitors)
 *
 * Ref: DECISIONS.md §38, ROADMAP.md 7.4.4
 * ═══════════════════════════════════════
 */

const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_support'];

export interface ConnectedUserInfo {
  userId: string;
  role: string;
  isAdmin: boolean;
  isGuest: boolean;
  userName: string;
  guestSessionHash?: string;
}

export class SupportGatewayAuth {
  private readonly logger = new Logger(SupportGatewayAuth.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Authenticate via JWT token (dashboard users).
   * Returns ConnectedUserInfo if successful, null otherwise.
   */
  async authenticateWithJwt(
    client: Socket,
    token: string,
  ): Promise<ConnectedUserInfo | null> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { role: true },
      });

      if (!user || user.status !== 'active') return null;

      const isAdmin = ADMIN_ROLES.includes(user.role.slug);

      this.logger.log(
        `Connected: ${user.email} (${user.role.slug}) — socket: ${client.id}`,
      );

      return {
        userId: user.id,
        role: user.role.slug,
        isAdmin,
        isGuest: false,
        userName: `${user.first_name} ${user.last_name}`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Authenticate as a guest user via session token cookie (7.4.4).
   * Returns ConnectedUserInfo if successful, null otherwise.
   */
  async authenticateAsGuest(
    client: Socket,
    rawToken: string,
  ): Promise<ConnectedUserInfo | null> {
    try {
      const sessionHash = hashGuestToken(rawToken);

      const guestConversation = await this.prisma.conversation.findFirst({
        where: { guest_session_hash: sessionHash },
        select: { id: true, guest_name: true },
      });

      if (!guestConversation) return null;

      const syntheticId = `guest:${sessionHash.substring(0, 12)}`;

      this.logger.log(
        `Connected: guest "${guestConversation.guest_name}" — socket: ${client.id}`,
      );

      return {
        userId: syntheticId,
        role: 'guest',
        isAdmin: false,
        isGuest: true,
        userName: guestConversation.guest_name || 'Visitante',
        guestSessionHash: sessionHash,
      };
    } catch (error) {
      this.logger.warn(`Guest auth failed: ${error}`);
      return null;
    }
  }

  /**
   * Extract the guest session token from the Socket.io handshake cookies.
   */
  extractGuestTokenFromCookie(client: Socket): string | null {
    const cookieHeader = client.handshake.headers?.cookie;
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').reduce(
        (acc, cookie) => {
          const [key, ...val] = cookie.trim().split('=');
          if (key) acc[key.trim()] = val.join('=').trim();
          return acc;
        },
        {} as Record<string, string>,
      );

      if (cookies[GUEST_TOKEN_COOKIE_NAME]) {
        return cookies[GUEST_TOKEN_COOKIE_NAME];
      }
    }

    if (client.handshake.auth?.guestToken) {
      return client.handshake.auth.guestToken;
    }

    return null;
  }
}
