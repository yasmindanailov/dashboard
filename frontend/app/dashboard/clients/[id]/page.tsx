'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { clientsApi } from '../../../lib/api';

interface ClientDetail {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  email_verified_at: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  two_factor_enabled: boolean;
  language: string;
  timezone: string;
  created_at: string;
  role: { slug: string; name: string };
  client_profile: {
    id: string;
    client_type: string;
    company_name: string | null;
    tax_id: string | null;
    phone: string | null;
    address_line1: string | null;
    city: string | null;
    postal_code: string | null;
    country: string;
    billing_email: string | null;
    notes_internal: string | null;
    credit_balance: string;
  } | null;
  billing_profiles: BillingProfile[];
}

interface BillingProfile {
  id: string;
  type: string;
  label: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  nif_cif: string | null;
  address_line1: string;
  city: string;
  postal_code: string;
  country: string;
  is_default: boolean;
  created_at: string;
}

type Tab = 'resumen' | 'facturacion' | 'notas';

const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'facturacion', label: 'Facturación' },
  { key: 'notas', label: 'Notas internas' },
];

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('resumen');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    clientsApi.get(token, id)
      .then((data) => setClient(data as ClientDetail))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const token = localStorage.getItem('access_token');
    if (!token) return;

    setSavingNote(true);
    try {
      await clientsApi.addNote(token, id, noteText);
      // Reload client data
      const data = await clientsApi.get(token, id) as ClientDetail;
      setClient(data);
      setNoteText('');
    } catch { /* handled */ }
    finally { setSavingNote(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-6 w-6" style={{ color: 'var(--brand)' }} viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-20">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cliente no encontrado</p>
        <Link href="/dashboard/clients" className="text-sm font-medium mt-2 inline-block" style={{ color: 'var(--brand)' }}>
          ← Volver a clientes
        </Link>
      </div>
    );
  }

  const statusColor = client.status === 'active' ? '#16A34A' : client.status === 'pending_verification' ? '#CA8A04' : '#6B7280';

  return (
    <div className="max-w-5xl">
      {/* Back link */}
      <Link
        href="/dashboard/clients"
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors duration-200"
        style={{ color: 'var(--text-secondary)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Clientes
      </Link>

      {/* Client header */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold text-white shrink-0"
            style={{ background: 'var(--brand)' }}
          >
            {client.first_name[0]}{client.last_name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {client.first_name} {client.last_name}
              </h1>
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: statusColor + '15', color: statusColor }}
              >
                {client.status === 'active' ? 'Activo' : client.status === 'pending_verification' ? 'Pendiente' : client.status}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm flex-wrap" style={{ color: 'var(--text-secondary)' }}>
              <span>{client.email}</span>
              {client.client_profile?.phone && <span>📞 {client.client_profile.phone}</span>}
              {client.client_profile?.company_name && <span>🏢 {client.client_profile.company_name}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2.5 text-sm font-medium transition-colors duration-200 whitespace-nowrap cursor-pointer"
            style={{
              color: tab === key ? 'var(--brand)' : 'var(--text-secondary)',
              borderBottom: tab === key ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'resumen' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Account info */}
          <div
            className="rounded-xl p-6"
            style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Cuenta</h2>
            <div className="space-y-3 text-sm">
              <InfoRow label="Email" value={client.email} />
              <InfoRow label="Verificado" value={client.email_verified_at ? new Date(client.email_verified_at).toLocaleDateString('es-ES') : 'No'} />
              <InfoRow label="2FA" value={client.two_factor_enabled ? 'Activado' : 'Desactivado'} />
              <InfoRow label="Último acceso" value={client.last_login_at ? new Date(client.last_login_at).toLocaleString('es-ES') : 'Nunca'} />
              <InfoRow label="IP último login" value={client.last_login_ip || '—'} />
              <InfoRow label="Registrado" value={new Date(client.created_at).toLocaleDateString('es-ES')} />
            </div>
          </div>

          {/* Profile info */}
          <div
            className="rounded-xl p-6"
            style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Perfil</h2>
            <div className="space-y-3 text-sm">
              <InfoRow label="Tipo" value={client.client_profile?.client_type === 'company' ? 'Empresa' : 'Particular'} />
              <InfoRow label="Teléfono" value={client.client_profile?.phone || '—'} />
              <InfoRow label="NIF/CIF" value={client.client_profile?.tax_id || '—'} />
              <InfoRow label="Dirección" value={client.client_profile?.address_line1 || '—'} />
              <InfoRow label="Ciudad" value={client.client_profile?.city || '—'} />
              <InfoRow label="CP" value={client.client_profile?.postal_code || '—'} />
              <InfoRow label="País" value={client.client_profile?.country || 'ES'} />
              <InfoRow label="Saldo" value={`${client.client_profile?.credit_balance || '0.00'} €`} />
            </div>
          </div>
        </div>
      )}

      {tab === 'facturacion' && (
        <div
          className="rounded-xl p-6"
          style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Perfiles de facturación
            </h2>
          </div>

          {client.billing_profiles.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
              No hay perfiles de facturación. Se crearán cuando el cliente vaya a pagar.
            </p>
          ) : (
            <div className="space-y-3">
              {client.billing_profiles.map((bp) => (
                <div
                  key={bp.id}
                  className="p-4 rounded-lg"
                  style={{ background: 'var(--surface-secondary)', border: bp.is_default ? '1px solid var(--brand)' : '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{bp.label}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
                    >
                      {bp.type}
                    </span>
                    {bp.is_default && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#DCFCE7', color: '#16A34A' }}>
                        Predeterminado
                      </span>
                    )}
                  </div>
                  <div className="text-xs space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {(bp.first_name || bp.company_name) && (
                      <p>{bp.company_name || `${bp.first_name} ${bp.last_name}`}</p>
                    )}
                    {bp.nif_cif && <p>NIF/CIF: {bp.nif_cif}</p>}
                    <p>{bp.address_line1}, {bp.postal_code} {bp.city}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'notas' && (
        <div
          className="rounded-xl p-6"
          style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Notas internas</h2>

          {/* Add note */}
          <div className="mb-6">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Añadir nota interna..."
              rows={3}
              className="w-full px-4 py-3 text-sm rounded-lg outline-none transition-all duration-200 resize-none"
              style={{ border: '1px solid var(--border)', background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />
            <button
              onClick={handleAddNote}
              disabled={!noteText.trim() || savingNote}
              className="mt-2 px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              style={{ background: 'var(--brand)' }}
            >
              {savingNote ? 'Guardando...' : 'Añadir nota'}
            </button>
          </div>

          {/* Notes display */}
          {client.client_profile?.notes_internal ? (
            <div className="space-y-4">
              {client.client_profile.notes_internal.split('\n\n---\n\n').map((note, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg text-sm whitespace-pre-wrap"
                  style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}
                >
                  {note}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
              No hay notas internas
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
