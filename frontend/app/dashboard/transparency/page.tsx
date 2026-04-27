'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/auth-context';
import { auditApi, type AuditAccessItem } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';

/* ═══════════════════════════════════════
   /dashboard/transparency — Portal de transparencia (Sprint 9 Fase E).
   Cumple ADR-017 + ADR-010 RGPD: el cliente ve quién accedió a sus
   datos personales/financieros.

   El backend filtra por ownership server-side (target_user_id =
   caller.id). Esta página NO expone otros usuarios.
   ═══════════════════════════════════════ */

const PAGE_SIZE = 50;

const ACTION_LABEL: Record<string, string> = {
  read: 'Acceso de lectura',
  download: 'Descarga',
  update: 'Modificación',
};

const RESOURCE_LABEL: Record<string, string> = {
  Invoice: 'Factura',
  Client: 'Tu ficha de cliente',
  BillingProfile: 'Perfil fiscal',
};

export default function TransparencyPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<AuditAccessItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await auditApi.myAccessLog(token, { limit: PAGE_SIZE });
      setItems(res.data);
    } catch (err) {
      setError(getErrorMessage(err) || 'No se pudo cargar el portal');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Transparencia
        </h1>
        <p
          style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}
        >
          Aquí puedes ver quién, dentro de Aelium, ha accedido a tus datos.
          Conservamos este registro durante 2 años conforme al RGPD.
        </p>
      </header>

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
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}
        >
          <p style={{ color: 'var(--text-secondary)' }}>
            Nadie ha accedido a tus datos todavía. Cuando un agente de Aelium
            consulte tu información, lo verás aquí.
          </p>
        </div>
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
                <th style={cellHead}>Cuándo</th>
                <th style={cellHead}>Quién</th>
                <th style={cellHead}>Recurso</th>
                <th style={cellHead}>Acción</th>
                <th style={cellHead}>IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const meta = item.metadata as Record<string, unknown> | null;
                const resourceType =
                  (meta?.resource_type as string | undefined) ?? '';
                const resourceLabel =
                  RESOURCE_LABEL[resourceType] ?? resourceType ?? 'Recurso';
                const actorName = item.actor
                  ? [item.actor.first_name, item.actor.last_name]
                      .filter(Boolean)
                      .join(' ') || 'Agente'
                  : 'Agente';
                return (
                  <tr
                    key={item.id}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <td style={cell}>
                      {new Date(item.created_at).toLocaleString('es-ES')}
                    </td>
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{actorName}</div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {item.actor?.role_name ?? '—'}
                      </div>
                    </td>
                    <td style={cell}>{resourceLabel}</td>
                    <td style={cell}>
                      {ACTION_LABEL[item.action] ?? item.action}
                    </td>
                    <td style={cell}>
                      <code
                        style={{
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {item.ip_address}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
