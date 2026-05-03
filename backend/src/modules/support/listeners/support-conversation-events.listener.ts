import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';

/**
 * SupportConversationEventsListener — Sprint 16 (ADR-079 amendment).
 *
 * Listener canónico de eventos del lifecycle de tickets (post Sprint 16):
 *
 *   - `conversation.resolved`  → notif al cliente con CTA al ticket explicando
 *     que el agente cree haberlo resuelto y dándole 3 opciones (responder,
 *     confirmar, esperar a auto-close).
 *   - `conversation.auto_closed` → notif info al agente que lo resolvió:
 *     "el ticket #X que resolviste se cerró automáticamente por inactividad".
 *
 * Política de errores: log + degradación silenciosa (R13). La cola
 * `notifications-dispatch` ya tiene su propia DLQ; no relanzamos para
 * evitar bucles si el bus está caído.
 */
@Injectable()
export class SupportConversationEventsListener {
  private readonly logger = new Logger(SupportConversationEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cuando un ticket pasa a `resolved` (vía bridge task o action manual),
   * el cliente recibe notif (canal email + campana) con CTA al detalle.
   * En `/dashboard/support/[id]` puede:
   *   - escribir mensaje → reactiva el ticket (`→waiting_agent`).
   *   - pulsar "Confirmar resolución" → cierra explícito (`→closed`).
   *   - no hacer nada → el cron `support-resolved-auto-close` lo cierra
   *     pasados N días.
   */
  @OnEvent('conversation.resolved')
  async handleResolved(payload: {
    conversation_id: string;
    user_id: string | null;
    sequence_number?: number | null;
    subject?: string;
    type?: string;
  }): Promise<void> {
    if (!payload.user_id) return;
    /* Sprint 16 (ADR-079 amendment A3): notificación push al cliente solo
       para TICKETS — los chats son conversaciones en directo: el cliente
       ya está conectado por WS y recibe `conversation:updated` para
       reaccionar en tiempo real (input bloqueado + banner si fue
       escalación). Notificar push de un chat resuelto sería redundante. */
    if (payload.type && payload.type !== 'ticket') return;
    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );
    try {
      await this.notifications.dispatchToUser(
        'conversation.resolved',
        {
          conversation_id: payload.conversation_id,
          sequence_number: payload.sequence_number ?? null,
          subject: payload.subject ?? '',
          ticket_url: `${appUrl}/dashboard/support/${payload.conversation_id}`,
          action_url: `/dashboard/support/${payload.conversation_id}`,
        },
        payload.user_id,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch conversation.resolved for ${payload.conversation_id}: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * Cuando el cron auto-close cierra un ticket por inactividad, notif info al
   * agente que lo resolvió originalmente. Silente al cliente.
   */
  @OnEvent('conversation.auto_closed')
  async handleAutoClosed(payload: {
    conversation_id: string;
    sequence_number: number | null;
    subject: string;
    client_user_id: string | null;
    agent_user_id: string | null;
    days_inactive: number;
    ticket_url: string;
  }): Promise<void> {
    if (!payload.agent_user_id) return;
    try {
      await this.notifications.dispatchToUser(
        'conversation.auto_closed',
        {
          conversation_id: payload.conversation_id,
          sequence_number: payload.sequence_number,
          subject: payload.subject,
          days_inactive: payload.days_inactive,
          ticket_url: payload.ticket_url,
          action_url: `/admin/support/${payload.conversation_id}`,
        },
        payload.agent_user_id,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch conversation.auto_closed for ${payload.conversation_id}: ${getErrorMessage(err)}`,
      );
    }
  }
}
