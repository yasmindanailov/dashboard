import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { AuditAccessListResponse, AuditAccessItem } from '../../lib/api';
import ExportDataButton from './_components/ExportDataButton';

interface SubprocessorEntry {
  name: string;
  purpose: string;
  location: string;
  dpa_url: string;
}

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

  // Subprocesadores (fail-soft: si no cargan, no rompemos el resto del portal).
  let subprocessors: SubprocessorEntry[] = [];
  try {
    const res = await serverFetch<{ subprocessors: SubprocessorEntry[] }>(
      '/account/transparency',
    );
    subprocessors = res.subprocessors;
  } catch {
    subprocessors = [];
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Transparencia
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
          Aquí puedes ver qué hacemos con tus datos, quién accede a ellos y
          ejercer tus derechos. Conservamos los registros conforme al RGPD.
        </p>
      </header>

      {/* ── Mis datos (portabilidad RGPD) — H3b.1 ── */}
      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Mis datos</h2>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 14,
            margin: '8px 0 16px',
          }}
        >
          Descarga una copia de todos los datos personales que Aelium tiene sobre
          ti (perfil, facturación, servicios, soporte y registros de acceso) en
          formato JSON.
        </p>
        <ExportDataButton />
      </section>

      {/* ── Subprocesadores ── */}
      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          ¿Con quién compartimos tus datos?
        </h2>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 14,
            margin: '8px 0 16px',
          }}
        >
          Estos son los proveedores externos (subprocesadores) que pueden tratar
          tus datos para prestarte el servicio. No vendemos tus datos a terceros.
        </p>
        {subprocessors.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
            No hay subprocesadores configurados.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {subprocessors.map((sp) => (
              <li
                key={sp.name}
                style={{
                  padding: '12px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{sp.name}</div>
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  {sp.purpose} · {sp.location} ·{' '}
                  <a
                    href={sp.dpa_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--primary, #635BFF)' }}
                  >
                    Política de privacidad
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>
        Quién ha accedido a tus datos
      </h2>

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
