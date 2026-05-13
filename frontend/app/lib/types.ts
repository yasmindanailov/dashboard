/**
 * Tipos de dominio compartidos por el frontend.
 *
 * Reflejan los shapes que devuelve el backend (`backend/src/modules/.../*.dto.ts`
 * + Prisma). NO incluyen todos los campos — solo los que el frontend consume.
 * Si añades un campo nuevo en el backend, añádelo aquí cuando lo uses en UI.
 *
 * Convención: snake_case para alinear con la API REST (`first_name`, no
 * `firstName`). Esto evita transformaciones intermedias.
 */

// ─── Generic API shapes ──────────────────────────────────────────

/** Respuesta paginada estándar (`backend/src/common/dto/pagination.dto.ts`). */
export interface Pagination<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/** Forma del error que `lib/api.ts` lanza en `!res.ok`. */
export interface ApiError {
  status: number;
  message: string;
  correlationId?: string;
}

// ─── Auth / users ────────────────────────────────────────────────

export type RoleSlug =
  | 'superadmin'
  | 'agent_full'
  | 'agent_billing'
  | 'agent_support'
  | 'client'
  | 'partner';

export type UserStatus =
  | 'active'
  | 'pending_verification'
  | 'blocked'
  | 'inactive';

export interface UserSummary {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status?: UserStatus;
  role?: { slug: RoleSlug; name: string };
}

/**
 * Shape devuelto por `GET /api/v1/admin/users` (Sprint 8 Fase A — backend
 * `AgentListItemDto`). Subconjunto del User que el frontend muestra en
 * selectores de asignación de tareas (NewTaskModal, DetailPage reasignar).
 *
 * `role` es siempre uno de los 4 slugs staff asignables: `superadmin`,
 * `agent_full`, `agent_billing`, `agent_support`. El backend filtra
 * defense-in-depth via `ASSIGNABLE_ROLE_SLUGS`.
 */
export interface Agent {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: RoleSlug;
  status: UserStatus;
  avatar_url: string | null;
}

// ─── Clients ─────────────────────────────────────────────────────

export type ClientType = 'b2c' | 'b2b';

export interface ClientProfile {
  client_type: ClientType;
  phone: string | null;
  company_name: string | null;
}

export interface Client extends UserSummary {
  client_profile?: ClientProfile | null;
  last_login_at?: string | null;
  created_at?: string;
}

/* ADR-079 §3.8: shape canónico Sprint 16. La nota lleva `source_system`
   + `source_id` polimórfico (FK a Conversation/Slot/Task/Project sin
   integridad referencial dura) + `triggered_by_action` para trazar qué
   acción del agente la generó. */
export type NoteCategory =
  | 'support'
  | 'maintenance'
  | 'onboarding'
  | 'billing'
  | 'project'
  | 'technical_incident'
  | 'exceptional'
  /** Sprint 15C.II F.6: transiciones canónicas de lifecycle de servicio
      (cancel/suspend/unsuspend, manual admin o automático del cron). */
  | 'lifecycle';

export type NoteSourceSystem =
  | 'ticket'
  | 'chat'
  | 'maintenance_log'
  | 'task_completion'
  | 'exceptional'
  /** Sprint 15C.II F.6: nota desde acción de lifecycle de servicio
      (`source_id = service.id`). */
  | 'service';

export interface ClientNote {
  id: string;
  user_id: string;
  /** Sprint 15C.II F.6: nullable para soportar "actor sistema"
      (cron, listeners). Backend enriquece `author_name = 'Sistema'` cuando
      es null. */
  author_id: string | null;
  /** Backend enriquece con nombre del autor o 'Sistema' (client-notes.service.ts). */
  author_name?: string;
  body: string;
  category: NoteCategory;
  source_system: NoteSourceSystem;
  /** ID en el sistema vinculado: conversation_id | slot_id | task_id |
      project_id. Null para `source_system='exceptional'`. */
  source_id: string | null;
  /** Acción que disparó la nota (`ticket.resolved` | `task.completed` |
      `maintenance.completed` | `manual_entry`). */
  triggered_by_action: string | null;
  is_pinned: boolean;
  created_at: string;
}

export interface BillingProfile {
  id: string;
  user_id: string;
  is_default: boolean;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nif_cif: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

// ─── Billing / Invoices ──────────────────────────────────────────

export type InvoiceStatus =
  | 'draft'
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'refunded';

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: string | number;
  total: string | number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  user_id: string;
  status: InvoiceStatus;
  subtotal: string | number;
  tax_amount: string | number;
  total: string | number;
  currency: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  items?: InvoiceItem[];
}

// ─── Services ────────────────────────────────────────────────────

export type ServiceStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'suspended'
  | 'cancelled';

export interface Service {
  id: string;
  user_id: string;
  product_id: string;
  status: ServiceStatus;
  amount: string | number;
  currency: string;
  billing_cycle: string;
  domain: string | null;
  label: string | null;
  next_due_date: string | null;
  created_at: string;
  product?: { id: string; name: string; type: string };
}

// ─── Products ────────────────────────────────────────────────────

export interface ProductPricing {
  id: string;
  product_id: string;
  billing_cycle: string;
  price: string | number;
  setup_fee: string | number;
  currency: string;
  discount_percentage: number | null;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: 'active' | 'inactive';
  description: string | null;
  pricing?: ProductPricing[];
}

// ─── Support (Conversations + Messages) ──────────────────────────

export type ConversationType = 'chat' | 'ticket';
export type ConversationStatus =
  | 'open'
  | 'waiting_agent'
  | 'in_progress'
  | 'resolved'
  | 'closed';
export type ConversationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Conversation {
  id: string;
  type: ConversationType;
  status: ConversationStatus;
  priority: ConversationPriority;
  category: string | null;
  subject: string | null;
  user_id: string | null;
  assigned_agent_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  tags: string[] | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'client' | 'agent' | 'ai' | 'system';
  sender_id: string | null;
  body: string;
  is_internal: boolean;
  attachments: unknown;
  read_at: string | null;
  created_at: string;
}

// ─── Tasks ───────────────────────────────────────────────────────
// Sprint 8 Fase B.7 (2026-04-29) — ADR-073. Sincronizado con
// `backend/src/modules/tasks/dto/task.dto.ts`. Antes de B.7 esta
// definición divergía (`follow_up`/`other` inexistentes, `urgent` en
// vez de `critical`, faltaba `not_completed_in_time`). Si añades un
// nuevo valor en backend, replícalo aquí o el tipado mentirá silenciosamente.

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'not_completed_in_time'
  | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskType =
  | 'contact_client'
  | 'maintenance'
  | 'maintenance_management'
  | 'project_task'
  | 'custom_work'
  | 'support_setup';

export interface TaskTag {
  id: string;
  slug: string;
  label: string;
  color: string | null;
}

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  client_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  /** Sprint 8 Fase B.7 — ADR-073: POR QUÉ humano de la tarea. */
  reason: string | null;
  /** Sprint 8 Fase B.7 — ADR-073: tags asignados (chips). */
  tag_assignments?: { tag: TaskTag }[];
}
