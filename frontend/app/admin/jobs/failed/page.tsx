'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { jobsApi, type FailedJobItem } from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';

/* ═══════════════════════════════════════
   /admin/jobs/failed — Sprint 9 Fase F.
   Lista jobs en DLQ (failed_jobs). Permite reintentar manualmente.
   ═══════════════════════════════════════ */

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<string, string> = {
  failed: 'Fallido',
  retrying: 'Reintentando',
  resolved: 'Resuelto',
};

export default function JobsFailedPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FailedJobItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterQueue, setFilterQueue] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await jobsApi.listFailed(token, {
        queue: filterQueue || undefined,
        status: filterStatus || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setItems(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(getErrorMessage(err) || 'Error al cargar la DLQ');
    } finally {
      setLoading(false);
    }
  }, [token, page, filterQueue, filterStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRetry(id: string) {
    if (!token) return;
    if (!confirm('¿Reencolar este job? Se intentará de nuevo con 5 reintentos.')) return;
    setRetryingId(id);
    try {
      await jobsApi.retry(token, id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err) || 'No se pudo reintentar el job');
    } finally {
      setRetryingId(null);
    }
  }

  if (!user) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Jobs en DLQ</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          Jobs BullMQ que agotaron sus reintentos. {total} entrada{total === 1 ? '' : 's'}.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterQueue}
          onChange={(e) => {
            setFilterQueue(e.target.value);
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">Todas las colas</option>
          <option value="pdf-generation">pdf-generation</option>
          <option value="outbox-dispatch">outbox-dispatch</option>
          <option value="notifications-dispatch">notifications-dispatch</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">Todos los estados</option>
          <option value="failed">Fallido</option>
          <option value="retrying">Reintentando</option>
          <option value="resolved">Resuelto</option>
        </select>
      </div>

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

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          Sin jobs fallidos. Todo va bien.
        </p>
      ) : (
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
                    {item.status === 'failed' && (
                      <button
                        onClick={() => void handleRetry(item.id)}
                        disabled={retryingId === item.id}
                        style={btn}
                      >
                        {retryingId === item.id ? 'Reintentando…' : 'Reintentar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={btn}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Página {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={btn}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
};

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

const btn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
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
