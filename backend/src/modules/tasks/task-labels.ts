/**
 * Sprint 16 Fase 16.B (ADR-079) — labels canónicos para emails de tareas.
 *
 * Migrado del enum TaskType (7 valores) al enum TaskSourceSystem (5 valores).
 * Vive aquí (no en plantillas) porque las plantillas son contenido editable
 * desde la UI admin (Sprint 9.5) y no deben conocer mapeos internos.
 *
 * El frontend mantiene su propio mapping en `frontend/app/_shared/tasks/source-labels.ts`
 * (Sprint 16 Fase 16.C). Si cambia el enum hay que actualizar ambos lados.
 */

export const TASK_SOURCE_SYSTEM_LABELS_ES: Record<string, string> = {
  support_ticket: 'Ticket de soporte',
  support_inside_slot: 'Mantenimiento mensual',
  provisioning_manual: 'Setup servicio',
  client_lifecycle: 'Llamada bienvenida',
  project: 'Proyecto',
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
