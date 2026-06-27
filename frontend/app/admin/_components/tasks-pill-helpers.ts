/* ═══════════════════════════════════════
   TasksPill — lógica pura (agrupado, urgencia, etiquetas).
   Mapea el modelo real `Task` (ADR-079) al layout del mockup
   admin/Shell.dc.html (pill + popover agrupado Vencidas/Hoy/Semana).
   ═══════════════════════════════════════ */

import { SOURCE_LABELS } from '../../_shared/tasks/source-labels';
import type { Task, TaskPriority, TaskSourceSystem, TaskStatus } from '../../_shared/tasks/types';

export type TaskBucket = 'overdue' | 'today' | 'week' | 'later';
export type BadgeTone = 'brand' | 'success' | 'neutral';

/** Estados "vivos": pendientes de acción del agente (se muestran en el pill). */
const LIVE_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'not_completed_in_time'];
export function isLiveTask(t: Task): boolean {
  return LIVE_STATUSES.includes(t.status);
}

/** Pill de tipo (categoría coloreada) por sistema vinculado. */
export const TYPE_BADGE: Record<TaskSourceSystem, { label: string; tone: BadgeTone }> = {
  support_ticket: { label: 'Ticket', tone: 'brand' },
  support_inside_slot: { label: 'Mantenimiento', tone: 'brand' },
  provisioning_manual: { label: 'Setup', tone: 'neutral' },
  client_lifecycle: { label: 'Bienvenida', tone: 'success' },
  project: { label: 'Proyecto', tone: 'neutral' },
};

/** Color del borde izquierdo por prioridad (mockup PRIOW). */
export const PRIORITY_VAR: Record<TaskPriority, string> = {
  critical: 'var(--danger)',
  high: 'var(--warning)',
  medium: 'var(--border-hover)',
  low: 'var(--border)',
};

export interface TaskGroup {
  key: TaskBucket;
  label: string;
  tone: string;
  tasks: Task[];
}

const GROUP_DEFS: { key: TaskBucket; label: string; tone: string }[] = [
  { key: 'overdue', label: 'Vencidas', tone: 'var(--task-overdue-fg)' },
  { key: 'today', label: 'Hoy', tone: 'var(--wait-amber-fg)' },
  { key: 'week', label: 'Esta semana', tone: 'var(--text-secondary)' },
  { key: 'later', label: 'Más adelante', tone: 'var(--text-tertiary)' },
];

function bucketOf(t: Task, startToday: number, endToday: number, endWeek: number): TaskBucket {
  if (t.status === 'not_completed_in_time') return 'overdue';
  if (!t.due_date) return 'later';
  const due = new Date(t.due_date).getTime();
  if (due < startToday) return 'overdue';
  if (due < endToday) return 'today';
  if (due < endWeek) return 'week';
  return 'later';
}

export interface GroupedTasks {
  groups: TaskGroup[];
  overdueCount: number;
  /** Tarea más urgente (vencidas + hoy), o null. */
  mostUrgent: Task | null;
  total: number;
}

/**
 * Agrupa las tareas vivas en cubos de urgencia. Calcula los límites del día
 * una sola vez. Las tareas dentro de un cubo van ordenadas por fecha (las sin
 * fecha al final).
 */
export function groupTasks(tasks: Task[]): GroupedTasks {
  const live = tasks.filter(isLiveTask);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startToday = today.getTime();
  const endToday = startToday + 24 * 3600_000;
  const endWeek = startToday + 7 * 24 * 3600_000;

  const byBucket: Record<TaskBucket, Task[]> = { overdue: [], today: [], week: [], later: [] };
  for (const t of live) byBucket[bucketOf(t, startToday, endToday, endWeek)].push(t);

  const byDue = (a: Task, b: Task) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return da - db;
  };
  for (const k of Object.keys(byBucket) as TaskBucket[]) byBucket[k].sort(byDue);

  const groups = GROUP_DEFS.map((g) => ({ ...g, tasks: byBucket[g.key] })).filter(
    (g) => g.tasks.length > 0,
  );
  const urgent = [...byBucket.overdue, ...byBucket.today];

  return {
    groups,
    overdueCount: byBucket.overdue.length,
    mostUrgent: urgent[0] ?? null,
    total: live.length,
  };
}

/** Título de la tarea = etiqueta del sistema vinculado (no hay título propio). */
export function taskTitle(t: Task): string {
  return SOURCE_LABELS[t.source_system].label;
}

/** "Cliente · vencimiento" para la línea de contexto. */
export function taskContext(t: Task, bucket: TaskBucket): string {
  const name = `${t.client.first_name} ${t.client.last_name}`.trim() || 'Cliente';
  return `${name} · ${formatDue(t.due_date, bucket)}`;
}

export function formatDue(due: string | null, bucket: TaskBucket): string {
  if (!due) return 'Sin fecha';
  const d = new Date(due);
  if (bucket === 'overdue') {
    const days = Math.floor((Date.now() - d.getTime()) / (24 * 3600_000));
    if (days <= 0) return 'Vencida';
    if (days === 1) return 'Venció ayer';
    return `Venció hace ${days} días`;
  }
  if (bucket === 'today') {
    return `Hoy · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}
