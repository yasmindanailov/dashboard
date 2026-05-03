'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type {
  SupportInsideAdminPlanDetail,
  SupportInsidePlanPatch,
} from '../../../lib/api';

/* ═══════════════════════════════════════
   Server Actions — /admin/support-inside-plans/[slug].
   Sprint 13 §13.AUTH Fase E (Modelo A). ADR-075 §B.2 (5 secciones).
   Cada saveSection enviá un patch parcial; backend valida + persiste.
   ═══════════════════════════════════════ */

export type UpdatePlanResult =
  | { ok: true; detail: SupportInsideAdminPlanDetail }
  | { ok: false; error: string };

export async function updatePlanAction(
  slug: string,
  patch: SupportInsidePlanPatch,
): Promise<UpdatePlanResult> {
  try {
    const detail = await serverFetch<SupportInsideAdminPlanDetail>(
      `/admin/support-inside/plans/${slug}`,
      { method: 'PATCH', body: patch },
    );
    revalidatePath('/admin/support-inside-plans');
    revalidatePath(`/admin/support-inside-plans/${slug}`);
    return { ok: true, detail };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron guardar los cambios',
    };
  }
}
