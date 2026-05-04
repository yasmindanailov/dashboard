'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/notifications/templates.
   Sprint 13 §13.AUTH Fase E (Modelo A).
   ═══════════════════════════════════════ */

export type TemplateMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function updateTemplateAction(
  id: string,
  data: { subject?: string; body?: string; active?: boolean },
): Promise<TemplateMutationResult> {
  try {
    const res = await serverFetch<{ id: string }>(
      `/admin/notifications/templates/${id}`,
      { method: 'PATCH', body: data },
    );
    revalidatePath('/admin/notifications/templates');
    return { ok: true, id: res.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo guardar la plantilla',
    };
  }
}

export type PreviewTemplateResult =
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string };

export async function previewTemplateAction(
  id: string,
): Promise<PreviewTemplateResult> {
  try {
    const res = await serverFetch<{ subject: string; body: string }>(
      `/admin/notifications/templates/${id}/preview`,
      { method: 'POST', body: {} },
    );
    return { ok: true, subject: res.subject, body: res.body };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo renderizar el preview',
    };
  }
}
