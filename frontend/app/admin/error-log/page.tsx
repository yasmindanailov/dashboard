import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { ErrorLogListResponse, ErrorLogItem } from '../../lib/api';
import {
  ErrorLogFilters,
  PaginationLink,
  ResolveButton,
} from './_components';

/* ═══════════════════════════════════════
   /admin/error-log — Sprint 13 §13.AUTH Fase E (Modelo A).
   Server Component nativo: filtros + paginación viajan por searchParams.
   Mutación (resolver) via Server Action `resolveErrorAction` que invoca
   `revalidatePath`. Cero useEffect+fetch+setState. ADR-078 Amendment A1.
   ═══════════════════════════════════════ */

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function ErrorLogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const level = singleParam(params.level);
  const resolved = singleParam(params.resolved);
  const pageRaw = singleParam(params.page);
  const page = Math.max(1, parseInt(pageRaw, 10) || 1);

  const query = new URLSearchParams();
  if (level) query.set('level', level);
  if (resolved !== '') query.set('resolved', resolved);
  query.set('page', String(page));
  query.set('limit', String(PAGE_SIZE));

  let items: ErrorLogItem[] = [];
  let total = 0;
  let error: string | null = null;
  try {
    const res = await serverFetch<ErrorLogListResponse>(
      `/admin/error-log?${query.toString()}`,
    );
    items = res.data;
    total = res.meta.total;
  } catch (err) {
    error =
      err instanceof ServerFetchError
        ? err.message
        : 'Error al cargar el log';
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Error Log</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          Errores operativos del sistema. {total} entrada{total === 1 ? '' : 's'}.
        </p>
      </header>

      <ErrorLogFilters level={level} resolved={resolved} />

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
        <p style={{ color: 'var(--text-secondary)' }}>Sin errores registrados.</p>
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
                <th style={cellHead}>Nivel</th>
                <th style={cellHead}>Módulo</th>
                <th style={cellHead}>Mensaje</th>
                <th style={cellHead}>Correlation</th>
                <th style={cellHead}>Estado</th>
                <th style={cellHead}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const resolvedFlag =
                  item.metadata && (item.metadata.resolved as boolean | undefined);
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={cell}>
                      {new Date(item.created_at).toLocaleString('es-ES')}
                    </td>
                    <td style={cell}>
                      <span style={levelStyle(item.level)}>{item.level}</span>
                    </td>
                    <td style={cell}>
                      <code style={{ fontSize: 12 }}>{item.module}</code>
                    </td>
                    <td
                      style={{
                        ...cell,
                        maxWidth: 360,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={item.message}
                    >
                      {item.message}
                    </td>
                    <td style={cell}>
                      <code style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {item.correlation_id?.slice(0, 8) ?? '—'}
                      </code>
                    </td>
                    <td style={cell}>
                      {resolvedFlag ? (
                        <span style={{ color: '#059669', fontWeight: 600 }}>
                          Resuelto
                        </span>
                      ) : (
                        <span style={{ color: '#DC2626' }}>Abierto</span>
                      )}
                    </td>
                    <td style={cell}>
                      {!resolvedFlag && <ResolveButton id={item.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <PaginationLink page={page} totalPages={totalPages} />
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

function levelStyle(level: string): React.CSSProperties {
  const map: Record<string, string> = {
    error: '#DC2626',
    warn: '#D97706',
    fatal: '#991B1B',
  };
  return {
    fontWeight: 600,
    color: map[level] || 'var(--text-secondary)',
    textTransform: 'uppercase',
    fontSize: 11,
  };
}
