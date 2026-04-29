import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

interface TaskAssignedPayload {
  task: {
    id: string;
    title: string;
    type: string;
    priority: string;
    assigned_to: string | null;
    due_date: Date | null;
    description: string | null;
    reason?: string | null;
  };
  assignedBy: string;
}

/**
 * TasksEmailListener — delega a `NotificationsService.dispatchToUser`
 * (Sprint 9 Fase D + ADR-065).
 *
 * El listener queda en una línea por handler. La plantilla HTML inline
 * previa (P0.1) se ha movido a la tabla `notification_templates` con
 * Handlebars. Email + campana convergen ambos al pasar por la cola
 * `notifications-dispatch`.
 *
 * Cumple R1 + R2 + R7 + ADR-042 + ADR-065.
 */
/**
 * Mapeo enum Prisma → label humano (es-ES). Vive en el listener en lugar de
 * en la plantilla porque (a) las plantillas son contenido que el admin puede
 * editar vía UI Sprint 9.5 — no debe contener mapeos internos de enums; (b)
 * mantiene sincronía con `frontend/app/admin/tasks/types.ts` (`TASK_TYPE_LABELS`,
 * `TASK_PRIORITY_LABELS`) — si cambia el enum hay que actualizar ambos lados.
 */
const TASK_TYPE_LABELS_ES: Record<string, string> = {
  contact_client: 'Contactar cliente',
  maintenance: 'Mantenimiento',
  maintenance_management: 'Mantenimiento + Gestión',
  project_task: 'Proyecto',
  custom_work: 'Personalizada',
  support_setup: 'Setup soporte',
};

const TASK_PRIORITY_LABELS_ES: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

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
    const dueLabel = task.due_date
      ? new Date(task.due_date).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : 'Sin fecha límite';

    await this.notifications.dispatchToUser(
      'task.assigned',
      {
        task_id: task.id,
        task_title: task.title,
        task_type: task.type,
        task_type_label: TASK_TYPE_LABELS_ES[task.type] ?? task.type,
        task_priority: task.priority,
        task_priority_label:
          TASK_PRIORITY_LABELS_ES[task.priority] ?? task.priority,
        task_description: task.description,
        // Sprint 8 Fase B.7 — ADR-073: el contexto humano (reason) viaja
        // al payload para que la plantilla pueda mostrar el porqué bajo
        // el título. Vacío/null = no se renderiza.
        task_reason: task.reason ?? null,
        // Tasks viven en el portal staff: ADR-066 + Sprint 9.6 DC.7 movió
        // `/dashboard/tasks/*` → `/admin/tasks/*` con `git mv`. La campana
        // del topbar y los emails al agente deben apuntar al portal admin.
        task_url: `${appUrl}/admin/tasks/${task.id}`,
        action_url: `/admin/tasks/${task.id}`,
        due_label: dueLabel,
        assigned_by: payload.assignedBy,
      },
      task.assigned_to,
    );

    this.logger.log(
      `task.assigned dispatched to notifications for agent ${task.assigned_to} (task ${task.id})`,
    );
  }
}
