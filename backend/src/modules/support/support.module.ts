import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SupportService } from './support.service';
import { SupportChatService } from './support-chat.service';
import { SupportTicketService } from './support-ticket.service';
import { SupportMessageService } from './support-message.service';
import { SupportQueryService } from './support-query.service';
import { SupportAiSuggestionService } from './support-ai-suggestion.service';
import { SupportController } from './support.controller';
import { AiModule } from '../ai/ai.module';
import { SupportGuestController } from './support-guest.controller';
import { SupportGateway } from './support.gateway';
import { SupportEmailListener } from './support-email.listener';
import { SupportWebsocketListener } from './support-websocket.listener';
import { SupportGuestLinkListener } from './support-guest-link.listener';
import { SupportCleanupWorker } from './support-cleanup.worker';
import { SupportConversationEventsListener } from './listeners/support-conversation-events.listener';
import { SupportResolvedAutoCloseService } from './crons/support-resolved-auto-close.service';
import {
  SupportResolvedAutoCloseProcessor,
  SUPPORT_RESOLVED_AUTO_CLOSE_QUEUE,
} from './crons/support-resolved-auto-close.processor';

/**
 * SupportModule — Core support/conversation system.
 *
 * Phase 1 (Sprint 7.1):  REST API for conversations + messages + emails ✅
 * Phase 2 (Sprint 7.2-3): WebSocket gateway for real-time chat ✅
 * Phase 3 (Sprint 7.4-5): Guest/anonymous chat ✅
 * Phase 4 (Sprint 16):    Lifecycle ticket canónico — `resolved` transitorio
 *                         con auto-close + `conversation.reactivated` event
 *                         + endpoint cliente `confirm-resolution`. ADR-079
 *                         amendment.
 *
 * JwtModule verifica tokens del WebSocket. PrismaService es global.
 * EventEmitter2 es global (registrado en AppModule).
 * BullModule registra la queue del cron `support-resolved-auto-close`.
 *
 * Ref: DECISIONS.md §7, §9 + ADR-079.
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
    BullModule.registerQueue({ name: SUPPORT_RESOLVED_AUTO_CLOSE_QUEUE }),
    // F3·E13 Fase D — subsistema IA paralelo (ADR-080 Amendment D). Provee
    // `AiSuggestionService` (proveedor activo + SecretVault + breaker R11).
    AiModule,
  ],
  controllers: [SupportController, SupportGuestController],
  providers: [
    // Sub-services (internal — not exported)
    SupportChatService,
    SupportTicketService,
    SupportMessageService,
    SupportQueryService,
    SupportAiSuggestionService,
    // Facade (public API)
    SupportService,
    // Infrastructure
    SupportGateway,
    SupportEmailListener,
    SupportWebsocketListener,
    SupportGuestLinkListener,
    SupportCleanupWorker,
    // Sprint 16 — lifecycle ticket canónico
    SupportConversationEventsListener,
    SupportResolvedAutoCloseService,
    SupportResolvedAutoCloseProcessor,
  ],
  exports: [SupportService, SupportGateway, SupportResolvedAutoCloseService],
})
export class SupportModule {}
