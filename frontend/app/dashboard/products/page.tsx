'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import { productsApi } from '../../lib/api';

/* ═══════════════════════════════════════
   Type labels
   ═══════════════════════════════════════ */
const TYPE_LABELS: Record<string, string> = {
  hosting_web: 'Hosting Web',
  domain: 'Dominio',
  docker_service: 'Docker Service',
  support_inside: 'Support Inside',
  we_do_it: 'We Do It',
  custom_service: 'Proyecto Custom',
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', label: 'Activo' },
  inactive: { bg: 'rgba(234, 179, 8, 0.1)', color: '#ca8a04', label: 'Inactivo' },
  deprecated: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', label: 'Obsoleto' },
};

interface ProductPricing {
  billing_cycle: string;
  price: string;
  currency: string;
}

interface ProductItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  is_addon: boolean;
  badge_text?: string;
  category?: { name: string } | null;
  pricing: ProductPricing[];
  _count: { services: number };
  created_at: string;
}

interface PaginatedResponse {
  data: ProductItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function ProductsPage() {
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
        page,
        limit: 20,
        search: search || undefined,
        status: filterStatus || undefined,
        type: filterType || undefined,
      }) as PaginatedResponse;
      setProducts(res.data);
      setMeta(res.meta);
    } catch {
      /* handled by global error */
    } finally {
      setLoading(false);
    }
  }, [token, search, filterStatus, filterType]);

  useEffect(() => {
    fetchProducts(1);
  }, [fetchProducts]);

  const handleToggleStatus = async (id: string) => {
    setToggling(id);
    try {
      await productsApi.toggleStatus(token, id);
      await fetchProducts(meta.page);
    } catch { /* */ }
    setToggling(null);
  };

  const formatPrice = (pricing: ProductPricing[]) => {
    if (!pricing.length) return '—';
    const monthly = pricing.find(p => p.billing_cycle === 'monthly');
    const annual = pricing.find(p => p.billing_cycle === 'annual');
    if (monthly) return `${Number(monthly.price).toFixed(2)} €/mes`;
    if (annual) return `${Number(annual.price).toFixed(2)} €/año`;
    return `${Number(pricing[0].price).toFixed(2)} €`;
  };

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Productos
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {meta.total} producto{meta.total !== 1 ? 's' : ''} en el catálogo
          </p>
        </div>
        <Link
          href="/dashboard/products/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all duration-200"
          style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-brand)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-hover)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--brand)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo producto
        </Link>
      </div>

      {/* Filters */}
      <div
        className="rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-3"
        style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}
      >
        {/* Search */}
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-sm cursor-pointer"
          style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', minWidth: '140px' }}
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="deprecated">Obsoleto</option>
        </select>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-sm cursor-pointer"
          style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', minWidth: '160px' }}
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin h-6 w-6" style={{ color: 'var(--brand)' }} viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <svg className="mx-auto mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No hay productos todavía</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div
              className="grid gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 100px' }}
            >
              <span>Producto</span>
              <span>Tipo</span>
              <span>Precio</span>
              <span>Servicios</span>
              <span>Estado</span>
              <span className="text-right">Acciones</span>
            </div>

            {/* Rows */}
            {products.map((product) => {
              const statusStyle = STATUS_STYLES[product.status] || STATUS_STYLES.inactive;
              return (
                <div
                  key={product.id}
                  className="grid gap-4 px-5 py-4 items-center transition-colors duration-150"
                  style={{ borderBottom: '1px solid var(--border)', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 100px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Name + badge */}
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="text-sm font-medium hover:underline flex items-center gap-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {product.name}
                      {product.badge_text && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
                        >
                          {product.badge_text}
                        </span>
                      )}
                      {product.is_addon && (
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#7c3aed' }}
                        >
                          Addon
                        </span>
                      )}
                    </Link>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {product.slug}
                      {product.category && ` · ${product.category.name}`}
                    </p>
                  </div>

                  {/* Type */}
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {TYPE_LABELS[product.type] || product.type}
                  </span>

                  {/* Price */}
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatPrice(product.pricing)}
                  </span>

                  {/* Services count */}
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {product._count.services}
                  </span>

                  {/* Status badge */}
                  <span
                    className="text-xs font-medium px-2 py-1 rounded-full text-center"
                    style={{ background: statusStyle.bg, color: statusStyle.color }}
                  >
                    {statusStyle.label}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggleStatus(product.id)}
                      disabled={toggling === product.id}
                      className="p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      style={{ color: 'var(--text-tertiary)' }}
                      title={product.status === 'active' ? 'Desactivar' : 'Activar'}
                    >
                      {product.status === 'active' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      )}
                    </button>

                    {/* Edit */}
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}
                      title="Editar"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </Link>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Página {meta.page} de {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => fetchProducts(meta.page - 1)}
              disabled={meta.page <= 1}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              Anterior
            </button>
            <button
              onClick={() => fetchProducts(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
