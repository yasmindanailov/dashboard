'use server';

/**
 * Server Actions del detalle de servicio admin — Rediseño UI F3·E8.
 *
 * Gestión "Support Inside" desde el detalle de servicio unificado: listar
 * técnicos elegibles (picker DS-A18) y reasignar el técnico de la suscripción.
 * Modelo A (ADR-078 A1): `serverFetch` inyecta el JWT httpOnly; nunca se leen
 * cookies aquí. Errores → unión discriminada (la vista los muestra con toast).
 */

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { SupportInsideEligibleTechnician } from '../../../lib/api';

export type ListTechniciansResult =
  | { ok: true; technicians: SupportInsideEligibleTechnician[] }
  | { ok: false; error: string };

export async function listEligibleTechniciansAction(): Promise<ListTechniciansResult> {
  try {
    const technicians = await serverFetch<SupportInsideEligibleTechnician[]>(
      '/admin/support-inside/technicians/eligible',
    );
    return { ok: true, technicians };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar los técnicos',
    };
  }
}

export type AssignTechnicianResult =
  | { ok: true; reassigned_pending_tasks: number }
  | { ok: false; error: string };

/**
 * Asigna/reasigna el técnico de la suscripción SI. `technicianId=null`
 * desasigna. Revalida el detalle del servicio para refrescar la sección
 * "Plan de soporte".
 */
export async function assignTechnicianAction(
  subscriptionId: string,
  technicianId: string | null,
  serviceId: string,
): Promise<AssignTechnicianResult> {
  try {
    const res = await serverFetch<{ reassigned_pending_tasks: number }>(
      `/admin/support-inside/subscriptions/${subscriptionId}/technician`,
      { method: 'PATCH', body: { technician_id: technicianId } },
    );
    revalidatePath(`/admin/services/${serviceId}`);
    return { ok: true, reassigned_pending_tasks: res.reassigned_pending_tasks };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo reasignar el técnico',
    };
  }
}
