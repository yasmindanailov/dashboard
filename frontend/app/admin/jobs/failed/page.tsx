import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { FailedJobsListResponse, FailedJobItem } from '../../../lib/api';
import {
  FailedJobsFilters,
  FailedJobsPagination,
  RetryButton,
} from './_components';

/* ═══════════════════════════════════════
   /admin/jobs/failed — Sprint 13 §13.AUTH Fase E (Modelo A).
   Server Component nativo. Filtros + paginación via searchParams.
   Mutación (retry) via Server Action `retryJobAction`.
   ═══════════════════════════════════════ */

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<string, string> = {
  failed: 'Fallido',
  retrying: 'Reintentando',
  resolved: 'Resuelto',
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function JobsFailedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const queue = singleParam(params.queue);
  const status = singleParam(params.status);
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);

  const query = new URLSearchParams();
  if (queue) query.set('queue', queue);
  if (status) query.set('status', status);
  query.set('page', String(page));
  query.set('limit', String(PAGE_SIZE));

  let items: FailedJobItem[] = [];
  let total = 0;
  let error: string | null = null;
  try {
    const res = await serverFetch<FailedJobsListResponse>(
      `/admin/jobs/failed?${query.toString()}`,
    );
    items = res.data;
    total = res.meta.total;
  } catch (err) {
    error =
      err instanceof ServerFetchError ? err.message : 'Error al cargar la DLQ';
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Jobs en DLQ</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          Jobs BullMQ que agotaron sus reintentos. {total} entrada{total === 1 ? '' : 's'}.
        </p>
      </header>

      <FailedJobsFilters queue={queue} status={status} />

      {error && (
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
          {error}
        </div>
      )}

      {items.length === 0 && !error ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          Sin jobs fallidos. Todo va bien.
        </p>
      ) : items.length > 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--surface-secondary)' }}>
              <tr>
                <th style={cellHead}>Fecha</th>
                <th style={cellHead}>Cola</th>
                <th style={cellHead}>Job</th>
                <th style={cellHead}>Intentos</th>
                <th style={cellHead}>Último error</th>
                <th style={cellHead}>Estado</th>
                <th style={cellHead}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={cell}>
                    {new Date(item.created_at).toLocaleString('es-ES')}
                  </td>
                  <td style={cell}>
                    <code style={{ fontSize: 12 }}>{item.queue}</code>
                  </td>
                  <td style={cell}>
                    <code style={{ fontSize: 12 }}>{item.name}</code>
                  </td>
                  <td style={cell}>{item.attempts_made}</td>
                  <td
                    style={{
                      ...cell,
                      maxWidth: 360,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item.last_error}
                  >
                    {item.last_error}
                  </td>
                  <td style={cell}>
                    <span style={statusStyle(item.status)}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </td>
                  <td style={cell}>
                    {item.status === 'failed' && <RetryButton id={item.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <FailedJobsPagination page={page} totalPages={totalPages} />
    </div>
  );
}

const cellHead: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 0.04,
};

const cell: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: 'var(--text-primary)',
};

function statusStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    failed: '#DC2626',
    retrying: '#D97706',
    resolved: '#059669',
  };
  return {
    fontWeight: 600,
    color: colors[status] || 'var(--text-secondary)',
    fontSize: 12,
  };
}
