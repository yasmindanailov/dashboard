'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type {
  SupportInsidePublicPlan,
  SupportInsideSubscriptionPayload,
  SupportInsideEligibleService,
  SupportInsideSlotPayload,
  SupportInsideSlotType,
} from '../../lib/api';

/* ═══════════════════════════════════════
   Server Actions — /dashboard/support-inside.
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).
   ADR-061, ADR-075 §B.1, ADR-076.
   ═══════════════════════════════════════ */

export type LoadSupportInsideResult =
  | {
      ok: true;
      plans: SupportInsidePublicPlan[];
      subscription: SupportInsideSubscriptionPayload | null;
    }
  | { ok: false; error: string };

export async function loadSupportInsideAction(): Promise<LoadSupportInsideResult> {
  try {
    const [plans, subscription] = await Promise.all([
      serverFetch<SupportInsidePublicPlan[]>('/dashboard/support-inside/plans'),
      serverFetch<SupportInsideSubscriptionPayload | null>(
        '/dashboard/support-inside/status',
      ),
    ]);
    return { ok: true, plans, subscription };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar Support Inside',
    };
  }
}

export type EligibleServicesResult =
  | { ok: true; services: SupportInsideEligibleService[] }
  | { ok: false; error: string };

export async function listEligibleServicesAction(): Promise<EligibleServicesResult> {
  try {
    const services = await serverFetch<SupportInsideEligibleService[]>(
      '/dashboard/support-inside/eligible-services',
    );
    return { ok: true, services };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar tus servicios',
    };
  }
}

export type SlotMutationResult = { ok: true } | { ok: false; error: string };

export async function addSlotAction(data: {
  service_id: string;
  slot_type: SupportInsideSlotType;
  is_extra?: boolean;
}): Promise<SlotMutationResult & { slot?: SupportInsideSlotPayload }> {
  try {
    const slot = await serverFetch<SupportInsideSlotPayload>(
      '/dashboard/support-inside/slots',
      { method: 'POST', body: data },
    );
    revalidatePath('/dashboard/support-inside');
    return { ok: true, slot };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo asignar el slot',
    };
  }
}

export async function releaseSlotAction(
  slotId: string,
): Promise<SlotMutationResult> {
  try {
    await serverFetch(`/dashboard/support-inside/slots/${slotId}`, {
      method: 'DELETE',
    });
    revalidatePath('/dashboard/support-inside');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo liberar el slot',
    };
  }
}

export type CancelSubscriptionResult =
  | { ok: true; releasedSlots: number }
  | { ok: false; error: string };

export async function cancelSupportInsideAction(
  reason?: string,
): Promise<CancelSubscriptionResult> {
  try {
    const res = await serverFetch<{ cancelled: true; released_slots: number }>(
      '/dashboard/support-inside/subscription',
      { method: 'DELETE', body: { reason } },
    );
    revalidatePath('/dashboard/support-inside');
    return { ok: true, releasedSlots: res.released_slots };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError ? err.message : 'No se pudo cancelar',
    };
  }
}
