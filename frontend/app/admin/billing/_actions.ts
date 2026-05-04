'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/billing.
   Sprint 13 §13.AUTH Fase E (Modelo A).
   Cada mutación llama backend + revalidatePath para que el SC
   recargue la lista server-side.
   ═══════════════════════════════════════ */

export type InvoiceMutationResult = { ok: true } | { ok: false; error: string };

function wrapError(err: unknown, fallback: string): InvoiceMutationResult {
  return {
    ok: false,
    error: err instanceof ServerFetchError ? err.message : fallback,
  };
}

export async function finalizeInvoiceAction(
  id: string,
): Promise<InvoiceMutationResult> {
  try {
    await serverFetch(`/billing/invoices/${id}/finalize`, { method: 'PATCH' });
    revalidatePath('/admin/billing');
    revalidatePath(`/admin/billing/${id}`);
    return { ok: true };
  } catch (err) {
    return wrapError(err, 'No se pudo finalizar la factura');
  }
}

export async function payInvoiceAction(
  id: string,
): Promise<InvoiceMutationResult> {
  try {
    await serverFetch(`/billing/invoices/${id}/pay`, {
      method: 'PATCH',
      body: {},
    });
    revalidatePath('/admin/billing');
    revalidatePath(`/admin/billing/${id}`);
    return { ok: true };
  } catch (err) {
    return wrapError(err, 'No se pudo cobrar la factura');
  }
}

export async function cancelInvoiceAction(
  id: string,
): Promise<InvoiceMutationResult> {
  try {
    await serverFetch(`/billing/invoices/${id}/cancel`, { method: 'PATCH' });
    revalidatePath('/admin/billing');
    revalidatePath(`/admin/billing/${id}`);
    return { ok: true };
  } catch (err) {
    return wrapError(err, 'No se pudo cancelar la factura');
  }
}

export async function refundInvoiceAction(
  id: string,
): Promise<InvoiceMutationResult> {
  try {
    await serverFetch(`/billing/invoices/${id}/refund`, { method: 'PATCH' });
    revalidatePath('/admin/billing');
    revalidatePath(`/admin/billing/${id}`);
    return { ok: true };
  } catch (err) {
    return wrapError(err, 'No se pudo reembolsar la factura');
  }
}

export type DownloadInvoicePdfResult =
  | { ok: true; url: string; filename: string }
  | { ok: false; error: string };

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
