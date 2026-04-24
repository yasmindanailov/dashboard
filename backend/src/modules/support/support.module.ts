import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupportService } from './support.service';
import { SupportChatService } from './support-chat.service';
import { SupportTicketService } from './support-ticket.service';
import { SupportMessageService } from './support-message.service';
import { SupportQueryService } from './support-query.service';
import { SupportController } from './support.controller';
import { SupportGuestController } from './support-guest.controller';
import { SupportGateway } from './support.gateway';
import { SupportEmailListener } from './support-email.listener';
import { SupportWebsocketListener } from './support-websocket.listener';
import { SupportGuestLinkListener } from './support-guest-link.listener';
import { SupportCleanupWorker } from './support-cleanup.worker';

/**
 * SupportModule — Core support/conversation system.
 *
 * Phase 1 (Sprint 7.1):  REST API for conversations + messages + emails ✅
 * Phase 2 (Sprint 7.2-3): WebSocket gateway for real-time chat ✅
 * Phase 3 (Sprint 7.4-5): Guest/anonymous chat ← current
 *
 * JwtModule is imported to verify tokens in the WebSocket handshake.
 * PrismaService is global (no need to import PrismaModule).
 * EventEmitter2 is global (registered in AppModule).
 *
 * SupportGuestController is a separate controller for unauthenticated
 * guest chat endpoints. It does NOT use JwtAuthGuard/PoliciesGuard.
 * Rate limiting is enforced via @Throttle() on each guest endpoint.
 *
 * Ref: DECISIONS.md §7, §9
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [SupportController, SupportGuestController],
  providers: [
    // Sub-services (internal — not exported)
    SupportChatService,
    SupportTicketService,
    SupportMessageService,
    SupportQueryService,
    // Facade (public API)
    SupportService,
    // Infrastructure
    SupportGateway,
    SupportEmailListener,
    SupportWebsocketListener,
    SupportGuestLinkListener,
    SupportCleanupWorker,
  ],
  exports: [SupportService, SupportGateway],
})
export class SupportModule {}

