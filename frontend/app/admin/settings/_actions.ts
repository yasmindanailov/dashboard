'use server';

import { revalidatePath } from 'next/cache';

import {
  serverFetch,
  ServerFetchError,
  readAccessToken,
} from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/settings (Sprint 12, ADR-044).

   Editar settings de negocio (PATCH por (category,key)) + subir el logo de
   marca (multipart). Mismo modelo de auth httpOnly (ADR-078) que el resto:
   `serverFetch` adjunta el Bearer en JSON; para el multipart del logo se usa
   `fetch` directo con `readAccessToken` (serverFetch sólo maneja JSON).
   ═══════════════════════════════════════ */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001/api/v1';

export interface SettingChange {
  category: string;
  key: string;
  value: unknown;
}

export type SaveSettingsResult =
  | { ok: true }
  | { ok: false; error: string; failedKey?: string };

/**
 * Guarda una tanda de cambios de settings (un PATCH por (category,key)). Si uno
 * falla, se detiene y reporta cuál — los anteriores ya quedaron persistidos
 * (cada setting es independiente). El backend valida contra el catálogo.
 */
export async function saveSettingsAction(
  changes: SettingChange[],
): Promise<SaveSettingsResult> {
  for (const change of changes) {
    try {
      await serverFetch(
        `/admin/settings/${change.category}/${change.key}`,
        { method: 'PATCH', body: { value: change.value } },
      );
    } catch (err) {
      const error =
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo guardar la configuración.';
      return { ok: false, error, failedKey: `${change.category}.${change.key}` };
    }
  }
  revalidatePath('/admin/settings');
  return { ok: true };
}

export type UploadLogoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Sube el logo de marca (multipart) a `POST /admin/settings/branding/logo`.
 * Usa `fetch` directo (no `serverFetch`) para no forzar `Content-Type: json`
 * y dejar que el runtime ponga el boundary multipart.
 */
export async function uploadLogoAction(
  formData: FormData,
): Promise<UploadLogoResult> {
  const token = await readAccessToken();
  if (!token) return { ok: false, error: 'No autenticado.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No se seleccionó ningún archivo.' };
  }

  const upload = new FormData();
  upload.append('file', file);

  try {
    const res = await fetch(`${BACKEND_URL}/admin/settings/branding/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: upload,
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text();
      let message = 'No se pudo subir el logo.';
      try {
        const body = text ? (JSON.parse(text) as { message?: unknown }) : {};
        if (Array.isArray(body.message)) message = body.message.join(', ');
        else if (typeof body.message === 'string') message = body.message;
      } catch {
        /* respuesta no-JSON → mensaje genérico */
      }
      return { ok: false, error: message };
    }
    const data = (await res.json()) as { url: string };
    revalidatePath('/admin/settings');
    return { ok: true, url: data.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red.',
    };
  }
}
