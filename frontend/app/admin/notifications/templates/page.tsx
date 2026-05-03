/**
 * /admin/notifications/templates — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. Lista cargada server-side via serverFetch;
 * filtros (event_type, channel) viajan en searchParams. Editor inline
 * en CC con Server Actions de save/preview. ADR-078 Amendment A1.
 *
 * Sprint 9.5 (ADR-042 + ADR-065): catálogo de plantillas controlado por
 * código (no UI), por eso solo edición — no creación.
 */

import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type {
  NotificationChannel,
  NotificationTemplateItem,
  NotificationTemplatesListResponse,
} from '../../../lib/api';
import TemplatesEditor from './_components/TemplatesEditor';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function NotificationTemplatesAdminPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const eventType = singleParam(params.event_type);
  const channel = singleParam(params.channel);

  const query = new URLSearchParams();
  if (eventType) query.set('event_type', eventType);
  if (channel) query.set('channel', channel);
  query.set('limit', '200');

  let items: NotificationTemplateItem[] = [];
  let listError: string | null = null;
  try {
    const res = await serverFetch<NotificationTemplatesListResponse>(
      `/admin/notifications/templates?${query.toString()}`,
    );
    items = res.data;
  } catch (err) {
    listError =
      err instanceof ServerFetchError
        ? err.message
        : 'Error al cargar plantillas';
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Plantillas de notificaciones
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          {items.length} plantilla{items.length === 1 ? '' : 's'} activa
          {items.length === 1 ? '' : 's'}. El asunto y el cuerpo soportan
          Handlebars (helpers <code>lt</code>/<code>gt</code>/<code>eq</code>).
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

      <TemplatesEditor
        items={items}
        initialFilters={{ eventType, channel: channel as NotificationChannel | '' }}
      />
    </div>
  );
}
