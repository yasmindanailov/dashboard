'use server';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /dashboard/transparency (Modelo A).
   audit 2026-06-25 GL-5 / H3b.1 — portabilidad RGPD.
   ═══════════════════════════════════════ */

export type ExportMyDataResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Pide al backend el export JSON de TODOS los datos del usuario (self-scoped
 * por la sesión httpOnly; el backend deriva el userId del JWT). Devuelve el
 * objeto al cliente, que lo materializa como descarga (Blob) — así el token
 * nunca toca el navegador (Modelo A, R17).
 */
export async function exportMyDataAction(): Promise<ExportMyDataResult> {
  try {
    const data = await serverFetch<unknown>('/account/data-export');
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo generar la exportación de datos',
    };
  }
}
