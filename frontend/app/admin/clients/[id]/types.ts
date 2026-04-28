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

export type Tab = 'resumen' | 'facturacion' | 'notas' | 'soporte';

export const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'facturacion', label: 'Facturación' },
  { key: 'soporte', label: 'Soporte' },
  { key: 'notas', label: 'Notas internas' },
];
