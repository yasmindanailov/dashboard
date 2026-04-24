/* ═══════════════════════════════════════
   Product Detail — Shared types & constants
   ═══════════════════════════════════════ */

import type { BadgeVariant } from '../../../components/ui';

export const TYPE_LABELS: Record<string, string> = {
  hosting_web: 'Hosting Web', domain: 'Dominio', docker_service: 'Docker Service',
  support_inside: 'Support Inside', we_do_it: 'We Do It', custom_service: 'Proyecto Custom',
};

export const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activo', variant: 'success' },
  inactive: { label: 'Inactivo', variant: 'neutral' },
  deprecated: { label: 'Obsoleto', variant: 'danger' },
};

export const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual', quarterly: 'Trimestral', semiannual: 'Semestral',
  annual: 'Anual', one_time: 'Único',
};

export interface Pricing { id: string; billing_cycle: string; price: string; setup_fee: string; currency: string; active: boolean; }
export interface Extra { id: string; type: string; label: string; is_mandatory: boolean; active: boolean; }
export interface ChecklistItem { id: string; label: string; order_index: number; is_required: boolean; }

export interface ProductDetailItem {
  id: string; name: string; slug: string; type: string; status: string;
  description?: string; short_description?: string; badge_text?: string;
  is_addon: boolean; is_global_addon: boolean; provisioner: string;
  grace_period_days: number; suspension_days: number; cancellation_days: number;
  client_can_pause: boolean; partner_commission_pct?: string;
  category?: { id: string; name: string } | null;
  pricing: Pricing[]; extras: Extra[]; checklist_items: ChecklistItem[];
  _count: { services: number }; created_at: string; updated_at: string;
}
