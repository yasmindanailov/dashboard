'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { Pagination } from '../../../lib/types';
import type { BillingProfile, ClientOption, Product } from './types';

/* ═══════════════════════════════════════
   Server Actions — _shared/billing/checkout (useCheckout).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).
   ═══════════════════════════════════════ */

export type ListProductsResult =
  | { ok: true; products: Product[] }
  | { ok: false; error: string };

export async function listCatalogProductsAction(
  options: { onlyActive?: boolean; limit?: number } = {},
): Promise<ListProductsResult> {
  const query = new URLSearchParams();
  query.set('limit', String(options.limit ?? 50));
  if (options.onlyActive ?? true) query.set('status', 'active');
  try {
    const res = await serverFetch<Pagination<Product>>(
      `/products?${query.toString()}`,
    );
    return { ok: true, products: res.data || [] };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar el catálogo',
    };
  }
}

export type ListBillingProfilesResult =
  | { ok: true; profiles: BillingProfile[] }
  | { ok: false; error: string };

export async function listClientBillingProfilesAction(
  userId: string,
): Promise<ListBillingProfilesResult> {
  try {
    const res = await serverFetch<BillingProfile[] | { data: BillingProfile[] }>(
      `/admin/clients/${userId}/billing-profiles`,
    );
    const profiles = Array.isArray(res)
      ? res
      : Array.isArray((res as { data?: BillingProfile[] }).data)
        ? (res as { data: BillingProfile[] }).data
        : [];
    return { ok: true, profiles };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar los perfiles de facturación',
    };
  }
}

export type SearchClientsResult =
  | { ok: true; clients: ClientOption[] }
  | { ok: false; error: string };

export async function searchCheckoutClientsAction(
  searchTerm: string,
): Promise<SearchClientsResult> {
  if (searchTerm.length < 2) return { ok: true, clients: [] };
  try {
    const res = await serverFetch<Pagination<ClientOption>>(
      `/admin/clients?search=${encodeURIComponent(searchTerm)}&limit=10`,
    );
    return { ok: true, clients: res.data || [] };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron buscar clientes',
    };
  }
}

export type CheckoutResult = { ok: true } | { ok: false; error: string };

export async function checkoutAction(
  data: {
    product_pricing_id: string;
    billing_profile_id?: string;
    label?: string;
    domain?: string;
  },
  targetUserId?: string,
): Promise<CheckoutResult> {
  const qs = targetUserId ? `?targetUserId=${targetUserId}` : '';
  try {
    await serverFetch(`/billing/checkout${qs}`, {
      method: 'POST',
      body: data,
    });
    revalidatePath('/dashboard/billing');
    revalidatePath('/admin/billing');
    revalidatePath('/dashboard/support-inside');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'Error al procesar el checkout',
    };
  }
}
