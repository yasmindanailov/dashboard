import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../../notifications/notifications.service';
import { getErrorMessage } from '../../../core/common/utils/error.util';

interface TaskOverduePayload {
  task_id: string;
  task_title: string;
  task_type: string;
  task_type_label: string;
  task_priority: string;
  task_priority_label: string;
  task_url: string;
  action_url: string;
  due_date_label: string;
  days_overdue: number;
  assigned_to: string | null;
}

/**
 * TasksOverdueListener — Sprint 8 Fase C (2026-05-01).
 *
 * Consume `task.overdue` emitido por `TasksOverdueService` cuando una
 * tarea con asignado superó el umbral `tasks.overdue_to_failure_days`
 * desde su `due_date`. Notifica al agente vía
 * `NotificationsService.dispatchToUser` (canal email + campana via
 * plantillas seedeadas en `notification-templates.ts`).
 *
 * Cumple R7 (errores se notifican al responsable) + ADR-042/065.
 *
 * Política de errores: si el dispatch falla, log y degradación silenciosa
 * (R13 — la cola `notifications-dispatch` ya tiene su propia DLQ; este
 * listener no debe relanzar para no entrar en bucle si el bus de
 * notificaciones está caído).
 */
@Injectable()
export class TasksOverdueListener {
  private readonly logger = new Logger(TasksOverdueListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('task.overdue')
  async handle(payload: TaskOverduePayload): Promise<void> {
    if (!payload.assigned_to) {
      // Defensa: el cron sólo emite con `assigned_to NOT NULL` (ADR-072 §6),
      // pero protegemos contra payloads externos / tests.
      return;
    }
    try {
      const { assigned_to, ...notificationPayload } = payload;
      await this.notifications.dispatchToUser(
        'task.overdue',
        notificationPayload as unknown as Record<string, unknown>,
        assigned_to,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch task.overdue for ${payload.task_id}: ${getErrorMessage(err)}`,
      );
    }
  }
}
