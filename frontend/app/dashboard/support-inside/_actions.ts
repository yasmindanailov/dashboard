'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type {
  SupportInsidePublicPlan,
  SupportInsideSubscriptionPayload,
  SupportInsideEligibleService,
  SupportInsideSlotPayload,
  SupportInsideSlotType,
  SupportInsideMaintenanceHistory,
  SupportInsideTechnician,
  PlanChangePreview,
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

/**
 * F3·E8 — técnico asignado (con presencia) para la tarjeta de soporte del
 * sidebar cliente (`SidebarSupportSlot`). Ligero: solo el técnico del status.
 * Fail-soft: si no hay plan/técnico o falla, devuelve `null` (el slot cae al
 * remitente genérico "Soporte Aelium").
 */
export async function getSupportInsideTechnicianAction(): Promise<{
  technician: SupportInsideTechnician | null;
}> {
  try {
    const status = await serverFetch<SupportInsideSubscriptionPayload | null>(
      '/dashboard/support-inside/status',
    );
    return { technician: status?.technician ?? null };
  } catch {
    return { technician: null };
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

/* ── Histórico de mantenimientos del slot (F3·E8) ── */

export type MaintenanceHistoryResult =
  | { ok: true; data: SupportInsideMaintenanceHistory }
  | { ok: false; error: string };

export async function loadMaintenanceHistoryAction(
  slotId: string,
): Promise<MaintenanceHistoryResult> {
  try {
    const data = await serverFetch<SupportInsideMaintenanceHistory>(
      `/dashboard/support-inside/slots/${slotId}/maintenance-history`,
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar el histórico de mantenimientos',
    };
  }
}

/* ── Cambio de plan (GL-23 / ADR-029 A1) ── */

export type PreviewUpgradeResult =
  | { ok: true; preview: PlanChangePreview }
  | { ok: false; error: string };

/** Preview del prorrateo antes de confirmar (R5). */
export async function previewUpgradeAction(
  newPricingId: string,
): Promise<PreviewUpgradeResult> {
  try {
    const preview = await serverFetch<PlanChangePreview>(
      `/dashboard/support-inside/upgrade/preview?new_product_pricing_id=${encodeURIComponent(newPricingId)}`,
    );
    return { ok: true, preview };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo calcular el cambio de plan',
    };
  }
}

export type UpgradeResult = { ok: true } | { ok: false; error: string };

export async function upgradeSupportInsideAction(
  newPricingId: string,
): Promise<UpgradeResult> {
  try {
    await serverFetch('/dashboard/support-inside/upgrade', {
      method: 'POST',
      body: { new_product_pricing_id: newPricingId },
    });
    revalidatePath('/dashboard/support-inside');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cambiar de plan',
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
