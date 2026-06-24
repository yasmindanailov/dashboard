'use server';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════════════════════════════════════════
   Server Actions — gestión admin de precios de dominios (Modelo A).
   Sprint 15D Fase 15D.G·1. Backend: AdminDomainsController (/admin/domains/pricing).
   El componente cliente mantiene las filas en estado y las refresca tras cada
   mutación con `listDomainPricingAction` (no hace falta revalidatePath: la matriz
   no forma parte del render del Server Component tras la carga inicial).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DomainPricingRow {
  id: string;
  registrar_slug: string;
  tld: string;
  operation: 'register' | 'renew' | 'transfer' | 'restore';
  years: number;
  cost_amount: string;
  cost_currency: string;
  price_amount: string;
  price_currency: string;
  effective_margin_pct: string | null;
  markup_percent: string | null;
  source: 'sync' | 'manual';
  active: boolean;
  synced_at: string | null;
  updated_at: string;
}

export interface DomainPricingSyncSummary {
  total: number;
  written: number;
  skippedManual: number;
  skippedNotOffered: number;
  skippedCurrency: number;
  skippedInvalid: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof ServerFetchError) {
    const body = err.body as { message?: string } | undefined;
    return { ok: false, error: body?.message ?? err.message };
  }
  return { ok: false, error: fallback };
}

/** Matriz de precios (refresco del componente cliente tras mutaciones / sync). */
export async function listDomainPricingAction(
  registrar?: string,
): Promise<Result<DomainPricingRow[]>> {
  try {
    const qs = registrar ? `?registrar=${encodeURIComponent(registrar)}` : '';
    const data = await serverFetch<DomainPricingRow[]>(
      `/admin/domains/pricing${qs}`,
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudieron cargar los precios.');
  }
}

/** Fuerza una sincronización de precios con el registrar ahora. */
export async function syncDomainPricingAction(): Promise<
  Result<DomainPricingSyncSummary>
> {
  try {
    const data = await serverFetch<DomainPricingSyncSummary>(
      '/admin/domains/pricing/sync',
      { method: 'POST' },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo sincronizar los precios.');
  }
}

/** Override manual del precio de venta de una fila (source→manual). */
export async function setManualDomainPriceAction(
  id: string,
  price: number,
): Promise<Result<DomainPricingRow>> {
  try {
    const data = await serverFetch<DomainPricingRow>(
      `/admin/domains/pricing/${id}`,
      { method: 'PATCH', body: { price } },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo fijar el precio manual.');
  }
}

/** Revierte una fila a precio automático (source→sync). */
export async function revertDomainPriceAction(
  id: string,
): Promise<Result<DomainPricingRow>> {
  try {
    const data = await serverFetch<DomainPricingRow>(
      `/admin/domains/pricing/${id}`,
      { method: 'DELETE' },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo revertir el precio.');
  }
}

/**
 * Borrado destructivo de un dominio en período de gracia (admin) + cancelación
 * del servicio. Sprint 15D.G·2 / ADR-081 A3.1.
 */
export async function deleteDomainAction(
  serviceId: string,
  reason: string,
): Promise<Result<{ id: string; status: string }>> {
  try {
    const data = await serverFetch<{ id: string; status: string }>(
      `/admin/domains/services/${serviceId}/delete`,
      { method: 'POST', body: { reason } },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo borrar el dominio.');
  }
}
