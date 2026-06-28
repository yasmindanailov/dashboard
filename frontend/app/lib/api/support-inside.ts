import { api } from './client';

// ── Support Inside (Sprint 8 Fase D — ADR-061 + ADR-075) ──
//
// Cliente: `/api/v1/dashboard/support-inside/*` (catálogo público + suscripción).
// Admin:   `/api/v1/admin/support-inside/plans` (índice + editor por slug).

export type SupportInsideSlotType = 'maintenance' | 'maintenance_management';
export type SupportInsideChannel = 'webchat' | 'email' | 'phone' | 'whatsapp';
// ProductType del schema Prisma (mismos valores). Sub-fase 8.D.12.
export type ProductTypeSlug =
  | 'hosting_web'
  | 'domain'
  | 'docker_service'
  | 'support_inside'
  | 'we_do_it'
  | 'custom_service';
export type SupportInsidePriorityTier = 'standard' | 'high' | 'max';
export type SupportInsideCtaVisibility =
  | 'hidden'
  | 'catalog_banner'
  | 'landing_cta';
export type SupportInsideStatus = 'active' | 'cancelled' | 'past_due';
export type ProductStatus = 'active' | 'inactive' | 'deprecated';

// F3·E8 — presencia del staff + estado de mantenimiento del slot (derivados
// server-side; el front solo presenta).
export type PresenceStatus = 'online' | 'away' | 'offline';
export type SlotMaintenanceStatus =
  | 'up_to_date'
  | 'in_progress'
  | 'due_soon'
  | 'overdue';

export interface SupportInsideTechnician {
  id: string;
  first_name: string;
  last_name: string;
  presence: PresenceStatus;
}

/** Histórico de mantenimientos de un slot (modal "Ver mantenimientos"). */
export interface SupportInsideMaintenanceHistory {
  service: {
    label: string | null;
    domain: string | null;
    product_name: string;
  };
  history: Array<{
    id: string;
    month_year: string;
    summary: string;
    performed_at: string;
    performed_by: string | null;
    tasks_done: string[];
  }>;
}

export interface SupportInsidePublicPlan {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  badge_text: string | null;
  order_index: number;
  pricing: {
    monthly: {
      product_pricing_id: string;
      price: string;
      currency: string;
    } | null;
    yearly: {
      product_pricing_id: string;
      price: string;
      currency: string;
      discount_percentage: string | null;
    } | null;
  };
  config: {
    slots_included: number;
    slot_types_allowed: SupportInsideSlotType[];
    applicable_product_types: ProductTypeSlug[];
    extra_slot_price: string;
    channels_active: SupportInsideChannel[];
    priority_tier: SupportInsidePriorityTier;
    response_sla_hours: number;
  } | null;
}

export interface SupportInsideSlotPayload {
  id: string;
  subscription_id: string;
  service_id: string;
  slot_type: SupportInsideSlotType;
  is_extra: boolean;
  assigned_at: string;
  released_at: string | null;
  service?: {
    id: string;
    label: string | null;
    domain: string | null;
    status: string;
    product: { name: string };
  };
  // F3·E8 — mantenimiento derivado (presente en getStatus enriquecido).
  last_maintenance_at?: string | null;
  next_maintenance_at?: string;
  maintenance_status?: SlotMaintenanceStatus;
}

export interface SupportInsideSubscriptionPayload {
  id: string;
  client_id: string;
  product_id: string;
  service_id: string;
  status: SupportInsideStatus;
  started_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  product: {
    id: string;
    slug: string;
    name: string;
    short_description: string | null;
    support_inside_config: {
      slots_included: number;
      slot_types_allowed: SupportInsideSlotType[];
      applicable_product_types: ProductTypeSlug[];
      extra_slot_price: string;
      channels_active: SupportInsideChannel[];
      priority_tier: SupportInsidePriorityTier;
      response_sla_hours: number;
    } | null;
  };
  service: {
    id: string;
    status: string;
    next_due_date: string | null;
  };
  slots: SupportInsideSlotPayload[];
  // F3·E8 — "tu técnico" (con presencia) + total de mantenimientos hechos.
  assigned_technician_id?: string | null;
  technician?: SupportInsideTechnician | null;
  maintenance_count?: number;
}

export interface SupportInsideAdminPlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  status: ProductStatus;
  slots_included: number;
  pricing_monthly: string | null;
  pricing_yearly: string | null;
  currency: string;
  updated_at: string;
}

export interface SupportInsideAdminPricing {
  id: string;
  billing_cycle: string;
  currency: string;
  price: string;
  setup_fee: string;
  discount_percentage: string | null;
  active: boolean;
}

export interface SupportInsideAdminPlanDetail {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  status: ProductStatus;
  badge_text: string | null;
  partner_commission_pct: string | null;
  updated_at: string;
  support_inside_config: {
    slots_included: number;
    slot_types_allowed: SupportInsideSlotType[];
    applicable_product_types: ProductTypeSlug[];
    extra_slot_price: string;
    channels_active: SupportInsideChannel[];
    priority_tier: SupportInsidePriorityTier;
    response_sla_hours: number;
    cta_visibility: SupportInsideCtaVisibility;
  } | null;
  pricing: SupportInsideAdminPricing[];
}

export interface SupportInsidePlanPatch {
  // Identidad
  name?: string;
  description?: string | null;
  short_description?: string | null;
  status?: ProductStatus;
  // Precios
  pricing?: {
    monthly?: {
      price: number;
      setup_fee?: number;
      currency?: string;
      discount_percentage?: number | null;
      active?: boolean;
    };
    annual?: {
      price: number;
      setup_fee?: number;
      currency?: string;
      discount_percentage?: number | null;
      active?: boolean;
    };
  };
  // Slots
  slots_included?: number;
  slot_types_allowed?: SupportInsideSlotType[];
  applicable_product_types?: ProductTypeSlug[];
  extra_slot_price?: number;
  // Soporte
  channels_active?: SupportInsideChannel[];
  priority_tier?: SupportInsidePriorityTier;
  response_sla_hours?: number;
  // Avanzada
  partner_commission_pct?: number;
  cta_visibility?: SupportInsideCtaVisibility;
}

export interface SupportInsideEligibleService {
  id: string;
  label: string | null;
  domain: string | null;
  status: string;
  product_name: string;
  product_type: string;
}

export const supportInsideApi = {
  // ─── Cliente ──
  listPlans: (token: string) =>
    api<SupportInsidePublicPlan[]>('/dashboard/support-inside/plans', { token }),

  listEligibleServices: (token: string) =>
    api<SupportInsideEligibleService[]>(
      '/dashboard/support-inside/eligible-services',
      { token },
    ),

  getStatus: (token: string) =>
    api<SupportInsideSubscriptionPayload | null>(
      '/dashboard/support-inside/status',
      { token },
    ),

  subscribe: (
    token: string,
    data: { product_pricing_id: string; billing_profile_id?: string },
  ) =>
    api<{
      subscription: SupportInsideSubscriptionPayload;
      service: { id: string };
      invoice: { id: string };
    }>('/dashboard/support-inside/subscribe', {
      method: 'POST',
      token,
      body: data,
    }),

  cancel: (token: string, data: { reason?: string }) =>
    api<{ cancelled: true; released_slots: number }>(
      '/dashboard/support-inside/subscription',
      { method: 'DELETE', token, body: data },
    ),

  addSlot: (
    token: string,
    data: {
      service_id: string;
      slot_type: SupportInsideSlotType;
      is_extra?: boolean;
    },
  ) =>
    api<SupportInsideSlotPayload>('/dashboard/support-inside/slots', {
      method: 'POST',
      token,
      body: data,
    }),

  releaseSlot: (token: string, slotId: string) =>
    api<{ released: true }>(`/dashboard/support-inside/slots/${slotId}`, {
      method: 'DELETE',
      token,
    }),

  // F3·E8 — histórico de mantenimientos de un slot (modal del cliente).
  getMaintenanceHistory: (token: string, slotId: string) =>
    api<SupportInsideMaintenanceHistory>(
      `/dashboard/support-inside/slots/${slotId}/maintenance-history`,
      { token },
    ),

  // ─── Admin ──
  adminList: (token: string) =>
    api<SupportInsideAdminPlanRow[]>('/admin/support-inside/plans', { token }),

  adminGet: (token: string, slug: string) =>
    api<SupportInsideAdminPlanDetail>(
      `/admin/support-inside/plans/${slug}`,
      { token },
    ),

  adminUpdate: (token: string, slug: string, data: SupportInsidePlanPatch) =>
    api<SupportInsideAdminPlanDetail>(
      `/admin/support-inside/plans/${slug}`,
      { method: 'PATCH', token, body: data },
    ),
};

