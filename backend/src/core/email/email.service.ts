import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getErrorMessage } from '../common/utils/error.util';

/** Subset de `SentMessageInfo` que usamos — el tipo upstream es `any`. */
interface SendMailResult {
  messageId: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Buzón monitorizado al que llegan las respuestas ("responde a este correo"). */
  replyTo?: string;
  /** Cabeceras extra (p. ej. `X-Aelium-Event`). Se fusionan con los defaults. */
  headers?: Record<string, string>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');
  private transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    const transport = this.config.get<string>('MAIL_TRANSPORT', 'smtp');

    if (transport === 'console') {
      // Console transport — just logs, doesn't send
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      this.logger.warn(
        'Email transport: CONSOLE (emails will be logged, not sent)',
      );
    } else {
      // SMTP transport — MailPit in dev, real SMTP in production
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('MAIL_HOST', 'localhost'),
        port: this.config.get<number>('MAIL_PORT', 1025),
        secure: false,
        auth: this.config.get<string>('MAIL_USER')
          ? {
              user: this.config.get<string>('MAIL_USER'),
              pass: this.config.get<string>('MAIL_PASSWORD'),
            }
          : undefined,
      });
      this.logger.log(
        `Email transport: SMTP → ${this.config.get('MAIL_HOST', 'localhost')}:${this.config.get('MAIL_PORT', 1025)}`,
      );
    }
  }

  async send(payload: EmailPayload): Promise<boolean> {
    const from = this.config.get<string>(
      'MAIL_FROM',
      'Aelium <noreply@aelium.net>',
    );
    // Reply-To a un buzón monitorizado (el footer invita a "responde a este
    // correo"). Las notificaciones lo fijan por evento desde branding.company_email
    // (EmailChannel); aquí queda el fallback de config para auth/envíos directos.
    const replyTo = payload.replyTo ?? this.config.get<string>('MAIL_REPLY_TO');

    try {
      const info = (await this.transporter.sendMail({
        from,
        ...(replyTo ? { replyTo } : {}),
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text || this.stripHtml(payload.html),
        headers: {
          // Correo transaccional automático: anuncia que es generado y evita
          // bucles de autorrespuesta (vacaciones/"fuera de oficina").
          // RFC 3834 + supresión de auto-reply de Outlook.
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
          ...payload.headers,
        },
      })) as SendMailResult;

      if (this.config.get('MAIL_TRANSPORT') === 'console') {
        this.logger.log(
          `[EMAIL → console] To: ${payload.to} | Subject: ${payload.subject}`,
        );
      } else {
        this.logger.log(
          `[EMAIL → sent] To: ${payload.to} | MessageId: ${info.messageId}`,
        );
      }

      return true;
    } catch (error) {
      this.logger.error(
        `[EMAIL → failed] To: ${payload.to} | Error: ${getErrorMessage(error)}`,
      );
      return false;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
