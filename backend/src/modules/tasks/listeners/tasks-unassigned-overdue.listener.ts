import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../../notifications/notifications.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';

interface TaskUnassignedOverduePayload {
  total: number;
  oldest_age_hours: number;
  by_type: Record<string, number>;
  task_ids: string[];
  summary: string;
}

/**
 * TasksUnassignedOverdueListener — Sprint 8 Fase C (2026-05-01) + ADR-072.
 *
 * Consume `task.unassigned_overdue` (resumen agregado emitido por
 * `TasksUnassignedOverdueService`) y notifica a TODOS los superadmins
 * activos vía `NotificationsService.dispatchToSuperadmins`. Plantillas
 * `task.unassigned_overdue` (email + internal) seedeadas en
 * `notification-templates.ts`.
 *
 * Política de errores idéntica a `TasksOverdueListener`: log + degradación
 * silenciosa, nunca relanzar (R13 — la cola `notifications-dispatch`
 * gestiona su propia DLQ).
 */
@Injectable()
export class TasksUnassignedOverdueListener {
  private readonly logger = new Logger(TasksUnassignedOverdueListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('task.unassigned_overdue')
  async handle(payload: TaskUnassignedOverduePayload): Promise<void> {
    if (payload.total === 0) return; // Defensa: el cron no debería emitir, pero protegemos.
    try {
      await this.notifications.dispatchToSuperadmins(
        'task.unassigned_overdue',
        payload as unknown as Record<string, unknown>,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch task.unassigned_overdue (total=${payload.total}): ${getErrorMessage(err)}`,
      );
    }
  }
}
