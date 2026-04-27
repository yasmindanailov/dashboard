import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';

interface SystemErrorPayload {
  error_log_id: string;
  level: string;
  module: string;
  message: string;
  correlation_id: string | null;
}

const NOTIFICATIONS_DOMAIN = 'NotificationsService';
const NOTIFICATIONS_PROCESSOR = 'NotificationsDispatchProcessor';
const NOTIFICATIONS_TEMPLATES = 'NotificationTemplateService';

/**
 * NotificationsSystemErrorListener — consume `system.error` (cierra Sprint 9
 * Fase F.10 + ADR-055 §Monitoring + R7).
 *
 * Cuando `ErrorLogService.log()` persiste una entrada nueva, emite
 * `system.error` con el id, módulo, level, mensaje y correlation_id.
 * Este listener notifica a los superadmins via campana + email para que
 * el incidente no quede silencioso.
 *
 * Guard anti-loop crítico (EC-S9-07):
 *  - Si el error proviene de cualquier módulo de notifications
 *    (NotificationsService, NotificationsDispatchProcessor,
 *    NotificationTemplateService) → NO disparamos otra notificación. Si
 *    notifications está roto, una segunda llamada por el mismo cauce solo
 *    multiplica el problema (potencial bucle si el dispatcher emite
 *    `system.error` al fallar).
 *  - Si el dispatch a superadmins falla, log a stderr y degradamos
 *    silenciosamente. NUNCA relanzamos: el listener es operativo, no
 *    crítico para el flujo del caller.
 */
@Injectable()
export class NotificationsSystemErrorListener {
  private readonly logger = new Logger(NotificationsSystemErrorListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('system.error')
  async handleSystemError(payload: SystemErrorPayload): Promise<void> {
    if (this.isNotificationsModule(payload.module)) {
      this.logger.warn(
        `system.error from notifications domain (${payload.module}) — alert dropped to prevent loop. error_log_id=${payload.error_log_id}`,
      );
      return;
    }

    try {
      await this.notifications.dispatchToSuperadmins(
        'system.error',
        payload as unknown as Record<string, unknown>,
      );
    } catch (err) {
      this.logger.error(
        `Failed to alert superadmins about system.error (${payload.error_log_id}): ${getErrorMessage(err)}`,
      );
    }
  }

  private isNotificationsModule(module: string): boolean {
    return (
      module === NOTIFICATIONS_DOMAIN ||
      module === NOTIFICATIONS_PROCESSOR ||
      module === NOTIFICATIONS_TEMPLATES ||
      module.startsWith('Notifications')
    );
  }
}
