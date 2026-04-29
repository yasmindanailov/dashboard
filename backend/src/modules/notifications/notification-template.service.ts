import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, NotificationChannel as ChannelType } from '@prisma/client';
import * as Handlebars from 'handlebars';
import { PrismaService } from '../../core/database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { RenderedNotification } from './interfaces/notification-channel.interface';

const DEFAULT_LOCALE = 'es';

const TEMPLATE_SELECT = {
  id: true,
  event_type: true,
  channel: true,
  locale: true,
  subject: true,
  body: true,
  variables: true,
  active: true,
  updated_by: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.NotificationTemplateSelect;

export interface TemplateUpdateInput {
  subject?: string;
  body?: string;
  active?: boolean;
}

export interface TemplatePreviewSample {
  /**
   * Variables sustituidas en la plantilla. Pueden venir parciales — el
   * service rellena los huecos con valores por defecto humanos para que
   * el preview siempre renderice algo coherente.
   */
  payload?: Record<string, unknown>;
}

const DEFAULT_PREVIEW_SAMPLES: Record<string, Record<string, unknown>> = {
  'invoice.created': {
    invoice_id: '00000000-0000-0000-0000-000000000000',
    invoice_number: 'AEL-2026-0001',
    total: 99.99,
    currency: 'EUR',
  },
  'invoice.paid': {
    invoice_id: '00000000-0000-0000-0000-000000000000',
    invoice_number: 'AEL-2026-0001',
    total: 99.99,
    currency: 'EUR',
    payment_provider: 'manual',
  },
  'invoice.failed': {
    invoice_id: '00000000-0000-0000-0000-000000000000',
    invoice_number: 'AEL-2026-0001',
    retry_count: 2,
    max_retries: 5,
  },
  'invoice.overdue': {
    invoice_id: '00000000-0000-0000-0000-000000000000',
    invoice_number: 'AEL-2026-0001',
    total: 99.99,
    retry_count: 5,
    max_retries: 5,
  },
  'task.assigned': {
    task_id: '00000000-0000-0000-0000-000000000000',
    task_title: 'Llamada de bienvenida',
    task_type: 'wow_call',
    task_type_label: 'WOW Call',
    task_priority: 'high',
    task_priority_label: 'Alta',
    task_url: 'http://localhost:3002/admin/tasks/preview',
    due_label: '15 may 2026',
  },
  'outbox.event_failed': {
    event_outbox_id: '00000000-0000-0000-0000-000000000000',
    event_type: 'invoice.created',
    last_error: 'Connection refused (preview)',
    retry_count: 5,
  },
  'dlq.job_failed': {
    failed_job_id: '00000000-0000-0000-0000-000000000000',
    queue: 'pdf-generation',
    name: 'invoice-pdf',
    last_error: 'MinIO endpoint unreachable (preview)',
    attempts_made: 5,
  },
  'system.error': {
    error_log_id: '00000000-0000-0000-0000-000000000000',
    level: 'error',
    module: 'BillingService',
    message: 'Excepción no controlada al generar factura (preview)',
    correlation_id: 'preview-corr-id',
  },
};

const DEFAULT_RECIPIENT = {
  user_id: '00000000-0000-0000-0000-000000000000',
  email: 'cliente@ejemplo.com',
  first_name: 'Ana',
  last_name: 'Cliente',
  language: 'es',
};

/**
 * NotificationTemplateService — render + administración de plantillas
 * (ADR-065 + Sprint 9.5).
 *
 * Lookup `(event_type, channel, locale)` con fallback a locale 'es' si
 * no existe la combinación pedida. Si no hay plantilla activa para
 * `(event_type, channel)` → devuelve `null` y el dispatcher omite el canal.
 *
 * Render con Handlebars:
 *  - `email`: `noEscape: true` — el HTML lo curra el admin.
 *  - `internal` (campana) y otros: `noEscape: false` — escape estricto.
 *
 * Sprint 9.5 añade el flujo admin: list / get / update (subject + body +
 * active) / preview con variables de muestra. La validación rechaza
 * plantillas que no compilan (Handlebars syntax error) — devuelve 422
 * con el mensaje de Handlebars.
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

  // ─── Render (dispatcher) ───────────────────────────────────────

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

  // ─── Administración (Sprint 9.5 — endpoints staff) ─────────────

  async findAll(query: {
    event_type?: string;
    channel?: ChannelType;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.NotificationTemplateWhereInput = {};
    if (query.event_type) where.event_type = query.event_type;
    if (query.channel) where.channel = query.channel;
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const [items, total] = await Promise.all([
      this.prisma.notificationTemplate.findMany({
        where,
        orderBy: [{ event_type: 'asc' }, { channel: 'asc' }, { locale: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: TEMPLATE_SELECT,
      }),
      this.prisma.notificationTemplate.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string) {
    const tpl = await this.prisma.notificationTemplate.findUnique({
      where: { id },
      select: TEMPLATE_SELECT,
    });
    if (!tpl) {
      throw new NotFoundException(`Notification template ${id} no encontrada`);
    }
    return tpl;
  }

  /**
   * Actualiza subject / body / active de una plantilla. Valida que tanto
   * subject como body compilan con Handlebars antes de persistir — un
   * error sintáctico bloquea el save con 422 + mensaje claro (R14 +
   * EC-S9-03). Variables desconocidas NO bloquean (Handlebars las trata
   * como undefined → render silencioso); validación profunda contra el
   * schema `variables` se difiere a un sprint futuro si la UX la pide.
   */
  async update(
    id: string,
    actorId: string,
    input: TemplateUpdateInput,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: { id },
      select: { id: true, subject: true, body: true, channel: true },
    });
    if (!existing) {
      throw new NotFoundException(`Notification template ${id} no encontrada`);
    }

    const nextSubject = input.subject ?? existing.subject;
    const nextBody = input.body ?? existing.body;
    this.assertCompiles(nextSubject, 'subject');
    this.assertCompiles(nextBody, 'body');

    const data: Prisma.NotificationTemplateUpdateInput = {
      updated_by: actorId,
    };
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.body !== undefined) data.body = input.body;
    if (input.active !== undefined) data.active = input.active;

    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data,
      select: { id: true },
    });
    return { id: updated.id };
  }

  /**
   * Render preview sin persistir nada. Si el caller no aporta payload,
   * usa una muestra canónica por `event_type` (DEFAULT_PREVIEW_SAMPLES) y
   * un recipient ficticio. Útil para que el admin vea el resultado real
   * antes de guardar.
   */
  async preview(
    id: string,
    sample: TemplatePreviewSample = {},
  ): Promise<RenderedNotification> {
    const tpl = await this.findOne(id);
    const payload = {
      ...(DEFAULT_PREVIEW_SAMPLES[tpl.event_type] ?? {}),
      ...(sample.payload ?? {}),
      recipient: DEFAULT_RECIPIENT,
    };
    try {
      const subjectFn = Handlebars.compile(tpl.subject, { noEscape: false });
      const bodyFn = Handlebars.compile(tpl.body, {
        noEscape: tpl.channel === 'email',
      });
      return {
        event_type: tpl.event_type,
        subject: subjectFn(payload),
        body: bodyFn(payload),
      };
    } catch (err) {
      throw new BadRequestException(
        `Plantilla no renderiza: ${(err as Error).message}`,
      );
    }
  }

  // ─── Internos ──────────────────────────────────────────────────

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

  private assertCompiles(source: string, field: 'subject' | 'body'): void {
    try {
      Handlebars.compile(source);
    } catch (err) {
      throw new BadRequestException(
        `Plantilla inválida en campo "${field}": ${(err as Error).message}`,
      );
    }
  }
}
