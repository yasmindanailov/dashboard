import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { TASK_SOURCE_SYSTEM_LABELS_ES } from './task-labels';

interface TaskCompletedPayload {
  task: {
    id: string;
    source_system: string;
    source_id: string;
    client_id: string;
  };
  completedBy: string;
  /** Flag interno bridge ticket↔task — ADR-074 + ADR-079 §3.6.
   *  Cuando se completa una task `support_ticket`, la notificación canónica
   *  al cliente la emite `support` (vía `conversation.resolved/closed`).
   *  Sin este flag, el cliente recibiría dos emails. */
  __skipClientNotification?: boolean;
}

/**
 * TaskCompletedListener — Sprint 16 Fase 16.B (ADR-079).
 *
 * Notifica al cliente cuando una task se completa **excepto**:
 *   - bridge ticket↔task (cubierto por module support).
 *   - support_inside_slot (cubierto por `MaintenanceCompletedListener`
 *     con plantilla específica `maintenance.completed`).
 *   - tasks sin `client_id` (defensa — invariante).
 *
 * Aplica a `provisioning_manual`, `client_lifecycle` y `project`. La nota
 * obligatoria al cierre vive en `client_notes` (ADR-079 §3.9), por lo que
 * NO se incluye en el payload — el email muestra el label del sistema y
 * un CTA al portal cliente.
 */
@Injectable()
export class TaskCompletedListener {
  private readonly logger = new Logger(TaskCompletedListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('task.completed')
  async handle(payload: TaskCompletedPayload): Promise<void> {
    const { task } = payload;
    if (payload.__skipClientNotification) return;
    if (
      task.source_system === 'support_ticket' ||
      task.source_system === 'support_inside_slot'
    ) {
      return;
    }
    if (!task.client_id) return;

    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );

    await this.notifications.dispatchToUser(
      'task.completed',
      {
        task_id: task.id,
        task_source_system: task.source_system,
        task_source_system_label:
          TASK_SOURCE_SYSTEM_LABELS_ES[task.source_system] ??
          task.source_system,
        action_url: `/dashboard`,
        service_url: `${appUrl}/dashboard`,
      },
      task.client_id,
    );

    this.logger.log(
      `task.completed dispatched to client ${task.client_id} (task ${task.id} · ${task.source_system})`,
    );
  }
}
