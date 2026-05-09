/**
 * /admin/products/new — Sprint 13 §13.AUTH Fase E (Modelo A) +
 * Sprint 15C Fase 15C.E.2 (ADR-080 Amendment B).
 *
 * Server Component. Prefetch de la lista de plugins disponibles
 * (`GET /admin/plugins`) para alimentar el Select de provisioner +
 * el sub-form dinámico `provisioner_config` via `@rjsf/core`.
 * Lógica del form vive en `_components/NewProductForm.tsx` (CC).
 * ADR-078 Amendment A1.
 */

import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { AdminPluginListItem } from '../../../lib/api';
import NewProductForm from './_components/NewProductForm';

export default async function NewProductPage() {
  // Si la llamada falla (p.ej. backend caído o admin sin permiso),
  // degradamos a lista vacía: el form se renderiza con un Select que
  // sólo expone `manual` por fallback. Mejor que crashear la página
  // entera y dejar al admin sin poder crear productos triviales.
  let plugins: readonly AdminPluginListItem[] = [];
  try {
    plugins = await serverFetch<AdminPluginListItem[]>('/admin/plugins');
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  return <NewProductForm initialPlugins={plugins} />;
}
