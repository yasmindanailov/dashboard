import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettingsService } from '../../core/settings/settings.service';
import { AuditService } from './audit.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

/**
 * AuditRetentionCron — Sprint 9 Fase E (R3 + ADR-017 §Retención).
 *
 * Único actor del sistema con permiso de DELETE sobre `audit_access_log` Y
 * `audit_change_log` (R3 — el cron de retención es la excepción canónica al
 * INSERT-only de las tablas `audit_*`).
 *
 * audit 2026-06-25 GL-2/GL-5 (H3a): antes solo purgaba `audit_access_log`, así
 * que `audit_change_log` acumulaba PII (nombres, emails, diffs de perfil) **sin
 * límite** — incumpliendo ADR-010 §"Retención", que manda **2 años → borrado**
 * para AMBAS tablas de auditoría. Ahora purga las dos, cada una con su retención
 * (`audit.access_retention_days` / `audit.change_retention_days`, default 730 =
 * 2 años AEPD) y de forma INDEPENDIENTE (R7: un fallo en una no impide la otra).
 *
 * Implementación in-process via @nestjs/schedule. La migración a BullMQ
 * scheduled job (consistencia con ADR-064) se difiere a Sprint 13
 * Hardening — el cron de retención es nightly y de baja criticidad,
 * NO conflictea con el patrón canónico de §R2.
 */
@Injectable()
export class AuditRetentionCron {
  private readonly logger = new Logger(AuditRetentionCron.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly settings: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'cleanupOldAuditLogs',
    timeZone: 'UTC',
  })
  async cleanupOldAuditLogs(): Promise<void> {
    // Cada tabla se purga de forma independiente (R7): un fallo en una NO
    // impide la otra. ADR-010 §Retención: ambas → 2 años → borrado.
    await this.purgeAccessLogs();
    await this.purgeChangeLogs();
  }

  private async purgeAccessLogs(): Promise<void> {
    try {
      const retentionDays = await this.settings.getNumber(
        'audit',
        'access_retention_days',
        730,
      );
      const deleted =
        await this.auditService.cleanupOldAccessLogs(retentionDays);
      if (deleted > 0) {
        this.logger.log(
          `cleanupOldAuditLogs (access): borradas ${deleted} filas con > ${retentionDays} días`,
        );
      }
    } catch (err) {
      // No relanzar — el cron debe seguir vivo aunque una ejecución falle.
      this.logger.error(
        `cleanupOldAuditLogs (access) falló: ${getErrorMessage(err)}`,
      );
    }
  }

  private async purgeChangeLogs(): Promise<void> {
    try {
      const retentionDays = await this.settings.getNumber(
        'audit',
        'change_retention_days',
        730,
      );
      const deleted =
        await this.auditService.cleanupOldChangeLogs(retentionDays);
      if (deleted > 0) {
        this.logger.log(
          `cleanupOldAuditLogs (change): borradas ${deleted} filas con > ${retentionDays} días`,
        );
      }
    } catch (err) {
      // No relanzar — independiente del purgado de access (R7).
      this.logger.error(
        `cleanupOldAuditLogs (change) falló: ${getErrorMessage(err)}`,
      );
    }
  }
}
