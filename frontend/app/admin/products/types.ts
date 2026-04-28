/* ═══════════════════════════════════════
   Products — Shared types & constants
   ═══════════════════════════════════════ */

export const TYPE_LABELS: Record<string, string> = {
  hosting_web: 'Hosting Web',
  domain: 'Dominio',
  docker_service: 'Docker Service',
  support_inside: 'Support Inside',
  we_do_it: 'We Do It',
  custom_service: 'Proyecto Custom',
};

export const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', label: 'Activo' },
  inactive: { bg: 'rgba(234, 179, 8, 0.1)', color: '#ca8a04', label: 'Inactivo' },
  deprecated: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', label: 'Obsoleto' },
};

export interface ProductPricing {
  billing_cycle: string;
  price: string;
  currency: string;
}

export interface ProductItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  is_addon: boolean;
  badge_text?: string;
  category?: { name: string } | null;
  pricing: ProductPricing[];
  _count: { services: number };
  created_at: string;
}

export interface PaginatedResponse {
  data: ProductItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
