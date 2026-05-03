import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import {
  TASK_SOURCE_SYSTEM_LABELS_ES,
  TASK_PRIORITY_LABELS_ES,
  formatDueLabel,
} from './task-labels';

interface TaskAssignedPayload {
  task: {
    id: string;
    source_system: string;
    source_id: string;
    priority: string;
    assigned_to: string | null;
    due_date: Date | null;
    client_id: string;
  };
  assignedBy: string;
}

/**
 * TasksEmailListener — Sprint 16 Fase 16.B (ADR-079).
 *
 * Migrado del enum TaskType al nuevo TaskSourceSystem. El payload ya no
 * trae `title`/`description`/`reason` (eliminados del schema canónico):
 * el render del email usa el label del sistema de origen y el agente abre
 * el detalle para ver el contexto vivo del sistema vinculado.
 *
 * Cumple R1 + R2 + R7 + ADR-042 + ADR-065.
 */
@Injectable()
export class TasksEmailListener {
  private readonly logger = new Logger(TasksEmailListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('task.assigned')
  async handleTaskAssigned(payload: TaskAssignedPayload): Promise<void> {
    const { task } = payload;
    if (!task.assigned_to) return;

    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );

    /*
     * URL canónica de la task en el frontend (Sprint 13 §13.AUTH Fase F —
     * Yasmin 2026-05-04). El frontend NO tiene página de detalle por task
     * (ADR-079: las tasks son un mirror, se ven en lista + modal). La URL
     * resuelve por sistema vinculado:
     *   - support_ticket → ticket directo (`/admin/support/<conversationId>`).
     *     La fuente de verdad es el ticket; abrirlo da contexto completo.
     *   - resto         → lista `/admin/tasks` con filtro de la propia task.
     */
    const taskPath =
      task.source_system === 'support_ticket'
        ? `/admin/support/${task.source_id}`
        : `/admin/tasks`;

    await this.notifications.dispatchToUser(
      'task.assigned',
      {
        task_id: task.id,
        task_source_system: task.source_system,
        task_source_system_label:
          TASK_SOURCE_SYSTEM_LABELS_ES[task.source_system] ??
          task.source_system,
        task_source_id: task.source_id,
        task_priority: task.priority,
        task_priority_label:
          TASK_PRIORITY_LABELS_ES[task.priority] ?? task.priority,
        task_url: `${appUrl}${taskPath}`,
        action_url: taskPath,
        due_label: formatDueLabel(task.due_date),
        assigned_by: payload.assignedBy,
      },
      task.assigned_to,
    );

    this.logger.log(
      `task.assigned dispatched to notifications for agent ${task.assigned_to} (task ${task.id})`,
    );
  }
}
