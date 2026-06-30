/**
 * AdminPluginsListLayout — Sprint 15C.II Fase F.12 (layout canónico, UI_SPEC §5.18).
 *
 * Shell presentacional de la lista de plugins (`/admin/settings/plugins`):
 * PageHeader + estados (error / empty) + grid de `<PluginCard>`. El page es un
 * wrapper fino que fetcha `GET /admin/plugins` y delega aquí (patrón canónico
 * "page fetcha + delega a layout", consistente con `<ServiceDetailLayout>`).
 *
 * **Cero cambio funcional** (F.12.2): JSX portado literal del `page.tsx` previo.
 * Sin registry (R3 no aplica — 3 estados mutuamente excluyentes + grid uniforme).
 * Server-component compatible.
 */
import type { AdminPluginListItem } from '../../lib/api';
import { PluginCard } from './PluginCard';

interface AdminPluginsListLayoutProps {
  items: AdminPluginListItem[];
  listError: string | null;
}

export function AdminPluginsListLayout({
  items,
  listError,
}: AdminPluginsListLayoutProps) {
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Plugins</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          {items.length} plugin{items.length === 1 ? '' : 's'} disponible
          {items.length === 1 ? '' : 's'} (provisioning + IA). Habilita,
          configura o prueba la conexión de cada plugin desde su detalle. Los
          secretos se cifran con AES-256-GCM antes de persistirse (ADR-080 §3).
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
          No hay plugins disponibles. Si esperabas ver alguno, verifica los logs
          del boot (los plugins que fallan contract validation no aparecen aquí).
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
