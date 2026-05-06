'use server';

import { revalidatePath } from 'next/cache';

import type {
  AdminPluginTestConnectionResponse,
  AdminPluginUpdateBody,
  AdminPluginUpdateResponse,
} from '../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/settings/plugins.
   Sprint 15A Fase H.2 (Modelo A cookies httpOnly — ADR-078).

   Las 3 actions canónicas: update (edita config/secrets/enabled),
   toggle (atajo enabled-only, idempotente), testConnection (lectura
   sin persistir). Todas via `serverFetch` que adjunta cookies httpOnly
   Aelium Auth automáticamente.

   Convención de result: shape `{ ok: true, ... } | { ok: false, error }`
   coherente con `updateTemplateAction` (Sprint 13 §13.AUTH Fase E).
   ═══════════════════════════════════════ */

export type PluginUpdateResult =
  | { ok: true; data: AdminPluginUpdateResponse }
  | { ok: false; error: string; code?: string };

/**
 * Edita config / secrets / enabled de un plugin.
 *
 * El backend valida config + secrets contra `manifest.configSchema` /
 * `manifest.secretsSchema` con Ajv (Sprint 15A Fase G). En errores 400
 * con code `INVALID_PLUGIN_CONFIG` o `INVALID_PLUGIN_SECRETS`, el
 * `error` contiene el primer detail.message para que el form lo muestre
 * inline; el `code` permite que el cliente lo distinga si necesita.
 */
export async function updatePluginAction(
  slug: string,
  body: AdminPluginUpdateBody,
): Promise<PluginUpdateResult> {
  try {
    const data = await serverFetch<AdminPluginUpdateResponse>(
      `/admin/plugins/${slug}`,
      { method: 'PATCH', body: body as Record<string, unknown> },
    );
    revalidatePath('/admin/settings/plugins');
    revalidatePath(`/admin/settings/plugins/${slug}`);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      return {
        ok: false,
        error: err.message,
        code: extractAjvCode(err),
      };
    }
    return { ok: false, error: 'No se pudo actualizar el plugin.' };
  }
}

/**
 * Atajo idempotente para habilitar/deshabilitar sin tocar config/secrets.
 * Equivalente a `updatePluginAction(slug, { enabled })` pero la firma
 * concisa simplifica los toggles inline en cards/lista.
 */
export async function togglePluginAction(
  slug: string,
  enabled: boolean,
): Promise<PluginUpdateResult> {
  return updatePluginAction(slug, { enabled });
}

export type PluginTestConnectionResult =
  | { ok: true; data: AdminPluginTestConnectionResponse }
  | { ok: false; error: string };

/**
 * Invoca el test-connection del plugin (`POST /admin/plugins/:slug/test-connection`).
 * NO revalida path — es lectura pura; el resultado se muestra inline en el
 * componente del form sin cambiar el estado persistido.
 */
export async function testConnectionAction(
  slug: string,
): Promise<PluginTestConnectionResult> {
  try {
    const data = await serverFetch<AdminPluginTestConnectionResponse>(
      `/admin/plugins/${slug}/test-connection`,
      { method: 'POST', body: {} },
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo probar la conexión.',
    };
  }
}

/**
 * Extrae el code semántico (`INVALID_PLUGIN_CONFIG` / `INVALID_PLUGIN_SECRETS`)
 * del error si el backend lo expuso en el body 400. Otros errores devuelven
 * `undefined` y el caller usa solo `error.message`.
 */
function extractAjvCode(err: ServerFetchError): string | undefined {
  const body = err.body as { code?: unknown } | undefined;
  if (body && typeof body === 'object' && typeof body.code === 'string') {
    return body.code;
  }
  return undefined;
}
