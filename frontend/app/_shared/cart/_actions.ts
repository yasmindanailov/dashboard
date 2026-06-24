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
  | { kind: 'product'; product_pricing_id: string; domain?: string }
  | {
      kind: 'domain';
      domain_name: string;
      years: number;
      /** 15D.II.T2c.3 — `transfer_in` activa deferBilling (cobro al completar). */
      operation?: 'register' | 'transfer_in';
    };

export interface CartCheckoutData {
  // 15D.II.T2c.3 — `null` cuando el carrito es SOLO transfers (deferBilling): no
  // se emite factura en el checkout (cobro al completar, ADR-084 A2.3).
  invoice_id: string | null;
  invoice_number: string | null;
  total: string | null;
  currency: string | null;
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
