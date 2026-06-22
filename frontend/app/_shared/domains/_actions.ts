'use server';

import { revalidatePath } from 'next/cache';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type {
  CartCheckoutResult,
  CheckDomainAvailabilityResponse,
} from './types';

/* ═══════════════════════════════════════
   Server Actions — _shared/domains — Sprint 15D Fase 15D.F.4 (Modelo A).
   El precio se resuelve SIEMPRE server-side (R5); el registrar por capability
   (R4). El carrito vive client-side y se re-verifica aquí en el checkout.
   ═══════════════════════════════════════ */

export type CheckAvailabilityResult =
  | { ok: true; data: CheckDomainAvailabilityResponse }
  | { ok: false; error: string; code?: string };

export async function checkDomainAvailabilityAction(input: {
  sld: string;
  tlds?: string[];
}): Promise<CheckAvailabilityResult> {
  try {
    const data = await serverFetch<CheckDomainAvailabilityResponse>(
      '/domains/check-availability',
      {
        method: 'POST',
        body: {
          sld: input.sld,
          ...(input.tlds && input.tlds.length > 0 ? { tlds: input.tlds } : {}),
        },
      },
    );
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      const body = err.body as { code?: string; message?: string } | undefined;
      return { ok: false, error: body?.message ?? err.message, code: body?.code };
    }
    return { ok: false, error: 'No se pudo comprobar la disponibilidad.' };
  }
}

export type CheckoutCartResult =
  | { ok: true; data: CartCheckoutResult }
  | {
      ok: false;
      error: string;
      /** Código canónico (p.ej. `REGISTRANT_INELIGIBLE`) para UX accionable. */
      code?: string;
      /** TLD afectado por un fallo de elegibilidad (.es/.eu). */
      tld?: string;
    };

export async function checkoutDomainCartAction(input: {
  items: { domain_name: string; years: number }[];
  billing_profile_id?: string;
}): Promise<CheckoutCartResult> {
  try {
    const data = await serverFetch<CartCheckoutResult>('/domains/cart/checkout', {
      method: 'POST',
      body: {
        items: input.items,
        ...(input.billing_profile_id
          ? { billing_profile_id: input.billing_profile_id }
          : {}),
      },
    });
    revalidatePath('/dashboard/domains');
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
    return { ok: false, error: 'No se pudo completar el registro.' };
  }
}
