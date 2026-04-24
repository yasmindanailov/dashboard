/* ═══════════════════════════════════════
   Checkout — Shared types & constants
   Ref: DECISIONS.md §37
   ═══════════════════════════════════════ */

export interface ProductPricing {
  id: string;
  billing_cycle: string;
  price: string;
  setup_fee: string;
  currency: string;
  discount_percentage: string | null;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  type: string;
  short_description: string | null;
  description: string | null;
  badge_text: string | null;
  image_url: string | null;
  pricing: ProductPricing[];
  features: { key: string; value: string }[] | null;
}

export interface BillingProfile {
  id: string;
  label: string;
  type: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  nif_cif: string | null;
  address_line1: string;
  city: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

export interface ClientOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export type Step = 'client' | 'product' | 'pricing' | 'profile' | 'confirm';

export const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  one_time: 'Pago único',
};

export const CYCLE_SAVINGS: Record<string, string> = {
  quarterly: '5%',
  semiannual: '10%',
  annual: '20%',
};

export const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_billing'];

/** Format currency: "12,99 €" */
export const fmt = (amount: string | number, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(amount));
