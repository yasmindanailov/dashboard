'use server';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /dashboard/billing.
   Sprint 13 §13.AUTH Fase E (Modelo A).
   ═══════════════════════════════════════ */

export type DownloadInvoicePdfResult =
  | { ok: true; url: string; filename: string }
  | { ok: false; error: string };

/**
 * Pide al backend la URL pre-signed del PDF (ADR-062 §H two-phase).
 * El cliente luego descarga directo del bucket sin CORS preflight.
 */
export async function downloadInvoicePdfAction(
  id: string,
): Promise<DownloadInvoicePdfResult> {
  try {
    const res = await serverFetch<{ url: string; filename: string }>(
      `/billing/invoices/${id}/pdf-url`,
    );
    return { ok: true, url: res.url, filename: res.filename };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo generar la URL de descarga',
    };
  }
}
