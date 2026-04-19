'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { productsApi } from '../../../lib/api';

const TYPE_LABELS: Record<string, string> = {
  hosting_web: 'Hosting Web', domain: 'Dominio', docker_service: 'Docker Service',
  support_inside: 'Support Inside', we_do_it: 'We Do It', custom_service: 'Proyecto Custom',
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: 'rgba(34,197,94,0.1)', color: '#16a34a', label: 'Activo' },
  inactive: { bg: 'rgba(234,179,8,0.1)', color: '#ca8a04', label: 'Inactivo' },
  deprecated: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: 'Obsoleto' },
};

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual', quarterly: 'Trimestral', semiannual: 'Semestral',
  annual: 'Anual', one_time: 'Único',
};

interface Pricing { id: string; billing_cycle: string; price: string; setup_fee: string; currency: string; active: boolean; }
interface Extra { id: string; type: string; label: string; is_mandatory: boolean; active: boolean; }
interface ChecklistItem { id: string; label: string; order_index: number; is_required: boolean; }
interface ProductDetail {
  id: string; name: string; slug: string; type: string; status: string;
  description?: string; short_description?: string; badge_text?: string;
  is_addon: boolean; is_global_addon: boolean; provisioner: string;
  grace_period_days: number; suspension_days: number; cancellation_days: number;
  client_can_pause: boolean; partner_commission_pct?: string;
  category?: { id: string; name: string } | null;
  pricing: Pricing[]; extras: Extra[]; checklist_items: ChecklistItem[];
  _count: { services: number }; created_at: string; updated_at: string;
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    productsApi.get(token, id)
      .then((data) => setProduct(data as ProductDetail))
      .catch(() => router.push('/dashboard/products'))
      .finally(() => setLoading(false));
  }, [token, id, router]);

  const handleToggle = async () => {
    if (!product) return;
    setToggling(true);
    try {
      const res = await productsApi.toggleStatus(token, product.id) as { status: string };
      setProduct({ ...product, status: res.status });
    } catch { /* */ }
    setToggling(false);
  };

  const handleDelete = async () => {
    if (!product || !confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await productsApi.delete(token, product.id);
      router.push('/dashboard/products');
    } catch { setDeleting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin h-6 w-6" style={{ color: 'var(--brand)' }} viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!product) return null;

  const statusStyle = STATUS_STYLES[product.status] || STATUS_STYLES.inactive;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard/products')} className="p-2 rounded-lg cursor-pointer" style={{ color: 'var(--text-tertiary)', background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{product.name}</h1>
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span>
              {product.is_addon && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#7c3aed' }}>Addon</span>}
            </div>
            <p className="text-sm mt-1 font-mono" style={{ color: 'var(--text-tertiary)' }}>{product.slug}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/products/${product.id}/edit`} className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all cursor-pointer" style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-brand)' }}>
            Editar
          </Link>
          <button onClick={handleToggle} disabled={toggling} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-50" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            {product.status === 'active' ? 'Desactivar' : 'Activar'}
          </button>
          <button onClick={handleDelete} disabled={deleting || product._count.services > 0} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }} title={product._count.services > 0 ? 'No se puede eliminar: tiene servicios asociados' : 'Eliminar producto'}>
            Eliminar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details */}
          <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>Detalles</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Tipo</span><span style={{ color: 'var(--text-primary)' }}>{TYPE_LABELS[product.type]}</span></div>
              <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Categoría</span><span style={{ color: 'var(--text-primary)' }}>{product.category?.name || '—'}</span></div>
              <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Provisioner</span><span style={{ color: 'var(--text-primary)' }}>{product.provisioner}</span></div>
              <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Servicios activos</span><span style={{ color: 'var(--text-primary)' }}>{product._count.services}</span></div>
            </div>
            {product.short_description && <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{product.short_description}</p>}
            {product.description && <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{product.description}</p>}
          </div>

          {/* Pricing */}
          <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>Planes de precio</h2>
            {product.pricing.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin planes de precio configurados.</p>
            ) : (
              <div className="space-y-2">
                {product.pricing.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{CYCLE_LABELS[p.billing_cycle]}</span>
                      {Number(p.setup_fee) > 0 && <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>+ {Number(p.setup_fee).toFixed(2)} € setup</span>}
                    </div>
                    <span className="text-lg font-semibold" style={{ color: 'var(--brand)' }}>{Number(p.price).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extras */}
          {product.extras.length > 0 && (
            <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>Extras</h2>
              <div className="space-y-2">
                {product.extras.map((e) => (
                  <div key={e.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{e.label}</span>
                      {e.is_mandatory && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>Obligatorio</span>}
                    </div>
                    <span className="text-xs" style={{ color: e.active ? '#16a34a' : 'var(--text-tertiary)' }}>{e.active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Config */}
          <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>Configuración</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Gracia</span><span style={{ color: 'var(--text-primary)' }}>{product.grace_period_days} días</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Suspensión</span><span style={{ color: 'var(--text-primary)' }}>{product.suspension_days} días</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Cancelación</span><span style={{ color: 'var(--text-primary)' }}>{product.cancellation_days} días</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Pausar</span><span style={{ color: 'var(--text-primary)' }}>{product.client_can_pause ? 'Sí' : 'No'}</span></div>
              {product.partner_commission_pct && <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Comisión partner</span><span style={{ color: 'var(--text-primary)' }}>{product.partner_commission_pct}%</span></div>}
            </div>
          </div>

          {/* Meta */}
          <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>Metadatos</h2>
            <div className="space-y-3 text-sm">
              <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>ID</span><span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{product.id}</span></div>
              <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Creado</span><span style={{ color: 'var(--text-primary)' }}>{new Date(product.created_at).toLocaleString('es-ES')}</span></div>
              <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Actualizado</span><span style={{ color: 'var(--text-primary)' }}>{new Date(product.updated_at).toLocaleString('es-ES')}</span></div>
            </div>
          </div>

          {/* Checklist */}
          {product.checklist_items.length > 0 && (
            <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>Checklist</h2>
              <div className="space-y-2">
                {product.checklist_items.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className="w-4 h-4 rounded border flex items-center justify-center" style={{ borderColor: 'var(--border)' }}>
                      {c.is_required && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
