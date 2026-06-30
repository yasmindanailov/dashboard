'use server';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { ResponseTemplate, ResponseTemplateInput } from './types';

/* ═══════════════════════════════════════
   Server Actions — Respuestas guardadas (macros de soporte). F3·E12.

   Biblioteca de EQUIPO: recurso staff-puro bajo `/api/v1/admin/response-templates`
   (el backend impone AdminOnlyGuard + CASL `Manage.ResponseTemplate`). Modelo A
   (ADR-078 A1): cero localStorage — el token viaja en la cookie httpOnly vía
   `serverFetch`.
   ═══════════════════════════════════════ */

const BASE = '/admin/response-templates';

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ServerFetchError ? err.message : fallback;
}

export type ListResponseTemplatesResult =
  | { ok: true; templates: ResponseTemplate[] }
  | { ok: false; error: string };

export async function listResponseTemplatesAction(filter?: {
  category?: string;
  search?: string;
}): Promise<ListResponseTemplatesResult> {
  const query = new URLSearchParams();
  if (filter?.category) query.set('category', filter.category);
  if (filter?.search) query.set('search', filter.search);
  const qs = query.toString();

  try {
    const templates = await serverFetch<ResponseTemplate[]>(
      qs ? `${BASE}?${qs}` : BASE,
    );
    return { ok: true, templates };
  } catch (err) {
    return {
      ok: false,
      error: errMsg(err, 'No se pudieron cargar las respuestas guardadas.'),
    };
  }
}

export type MutateResponseTemplateResult =
  | { ok: true; template: ResponseTemplate }
  | { ok: false; error: string };

export async function createResponseTemplateAction(
  data: ResponseTemplateInput,
): Promise<MutateResponseTemplateResult> {
  try {
    const template = await serverFetch<ResponseTemplate>(BASE, {
      method: 'POST',
      body: data,
    });
    return { ok: true, template };
  } catch (err) {
    return {
      ok: false,
      error: errMsg(err, 'No se pudo crear la respuesta guardada.'),
    };
  }
}

export async function updateResponseTemplateAction(
  id: string,
  data: Partial<ResponseTemplateInput>,
): Promise<MutateResponseTemplateResult> {
  try {
    const template = await serverFetch<ResponseTemplate>(`${BASE}/${id}`, {
      method: 'PATCH',
      body: data,
    });
    return { ok: true, template };
  } catch (err) {
    return {
      ok: false,
      error: errMsg(err, 'No se pudo guardar la respuesta.'),
    };
  }
}

export type DeleteResponseTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteResponseTemplateAction(
  id: string,
): Promise<DeleteResponseTemplateResult> {
  try {
    await serverFetch(`${BASE}/${id}`, { method: 'DELETE' });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: errMsg(err, 'No se pudo borrar la respuesta.'),
    };
  }
}
