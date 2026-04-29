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

/**
 * Sprint 8 Fase B.2 (2026-04-29) — `findOne()` backend incluye `service`
 * + `product` para alimentar la sidebar "Servicio" + bloque adaptativo
 * `wow_call` (UI_SPEC §5.16). La lista (`findAll`) no lo trae para no
 * penalizar el tablero. `null` cuando la task no tiene service_id, o
 * cuando viene de la lista (NewTaskModal/[id]/list shape distinto).
 */
export interface TaskService {
  id: string;
  label: string | null;
  domain: string | null;
  status: string;
  amount: string | number;
  billing_cycle: string;
  currency: string;
  product: {
    id: string;
    name: string;
    slug: string;
    type: string;
  } | null;
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
  /** Sólo viene poblado en `findOne()` (DetailPage). */
  service?: TaskService | null;
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

/**
 * Sprint 8 Fase B.3 (2026-04-29) — DS compliance: tokens canónicos del DS
 * (`globals.css`). Los nombres `--color-*` no existen en el DS — son
 * tokens fantasma legacy que dejaban la barra transparente. Ahora apuntan
 * a `--danger`/`--warning`/`--border` reales.
 */
export const TASK_PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--danger)',
  high: 'var(--warning)',
  medium: 'var(--border)',
  low: 'var(--border)',
};
