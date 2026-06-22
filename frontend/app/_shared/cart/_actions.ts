'use server';

import { revalidatePath } from 'next/cache';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Action — carrito unificado (Sprint 15D Fase 15D.F.4, Modelo A).
   Un único checkout multi-ítem (producto + dominio) → POST /billing/checkout/items.
   El precio se re-verifica server-side (R5); el producto-dominio se resuelve por
   capability (R4). DOM-INV-5 (.es/.eu) lo aplica el backend antes de cobrar.
   ═══════════════════════════════════════ */

/** Ítem en forma REST (snake_case) que entiende el endpoint unificado. */
export type CheckoutItemPayload =
  | { kind: 'product'; product_pricing_id: string }
  | { kind: 'domain'; domain_name: string; years: number };

export interface CartCheckoutData {
  invoice_id: string;
  invoice_number: string;
  total: string;
  currency: string;
  services: { id: string; domain: string | null }[];
}

export type CheckoutCartResult =
  | { ok: true; data: CartCheckoutData }
  | {
      ok: false;
      error: string;
      /** Código canónico (p.ej. `REGISTRANT_INELIGIBLE`) para UX accionable. */
      code?: string;
      /** TLD afectado por un fallo de elegibilidad (.es/.eu). */
      tld?: string;
    };

export async function checkoutCartAction(input: {
  items: CheckoutItemPayload[];
  billing_profile_id?: string;
}): Promise<CheckoutCartResult> {
  try {
    const data = await serverFetch<CartCheckoutData>('/billing/checkout/items', {
      method: 'POST',
      body: {
        items: input.items,
        ...(input.billing_profile_id
          ? { billing_profile_id: input.billing_profile_id }
          : {}),
      },
    });
    revalidatePath('/dashboard/domains');
    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/billing');
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      const body = err.body as
        | { code?: string; message?: string; tld?: string }
        | undefined;
      return {
        ok: false,
        error: body?.message ?? err.message,
        code: body?.code,
        tld: body?.tld,
      };
    }
    return { ok: false, error: 'No se pudo completar la compra.' };
  }
}
