'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/products.
   Sprint 13 §13.AUTH Fase E (Modelo A).
   ═══════════════════════════════════════ */

export type ProductMutationResult = { ok: true } | { ok: false; error: string };

export async function toggleProductStatusAction(
  id: string,
): Promise<ProductMutationResult> {
  try {
    await serverFetch(`/admin/products/${id}/status`, { method: 'PATCH' });
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${id}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cambiar el estado',
    };
  }
}

export async function deleteProductAction(
  id: string,
): Promise<ProductMutationResult> {
  try {
    await serverFetch(`/admin/products/${id}`, { method: 'DELETE' });
    revalidatePath('/admin/products');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo eliminar el producto',
    };
  }
}

export async function createProductAction(
  data: Record<string, unknown>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await serverFetch<{ id: string }>('/admin/products', {
      method: 'POST',
      body: data,
    });
    revalidatePath('/admin/products');
    return { ok: true, id: res.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo crear el producto',
    };
  }
}

export async function updateProductAction(
  id: string,
  data: Record<string, unknown>,
): Promise<ProductMutationResult> {
  try {
    await serverFetch(`/admin/products/${id}`, {
      method: 'PATCH',
      body: data,
    });
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${id}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo actualizar el producto',
    };
  }
}

export interface PricingRowResult {
  id: string;
  billing_cycle: string;
  price: string;
  setup_fee: string;
  currency: string;
  active: boolean;
}

export type AddPricingResult =
  | { ok: true; pricing: PricingRowResult[] }
  | { ok: false; error: string };

export async function addPricingAction(
  productId: string,
  data: { billing_cycle: string; price: number; setup_fee: number },
): Promise<AddPricingResult> {
  try {
    await serverFetch(`/admin/products/${productId}/pricing`, {
      method: 'POST',
      body: data,
    });
    /* Recargar pricing del producto para devolver la lista actualizada. */
    const product = await serverFetch<{ pricing: PricingRowResult[] }>(
      `/products/${productId}`,
    );
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/admin/products/${productId}/edit`);
    return { ok: true, pricing: product.pricing };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo añadir el plan de precio',
    };
  }
}

export async function deletePricingAction(
  productId: string,
  pricingId: string,
): Promise<ProductMutationResult> {
  try {
    await serverFetch(`/admin/products/pricing/${pricingId}`, {
      method: 'DELETE',
    });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/admin/products/${productId}/edit`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo eliminar el plan de precio',
    };
  }
}
