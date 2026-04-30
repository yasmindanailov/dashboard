import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

interface TaskCompletedPayload {
  task: {
    id: string;
    type: string;
    title: string;
    client_id: string;
    service_id: string | null;
    reason: string | null;
  };
  completedBy: string;
  clientNotes?: string;
  internalNotes?: string;
}

const TASK_TYPE_LABELS_ES: Record<string, string> = {
  contact_client: 'Contactar cliente',
  maintenance: 'Mantenimiento',
  maintenance_management: 'Mantenimiento + Gestión',
  project_task: 'Proyecto',
  custom_work: 'Personalizada',
  support_setup: 'Setup soporte',
};

/**
 * TaskCompletedListener — Sprint 8 Fase B.9 (2026-04-30).
 *
 * Consume `task.completed` emitido por `TasksService.complete()` y
 * `TasksService.update({status: completed})`. Notifica al cliente vía
 * `NotificationsService.dispatchToUser` con plantilla `task.completed`
 * (email + campana) **sólo si**:
 *
 *   1. El payload incluye `clientNotes` no vacío. Sin nota, no hay
 *      mensaje útil que mandar al cliente — silenciamos para no spammear.
 *   2. La tarea NO es de mantenimiento (`maintenance` /
 *      `maintenance_management`). Esos tipos ya tienen su propio
 *      listener `MaintenanceCompletedListener` con plantilla específica
 *      `maintenance.completed`. Doble notificación sería ruido.
 *   3. La tarea tiene `client_id` (siempre cierto por TASK-INV — la
 *      validación queda como salvaguarda).
 *
 * Sprint 8 Fase B.10 (ADR-074) extenderá este listener: cuando
 * `task.conversation_id` esté presente, en lugar de notificar al
 * cliente desde aquí, delegará en el flujo de cierre del ticket
 * vinculado (la notificación canónica al cliente la emite el módulo
 * support, no la duplicamos).
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
    const { task, clientNotes } = payload;
    if (!clientNotes || !clientNotes.trim()) return;
    if (task.type === 'maintenance' || task.type === 'maintenance_management') {
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
        task_title: task.title,
        task_type: task.type,
        task_type_label: TASK_TYPE_LABELS_ES[task.type] ?? task.type,
        task_reason: task.reason ?? null,
        client_notes: clientNotes,
        // El cliente ve su servicio en el portal cliente; el detalle
        // de la tarea es interno (no se expone al cliente).
        action_url: task.service_id
          ? `/dashboard/services/${task.service_id}`
          : `/dashboard`,
        service_url: task.service_id
          ? `${appUrl}/dashboard/services/${task.service_id}`
          : `${appUrl}/dashboard`,
      },
      task.client_id,
    );

    this.logger.log(
      `task.completed dispatched to client ${task.client_id} (task ${task.id} · type ${task.type})`,
    );
  }
}
