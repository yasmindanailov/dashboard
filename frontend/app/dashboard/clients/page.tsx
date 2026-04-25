'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clientsApi } from '../../lib/api';
import {
  Table, Badge, SearchInput, Select, Pagination, Avatar,
  BulkActionBar, Button, useToast,
  ListPage, FilterBar,
} from '../../components/ui';
import type { TableColumn, BadgeVariant } from '../../components/ui';

/* ═══════════════════════════════════════
   Clients Page — List (UI_SPEC §2.4)
   Layout: ListPage + FilterBar
   No StatusTabs — client status is not a
   meaningful workflow (§3.2: "estados finitos
   y significativos"). Status goes as Select.
   Ref: ROADMAP.md §7.5.D20, UI_SPEC §5.1
   ═══════════════════════════════════════ */

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

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active:               { label: 'Activo',     variant: 'success' },
  pending_verification: { label: 'Pendiente',  variant: 'warning' },
  blocked:              { label: 'Bloqueado',  variant: 'danger' },
  inactive:             { label: 'Inactivo',   variant: 'neutral' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label })),
];

const UsersIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const { toast } = useToast();

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
        page, limit: 20,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
      }) as PaginatedResponse;
      setClients(res.data);
      setMeta(res.meta);
    } catch (err) { console.warn('[Clients] loadClients failed:', err); }
    finally { setLoading(false); }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => { loadClients(1); }, [loadClients]);

  /* ── Column definitions ── */
  const columns: TableColumn<Client>[] = [
    {
      key: 'name', header: 'Cliente',
      render: (c) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Avatar name={`${c.first_name} ${c.last_name}`} size="md" />
          <div>
            <div style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>
              {c.first_name} {c.last_name}
            </div>
            {c.client_profile?.company_name && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                {c.client_profile.company_name}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'email', header: 'Email',
      render: (c) => <span style={{ color: 'var(--text-secondary)' }}>{c.email}</span>,
    },
    {
      key: 'type', header: 'Tipo',
      render: (c) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {c.client_profile?.client_type === 'company' ? 'Empresa' : 'Particular'}
        </span>
      ),
    },
    {
      key: 'status', header: 'Estado',
      render: (c) => {
        const s = STATUS_MAP[c.status] || STATUS_MAP.inactive;
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'created_at', header: 'Registro',
      render: (c) => (
        <span style={{ color: 'var(--text-tertiary)' }}>
          {new Date(c.created_at).toLocaleDateString('es-ES')}
        </span>
      ),
    },
  ];

  return (
    <ListPage
      title="Clientes"
      subtitle={`${meta.total} cliente${meta.total !== 1 ? 's' : ''} registrado${meta.total !== 1 ? 's' : ''}`}
      filterBar={
        <FilterBar
          search={
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
              placeholder="Buscar por nombre o email..."
            />
          }
          filters={
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_OPTIONS} />
          }
        />
      }
      pagination={
        <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={(p) => loadClients(p)} />
      }
    >
      <Table<Client>
        columns={columns}
        data={clients}
        rowKey={(c) => c.id}
        loading={loading}
        skeletonRows={8}
        onRowClick={(c) => router.push(`/dashboard/clients/${c.id}`)}
        emptyIcon={UsersIcon}
        emptyTitle={debouncedSearch ? 'Sin resultados' : 'No hay clientes'}
        emptyDescription={debouncedSearch ? 'No se encontraron clientes con esa búsqueda' : 'No hay clientes registrados'}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
      />

      {/* Bulk action bar (§4.11) */}
      {selected.size > 0 && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button size="sm" variant="secondary" onClick={() => {
            toast('info', `Exportando ${selected.size} cliente${selected.size > 1 ? 's' : ''}...`);
            setSelected(new Set());
          }}>Exportar</Button>
        </BulkActionBar>
      )}
    </ListPage>
  );
}
