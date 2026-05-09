import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';
import { NotificationsService } from '../notifications.service';

const ALERT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const COUNT_WINDOW_MS = 24 * 60 * 60 * 1000;
const SETTING_CATEGORY = 'provisioning';
const SETTING_KEY_THRESHOLD = 'enhance_cp.reconciliation_alert_threshold';
const SETTING_KEY_LAST_ALERT_AT = 'enhance_cp.reconciliation_last_alert_at';

/**
 * NotificationsOnReconciliationThresholdExceededListener — Sprint 15C
 * Fase 15C.H (ADR-083 §6 decisión 24).
 *
 * Cuenta divergencias detectadas por `EnhanceReconciliationCron` en las
 * últimas 24h y, si supera el setting
 * `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5),
 * notifica a superadmins (canal `internal` campana + `email`).
 *
 * Estrategia (ambigüedad A3 resuelta 2026-05-09):
 *   - Counter SQL sobre `audit_change_log` (NO Redis dedicado). El cron es
 *     6h, no hay presión de latencia y un counter Redis nuevo introduciría
 *     una key sin precedente en el módulo notifications.
 *   - Dedupe vía setting `enhance_cp.reconciliation_last_alert_at`
 *     (timestamp ISO). Si la última alerta fue hace <24h, skip — evita
 *     spam cuando el threshold se cruza al inicio del día y siguen
 *     llegando divergencias durante la misma pasada del cron o pasadas
 *     posteriores.
 *
 * Race condition tolerada (intencional):
 *   El audit listener (`AuditOnServiceReconciledExternalChangeListener`) y
 *   este listener consumen el MISMO evento `service.reconciled_external_change`.
 *   EventEmitter2 NestJS dispara handlers async concurrentemente — no hay
 *   garantía de orden ni de await entre ellos. Por tanto el SQL count
 *   puede leer ANTES de que el audit haya persistido el evento actual.
 *   Compensamos sumando `+1` al count: contamos los rows persistidos +
 *   este evento (que aún no está). Resultado: la decisión de alertar es
 *   determinista respecto al evento que invoca el listener.
 *
 * Degradación elegante (R7): cualquier excepción se loguea y se traga.
 * El audit del evento ya quedó en el otro listener, perder la notif no
 * debe propagar errores que rompan el cron.
 */
@Injectable()
export class NotificationsOnReconciliationThresholdExceededListener {
  private readonly logger = new Logger(
    NotificationsOnReconciliationThresholdExceededListener.name,
  );

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent('service.reconciled_external_change')
  async onReconciledExternalChange(payload: {
    service_id: string;
    user_id: string;
    plugin_slug: string;
    change_type:
      | 'subscription_missing'
      | 'status_divergence'
      | 'plan_divergence';
    expected: unknown;
    actual: unknown;
    detected_at: string;
  }): Promise<void> {
    try {
      const threshold = await this.settings.getNumber(
        SETTING_CATEGORY,
        SETTING_KEY_THRESHOLD,
        5,
      );

      // Dedupe: si alertamos en últimas 24h, no re-alertar.
      if (await this.alreadyAlertedRecently()) {
        return;
      }

      // SQL count + 1 (race condition tolerada — ver doctrina arriba).
      const cutoff = new Date(Date.now() - COUNT_WINDOW_MS);
      const persistedCount = await this.prisma.auditChangeLog.count({
        where: {
          action: 'reconciled_external_change',
          created_at: { gte: cutoff },
        },
      });
      const totalIncludingThis = persistedCount + 1;

      if (totalIncludingThis < threshold) {
        return;
      }

      const now = new Date().toISOString();
      await this.notifications.dispatchToSuperadmins(
        'enhance.reconciliation_threshold_exceeded',
        {
          threshold,
          count_in_last_24h: totalIncludingThis,
          plugin_slug: payload.plugin_slug,
          last_change_type: payload.change_type,
          last_service_id: payload.service_id,
          alerted_at: now,
        },
      );

      await this.markAlerted(now);

      this.logger.warn(
        `Reconciliation threshold exceeded: ${totalIncludingThis}` +
          ` divergence(s) in last 24h (threshold=${threshold}, ` +
          `plugin=${payload.plugin_slug}). Superadmins alerted.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to evaluate reconciliation threshold: ${getErrorMessage(err)}`,
      );
    }
  }

  private async alreadyAlertedRecently(): Promise<boolean> {
    const lastAlertRaw = await this.settings.get(
      SETTING_CATEGORY,
      SETTING_KEY_LAST_ALERT_AT,
      '',
    );
    if (!lastAlertRaw) return false;
    const lastAlertTime = Date.parse(lastAlertRaw);
    if (Number.isNaN(lastAlertTime)) return false;
    return Date.now() - lastAlertTime < ALERT_DEDUPE_WINDOW_MS;
  }

  private async markAlerted(nowIso: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: {
        category_key: {
          category: SETTING_CATEGORY,
          key: SETTING_KEY_LAST_ALERT_AT,
        },
      },
      create: {
        category: SETTING_CATEGORY,
        key: SETTING_KEY_LAST_ALERT_AT,
        value: nowIso,
        description:
          'Sprint 15C Fase 15C.H — timestamp ISO de la última alerta superadmin' +
          ' por threshold de reconcile-enhance-services excedido. Setting interno' +
          ' (NO editable admin); rotated automáticamente por' +
          ' NotificationsOnReconciliationThresholdExceededListener.',
      },
      update: { value: nowIso },
    });
    this.settings.invalidateCache(SETTING_CATEGORY, SETTING_KEY_LAST_ALERT_AT);
  }
}
