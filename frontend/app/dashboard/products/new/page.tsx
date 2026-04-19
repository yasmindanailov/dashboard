'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { productsApi } from '../../../lib/api';

/* ═══════════════════════════════════════
   Product type definitions per DECISIONS.md §6, §7, §8, §27
   ═══════════════════════════════════════ */
const PRODUCT_TYPES = [
  {
    value: 'hosting_web', label: 'Hosting Web', icon: '🌐', isAddon: false,
    description: 'Planes de hosting web (Web Inicio, Web Pro, Web Business)',
    defaultProvisioner: 'enhance_cp',
  },
  {
    value: 'domain', label: 'Dominio', icon: '🔗', isAddon: false,
    description: 'Registro y transferencia de dominios',
    defaultProvisioner: 'resellerclub',
  },
  {
    value: 'docker_service', label: 'Docker Service', icon: '🐳', isAddon: false,
    description: 'Contenedores Docker (Nextcloud, OpenClaw, etc.)',
    defaultProvisioner: 'docker_engine',
  },
  {
    value: 'support_inside', label: 'Support Inside', icon: '🛡️', isAddon: true,
    description: 'Addon global de cuenta — planes Básico, Medium, Pro (§7)',
    defaultProvisioner: 'internal',
  },
  {
    value: 'we_do_it', label: 'We Do It For You', icon: '🛠️', isAddon: true,
    description: 'Addon por producto — desarrollo/configuración (§8)',
    defaultProvisioner: 'manual',
  },
  {
    value: 'custom_service', label: 'Proyecto Custom', icon: '📐', isAddon: false,
    description: 'Proyectos manuales a escala (ERP, CRM). Creación manual.',
    defaultProvisioner: 'manual',
  },
];

const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'one_time', label: 'Único' },
];

interface PricingRow { billing_cycle: string; price: string; setup_fee: string; }

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

export default function NewProductPage() {
  const router = useRouter();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  // Step 1: type selection
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Form state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [badgeText, setBadgeText] = useState('');
  const [provisioner, setProvisioner] = useState('manual');
  const [gracePeriod, setGracePeriod] = useState('0');
  const [suspensionDays, setSuspensionDays] = useState('7');
  const [cancellationDays, setCancellationDays] = useState('30');
  const [clientCanPause, setClientCanPause] = useState(false);
  const [partnerCommission, setPartnerCommission] = useState('');
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([
    { billing_cycle: 'monthly', price: '', setup_fee: '0' },
  ]);

  const typeMeta = PRODUCT_TYPES.find(t => t.value === selectedType);
  const isAddonType = typeMeta?.isAddon ?? false;
  const isSupportInside = selectedType === 'support_inside';
  const isWeDoIt = selectedType === 'we_do_it';
  const isCustomService = selectedType === 'custom_service';
  const showLifecycle = !isSupportInside && !isWeDoIt;

  const generateSlug = (val: string) =>
    val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === generateSlug(name)) setSlug(generateSlug(val));
  };

  const handleTypeSelect = (typeValue: string) => {
    const meta = PRODUCT_TYPES.find(t => t.value === typeValue)!;
    setSelectedType(typeValue);
    setProvisioner(meta.defaultProvisioner);
    if (typeValue === 'custom_service') {
      setPricingRows([{ billing_cycle: 'one_time', price: '', setup_fee: '0' }]);
    }
  };

  const addPricingRow = () => setPricingRows([...pricingRows, { billing_cycle: 'annual', price: '', setup_fee: '0' }]);
  const removePricingRow = (idx: number) => setPricingRows(pricingRows.filter((_, i) => i !== idx));
  const updatePricingRow = (idx: number, field: string, val: string) => {
    const rows = [...pricingRows];
    (rows[idx] as any)[field] = val;
    setPricingRows(rows);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!isCustomService && !pricingRows.some(r => r.price)) { setError('Debe haber al menos un plan de precio.'); return; }

    setSaving(true);
    try {
      await productsApi.create(token, {
        name: name.trim(),
        slug: slug.trim() || undefined,
        type: selectedType,
        description: description || undefined,
        short_description: shortDescription || undefined,
        badge_text: badgeText || undefined,
        is_addon: isAddonType,
        is_global_addon: isSupportInside,
        requires_existing_product: isSupportInside || isWeDoIt,
        provisioner,
        grace_period_days: parseInt(gracePeriod) || 0,
        suspension_days: parseInt(suspensionDays) || 7,
        cancellation_days: parseInt(cancellationDays) || 30,
        client_can_pause: clientCanPause,
        partner_commission_pct: partnerCommission ? parseFloat(partnerCommission) : undefined,
        pricing: pricingRows.filter(r => r.price).map(r => ({
          billing_cycle: r.billing_cycle,
          price: parseFloat(r.price),
          setup_fee: parseFloat(r.setup_fee) || 0,
        })),
      });
      router.push('/dashboard/products');
    } catch (err: any) {
      setError(err?.message || 'Error al crear el producto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => selectedType ? setSelectedType(null) : router.back()} className="p-2 rounded-lg transition-colors cursor-pointer" style={{ color: 'var(--text-tertiary)', background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
        </button>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {!selectedType ? 'Nuevo producto' : `Nuevo ${typeMeta?.label}`}
        </h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>
      )}

      {/* ── STEP 1: Type Selection ── */}
      {!selectedType && (
        <div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>¿Qué tipo de producto quieres crear?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRODUCT_TYPES.map(t => (
              <button key={t.value} onClick={() => handleTypeSelect(t.value)} className="p-4 rounded-xl text-left transition-all duration-200 cursor-pointer group" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--brand)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.label}</span>
                  {t.isAddon && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#7c3aed' }}>Addon</span>}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Form ── */}
      {selectedType && (
        <form onSubmit={handleSubmit}>
          <div className="rounded-xl p-6 space-y-0" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>

            {/* Auto-set badges */}
            {isAddonType && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(168,85,247,0.06)', color: '#7c3aed', border: '1px solid rgba(168,85,247,0.15)' }}>
                <span className="font-medium">Addon</span> —
                {isSupportInside && ' Global de cuenta · Requiere producto activo previo'}
                {isWeDoIt && ' Por producto · Solo aplica a hosting_web y docker_service'}
              </div>
            )}

            {/* Identity */}
            <SectionTitle>Identidad</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nombre *</label>
                <input value={name} onChange={e => handleNameChange(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} placeholder={isSupportInside ? 'Support Inside Básico' : 'Hosting Starter'} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Slug</label>
                <input value={slug} onChange={e => setSlug(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Badge</label>
                <input value={badgeText} onChange={e => setBadgeText(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} placeholder="Más popular" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Comisión partner (%)</label>
                <input type="number" step="0.01" min="0" max="100" value={partnerCommission} onChange={e => setPartnerCommission(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} placeholder="20" />
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

            {/* Pricing */}
            <SectionTitle>Pricing</SectionTitle>
            <div className="space-y-3">
              {pricingRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_40px] gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Ciclo</label>
                    <select value={row.billing_cycle} onChange={e => updatePricingRow(idx, 'billing_cycle', e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer" style={inputStyle}>
                      {CYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Precio (€) *</label>
                    <input type="number" step="0.01" min="0" value={row.price} onChange={e => updatePricingRow(idx, 'price', e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} placeholder="9.99" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Setup fee (€)</label>
                    <input type="number" step="0.01" min="0" value={row.setup_fee} onChange={e => updatePricingRow(idx, 'setup_fee', e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} placeholder="0" />
                  </div>
                  <button type="button" onClick={() => removePricingRow(idx)} disabled={pricingRows.length <= 1} className="p-2.5 rounded-lg cursor-pointer disabled:opacity-30" style={{ color: '#dc2626' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addPricingRow} className="mt-3 flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--brand)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Añadir plan de precio
            </button>

            {/* Provisioning — only for non-addon types */}
            {!isAddonType && (
              <>
                <SectionTitle>Provisioning</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Provisioner</label>
                    <input value={provisioner} onChange={e => setProvisioner(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Se gestionará dinámicamente via plugins (Sprint 8)</p>
                  </div>
                </div>
              </>
            )}

            {/* Lifecycle — only for products, not addons */}
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

            {/* Type-specific hints */}
            {isSupportInside && (
              <div className="mt-6 p-4 rounded-lg text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                <strong>Support Inside</strong> — Los canales, SLA, y configuración de slots se definirán en el Sprint de Soporte. Por ahora solo se crea el producto base con su pricing.
              </div>
            )}
            {isWeDoIt && (
              <div className="mt-6 p-4 rounded-lg text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                <strong>We Do It For You</strong> — La vinculación a productos específicos se gestionará en el Sprint de Provisioning. Solo aplica a hosting_web y docker_service.
              </div>
            )}
            {isCustomService && (
              <div className="mt-6 p-4 rounded-lg text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                <strong>Proyecto Custom</strong> — Se crea manualmente para cada proyecto. El agente recibe una tarea al activarse.
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <button type="button" onClick={() => setSelectedType(null)} className="px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer" style={{ color: 'var(--text-secondary)', background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
              Cambiar tipo
            </button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl text-sm font-medium text-white cursor-pointer disabled:opacity-60" style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-brand)' }}>
              {saving ? 'Guardando...' : `Crear ${typeMeta?.label}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
