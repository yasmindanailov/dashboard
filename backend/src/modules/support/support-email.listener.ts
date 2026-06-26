import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { EmailService } from '../../core/email/email.service';
import { SettingsService } from '../../core/settings/settings.service';
import { getErrorMessage } from '../../core/common/utils/error.util';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationTemplateService } from '../notifications/notification-template.service';

/**
 * SupportEmailListener — notificaciones de soporte (email + campana).
 *
 * GL-25 (audit 2026-06-25): migrado de HTML inline en `EmailService.send`
 * (interpolación CRUDA del contenido del usuario — asunto, cuerpo del mensaje
 * → inyección HTML + violación D12) a `NotificationsService.dispatchToUser`
 * con plantillas de BD Handlebars (escape vía `{{e}}`). Cierra además el gap
 * "sin campana" (ahora email + in-app) y la deuda R15 (217→~145 líneas).
 *
 * Recipientes:
 *   - `conversation.created` → cliente (confirmación). Para chats GUEST (sin
 *     cuenta → `user_id=null`) renderiza la MISMA plantilla y la envía por
 *     EmailService (escapada, respetando el kill-switch `email_enabled_globally`).
 *   - `message.created` (respuesta del agente) → cliente registrado.
 *   - `conversation.assigned` → agente.
 *
 * SUPP-INV-3: las notas internas (`is_internal`) NUNCA se envían al cliente.
 * R7: cada handler es fail-soft (loguea y traga) — perder un email no rompe el flujo.
 */
@Injectable()
export class SupportEmailListener {
  private readonly logger = new Logger(SupportEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly templates: NotificationTemplateService,
    private readonly emailService: EmailService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  private get appUrl(): string {
    return this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );
  }

  @OnEvent('conversation.created')
  async handleConversationCreated(payload: {
    conversation_id: string;
    user_id: string | null;
    user_name: string;
    user_email: string | null;
    subject: string;
    channel: string;
    is_guest?: boolean;
  }): Promise<void> {
    const eventPayload = {
      subject: payload.subject,
      channel: payload.channel,
      support_url: `${this.appUrl}/dashboard/support`,
      action_url: '/dashboard/support',
    };
    try {
      if (payload.user_id) {
        // Cliente registrado → email + campana vía dispatcher (D12, escapado).
        await this.notifications.dispatchToUser(
          'conversation.created',
          eventPayload,
          payload.user_id,
        );
      } else if (payload.user_email) {
        // Chat GUEST (sin cuenta) → email-only con la MISMA plantilla de BD,
        // escapada, respetando el kill-switch global (GL-9). Sin campana (no hay
        // cuenta donde persistir la notificación in-app).
        await this.sendGuestEmail('conversation.created', payload.user_email, {
          ...eventPayload,
          recipient: { first_name: firstWord(payload.user_name) },
        });
      }
    } catch (err) {
      this.logger.error(
        `conversation.created notify failed (conv=${payload.conversation_id}): ${getErrorMessage(err)}`,
      );
    }
  }

  @OnEvent('message.created')
  async handleMessageCreated(payload: {
    conversation_id: string;
    message_id: string;
    sender_type: string;
    sender_id: string | null;
    is_internal: boolean;
    user_id: string | null;
  }): Promise<void> {
    if (payload.is_internal) return; // SUPP-INV-3: nunca al cliente
    if (payload.sender_type !== 'agent') return; // solo respuesta del agente → cliente
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: payload.conversation_id },
        select: { subject: true, user_id: true },
      });
      if (!conversation?.user_id) return; // chat guest / sin cliente → sin email

      const message = await this.prisma.message.findUnique({
        where: { id: payload.message_id },
        select: { body: true },
      });

      await this.notifications.dispatchToUser(
        'message.created',
        {
          subject: conversation.subject,
          preview: truncate(message?.body ?? '', 200),
          support_url: `${this.appUrl}/dashboard/support`,
          action_url: '/dashboard/support',
        },
        conversation.user_id,
      );
    } catch (err) {
      this.logger.error(
        `message.created notify failed (conv=${payload.conversation_id}): ${getErrorMessage(err)}`,
      );
    }
  }

  @OnEvent('conversation.assigned')
  async handleConversationAssigned(payload: {
    conversation_id: string;
    agent_id: string;
    agent_name: string;
    assigned_by: string;
  }): Promise<void> {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: payload.conversation_id },
        select: { subject: true },
      });
      if (!conversation) return;

      await this.notifications.dispatchToUser(
        'conversation.assigned',
        {
          subject: conversation.subject,
          support_url: `${this.appUrl}/admin/support`,
          action_url: '/admin/support',
        },
        payload.agent_id,
      );
    } catch (err) {
      this.logger.error(
        `conversation.assigned notify failed (conv=${payload.conversation_id}): ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * Email a un recipiente SIN cuenta (chat guest): renderiza la plantilla de BD
   * canónica del evento (escape `{{e}}`) y respeta el kill-switch global de
   * email (GL-9). No hay campana — el guest no tiene cuenta.
   */
  private async sendGuestEmail(
    eventType: string,
    to: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const emailEnabled = await this.settings.getBoolean(
      'notifications',
      'email_enabled_globally',
      true,
    );
    if (!emailEnabled) return;
    const rendered = await this.templates.render(
      eventType,
      'email',
      'es',
      context,
    );
    if (!rendered) return;
    await this.emailService.send({
      to,
      subject: rendered.subject,
      html: rendered.body,
    });
  }
}

function firstWord(name: string): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.substring(0, max)}...` : text;
}
