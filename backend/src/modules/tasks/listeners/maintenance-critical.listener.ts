import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../../notifications/notifications.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';

interface MaintenanceCriticalPayload {
  total: number;
  threshold_days: number;
  service_ids: string[];
  summary: string;
}

/**
 * MaintenanceCriticalListener — Sprint 8 Fase C (2026-05-01).
 *
 * Consume `maintenance.critical` (resumen agregado emitido por
 * `MaintenanceCriticalService`) y notifica a TODOS los superadmins
 * activos vía `NotificationsService.dispatchToSuperadmins`. Plantillas
 * `maintenance.critical` (email + internal) seedeadas en
 * `notification-templates.ts`.
 */
@Injectable()
export class MaintenanceCriticalListener {
  private readonly logger = new Logger(MaintenanceCriticalListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('maintenance.critical')
  async handle(payload: MaintenanceCriticalPayload): Promise<void> {
    if (payload.total === 0) return;
    try {
      await this.notifications.dispatchToSuperadmins(
        'maintenance.critical',
        payload as unknown as Record<string, unknown>,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch maintenance.critical (total=${payload.total}): ${getErrorMessage(err)}`,
      );
    }
  }
}
