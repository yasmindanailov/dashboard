'use server';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { CheckDomainAvailabilityResponse } from './types';

/* ═══════════════════════════════════════
   Server Actions — _shared/domains — Sprint 15D Fase 15D.F.4 (Modelo A).
   Solo el buscador (pre-venta). La COMPRA va por el carrito unificado
   (`_shared/cart/_actions` → POST /billing/checkout/items). El precio se resuelve
   SIEMPRE server-side (R5); el registrar por capability (R4).
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
