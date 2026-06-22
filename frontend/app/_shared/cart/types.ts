/**
 * Carrito unificado del portal cliente — Sprint 15D Fase 15D.F.4.
 *
 * UN solo carrito mixto: productos (hosting/etc.) + dominios. El precio SIEMPRE
 * lo calcula el backend (R5); el carrito vive client-side (localStorage) y se
 * re-verifica server-side en el checkout (`POST /billing/checkout/items`).
 */

export interface Money {
  amount: string;
  currency: string;
}

export type CartItem =
  | {
      kind: 'product';
      /** Plan elegido (`ProductPricing.id`) — lo que necesita el checkout. */
      productPricingId: string;
      productName: string;
      cycleLabel: string;
      price: Money;
    }
  | {
      kind: 'domain';
      fqdn: string;
      tld: string;
      /** Años de registro (v1: 1). */
      years: number;
      price: Money;
    };

/** Clave estable para dedup/borrado: producto por plan, dominio por FQDN. */
export function cartItemKey(item: CartItem): string {
  return item.kind === 'product'
    ? `product:${item.productPricingId}`
    : `domain:${item.fqdn}`;
}

/** Etiqueta visible del ítem (nombre del producto o FQDN). */
export function cartItemLabel(item: CartItem): string {
  return item.kind === 'product' ? item.productName : item.fqdn;
}

export function formatMoney(money: Money): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: money.currency,
  }).format(Number(money.amount));
}

/**
 * Contexto de compra de un producto para el usuario (Tienda consciente del
 * estado, 15D.F.4). Espejo de `GET /products/:id/purchase-context`. Guía el CTA;
 * el checkout sigue siendo la autoridad.
 */
export interface ProductPurchaseContext {
  canBuy: boolean;
  reason: 'ok' | 'owns_global_addon' | 'at_quantity_limit';
  isGlobalAddon: boolean;
  maxQuantity: number | null;
  currentQuantity: number;
  ownedSubscriptionId?: string;
}
