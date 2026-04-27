import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettingsService } from '../../core/settings/settings.service';
import { AuditService } from './audit.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

/**
 * AuditRetentionCron — Sprint 9 Fase E (R3 + ADR-017 §Retención).
 *
 * Único actor del sistema con permiso de DELETE sobre `audit_access_log`.
 * Borra rows con `created_at < now() - audit.access_retention_days` (default 730).
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
          `cleanupOldAuditLogs: borradas ${deleted} filas con > ${retentionDays} días`,
        );
      }
    } catch (err) {
      // No relanzar — el cron debe seguir vivo aunque una ejecución falle.
      this.logger.error(`cleanupOldAuditLogs falló: ${getErrorMessage(err)}`);
    }
  }
}
