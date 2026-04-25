'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { productsApi } from '../../lib/api';
import {
  Table, Badge, SearchInput, Select, Pagination, Button, Tooltip, useToast, BulkActionBar,
  ListPage, FilterBar,
} from '../../components/ui';
import type { TableColumn, BadgeVariant } from '../../components/ui';
import { TYPE_LABELS } from './types';
import type { ProductPricing, ProductItem, PaginatedResponse } from './types';
import { PackageIcon, PlusIcon, EyeIcon, EyeOffIcon, EditIcon } from './icons';

/* ═══════════════════════════════════════
   Products Page — List (UI_SPEC §2.4)
   Layout: ListPage + FilterBar
   No StatusTabs — product status is binary
   (active/inactive), not a workflow (§3.2).
   Ref: ROADMAP.md §7.5.D20, UI_SPEC §5.3
   ═══════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active:     { label: 'Activo',    variant: 'success' },
  inactive:   { label: 'Inactivo',  variant: 'neutral' },
  deprecated: { label: 'Obsoleto',  variant: 'danger' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label })),
];

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

function formatPrice(pricing: ProductPricing[]) {
  if (!pricing.length) return '—';
  const monthly = pricing.find(p => p.billing_cycle === 'monthly');
  const annual = pricing.find(p => p.billing_cycle === 'annual');
  if (monthly) return `${Number(monthly.price).toFixed(2)} €/mes`;
  if (annual) return `${Number(annual.price).toFixed(2)} €/año`;
  return `${Number(pricing[0].price).toFixed(2)} €`;
}

export default function ProductsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  const fetchProducts = useCallback(async (page = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await productsApi.list(token, {
        page, limit: 20,
        search: search || undefined,
        status: filterStatus || undefined,
        type: filterType || undefined,
      }) as PaginatedResponse;
      setProducts(res.data);
      setMeta(res.meta);
    } catch (err) { console.warn('[Products] fetchProducts failed:', err); }
    finally { setLoading(false); }
  }, [token, search, filterStatus, filterType]);

  useEffect(() => { fetchProducts(1); }, [fetchProducts]);

  const { toast } = useToast();

  const handleToggleStatus = async (id: string) => {
    setToggling(id);
    try { await productsApi.toggleStatus(token, id); toast('success', 'Estado del producto actualizado.'); await fetchProducts(meta.page); }
    catch { toast('error', 'No se pudo cambiar el estado.'); }
    setToggling(null);
  };

  /* ── Bulk actions (§4.11) ── */
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const handleBulkToggle = async () => {
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      try { await productsApi.toggleStatus(token, String(id)); ok++; } catch { fail++; }
    }
    if (ok > 0) toast('success', `${ok} producto${ok > 1 ? 's' : ''} actualizado${ok > 1 ? 's' : ''}.`);
    if (fail > 0) toast('error', `${fail} producto${fail > 1 ? 's' : ''} fallaron.`);
    setSelected(new Set());
    fetchProducts(meta.page);
  };

  if (!user) return null;

  /* ── Columns ── */
  const columns: TableColumn<ProductItem>[] = [
    {
      key: 'name', header: 'Producto',
      render: (p) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Link href={`/dashboard/products/${p.id}`}
              style={{ color: 'var(--text-primary)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)', textDecoration: 'none' }}>
              {p.name}
            </Link>
            {p.badge_text && <Badge variant="brand">{p.badge_text}</Badge>}
            {p.is_addon && <Badge variant="info">Addon</Badge>}
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            {p.slug}{p.category && ` · ${p.category.name}`}
          </p>
        </div>
      ),
    },
    {
      key: 'type', header: 'Tipo',
      render: (p) => <span style={{ color: 'var(--text-secondary)' }}>{TYPE_LABELS[p.type] || p.type}</span>,
    },
    {
      key: 'price', header: 'Precio',
      render: (p) => <span style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>{formatPrice(p.pricing)}</span>,
    },
    {
      key: 'services', header: 'Servicios',
      render: (p) => <span style={{ color: 'var(--text-secondary)' }}>{p._count.services}</span>,
    },
    {
      key: 'status', header: 'Estado', width: '100px',
      render: (p) => {
        const s = STATUS_MAP[p.status] || STATUS_MAP.inactive;
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'actions', header: '', width: '80px', align: 'right',
      render: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
          <Tooltip content={p.status === 'active' ? 'Desactivar' : 'Activar'}>
            <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(p.id); }}
              disabled={toggling === p.id}
              style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
              {p.status === 'active' ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </Tooltip>
          <Tooltip content="Editar">
            <Link href={`/dashboard/products/${p.id}`}
              style={{ color: 'var(--text-tertiary)', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
              <EditIcon />
            </Link>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <ListPage
      title="Productos"
      subtitle={`${meta.total} producto${meta.total !== 1 ? 's' : ''} en el catálogo`}
      action={
        <Link href="/dashboard/products/new">
          <Button><PlusIcon /> Nuevo producto</Button>
        </Link>
      }
      wide
      filterBar={
        <FilterBar
          search={
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
              placeholder="Buscar por nombre o slug..."
            />
          }
          filters={
            <>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} options={STATUS_OPTIONS} />
              <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} options={TYPE_OPTIONS} />
            </>
          }
        />
      }
      pagination={
        <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={(p) => fetchProducts(p)} />
      }
    >
      <Table<ProductItem>
        columns={columns} data={products} rowKey={(p) => p.id}
        loading={loading} skeletonRows={8}
        onRowClick={(p) => router.push(`/dashboard/products/${p.id}`)}
        emptyIcon={PackageIcon} emptyTitle="Sin productos"
        emptyDescription="No hay productos en el catálogo"
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
      />

      {/* Bulk action bar (§4.11) */}
      {selected.size > 0 && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button size="sm" variant="secondary" onClick={handleBulkToggle}>Activar/Desactivar</Button>
        </BulkActionBar>
      )}
    </ListPage>
  );
}
