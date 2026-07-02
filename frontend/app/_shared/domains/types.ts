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

/* ── Buscador rico (Sprint 15D.II.S) ── */

/** Disponibilidad de varios SLDs (POST /domains/check-availability-bulk). */
export interface BulkAvailabilityResponse {
  results: Array<{ sld: string; results: DomainAvailabilityResult[] }>;
}

/** Una sugerencia comprable del buscador rico (POST /domains/suggest). */
export interface DomainSuggestionResult {
  fqdn: string;
  tld: string;
  price: DomainPrice;
}

export interface DomainSuggestionsResponse {
  keyword: string;
  results: DomainSuggestionResult[];
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
  /** F4·W3 — preferencia de auto-renovación (invoice-driven, Aelium-side). */
  auto_renew: boolean;
  created_at: string;
  product_name: string;
}

export interface ListDomainsResponse {
  data: DomainListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/* ── Transfer-in (Sprint 15D.II.T2c.3) ── */

/** Cotización de transferencia de un FQDN (POST /domains/transfer-quote). */
export interface DomainTransferQuote {
  fqdn: string;
  tld: string;
  /** El TLD se transfiere (precio activo + margen válido) → añadible al carrito. */
  offered: boolean;
  /** Precio de venta del transfer (server-side). Solo si `offered`. */
  price?: DomainPrice;
}

/** Estado de un transfer-in tras aportar el auth-code (submit-auth). */
export interface DomainTransferStatus {
  id: string;
  status: string;
  /** Estado de la FSM (`pending`/`awaiting_auth`/`submitted`/...). */
  transfer_state: string;
}
