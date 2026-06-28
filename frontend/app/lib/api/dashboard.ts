import { api } from './client';

// ── Dashboard API ──

export interface AdminOverview {
  role: 'admin';
  active_clients: number;
  total_revenue: number;
  overdue_invoices: number;
  pending_amount: number;
  open_tickets: number;
  open_chats: number;
  waiting_agent: number;
}

export interface ClientOverview {
  role: 'client';
  active_services: number;
  pending_invoice_amount: number;
  next_renewal: string | null;
  open_conversations: number;
  // Sub-fase 8.D.12.7 — Support Inside transversal en overview.
  support_inside: {
    product_name: string;
    product_slug: string;
    priority_tier: 'standard' | 'high' | 'max';
    response_sla_hours: number;
    slots_included: number;
    slots_used: number;
  } | null;
}

export interface AgentOverview {
  role: 'agent';
  waiting_chats: number;
  unanswered_tickets: number;
  tasks_today: number;
}

export interface PartnerOverview {
  role: 'partner';
  referred_clients: number;
  commissions_this_month: number;
  next_settlement: string | null;
}

export type OverviewStats = AdminOverview | ClientOverview | AgentOverview | PartnerOverview;

// ── Dashboard ejecutivo admin (F3·E7) — espejo de AdminOverviewService ──

export interface AdminOverviewKpis {
  revenue_this_month: number;
  revenue_prev_month: number;
  revenue_mom_pct: number | null;
  active_clients: number;
  new_clients_this_month: number;
  overdue_amount: number;
  overdue_count: number;
  oldest_overdue_days: number | null;
  sla_compliance_pct: number | null;
  sla_breaches: number;
  sla_sample: number;
}

export type DecisionKind =
  | 'overdue_invoices'
  | 'errors_5xx'
  | 'dlq_jobs'
  | 'si_maintenance';

export interface DecisionSignal {
  kind: DecisionKind;
  count: number;
  amount?: number;
  oldest_days?: number;
  sample?: string;
}

export interface TeamMemberLoad {
  user_id: string;
  name: string;
  role_slug: string;
  open_count: number;
  online: boolean;
}

export interface TeamLoad {
  members: TeamMemberLoad[];
  max_open: number;
}

export const dashboardApi = {
  getOverview: (token: string) =>
    api<OverviewStats>('/dashboard/overview', { token }),
};

