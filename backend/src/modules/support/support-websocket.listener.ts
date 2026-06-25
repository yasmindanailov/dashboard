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
    message?: Record<string, unknown>;
  }) {
    /* Sprint 16 (ADR-079 amendment A3): broadcast canónico `message:new`
       a la room de la conversación. ANTES solo lo emitía el gateway WS
       cuando el envío llegaba vía socket; los mensajes enviados por REST
       (página detalle /admin/support/[id]) no llegaban al cliente del
       widget en tiempo real. Ahora el listener es la ÚNICA fuente —
       el gateway eliminó su emisión directa para evitar duplicación. */
    if (payload.message) {
      // SUPP-INV-3 (audit GL-3): propaga `is_internal` para que el gateway
      // enrute las notas internas solo a staff (agent:inbox), nunca al cliente.
      this.gateway.broadcastNewMessage(
        payload.conversation_id,
        payload.message,
        payload.is_internal,
      );
    }

    // Update unread count for the other party
    if (
      payload.sender_type === 'agent' &&
      payload.user_id &&
      !payload.is_internal
    ) {
      await this.gateway.broadcastUnreadCount(payload.user_id, 'client');
    }
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

  /* Sprint 16 (ADR-079 amendment A3): cuando un chat o ticket pasa a
     `resolved` (vía updateConversation o vía escalateToTicket), el cliente
     conectado por WS necesita ver el cambio de estado en tiempo real
     para que la UI bloquee el input automáticamente sin esperar a un
     refresh manual. Reusamos el evento `conversation.resolved` que ya
     emite `SupportMessageService` y añadimos broadcast a la room
     `conversation:${id}`. */
  @OnEvent('conversation.resolved')
  handleConversationResolved(payload: {
    conversation_id: string;
    user_id: string | null;
  }) {
    this.gateway.broadcastConversationUpdate(payload.conversation_id, {
      status: 'resolved',
    });
  }
}
