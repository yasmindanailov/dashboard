/**
 * Mapeo enum Prisma → label humano (es-ES) — Sprint 8 Fase C (2026-05-01).
 *
 * Extracción desde `tasks-email.listener.ts` para reuso entre los listeners
 * de notificación de tareas (`task.assigned`, `task.overdue`,
 * `task.unassigned_overdue`). Vive aquí (no en la plantilla) porque las
 * plantillas son contenido editable desde la UI admin (Sprint 9.5) y no
 * deben conocer mapeos internos de enums.
 *
 * Mantiene sincronía con `frontend/app/admin/tasks/types.ts`
 * (`TASK_TYPE_LABELS`, `TASK_PRIORITY_LABELS`). Si cambia el enum hay que
 * actualizar ambos lados.
 */

export const TASK_TYPE_LABELS_ES: Record<string, string> = {
  contact_client: 'Contactar cliente',
  maintenance: 'Mantenimiento',
  maintenance_management: 'Mantenimiento + Gestión',
  project_task: 'Proyecto',
  custom_work: 'Personalizada',
  support_setup: 'Setup soporte',
  support_ticket: 'Ticket de soporte',
};

export const TASK_PRIORITY_LABELS_ES: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export function formatDueLabel(due: Date | string | null | undefined): string {
  if (!due) return 'Sin fecha límite';
  const date = due instanceof Date ? due : new Date(due);
  if (Number.isNaN(date.getTime())) return 'Sin fecha límite';
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
