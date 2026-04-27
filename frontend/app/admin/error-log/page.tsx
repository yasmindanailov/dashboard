'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/auth-context';
import { errorLogApi, type ErrorLogItem } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';

/* ═══════════════════════════════════════
   /admin/error-log — Sprint 9 Fase F.
   Lista paginada de errores operativos. Filtros: level, module,
   resolved. Acción: marcar como resuelto.
   ═══════════════════════════════════════ */

const PAGE_SIZE = 50;

export default function ErrorLogPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ErrorLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterResolved, setFilterResolved] = useState<string>('');

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await errorLogApi.list(token, {
        level: filterLevel || undefined,
        resolved:
          filterResolved === ''
            ? undefined
            : filterResolved === 'true'
              ? true
              : false,
        page,
        limit: PAGE_SIZE,
      });
      setItems(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(getErrorMessage(err) || 'Error al cargar el log');
    } finally {
      setLoading(false);
    }
  }, [token, page, filterLevel, filterResolved]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleResolve(id: string) {
    if (!token) return;
    try {
      await errorLogApi.resolve(token, id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err) || 'No se pudo marcar como resuelto');
    }
  }

  if (!user) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Error Log</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          Errores operativos del sistema. {total} entrada{total === 1 ? '' : 's'}.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterLevel}
          onChange={(e) => {
            setFilterLevel(e.target.value);
            setPage(1);
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
          }}
        >
          <option value="">Todos los niveles</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="fatal">fatal</option>
        </select>

        <select
          value={filterResolved}
          onChange={(e) => {
            setFilterResolved(e.target.value);
            setPage(1);
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
          }}
        >
          <option value="">Todos</option>
          <option value="false">Sin resolver</option>
          <option value="true">Resueltos</option>
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
        <p style={{ color: 'var(--text-secondary)' }}>Sin errores registrados.</p>
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
                const resolved =
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
                      {resolved ? (
                        <span style={{ color: '#059669', fontWeight: 600 }}>
                          Resuelto
                        </span>
                      ) : (
                        <span style={{ color: '#DC2626' }}>Abierto</span>
                      )}
                    </td>
                    <td style={cell}>
                      {!resolved && (
                        <button
                          onClick={() => void handleResolve(item.id)}
                          style={btn}
                        >
                          Marcar resuelto
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
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
