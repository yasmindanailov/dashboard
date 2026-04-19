'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { productsApi } from '../../../../lib/api';

const TYPE_LABELS: Record<string, string> = {
  hosting_web: 'Hosting Web', domain: 'Dominio', docker_service: 'Docker Service',
  support_inside: 'Support Inside', we_do_it: 'We Do It', custom_service: 'Proyecto Custom',
};

const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'one_time', label: 'Único' },
];

const inputStyle = {
  background: 'var(--surface-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  outline: 'none',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold uppercase tracking-wider mb-4 mt-6 first:mt-0" style={{ color: 'var(--text-tertiary)' }}>
      {children}
    </h3>
  );
}

interface Pricing { id: string; billing_cycle: string; price: string; setup_fee: string; currency: string; active: boolean; }

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [productType, setProductType] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [badgeText, setBadgeText] = useState('');
  const [provisioner, setProvisioner] = useState('');
  const [gracePeriod, setGracePeriod] = useState('0');
  const [suspensionDays, setSuspensionDays] = useState('7');
  const [cancellationDays, setCancellationDays] = useState('30');
  const [clientCanPause, setClientCanPause] = useState(false);
  const [partnerCommission, setPartnerCommission] = useState('');

  // Existing pricing (managed separately via API)
  const [existingPricing, setExistingPricing] = useState<Pricing[]>([]);
  const [newCycle, setNewCycle] = useState('monthly');
  const [newPrice, setNewPrice] = useState('');
  const [newSetup, setNewSetup] = useState('0');
  const [addingPrice, setAddingPrice] = useState(false);

  const isAddon = productType === 'support_inside' || productType === 'we_do_it';
  const showLifecycle = productType !== 'support_inside' && productType !== 'we_do_it';

  useEffect(() => {
    if (!token || !id) return;
    productsApi.get(token, id)
      .then((data: any) => {
        setProductType(data.type);
        setName(data.name);
        setSlug(data.slug);
        setDescription(data.description || '');
        setShortDescription(data.short_description || '');
        setBadgeText(data.badge_text || '');
        setProvisioner(data.provisioner || '');
        setGracePeriod(String(data.grace_period_days));
        setSuspensionDays(String(data.suspension_days));
        setCancellationDays(String(data.cancellation_days));
        setClientCanPause(data.client_can_pause);
        setPartnerCommission(data.partner_commission_pct ? String(data.partner_commission_pct) : '');
        setExistingPricing(data.pricing || []);
      })
      .catch(() => router.push('/dashboard/products'))
      .finally(() => setLoading(false));
  }, [token, id, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!name.trim()) { setError('El nombre es obligatorio.'); return; }

    setSaving(true);
    try {
      await productsApi.update(token, id, {
        name: name.trim(),
        slug: slug.trim(),
        description: description || undefined,
        short_description: shortDescription || undefined,
        badge_text: badgeText || undefined,
        provisioner: provisioner || undefined,
        grace_period_days: parseInt(gracePeriod) || 0,
        suspension_days: parseInt(suspensionDays) || 7,
        cancellation_days: parseInt(cancellationDays) || 30,
        client_can_pause: clientCanPause,
        partner_commission_pct: partnerCommission ? parseFloat(partnerCommission) : undefined,
      });
      setSuccess('Producto actualizado correctamente.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPricing = async () => {
    if (!newPrice) return;
    setAddingPrice(true);
    try {
      await productsApi.addPricing(token, id, {
        billing_cycle: newCycle,
        price: parseFloat(newPrice),
        setup_fee: parseFloat(newSetup) || 0,
      });
      const data: any = await productsApi.get(token, id);
      setExistingPricing(data.pricing || []);
      setNewPrice(''); setNewSetup('0');
    } catch (err: any) {
      setError(err?.message || 'Error al añadir precio.');
    }
    setAddingPrice(false);
  };

  const handleDeletePricing = async (pricingId: string) => {
    if (!confirm('¿Eliminar este plan de precio?')) return;
    try {
      await productsApi.deletePricing(token, pricingId);
      setExistingPricing(existingPricing.filter(p => p.id !== pricingId));
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar precio.');
    }
  };

  const cycleLbl = (c: string) => CYCLE_OPTIONS.find(o => o.value === c)?.label || c;

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

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.push(`/dashboard/products/${id}`)} className="p-2 rounded-lg cursor-pointer" style={{ color: 'var(--text-tertiary)', background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Editar producto</h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{TYPE_LABELS[productType]} · {slug}</p>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(34,197,94,0.08)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}>{success}</div>}

      <form onSubmit={handleSave}>
        <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>

          <SectionTitle>Identidad</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nombre *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Slug</label>
              <input value={slug} onChange={e => setSlug(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Badge</label>
              <input value={badgeText} onChange={e => setBadgeText(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Comisión partner (%)</label>
              <input type="number" step="0.01" min="0" max="100" value={partnerCommission} onChange={e => setPartnerCommission(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Descripción corta</label>
            <input value={shortDescription} onChange={e => setShortDescription(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} maxLength={500} />
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Descripción completa</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-lg text-sm resize-none" style={inputStyle} />
          </div>

          {!isAddon && (
            <>
              <SectionTitle>Provisioning</SectionTitle>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Provisioner</label>
                <input value={provisioner} onChange={e => setProvisioner(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm md:w-1/2" style={inputStyle} />
              </div>
            </>
          )}

          {showLifecycle && (
            <>
              <SectionTitle>Ciclo de vida</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Gracia (días)</label>
                  <input type="number" min="0" value={gracePeriod} onChange={e => setGracePeriod(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Suspensión (días)</label>
                  <input type="number" min="0" value={suspensionDays} onChange={e => setSuspensionDays(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Cancelación (días)</label>
                  <input type="number" min="0" value={cancellationDays} onChange={e => setCancellationDays(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer pb-2.5" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={clientCanPause} onChange={e => setClientCanPause(e.target.checked)} className="rounded cursor-pointer" />
                    Pausar
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pricing section (separate from main form) */}
        <div className="rounded-xl p-6 mt-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <SectionTitle>Planes de precio</SectionTitle>
          {existingPricing.length > 0 && (
            <div className="space-y-2 mb-4">
              {existingPricing.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{cycleLbl(p.billing_cycle)}</span>
                    {Number(p.setup_fee) > 0 && <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>+ {Number(p.setup_fee).toFixed(2)} € setup</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold" style={{ color: 'var(--brand)' }}>{Number(p.price).toFixed(2)} €</span>
                    <button type="button" onClick={() => handleDeletePricing(p.id)} className="p-1 rounded cursor-pointer" style={{ color: '#dc2626' }} title="Eliminar">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Ciclo</label>
              <select value={newCycle} onChange={e => setNewCycle(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer" style={inputStyle}>
                {CYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Precio (€)</label>
              <input type="number" step="0.01" min="0" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} placeholder="9.99" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Setup (€)</label>
              <input type="number" step="0.01" min="0" value={newSetup} onChange={e => setNewSetup(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} placeholder="0" />
            </div>
            <button type="button" onClick={handleAddPricing} disabled={addingPrice || !newPrice} className="px-4 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50" style={{ background: 'var(--brand)' }}>
              Añadir
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button type="button" onClick={() => router.push(`/dashboard/products/${id}`)} className="px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer" style={{ color: 'var(--text-secondary)', background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-brand)' }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}
