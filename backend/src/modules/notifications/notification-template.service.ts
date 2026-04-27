import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel as ChannelType } from '@prisma/client';
import * as Handlebars from 'handlebars';
import { PrismaService } from '../../core/database/prisma.service';
import { RenderedNotification } from './interfaces/notification-channel.interface';

const DEFAULT_LOCALE = 'es';

/**
 * NotificationTemplateService — render de plantillas (ADR-065).
 *
 * Lookup `(event_type, channel, locale)` con fallback a locale 'es' si
 * no existe la combinación pedida. Si no hay plantilla activa para
 * `(event_type, channel)` → devuelve `null` y el dispatcher omite el canal.
 *
 * Render con Handlebars:
 *  - `email`: `noEscape: true` — el HTML lo curra el admin.
 *  - `internal` (campana) y otros: `noEscape: false` — escape estricto.
 */
@Injectable()
export class NotificationTemplateService {
  private readonly logger = new Logger(NotificationTemplateService.name);

  constructor(private readonly prisma: PrismaService) {
    NotificationTemplateService.registerHelpers();
  }

  /**
   * Helpers Handlebars registrados globalmente. Idempotente — la registry
   * de Handlebars sobreescribe en lugar de duplicar.
   */
  private static registerHelpers(): void {
    Handlebars.registerHelper('lt', (a: number, b: number) => a < b);
    Handlebars.registerHelper('gt', (a: number, b: number) => a > b);
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  }

  async render(
    eventType: string,
    channel: ChannelType,
    locale: string | null,
    payload: Record<string, unknown>,
  ): Promise<RenderedNotification | null> {
    const tpl = await this.findTemplate(
      eventType,
      channel,
      locale ?? DEFAULT_LOCALE,
    );
    if (!tpl) {
      this.logger.debug(
        `No template found for (${eventType}, ${channel}) — skipping channel`,
      );
      return null;
    }

    try {
      const subjectFn = Handlebars.compile(tpl.subject, { noEscape: false });
      const bodyFn = Handlebars.compile(tpl.body, {
        noEscape: channel === 'email',
      });
      return {
        event_type: eventType,
        subject: subjectFn(payload),
        body: bodyFn(payload),
      };
    } catch (err) {
      // Plantilla mal formada (Handlebars compile error). NO debe romper
      // el dispatcher — log y omite el canal.
      this.logger.error(
        `Failed to render template ${eventType}/${channel}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async findTemplate(
    eventType: string,
    channel: ChannelType,
    locale: string,
  ): Promise<{ subject: string; body: string } | null> {
    const exact = await this.prisma.notificationTemplate.findFirst({
      where: { event_type: eventType, channel, locale, active: true },
      select: { subject: true, body: true },
    });
    if (exact) return exact;
    if (locale !== DEFAULT_LOCALE) {
      const fallback = await this.prisma.notificationTemplate.findFirst({
        where: {
          event_type: eventType,
          channel,
          locale: DEFAULT_LOCALE,
          active: true,
        },
        select: { subject: true, body: true },
      });
      if (fallback) return fallback;
    }
    return null;
  }
}
