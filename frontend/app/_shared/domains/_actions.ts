'use server';

import { revalidatePath } from 'next/cache';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type {
  BulkAvailabilityResponse,
  CheckDomainAvailabilityResponse,
  DomainSuggestionsResponse,
  DomainTransferQuote,
  DomainTransferStatus,
} from './types';

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

/* ── Buscador rico (Sprint 15D.II.S) ── */

export type SuggestResult =
  | { ok: true; data: DomainSuggestionsResponse }
  | { ok: false; error: string };

/** Sugiere nombres comprables a partir de una palabra clave (server-side R5). */
export async function suggestDomainsAction(input: {
  keyword: string;
  tlds?: string[];
}): Promise<SuggestResult> {
  try {
    const data = await serverFetch<DomainSuggestionsResponse>(
      '/domains/suggest',
      {
        method: 'POST',
        body: {
          keyword: input.keyword,
          ...(input.tlds && input.tlds.length > 0 ? { tlds: input.tlds } : {}),
        },
      },
    );
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      const body = err.body as { message?: string } | undefined;
      return { ok: false, error: body?.message ?? err.message };
    }
    return { ok: false, error: 'No se pudieron obtener sugerencias.' };
  }
}

export type BulkAvailabilityResult =
  | { ok: true; data: BulkAvailabilityResponse }
  | { ok: false; error: string };

/** Disponibilidad + precio de varios SLDs en una operación (server-side R5). */
export async function checkAvailabilityBulkAction(input: {
  slds: string[];
  tlds?: string[];
}): Promise<BulkAvailabilityResult> {
  try {
    const data = await serverFetch<BulkAvailabilityResponse>(
      '/domains/check-availability-bulk',
      {
        method: 'POST',
        body: {
          slds: input.slds,
          ...(input.tlds && input.tlds.length > 0 ? { tlds: input.tlds } : {}),
        },
      },
    );
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      const body = err.body as { message?: string } | undefined;
      return { ok: false, error: body?.message ?? err.message };
    }
    return { ok: false, error: 'No se pudo comprobar la disponibilidad.' };
  }
}

/* ── Transfer-in (Sprint 15D.II.T2c.3) ── */

export type TransferQuoteResult =
  | { ok: true; data: DomainTransferQuote }
  | { ok: false; error: string };

/** Cotiza el precio de transferencia de un FQDN (pre-carrito, server-side R5). */
export async function transferQuoteAction(input: {
  fqdn: string;
}): Promise<TransferQuoteResult> {
  try {
    const data = await serverFetch<DomainTransferQuote>(
      '/domains/transfer-quote',
      { method: 'POST', body: { fqdn: input.fqdn } },
    );
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      const body = err.body as { message?: string } | undefined;
      return { ok: false, error: body?.message ?? err.message };
    }
    return { ok: false, error: 'No se pudo cotizar la transferencia.' };
  }
}

export type SubmitTransferAuthResult =
  | { ok: true; data: DomainTransferStatus }
  | { ok: false; error: string; code?: string };

/**
 * Aporta el EPP auth-code de un transfer-in (post-checkout). **R12:** el código es
 * secreto — viaja en el body por HTTPS, no se loguea. `INVALID_AUTH_CODE` → el
 * caller muestra un mensaje accionable y la FSM queda en `awaiting_auth`.
 */
export async function submitTransferAuthAction(input: {
  serviceId: string;
  authCode: string;
}): Promise<SubmitTransferAuthResult> {
  try {
    const data = await serverFetch<DomainTransferStatus>(
      `/domains/${input.serviceId}/transfer/submit-auth`,
      { method: 'POST', body: { authCode: input.authCode } },
    );
    revalidatePath(`/dashboard/domains/${input.serviceId}`);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      const body = err.body as { code?: string; message?: string } | undefined;
      return { ok: false, error: body?.message ?? err.message, code: body?.code };
    }
    return { ok: false, error: 'No se pudo enviar el código de autorización.' };
  }
}
