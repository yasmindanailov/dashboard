/**
 * Tipos del comercio de dominios (portal cliente) — Sprint 15D Fase 15D.F.4.
 *
 * Espejo de los shapes que devuelve el backend `DomainsController`
 * (`/api/v1/domains/*`). El precio SIEMPRE lo calcula el backend (R5); el
 * frontend solo lo muestra. El carrito vive client-side (localStorage) y se
 * re-verifica server-side en el checkout.
 */

/* ── Buscador (POST /domains/check-availability) ── */

export interface DomainPrice {
  amount: string;
  currency: string;
}

export interface DomainAvailabilityResult {
  fqdn: string;
  tld: string;
  available: boolean;
  /** El registrar lo marca premium (precio dinámico) → bloqueado en v1. */
  premium: boolean;
  /** `available && !premium && con precio` → se puede añadir al carrito. */
  purchasable: boolean;
  price?: DomainPrice;
  /** El registrar falló para este TLD (no rompe el resto del lote). */
  error?: boolean;
}

export interface CheckDomainAvailabilityResponse {
  sld: string;
  results: DomainAvailabilityResult[];
}

/* ── "Mis dominios" (GET /domains) ── */

export interface DomainListItem {
  /** `service.id` — id del recurso para detalle/gestión. */
  id: string;
  fqdn: string | null;
  status: string;
  /** Caducidad reportada por el registrar (`service.expires_at`), si se conoce. */
  expires_at: string | null;
  /** Próxima facturación de Aelium (`service.next_due_date`). */
  next_due_date: string | null;
  created_at: string;
  product_name: string;
}

export interface ListDomainsResponse {
  data: DomainListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/* ── Carrito (client-side, localStorage) ── */

export interface DomainCartItem {
  fqdn: string;
  tld: string;
  /** Años de registro (v1: 1). */
  years: number;
  /** Precio mostrado al añadir; el checkout lo re-verifica server-side (R5). */
  price: DomainPrice;
}

/* ── Checkout del carrito (POST /domains/cart/checkout) ── */

export interface CartCheckoutResult {
  invoice_id: string;
  invoice_number: string;
  total: string;
  currency: string;
  services: { id: string; fqdn: string | null }[];
}

/** Formatea un precio de dominio (`{amount,currency}`) en es-ES. */
export function formatDomainPrice(price: DomainPrice): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: price.currency,
  }).format(Number(price.amount));
}
