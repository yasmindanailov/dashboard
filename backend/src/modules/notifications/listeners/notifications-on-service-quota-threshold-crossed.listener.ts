import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnServiceQuotaThresholdCrossedListener — Sprint 15C.II Fase F.8
 * (dossier §A.11.10.5.1 R6 frozen 2026-05-16).
 *
 * Consume `service.quota_threshold_crossed` emitido por
 * `QuotaThresholdDetectorService.detectAndNotify` (core/provisioning/),
 * invocado al final de cada pasada del cron L3 del plugin (Enhance:
 * `EnhanceReconciliationCron.runAsExecutor`). Edge-triggered upstream —
 * este listener confía en que el detector ya garantizó "una sola emisión
 * por transición": no aplica anti-spam adicional aquí.
 *
 * Doctrina canónica (heredada de Fase F.5/F.6 — L11+L12):
 *   - NO invoca `EmailService.send` directo (ADR-065).
 *   - Usa `NotificationsService.dispatchToUser('service.quota_threshold_crossed',
 *     payload, user_id)`. La plantilla seedeada renderiza email + campana.
 *   - R7 — Degradación elegante: cualquier excepción del dispatch se loguea
 *     y se traga. La fila `ServiceQuotaAlert(crossed_up)` ya capturó el
 *     estado; perder el email NO debe deshacer ese side-effect.
 *
 * Heredable a cualquier plugin con `has_metrics` (15E Docker / 15G Plesk).
 * 15D RC no aplica (sin métricas).
 */
@Injectable()
export class NotificationsOnServiceQuotaThresholdCrossedListener {
  private readonly logger = new Logger(
    NotificationsOnServiceQuotaThresholdCrossedListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('service.quota_threshold_crossed')
  async handle(payload: {
    service_id: string;
    user_id: string;
    plugin_slug: string;
    resource: 'disk';
    used_pct: number;
    threshold_pct: number;
    used_mb: number;
    total_mb: number;
    detected_at: string;
  }): Promise<void> {
    try {
      // Defensa: derivar domain del service si está disponible. Si el
      // service desapareció entre detección y dispatch (improbable, los
      // services no se borran físicamente — `cancelled`/`terminated` no
      // los elimina; pero CASCADE FK podría disparar limpieza en futuras
      // operaciones admin), caemos al `service_id` como label.
      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        select: { domain: true, label: true },
      });
      const displayDomain =
        service?.domain ?? service?.label ?? payload.service_id;

      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );

      await this.notifications.dispatchToUser(
        'service.quota_threshold_crossed',
        {
          service_id: payload.service_id,
          domain: displayDomain,
          used_pct: formatPct(payload.used_pct),
          used_mb_label: formatMb(payload.used_mb),
          total_mb_label: formatMb(payload.total_mb),
          service_url: `${appUrl}/dashboard/services/${payload.service_id}`,
          support_url: `${appUrl}/dashboard/support`,
        },
        payload.user_id,
      );

      this.logger.log(
        `service.quota_threshold_crossed dispatched to user=${payload.user_id} ` +
          `(service=${payload.service_id} resource=${payload.resource} ` +
          `used_pct=${payload.used_pct})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch service.quota_threshold_crossed ` +
          `(service=${payload.service_id} user=${payload.user_id}): ` +
          `${getErrorMessage(err)}`,
      );
    }
  }
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatPct(pct: number): string {
  return pct.toFixed(1);
}
