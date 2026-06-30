'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  BulkActionBar,
  Button,
  FilterBar,
  Pagination,
  SearchInput,
  Select,
  Table,
  Tooltip,
  useToast,
} from '../../../components/ui';
import type { BadgeVariant, TableColumn } from '../../../components/ui';
import { TYPE_LABELS } from '../types';
import type { ProductItem, ProductPricing } from '../types';
import { EditIcon, EyeIcon, EyeOffIcon, PackageIcon } from '../icons';
import { toggleProductStatusAction } from '../_actions';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activo', variant: 'success' },
  inactive: { label: 'Inactivo', variant: 'neutral' },
  deprecated: { label: 'Obsoleto', variant: 'danger' },
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
  const monthly = pricing.find((p) => p.billing_cycle === 'monthly');
  const annual = pricing.find((p) => p.billing_cycle === 'annual');
  if (monthly) return `${Number(monthly.price).toFixed(2)} €/mes`;
  if (annual) return `${Number(annual.price).toFixed(2)} €/año`;
  return `${Number(pricing[0].price).toFixed(2)} €`;
}

const isSupportInside = (p: ProductItem) => p.type === 'support_inside';

interface Props {
  products: ProductItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  initialFilters: { search: string; status: string; type: string };
}

export default function ProductsListView({
  products,
  meta,
  initialFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const [search, setSearch] = useState(initialFilters.search);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  function pushFilters(next: { search?: string; status?: string; type?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const writeOrDelete = (k: string, v: string | undefined) => {
      if (v && v.length > 0) params.set(k, v);
      else params.delete(k);
    };
    if (next.search !== undefined) writeOrDelete('search', next.search);
    if (next.status !== undefined) writeOrDelete('status', next.status);
    if (next.type !== undefined) writeOrDelete('type', next.type);
    params.delete('page');
    startTransition(() => router.push(`/admin/products?${params.toString()}`));
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() => router.push(`/admin/products?${params.toString()}`));
  }

  async function handleToggleStatus(id: string) {
    setToggling(id);
    const result = await toggleProductStatusAction(id);
    if (result.ok) toast('success', 'Estado del producto actualizado.');
    else toast('error', result.error);
    setToggling(null);
  }

  async function handleBulkToggle() {
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      const result = await toggleProductStatusAction(String(id));
      if (result.ok) ok++;
      else fail++;
    }
    if (ok > 0) toast('success', `${ok} producto${ok > 1 ? 's' : ''} actualizado${ok > 1 ? 's' : ''}.`);
    if (fail > 0) toast('error', `${fail} producto${fail > 1 ? 's' : ''} fallaron.`);
    setSelected(new Set());
  }

  const columns: TableColumn<ProductItem>[] = [
    {
      key: 'name',
      header: 'Producto',
      render: (p) => {
        const si = isSupportInside(p);
        const linkHref = si
          ? `/admin/support-inside-plans/${p.slug}`
          : `/admin/products/${p.id}`;
        return (
          <div style={{ opacity: si ? 0.62 : 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Link
                href={linkHref}
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 'var(--font-weight-medium)',
                  fontSize: 'var(--font-size-sm)',
                  textDecoration: 'none',
                }}
              >
                {p.name}
              </Link>
              {p.badge_text && <Badge variant="brand">{p.badge_text}</Badge>}
              {si ? (
                <Badge variant="neutral">Tier de cuenta</Badge>
              ) : (
                p.is_addon && <Badge variant="info">Addon</Badge>
              )}
            </div>
            <p
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-tertiary)',
                marginTop: '2px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {p.slug}
              {p.category && ` · ${p.category.name}`}
            </p>
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (p) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {TYPE_LABELS[p.type] || p.type}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Precio',
      render: (p) => (
        <span style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>
          {formatPrice(p.pricing)}
        </span>
      ),
    },
    {
      key: 'services',
      header: 'Servicios',
      align: 'right',
      render: (p) => (
        <span style={{ color: 'var(--text-secondary)' }}>{p._count.services}</span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      width: '100px',
      render: (p) => {
        const s = STATUS_MAP[p.status] || STATUS_MAP.inactive;
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      align: 'right',
      render: (p) => {
        if (isSupportInside(p)) {
          return (
            <Link
              href={`/admin/support-inside-plans/${p.slug}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                color: 'var(--text-secondary)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-medium)',
                textDecoration: 'none',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              Gestionar →
            </Link>
          );
        }
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 'var(--space-1)',
            }}
          >
            <Tooltip content={p.status === 'active' ? 'Desactivar' : 'Activar'}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleToggleStatus(p.id);
                }}
                disabled={toggling === p.id}
                style={{
                  color: 'var(--text-tertiary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                }}
              >
                {p.status === 'active' ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            </Tooltip>
            <Tooltip content="Editar">
              <Link
                href={`/admin/products/${p.id}`}
                style={{
                  color: 'var(--text-tertiary)',
                  padding: '6px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                }}
              >
                <EditIcon />
              </Link>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  const hasFilter = Boolean(
    initialFilters.search || initialFilters.status || initialFilters.type,
  );

  return (
    <>
      <FilterBar
        search={
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => {
              setSearch('');
              pushFilters({ search: '' });
            }}
            onBlur={() => pushFilters({ search })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pushFilters({ search });
            }}
            placeholder="Buscar por nombre o slug..."
          />
        }
        filters={
          <>
            <Select
              value={initialFilters.status}
              onChange={(e) => pushFilters({ status: e.target.value })}
              options={STATUS_OPTIONS}
            />
            <Select
              value={initialFilters.type}
              onChange={(e) => pushFilters({ type: e.target.value })}
              options={TYPE_OPTIONS}
            />
          </>
        }
      />

      <Table<ProductItem>
        card
        columns={columns}
        data={products}
        rowKey={(p) => p.id}
        onRowClick={(p) =>
          isSupportInside(p)
            ? router.push(`/admin/support-inside-plans/${p.slug}`)
            : router.push(`/admin/products/${p.id}`)
        }
        emptyIcon={PackageIcon}
        emptyTitle="Sin productos"
        emptyDescription={
          hasFilter
            ? 'No hay productos que coincidan con esos filtros.'
            : 'No hay productos en el catálogo'
        }
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
      />

      {meta.totalPages > 1 && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={handlePageChange}
        />
      )}

      {selected.size > 0 && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<EyeIcon />}
            onClick={() => void handleBulkToggle()}
          >
            Activar / Desactivar
          </Button>
        </BulkActionBar>
      )}
    </>
  );
}
