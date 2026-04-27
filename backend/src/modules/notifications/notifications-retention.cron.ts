import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

/**
 * NotificationsRetentionCron — Sprint 9.5 (ADR-042 + ADR-060).
 *
 * Borra notificaciones internas (campana) ya leídas con `read_at` más
 * viejo que `notifications.retention_days` (default 90). Las no leídas
 * permanecen indefinidamente — es responsabilidad del usuario marcarlas.
 *
 * Implementación in-process via @nestjs/schedule por consistencia con
 * `AuditRetentionCron`. Migración a BullMQ scheduled queda diferida a
 * Sprint 13 Hardening (ADR-056 §13.30+) — el cron es nightly y de baja
 * criticidad: si falla una noche, la siguiente recupera.
 *
 * NO toca filas de canal externo (`email`, `whatsapp`, `push`) — esas no
 * tienen sentido de "leído" para el cliente y se conservan como prueba
 * de envío hasta el sprint que defina su política de retención (Sprint
 * 12.5 Portal RGPD). Hoy InAppChannel es el único productor activo.
 */
@Injectable()
export class NotificationsRetentionCron {
  private readonly logger = new Logger(NotificationsRetentionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'cleanupReadNotifications',
    timeZone: 'UTC',
  })
  async cleanupReadNotifications(): Promise<void> {
    try {
      const retentionDays = await this.settings.getNumber(
        'notifications',
        'retention_days',
        90,
      );
      const cutoff = new Date(Date.now() - retentionDays * 86400_000);
      const result = await this.prisma.notification.deleteMany({
        where: {
          channel: 'internal',
          read_at: { not: null, lt: cutoff },
        },
      });
      if (result.count > 0) {
        this.logger.log(
          `cleanupReadNotifications: borradas ${result.count} filas internal con read_at < ${cutoff.toISOString()} (retention ${retentionDays}d)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `cleanupReadNotifications falló: ${getErrorMessage(err)}`,
      );
    }
  }
}
