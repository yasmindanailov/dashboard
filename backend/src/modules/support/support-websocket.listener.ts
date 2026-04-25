import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SupportGateway } from './support.gateway';

/**
 * SupportWebsocketListener — Bridges EventEmitter2 events to WebSocket broadcasts.
 *
 * When the SupportService emits events (via EventEmitter2), this listener
 * forwards them to connected WebSocket clients via the SupportGateway.
 *
 * This separation keeps the SupportService clean (no direct WS dependency)
 * and follows the established event-driven pattern (like BillingEmailListener).
 */
@Injectable()
export class SupportWebsocketListener {
  private readonly logger = new Logger(SupportWebsocketListener.name);

  constructor(private readonly gateway: SupportGateway) {}

  @OnEvent('conversation.created')
  handleConversationCreated(payload: {
    conversation_id: string;
    subject: string;
    channel: string;
  }) {
    this.gateway.broadcastNewConversation(
      payload.conversation_id,
      payload.subject,
      payload.channel,
    );
    this.logger.log(`WS broadcast: conversation.created → agent:inbox`);
  }

  @OnEvent('message.created')
  async handleMessageCreated(payload: {
    conversation_id: string;
    sender_type: string;
    user_id: string | null;
    is_internal: boolean;
  }) {
    // Update unread count for the other party
    if (
      payload.sender_type === 'agent' &&
      payload.user_id &&
      !payload.is_internal
    ) {
      await this.gateway.broadcastUnreadCount(payload.user_id, 'client');
    }
    // Note: message:new is already broadcasted in the gateway's handleSendMessage
    // This listener handles messages sent via REST (not WebSocket)
  }

  @OnEvent('conversation.assigned')
  handleConversationAssigned(payload: {
    conversation_id: string;
    agent_id: string;
    agent_name: string;
  }) {
    this.gateway.broadcastConversationUpdate(payload.conversation_id, {
      assigned_agent_id: payload.agent_id,
      assigned_agent_name: payload.agent_name,
    });
  }
}
