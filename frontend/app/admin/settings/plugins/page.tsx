/**
 * /admin/settings/plugins — Sprint 15A Fase I.1 (ADR-080 §7).
 *
 * Server Component nativo (Modelo A — ADR-078). Lista los plugins
 * disponibles con su manifest + estado + circuit state. Las cards
 * son clickables y enlazan a `/admin/settings/plugins/[slug]`.
 *
 * Visibilidad: solo superadmin (Subject.Plugin admin-puro — ADR-080 +
 * ADR-067 patrón). El layout admin redirige otros roles antes de llegar
 * aquí; el backend además rechaza con 403.
 */

import type { AdminPluginListItem } from '../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import { PluginCard } from '../../../_shared/plugins/PluginCard';

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

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Plugins de provisioning
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 14,
            marginTop: 4,
          }}
        >
          {items.length} plugin{items.length === 1 ? '' : 's'} disponible
          {items.length === 1 ? '' : 's'}. Habilita, configura o prueba la
          conexión de cada plugin desde su detalle. Los secretos se cifran
          con AES-256-GCM antes de persistirse (ADR-080 §3).
        </p>
      </header>

      {listError && (
        <div
          style={{
            padding: 12,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            color: '#991B1B',
            marginBottom: 16,
          }}
        >
          {listError}
        </div>
      )}

      {!listError && items.length === 0 && (
        <div
          style={{
            padding: 24,
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-secondary)',
            fontSize: 14,
          }}
        >
          No hay plugins disponibles. Si esperabas ver alguno, verifica los
          logs del boot (los plugins que fallan contract validation no
          aparecen aquí).
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        {items.map((item) => (
          <PluginCard key={item.slug} item={item} />
        ))}
      </div>
    </div>
  );
}
