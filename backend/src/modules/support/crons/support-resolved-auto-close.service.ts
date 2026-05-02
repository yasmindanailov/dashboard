import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';

const MS_PER_DAY = 86_400_000;
const DEFAULT_AUTO_CLOSE_DAYS = 7;

export interface SupportResolvedAutoCloseRunResult {
  processed: number;
  threshold_days: number;
  cutoff: Date;
}

/**
 * SupportResolvedAutoCloseService — Sprint 16 (ADR-079 amendment).
 *
 * Cron diario que cierra automáticamente los tickets en estado `resolved`
 * cuyo `resolved_at < now() - N días` y el cliente no respondió ni confirmó.
 *
 * Doctrina canónica del lifecycle del ticket (post Sprint 16):
 *   - `resolved` = estado **transitorio**: el agente terminó su trabajo y
 *     espera confirmación del cliente. El cliente puede:
 *       a) Responder → reactiva el ticket (`→waiting_agent`) + nueva task
 *          bridge (vía `conversation.reactivated`).
 *       b) Pulsar "Confirmar resolución" → cierra explícitamente
 *          (`→closed`) sin acción del agente.
 *       c) No hacer nada → este cron lo cierra pasados N días.
 *   - `closed` = estado **terminal inmutable**.
 *
 * Notificación: silente al cliente. Notif informativa al agente que lo
 * resolvió ("el ticket #X que resolviste se ha cerrado por inactividad").
 *
 * Setting canónico: `support.auto_close_resolved_days` (default 7).
 * Sprint 12 lo expondrá en UI; ahora vive en `core/settings/seed`.
 */
@Injectable()
export class SupportResolvedAutoCloseService {
  private readonly logger = new Logger(SupportResolvedAutoCloseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async run(now: Date = new Date()): Promise<SupportResolvedAutoCloseRunResult> {
    const days = await this.settings.getNumber(
      'support',
      'auto_close_resolved_days',
      DEFAULT_AUTO_CLOSE_DAYS,
    );
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY);

    const candidates = await this.prisma.conversation.findMany({
      where: {
        type: 'ticket',
        status: 'resolved',
        resolved_at: { lt: cutoff },
      },
      select: {
        id: true,
        sequence_number: true,
        subject: true,
        user_id: true,
        resolved_at: true,
        resolved_by_id: true,
      },
    });

    if (candidates.length === 0) {
      this.logger.debug(
        `support-resolved-auto-close: no candidates (threshold=${days}d, cutoff=${cutoff.toISOString()})`,
      );
      return { processed: 0, threshold_days: days, cutoff };
    }

    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );

    let processed = 0;
    for (const ticket of candidates) {
      // Compare-and-swap: otra carrera (agente reabriendo manualmente o
      // cliente respondiendo justo en este tick) podría haber cambiado el
      // status. El UPDATE solo afecta filas que SIGUEN en `resolved`.
      const result = await this.prisma.conversation.updateMany({
        where: { id: ticket.id, status: 'resolved' },
        data: {
          status: 'closed',
          closed_at: now,
        },
      });
      if (result.count === 0) continue;

      // System message en el hilo del ticket — auditoría visible.
      await this.prisma.message.create({
        data: {
          conversation_id: ticket.id,
          sender_type: 'system',
          body: `🔒 Ticket cerrado automáticamente por inactividad del cliente tras ${days} días sin respuesta.`,
          is_internal: false,
        },
      });

      // Evento canónico para notificar al agente (listener consume).
      this.events.emit('conversation.auto_closed', {
        conversation_id: ticket.id,
        sequence_number: ticket.sequence_number,
        subject: ticket.subject,
        client_user_id: ticket.user_id,
        agent_user_id: ticket.resolved_by_id,
        days_inactive: days,
        ticket_url: `${appUrl}/admin/support/${ticket.id}`,
      });

      processed += 1;
    }

    this.logger.log(
      `support-resolved-auto-close: ${processed}/${candidates.length} tickets cerrados (threshold=${days}d)`,
    );
    return { processed, threshold_days: days, cutoff };
  }
}
