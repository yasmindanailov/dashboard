import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { EmailService } from '../../core/email/email.service';

/**
 * SupportEmailListener — Handles support-related email notifications.
 *
 * Listens to:
 * - conversation.created → Notify agents of new conversation (+ client confirmation)
 * - message.created      → Notify the other party of a new message
 * - conversation.assigned → Notify agent of assignment
 *
 * Ref: DECISIONS.md §9 (communication system)
 */
@Injectable()
export class SupportEmailListener {
  private readonly logger = new Logger(SupportEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /* ═══════════════════════════════════════
     CONVERSATION CREATED
     ═══════════════════════════════════════ */

  @OnEvent('conversation.created')
  async handleConversationCreated(payload: {
    conversation_id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    subject: string;
    channel: string;
  }) {
    // 1. Send confirmation to client
    await this.emailService.send({
      to: payload.user_email,
      subject: `Tu consulta ha sido recibida — "${payload.subject}"`,
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Consulta recibida</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${payload.subject}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola ${payload.user_name.split(' ')[0]},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hemos recibido tu consulta. Nuestro equipo la revisará lo antes posible
              y te responderemos desde tu panel de soporte.
            </p>
            <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #9ca3af;">Asunto:</td><td style="text-align: right; font-weight: 600;">${payload.subject}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Canal:</td><td style="text-align: right;">${payload.channel}</td></tr>
              </table>
            </div>
            <p style="color: #6b7280; font-size: 13px;">
              Te notificaremos por email cuando haya una respuesta.
            </p>
          </div>
        </div>
      `,
    });

    this.logger.log(
      `Email sent: conversation.created → client ${payload.user_email}`,
    );

    // 2. Notify all support agents via internal notification
    // (Email to agents is optional — they'll see it in the dashboard inbox)
    // For now we log it; in-app notifications are in Sprint 9
    this.logger.log(
      `New conversation from ${payload.user_name}: "${payload.subject}" (${payload.channel})`,
    );
  }

  /* ═══════════════════════════════════════
     NEW MESSAGE — Notify the other party
     ═══════════════════════════════════════ */

  @OnEvent('message.created')
  async handleMessageCreated(payload: {
    conversation_id: string;
    message_id: string;
    sender_type: string;
    sender_id: string | null;
    is_internal: boolean;
    user_id: string | null;
  }) {
    // Don't send email for internal notes
    if (payload.is_internal) return;

    // Don't send email for system messages
    if (payload.sender_type === 'system') return;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: payload.conversation_id },
      select: {
        id: true,
        subject: true,
        user_id: true,
        assigned_agent_id: true,
      },
    });
    if (!conversation) return;

    if (payload.sender_type === 'agent' && conversation.user_id) {
      // Agent replied → notify client
      const client = await this.prisma.user.findUnique({
        where: { id: conversation.user_id },
        select: { email: true, first_name: true },
      });
      if (!client) return;

      const message = await this.prisma.message.findUnique({
        where: { id: payload.message_id },
        select: { body: true },
      });

      // Truncate message preview for email
      const preview = message?.body
        ? message.body.length > 200
          ? message.body.substring(0, 200) + '...'
          : message.body
        : '';

      await this.emailService.send({
        to: client.email,
        subject: `Nueva respuesta en "${conversation.subject}"`,
        html: `
          <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 24px;">Nueva respuesta</h1>
              <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${conversation.subject}</p>
            </div>
            <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
              <p style="color: #374151; font-size: 15px; line-height: 1.6;">
                Hola${client.first_name ? ` ${client.first_name}` : ''},
              </p>
              <p style="color: #374151; font-size: 15px; line-height: 1.6;">
                Has recibido una nueva respuesta en tu conversación de soporte:
              </p>
              <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 3px solid #635BFF;">
                <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-line;">${preview}</p>
              </div>
              <p style="color: #6b7280; font-size: 13px;">
                Accede a tu panel de soporte para ver la conversación completa y responder.
              </p>
            </div>
          </div>
        `,
      });

      this.logger.log(
        `Email sent: message.created (agent→client) → ${client.email}`,
      );
    }

    // Note: client→agent notifications are handled via the dashboard inbox
    // Agents don't receive email for every client message (too noisy).
    // They get in-app notifications (Sprint 9) and badge counts.
  }

  /* ═══════════════════════════════════════
     CONVERSATION ASSIGNED
     ═══════════════════════════════════════ */

  @OnEvent('conversation.assigned')
  async handleConversationAssigned(payload: {
    conversation_id: string;
    agent_id: string;
    agent_name: string;
    assigned_by: string;
  }) {
    const agent = await this.prisma.user.findUnique({
      where: { id: payload.agent_id },
      select: { email: true, first_name: true },
    });
    if (!agent) return;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: payload.conversation_id },
      select: { subject: true },
    });
    if (!conversation) return;

    await this.emailService.send({
      to: agent.email,
      subject: `Conversación asignada — "${conversation.subject}"`,
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Conversación asignada</h1>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola ${agent.first_name || 'agente'},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Se te ha asignado la conversación: <strong>"${conversation.subject}"</strong>.
            </p>
            <p style="color: #6b7280; font-size: 13px;">
              Accede al panel de soporte para revisarla y responder.
            </p>
          </div>
        </div>
      `,
    });

    this.logger.log(`Email sent: conversation.assigned → ${agent.email}`);
  }
}
