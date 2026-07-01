import type { NoteCategory, NoteSourceSystem, ClientNote } from '../../lib/types';

/* ═══════════════════════════════════════════════════════════════════════════
   note-meta — mapas + helpers compartidos del render de notas (F4·U24).
   Fuente única para `ClientNotesTab` (cliente-detalle) y `NotesTimeline`
   (detalle de servicio). Evita duplicar el diseño de notas (máxima coherencia).
   ═══════════════════════════════════════════════════════════════════════════ */

export const CATEGORY_LABELS: Record<NoteCategory, string> = {
  support: 'Soporte',
  maintenance: 'Mantenimiento',
  onboarding: 'Onboarding',
  billing: 'Facturación',
  project: 'Proyecto',
  technical_incident: 'Incidente técnico',
  exceptional: 'Excepcional',
  lifecycle: 'Lifecycle',
};

/** Paleta por categoría (fg = color del punto/acento), 1:1 con el mockup. */
export const CATEGORY_COLOR: Record<NoteCategory, string> = {
  support: '#3B82F6',
  maintenance: '#0E8C5F',
  onboarding: '#7C5CCB',
  billing: '#B27A12',
  project: '#0E7490',
  technical_incident: '#D14343',
  exceptional: '#64748B',
  lifecycle: '#475569',
};

export const SOURCE_LABELS: Record<NoteSourceSystem, string> = {
  ticket: 'Ticket',
  chat: 'Chat',
  maintenance_log: 'Mantenimiento',
  task_completion: 'Cierre de tarea',
  exceptional: 'Excepcional',
  service: 'Servicio',
};

/** Opciones del filtro de origen del `<NotesExplorer>` (cliente + servicio). */
export const NOTE_SOURCE_FILTER_OPTIONS: {
  value: NoteSourceSystem | '';
  label: string;
}[] = [
  { value: '', label: 'Todos los orígenes' },
  { value: 'ticket', label: 'Ticket de soporte' },
  { value: 'maintenance_log', label: 'Mantenimiento' },
  { value: 'task_completion', label: 'Cierre de tarea' },
  { value: 'service', label: 'Servicio (lifecycle)' },
  { value: 'exceptional', label: 'Nota excepcional' },
  { value: 'chat', label: 'Chat' },
];

export const ACTION_LABELS: Record<string, string> = {
  'ticket.resolved': 'Ticket resuelto',
  'ticket.closed': 'Ticket cerrado',
  'task.completed': 'Tarea completada',
  'maintenance.completed': 'Mantenimiento registrado',
  manual_entry: 'Entrada manual',
  'service.cancelled': 'Servicio cancelado',
  'service.suspended': 'Servicio suspendido',
  'service.unsuspended': 'Servicio reactivado',
  'service.auto_suspended_overdue': 'Suspendido por impago',
  'service.auto_unsuspended_overdue': 'Reactivado al pagar',
};

export const NOTE_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Enlace al origen de la nota (ticket/chat/servicio) — rutas admin. */
export function noteSourceHref(
  note: Pick<ClientNote, 'source_system' | 'source_id'>,
): string | null {
  if (!note.source_id) return null;
  switch (note.source_system) {
    case 'ticket':
    case 'chat':
      return `/admin/support/${note.source_id}`;
    case 'service':
      return `/admin/services/${note.source_id}`;
    default:
      return null;
  }
}
