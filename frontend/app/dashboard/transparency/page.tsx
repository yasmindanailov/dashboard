import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { AuditAccessListResponse, AuditAccessItem } from '../../lib/api';

/* ═══════════════════════════════════════
   /dashboard/transparency — Sprint 13 §13.AUTH Fase E (Modelo A).
   Server Component nativo: el `dashboard/layout.tsx` (SC) ya verificó
   sesión; aquí cargamos el access log server-side via `serverFetch`.
   Cero useEffect, cero localStorage. ADR-078 Amendment A1.

   Cumple ADR-017 + ADR-010 RGPD: el cliente ve quién accedió a sus
   datos personales/financieros. El backend filtra por ownership
   server-side (target_user_id = caller.id).
   ═══════════════════════════════════════ */

const PAGE_SIZE = 50;

const ACTION_LABEL: Record<string, string> = {
  read: 'Acceso de lectura',
  download: 'Descarga',
  update: 'Modificación',
  // Sprint 15C Fase 15C.F (ADR-083 §4 decisión 14): apertura del panel
  // del proveedor por un agente Aelium en nombre del cliente. Backend
  // emite `service.admin_sso_impersonation` + listener
  // `audit-on-admin-sso-impersonation` lo persiste con esta `action`.
  admin_sso_impersonation: 'Apertura del panel del proveedor',
};

const RESOURCE_LABEL: Record<string, string> = {
  Invoice: 'Factura',
  Client: 'Tu ficha de cliente',
  BillingProfile: 'Perfil fiscal',
  // Sprint 15C Fase 15C.F: el agente abrió el panel del proveedor de
  // tu servicio (hosting Enhance, Docker, etc.).
  Service: 'Tu servicio',
};

export default async function TransparencyPage() {
  let items: AuditAccessItem[] = [];
  let error: string | null = null;
  try {
    const res = await serverFetch<AuditAccessListResponse>(
      `/audit/access?limit=${PAGE_SIZE}`,
    );
    items = res.data;
  } catch (err) {
    error =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar el portal';
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Transparencia
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
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

      {items.length === 0 && !error ? (
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
                      <code style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {item.ip_address}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
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
