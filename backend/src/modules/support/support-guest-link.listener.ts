import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * ═══════════════════════════════════════
 * SupportGuestLinkListener — Automatic guest-to-user linking
 * ═══════════════════════════════════════
 *
 * Listens to:
 *   - auth.registered → Check if the new user's email matches any guest_email
 *     in existing guest conversations. If so, migrate those conversations
 *     to the new user (set user_id, clear guest fields).
 *
 * This enables seamless continuity: a visitor chats anonymously from the landing,
 * then registers → their chat history automatically appears in their dashboard.
 *
 * Migration logic:
 *   1. Find all conversations where guest_email = new user's email
 *   2. Set user_id = new user's id
 *   3. Clear guest_session_hash (no longer needed — user has JWT)
 *   4. Keep guest_name and guest_email for audit trail
 *   5. Add a system message documenting the linking
 *   6. Log the operation for audit
 *
 * Edge cases handled:
 *   - Multiple guest conversations with the same email → all get linked
 *   - No matching conversations → no-op (silent)
 *   - DB failure → logged but doesn't block registration
 *
 * Ref: ROADMAP.md 7.5.1, DECISIONS.md §38
 */
@Injectable()
export class SupportGuestLinkListener {
  private readonly logger = new Logger(SupportGuestLinkListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('auth.registered')
  async handleUserRegistered(payload: { userId: string; email: string }) {
    const { userId, email } = payload;

    try {
      // Find guest conversations matching this email
      const guestConversations = await this.prisma.conversation.findMany({
        where: {
          guest_email: email.toLowerCase().trim(),
          user_id: null, // Only unlinked guest conversations
        },
        select: {
          id: true,
          guest_name: true,
          subject: true,
        },
      });

      if (guestConversations.length === 0) return;

      // Migrate all matching conversations in a transaction
      await this.prisma.$transaction(async (tx) => {
        // 1. Update all conversations: set user_id, clear session hash
        await tx.conversation.updateMany({
          where: {
            guest_email: email.toLowerCase().trim(),
            user_id: null,
          },
          data: {
            user_id: userId,
            guest_session_hash: null, // No longer needed — user has JWT
            // guest_name and guest_email are preserved for audit trail
          },
        });

        // 2. Add system message to each conversation documenting the link
        for (const conv of guestConversations) {
          await tx.message.create({
            data: {
              conversation_id: conv.id,
              sender_type: 'system',
              body: `Conversación vinculada automáticamente a la cuenta registrada (${email}).`,
              is_internal: false,
            },
          });
        }
      });

      this.logger.log(
        `Linked ${guestConversations.length} guest conversation(s) to user ${userId} (email: ${email}): [${guestConversations.map((c) => c.id).join(', ')}]`,
      );
    } catch (error) {
      // Don't block registration if linking fails
      this.logger.error(
        `Failed to link guest conversations for ${email}: ${error}`,
      );
    }
  }
}
