import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
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

    try {
      const info = await this.transporter.sendMail({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text || this.stripHtml(payload.html),
      });

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
        `[EMAIL → failed] To: ${payload.to} | Error: ${(error as Error).message}`,
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
