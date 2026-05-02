/* ═══════════════════════════════════════
   Task types — canónicos Sprint 16 / ADR-079.
   Espejo del shape Prisma del backend (`Task` + `TaskSourceSystem` +
   `TaskStatus` + `TaskPriority`). Ref §3.1 ADR-079.
   ═══════════════════════════════════════ */

export type TaskSourceSystem =
  | 'support_ticket'
  | 'support_inside_slot'
  | 'provisioning_manual'
  | 'client_lifecycle'
  | 'project';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'not_completed_in_time'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskUserRef {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

/* Card cliente puede traer tier SI cuando aplica (heurística futura — el
   backend no lo poblamos hoy desde `findAll`; lo dejamos opcional para que
   el badge `[SI <tier>]` (§3.6) tenga sitio cuando se enriquezca). */
export interface TaskClientRef extends TaskUserRef {
  support_inside_tier?: 'pro' | 'medium' | 'basic' | null;
}

export interface Task {
  id: string;
  source_system: TaskSourceSystem;
  source_id: string;
  client_id: string;
  assigned_to: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  assignee: TaskUserRef | null;
  client: TaskClientRef;
  completer?: TaskUserRef | null;
}

export interface TaskListResponse {
  data: Task[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface TaskStats {
  today: number;
  this_week: number;
  pending: number;
  completed: number;
}

/* Etiquetas humanas — la card visual usa `source-labels.ts` para icono+ruta;
   estos labels textuales sirven para badges, listados secundarios y ARIA. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
  not_completed_in_time: 'Vencida',
  cancelled: 'Cancelada',
};

export const TASK_STATUS_VARIANTS: Record<TaskStatus, string> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
  not_completed_in_time: 'danger',
  cancelled: 'neutral',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

/* SLA visual canónico §3.6: verde (>50% restante), amarillo (20-50%), rojo
   (<20% o vencido). El cálculo necesita `created_at` + `due_date`. */
export type SlaTone = 'safe' | 'warn' | 'danger' | null;

export function computeSlaTone(
  createdAt: string | null,
  dueDate: string | null,
  status: TaskStatus,
): SlaTone {
  if (!dueDate) return null;
  if (status === 'completed' || status === 'cancelled') return null;
  const due = new Date(dueDate).getTime();
  const created = createdAt ? new Date(createdAt).getTime() : due - 24 * 3600_000;
  const now = Date.now();
  if (now >= due) return 'danger';
  const total = due - created;
  if (total <= 0) return 'safe';
  const remaining = due - now;
  const ratio = remaining / total;
  if (ratio <= 0.2) return 'danger';
  if (ratio <= 0.5) return 'warn';
  return 'safe';
}
