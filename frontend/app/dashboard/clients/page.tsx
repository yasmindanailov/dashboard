'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { clientsApi } from '../../lib/api';

interface Client {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  client_profile: {
    client_type: string;
    phone: string | null;
    company_name: string | null;
  } | null;
}

interface PaginatedResponse {
  data: Client[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Activo', color: '#16A34A', bg: '#DCFCE7' },
  pending_verification: { label: 'Pendiente', color: '#CA8A04', bg: '#FEF9C3' },
  blocked: { label: 'Bloqueado', color: '#DC2626', bg: '#FEF2F2' },
  inactive: { label: 'Inactivo', color: '#6B7280', bg: '#F3F4F6' },
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadClients = useCallback(async (page = 1) => {
    setLoading(true);
    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
      const res = await clientsApi.list(token, {
        page,
        limit: 20,
        search: debouncedSearch || undefined,
      }) as PaginatedResponse;
      setClients(res.data);
      setMeta(res.meta);
    } catch {
      // Error handled by API interceptor
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadClients(1);
  }, [loadClients]);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Clientes
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {meta.total} cliente{meta.total !== 1 ? 's' : ''} registrado{meta.total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth="1.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg outline-none transition-all duration-200"
            style={{
              border: '1px solid var(--border)',
              background: 'var(--surface-primary)',
              color: 'var(--text-primary)',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin h-6 w-6" style={{ color: 'var(--brand)' }} viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" className="mx-auto mb-4">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {debouncedSearch ? 'No se encontraron clientes con esa búsqueda' : 'No hay clientes registrados'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--text-tertiary)' }}>Cliente</th>
                <th className="text-left px-5 py-3 font-medium hidden md:table-cell" style={{ color: 'var(--text-tertiary)' }}>Email</th>
                <th className="text-left px-5 py-3 font-medium hidden lg:table-cell" style={{ color: 'var(--text-tertiary)' }}>Tipo</th>
                <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--text-tertiary)' }}>Estado</th>
                <th className="text-left px-5 py-3 font-medium hidden lg:table-cell" style={{ color: 'var(--text-tertiary)' }}>Registro</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const statusInfo = STATUS_LABELS[client.status] || STATUS_LABELS.inactive;
                return (
                  <tr
                    key={client.id}
                    className="transition-colors duration-150 cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-secondary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                          style={{ background: 'var(--brand)' }}
                        >
                          {client.first_name[0]}{client.last_name[0]}
                        </div>
                        <div>
                          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {client.first_name} {client.last_name}
                          </div>
                          {client.client_profile?.company_name && (
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {client.client_profile.company_name}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>
                      {client.email}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>
                      {client.client_profile?.client_type === 'company' ? 'Empresa' : 'Particular'}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ background: statusInfo.bg, color: statusInfo.color }}
                      >
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(client.created_at).toLocaleDateString('es-ES')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Página {meta.page} de {meta.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => loadClients(meta.page - 1)}
                disabled={meta.page <= 1}
                className="px-3 py-1.5 text-xs rounded-md transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                Anterior
              </button>
              <button
                onClick={() => loadClients(meta.page + 1)}
                disabled={meta.page >= meta.totalPages}
                className="px-3 py-1.5 text-xs rounded-md transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
