import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';

/**
 * ═══════════════════════════════════════
 * SupportCleanupWorker — Scheduled cleanup of expired guest sessions
 * ═══════════════════════════════════════
 *
 * Runs daily at 6 AM to clean up stale guest conversations:
 *
 * 1. Guest conversations with no activity in >30 days (configurable):
 *    - If status is open/waiting → close them
 *    - Clear guest_session_hash (invalidates any remaining cookies)
 *    - Add system message for audit trail
 *
 * 2. Does NOT delete conversations (data immutability principle).
 *    Only closes and invalidates the session.
 *
 * Configuration:
 *   - `support.guest_session_ttl_days` setting (default: 30)
 *
 * Ref: ROADMAP.md 7.5.3, DECISIONS.md §38, ARCHITECTURE.md Rule 3
 */
@Injectable()
export class SupportCleanupWorker {
  private readonly logger = new Logger(SupportCleanupWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async cleanupExpiredGuestSessions() {
    const startTime = Date.now();

    // Get configurable TTL (default 30 days)
    let ttlDays = 30;
    try {
      const setting = await this.settings.get(
        'support',
        'guest_session_ttl_days',
        '30',
      );
      if (setting) ttlDays = parseInt(setting, 10) || 30;
    } catch {
      // Setting doesn't exist yet — use default
    }

    const cutoffDate = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);

    try {
      // Find expired guest conversations that are still open
      const expiredConversations = await this.prisma.conversation.findMany({
        where: {
          user_id: null,
          guest_session_hash: { not: null },
          updated_at: { lt: cutoffDate },
          status: { in: ['open', 'waiting_agent', 'waiting_client'] },
        },
        select: { id: true, guest_name: true, subject: true },
      });

      if (expiredConversations.length === 0) {
        this.logger.log(
          `Guest cleanup: no expired sessions (TTL: ${ttlDays}d, cutoff: ${cutoffDate.toISOString()})`,
        );
        return;
      }

      // Close and invalidate in a transaction
      await this.prisma.$transaction(async (tx) => {
        // Batch update: close conversations and clear session hash
        await tx.conversation.updateMany({
          where: {
            id: { in: expiredConversations.map((c) => c.id) },
          },
          data: {
            status: 'closed',
            closed_at: new Date(),
            guest_session_hash: null,
          },
        });

        // Add system message to each for audit trail
        await tx.message.createMany({
          data: expiredConversations.map((conv) => ({
            conversation_id: conv.id,
            sender_type: 'system' as const,
            body: `Conversación cerrada automáticamente por inactividad (>${ttlDays} días).`,
            is_internal: false,
          })),
        });
      });

      const elapsed = Date.now() - startTime;
      this.logger.log(
        `Guest cleanup: closed ${expiredConversations.length} expired session(s) in ${elapsed}ms (TTL: ${ttlDays}d)`,
      );
    } catch (error) {
      this.logger.error(`Guest cleanup failed: ${error}`);
    }
  }
}
