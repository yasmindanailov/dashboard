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
  | { ok: true; sso: SsoUrl | null; errorCode: string | null }
  | { ok: false; error: string };

export async function requestSsoUrlAction(
  serviceId: string,
): Promise<SsoActionResult> {
  try {
    // Sprint 15C.II Fase C round 5 (smoke real Yasmin 2026-05-10): backend
    // ahora retorna `{ sso, errorCode }` para distinguir null legítimo
    // ("plugin no soporta SSO" / "refs missing") de error real
    // (`INVALID_STATE` drift detectable — ej. member_id stale en
    // `enhance_customers`). El SsoButton usa errorCode para mostrar
    // mensaje útil al usuario en lugar del genérico.
    const res = await serverFetch<{
      sso: SsoUrl | null;
      errorCode: string | null;
    }>(`/services/${serviceId}/sso`, { method: 'POST' });
    return { ok: true, sso: res.sso, errorCode: res.errorCode };
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

/* ═══════════════════════════════════════
   Sprint 15C.II Fase B (ADR-083 Amendment A4.1) — refresh metrics ↻

   Materializa la decisión doctrinal A1 frozen 2026-05-10: refresh
   manual del cache 60s del wrapper backend `getServiceInfoWithCache`.
   Invocado por el subcomponente client `<MetricsRefreshButton>` embebido
   en `MetricsBar.tsx` (cliente + admin) cuando el usuario pulsa "↻".

   Reemplaza las inline actions `view_disk_usage` + `view_bandwidth_usage`
   eliminadas del manifest del plugin Enhance (violaban UI_SPEC §1.2 P4
   "acción no contemplación"). Patrón estándar industria Stripe/Vercel.
   ═══════════════════════════════════════ */

export type RefreshServiceInfoResult =
  | { ok: true; data: ServiceDetailResponse }
  | { ok: false; error: string };

export async function refreshServiceInfoAction(
  serviceId: string,
  isAdmin: boolean,
): Promise<RefreshServiceInfoResult> {
  const path = isAdmin
    ? `/admin/services/${serviceId}/refresh`
    : `/services/${serviceId}/refresh`;
  try {
    const data = await serverFetch<ServiceDetailResponse>(path, {
      method: 'POST',
      body: {},
    });
    if (isAdmin) {
      revalidatePath(`/admin/services/${serviceId}`);
    } else {
      revalidatePath(`/dashboard/services/${serviceId}`);
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron actualizar las métricas.',
    };
  }
}

/* ═══════════════════════════════════════
   Sprint 15C.II Fase C (UI_SPEC §4.13 + ADR-083 Amendment A4.3) —
   reprovision admin desde drift banner

   Materializa el botón "Re-aprovisionar ahora" del `<AdminDriftBanner>`
   cuando el admin necesita re-crear el service en el proveedor (caso
   `not_yet_provisioned`: metadata externa perdida o servicio nunca
   creado realmente). El backend endpoint
   `POST /admin/services/:id/reprovision` existe desde Sprint 11 Fase D
   (`AdminProvisioningController.reprovision` → `provisioning.reprovisionAsAdmin`):
   enqueue + audit `service.reprovision_requested` + access_log
   `service_reprovision_admin`.

   La cola provisioning consume el job en segundos. El admin verá el
   nuevo estado al refrescar la página o al pulsar el ↻ del MetricsBar.
   ═══════════════════════════════════════ */

export type ReprovisionServiceResult =
  | { ok: true }
  | { ok: false; error: string };

export async function reprovisionServiceAction(
  serviceId: string,
): Promise<ReprovisionServiceResult> {
  try {
    await serverFetch<unknown>(`/admin/services/${serviceId}/reprovision`, {
      method: 'POST',
      body: {},
    });
    revalidatePath(`/admin/services/${serviceId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo enqueuear la re-aprovisión.',
    };
  }
}

/* ═══════════════════════════════════════
   Sprint 15C.II Fase E (GAP-15CII-J) — cancelar / desprovisionar servicio (admin)

   Materializa el botón "Cancelar servicio…" del `<AdminServiceOperationsCard>`.
   El backend endpoint `POST /admin/services/:id/deprovision` existe desde
   Sprint 11 Fase D (`AdminProvisioningController.deprovision` →
   `provisioning.deprovisionAsAdmin`): marca status `cancelled` + audit +
   emite `service.cancelled`. Sprint 15C.II Fase E añade el flag `notify_client`
   (toggle del modal, default ON) que el listener `notifications-on-service-cancelled`
   consume para enviar email + campana al cliente.

   Distinto de suspender: cancelar es FINAL e irreversible (el recurso se
   elimina en el proveedor vía `plugin.deprovision()`). Suspender (Fase F)
   es reversible. Tras OK el SC parent re-renderiza con el banner terminal
   `service.terminal.cancelled.admin`.
   ═══════════════════════════════════════ */

export type DeprovisionServiceReason = 'cancelled' | 'expired' | 'admin_override';

export type DeprovisionServiceResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deprovisionServiceAction(
  serviceId: string,
  payload: {
    reason: DeprovisionServiceReason;
    notes?: string;
    notify_client?: boolean;
  },
): Promise<DeprovisionServiceResult> {
  try {
    await serverFetch<unknown>(`/admin/services/${serviceId}/deprovision`, {
      method: 'POST',
      body: {
        reason: payload.reason,
        ...(payload.notes ? { notes: payload.notes } : {}),
        ...(payload.notify_client === false ? { notify_client: false } : {}),
      },
    });
    revalidatePath(`/admin/services/${serviceId}`);
    revalidatePath('/admin/services');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cancelar el servicio.',
    };
  }
}

/* ═══════════════════════════════════════
   Sprint 15C.II Fase F (ADR-077 Amendment A4) — suspender / reactivar servicio (admin)

   Materializa los botones "Suspender servicio…" / "Reanudar servicio" del
   `<AdminServiceOperationsCard>`. Endpoints `POST /admin/services/:id/suspend`
   (DTO `{reason, internal_note?, notify_client?}`) y `/unsuspend` (sin DTO).
   El backend `ProvisioningService.suspendAsAdmin`/`unsuspendAsAdmin` transiciona
   `services.status` (active ⇄ suspended), invoca la inline action canónica del
   plugin, invalida cache, emite `service.suspended`/`service.unsuspended` (→
   listeners email cliente) y audita.

   Distinto de cancelar (irreversible — `deprovisionServiceAction`): suspender
   preserva los datos en el proveedor. Por eso el modal usa variant `warning`
   (no `danger`) y NO exige typing-confirm (L17). Tras OK el SC parent
   re-renderiza con el banner amarillo "Servicio suspendido" / sin banner.
   ═══════════════════════════════════════ */

export type SuspendServiceReason =
  | 'overdue_payment'
  | 'abuse_investigation'
  | 'scheduled_maintenance'
  | 'gdpr_restriction'
  | 'other';

export type SuspendServiceResult = { ok: true } | { ok: false; error: string };

export async function suspendServiceAction(
  serviceId: string,
  payload: {
    reason: SuspendServiceReason;
    internal_note?: string;
    notify_client?: boolean;
  },
): Promise<SuspendServiceResult> {
  try {
    await serverFetch<unknown>(`/admin/services/${serviceId}/suspend`, {
      method: 'POST',
      body: {
        reason: payload.reason,
        ...(payload.internal_note
          ? { internal_note: payload.internal_note }
          : {}),
        ...(payload.notify_client === false ? { notify_client: false } : {}),
      },
    });
    revalidatePath(`/admin/services/${serviceId}`);
    revalidatePath('/admin/services');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo suspender el servicio.',
    };
  }
}

export async function unsuspendServiceAction(
  serviceId: string,
  payload: { internal_note: string },
): Promise<SuspendServiceResult> {
  try {
    await serverFetch<unknown>(`/admin/services/${serviceId}/unsuspend`, {
      method: 'POST',
      // Sprint 15C.II F.6 — R1 (`UnsuspendServiceDto`): el body lleva la
      // nota interna obligatoria del modal admin. El backend valida R2:
      // si el actor es admin (garantizado por JWT en este endpoint),
      // `internal_note` no puede estar vacío. El path auto-reactivar al
      // pagar NO pasa por este action — vive en el listener backend.
      body: { internal_note: payload.internal_note },
    });
    revalidatePath(`/admin/services/${serviceId}`);
    revalidatePath('/admin/services');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo reactivar el servicio.',
    };
  }
}

/* ═══════════════════════════════════════
   Sprint 15C.II Fase F.4.3 — realinear el estado de suspensión del proveedor

   Materializa el botón "Realinear estado del proveedor" del
   `<AdminProviderStateDesyncBanner>` (se muestra cuando
   `service.provider_state_desync === true`, ver `getInfoForUser` F.4.1).
   Endpoint `POST /admin/services/:id/resync-provider-state` →
   `ProvisioningService.resyncProviderStateAsAdmin`: re-aplica la inline
   action canónica `suspend_service` / `unsuspend_service` del plugin para
   que el proveedor coincida con `services.status` — SIN transición de
   lifecycle, sin escribir la BD, sin emitir `service.suspended`/`unsuspended`.
   Idempotente. Tras OK el SC parent re-renderiza sin el banner de desync.
   ═══════════════════════════════════════ */

export type ResyncProviderStateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resyncProviderStateAction(
  serviceId: string,
): Promise<ResyncProviderStateResult> {
  try {
    await serverFetch<unknown>(
      `/admin/services/${serviceId}/resync-provider-state`,
      { method: 'POST', body: {} },
    );
    revalidatePath(`/admin/services/${serviceId}`);
    revalidatePath('/admin/services');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo realinear el estado del proveedor.',
    };
  }
}
