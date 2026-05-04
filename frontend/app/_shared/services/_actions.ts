'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type {
  ActionResult,
  ServiceDetailResponse,
  SsoUrl,
} from '../../lib/api';

/* ═══════════════════════════════════════
   Server Actions — _shared/services (SsoButton + ActionsBar).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).
   Sprint 11 Fase 11.D (ADR-070 §B + §C).
   ═══════════════════════════════════════ */

export type SsoActionResult =
  | { ok: true; sso: SsoUrl | null }
  | { ok: false; error: string };

export async function requestSsoUrlAction(
  serviceId: string,
): Promise<SsoActionResult> {
  try {
    const res = await serverFetch<{ sso: SsoUrl | null }>(
      `/services/${serviceId}/sso`,
      { method: 'POST' },
    );
    return { ok: true, sso: res.sso };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo abrir el panel',
    };
  }
}

export type ExecuteServiceActionResult =
  | { ok: true; result: ActionResult }
  | { ok: false; error: string };

export async function executeServiceActionAction(
  serviceId: string,
  actionSlug: string,
  payload: Record<string, unknown>,
): Promise<ExecuteServiceActionResult> {
  try {
    const result = await serverFetch<ActionResult>(
      `/services/${serviceId}/actions/${actionSlug}`,
      { method: 'POST', body: { payload } },
    );
    revalidatePath(`/dashboard/services/${serviceId}`);
    revalidatePath(`/admin/services/${serviceId}`);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo ejecutar la acción',
    };
  }
}

export type ServiceDetailResult =
  | { ok: true; detail: ServiceDetailResponse }
  | { ok: false; error: string };

export async function getServiceDetailAction(
  serviceId: string,
): Promise<ServiceDetailResult> {
  try {
    const detail = await serverFetch<ServiceDetailResponse>(
      `/services/${serviceId}`,
    );
    return { ok: true, detail };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar el servicio',
    };
  }
}
