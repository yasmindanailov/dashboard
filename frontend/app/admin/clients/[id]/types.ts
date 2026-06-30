/* ═══════════════════════════════════════
   Client Detail — Shared types
   ═══════════════════════════════════════ */

export interface ClientDetail {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  email_verified_at: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  two_factor_enabled: boolean;
  language: string;
  timezone: string;
  created_at: string;
  role: { slug: string; name: string };
  client_profile: {
    id: string;
    client_type: string;
    company_name: string | null;
    tax_id: string | null;
    phone: string | null;
    address_line1: string | null;
    city: string | null;
    postal_code: string | null;
    country: string;
    billing_email: string | null;
    notes_internal: string | null;
    credit_balance: string;
  } | null;
  billing_profiles: BillingProfile[];
  // Sub-fase 8.D.12.4 — visibilidad transversal Support Inside.
  // Enriquecido server-side por `clientsService.findOne`. `null` si el
  // cliente no tiene subscription (admin renderiza CTA "no tiene plan"),
  // status ∈ {active, cancelled, past_due} si existe.
  support_inside_subscription: ClientSupportInsideSubscription | null;
}

export interface ClientSupportInsideSubscription {
  id: string;
  status: 'active' | 'cancelled' | 'past_due';
  started_at: string;
  cancelled_at: string | null;
  product: {
    slug: string;
    name: string;
    support_inside_config: {
      priority_tier: 'standard' | 'high' | 'max';
      response_sla_hours: number;
      channels_active: ('webchat' | 'email' | 'phone' | 'whatsapp')[];
      slots_included: number;
    } | null;
  };
  slots: {
    id: string;
    service_id: string;
    slot_type: 'maintenance' | 'maintenance_management';
    is_extra: boolean;
    anniversary_day: number;
  }[];
}

export interface BillingProfile {
  id: string;
  type: string;
  label: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  nif_cif: string | null;
  address_line1: string;
  city: string;
  postal_code: string;
  country: string;
  is_default: boolean;
  created_at: string;
}

export type Tab =
  | 'resumen'
  | 'servicios'
  | 'facturacion'
  | 'notas'
  | 'soporte';

export const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'servicios', label: 'Servicios' },
  { key: 'facturacion', label: 'Facturación' },
  { key: 'soporte', label: 'Soporte' },
  { key: 'notas', label: 'Notas internas' },
];

/* ── F4·U22 — datos agregados/listas que el detalle carga eager (SC) ── */

/** Servicio del cliente (resumen de `GET /admin/services?user_id=`). */
export interface ClientServiceItem {
  id: string;
  status: string;
  label: string | null;
  domain: string | null;
  expires_at: string | null;
  product: { slug: string; name: string; type: string } | null;
}

/** Agregado de facturación del cliente (`GET /billing/invoices/stats?user_id=`). */
export interface ClientBillingStats {
  total_invoices: number;
  total_revenue: number;
  pending_amount: number;
  pending_count: number;
  overdue_count: number;
  paid_count: number;
}
