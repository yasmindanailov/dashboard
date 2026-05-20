/**
 * /admin/settings/plugins — Sprint 15A Fase I.1 (ADR-080 §7).
 *
 * Sprint 15C.II Fase F.12 (layout canónico — UI_SPEC §5.18): wrapper fino que
 * fetcha `GET /admin/plugins` y delega en `<AdminPluginsListLayout>` (patrón
 * canónico "page fetcha + delega a layout"). Las cards enlazan a
 * `/admin/settings/plugins/[slug]`.
 *
 * Visibilidad: solo superadmin (Subject.Plugin admin-puro — ADR-080 + ADR-067).
 * El layout admin redirige otros roles antes de llegar aquí; el backend además
 * rechaza con 403.
 */

import type { AdminPluginListItem } from '../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import { AdminPluginsListLayout } from '../../../_shared/plugins/AdminPluginsListLayout';

export default async function AdminPluginsPage() {
  let items: AdminPluginListItem[] = [];
  let listError: string | null = null;
  try {
    items = await serverFetch<AdminPluginListItem[]>('/admin/plugins');
  } catch (err) {
    listError =
      err instanceof ServerFetchError
        ? err.message
        : 'Error al cargar la lista de plugins.';
  }

  return <AdminPluginsListLayout items={items} listError={listError} />;
}
