/* ═══════════════════════════════════════
   Task types — shared between components
   Ref: DECISIONS.md §10, DATABASE_SCHEMA.md tasks
   ═══════════════════════════════════════ */

export interface TaskUser {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

export interface Task {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_by: string;
  client_id: string;
  service_id: string | null;
  client_note: string | null;
  due_date: string | null;
  completed_at: string | null;
  is_recurring: boolean;
  billing_month: string | null;
  created_at: string;
  updated_at: string;
  assignee: TaskUser | null;
  creator: TaskUser;
  client: TaskUser;
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

export const TASK_TYPE_LABELS: Record<string, string> = {
  wow_call: 'WOW Call',
  maintenance: 'Mantenimiento',
  maintenance_management: 'Mant. + Gestión',
  project_task: 'Proyecto',
  custom_work: 'Personalizada',
  support_setup: 'Setup soporte',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
  not_completed_in_time: 'Vencida',
  cancelled: 'Cancelada',
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const TASK_STATUS_VARIANTS: Record<string, string> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
  not_completed_in_time: 'danger',
  cancelled: 'neutral',
};

export const TASK_PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--color-danger)',
  high: 'var(--color-warning)',
  medium: 'var(--color-border)',
  low: 'var(--color-border-light, var(--color-border))',
};
