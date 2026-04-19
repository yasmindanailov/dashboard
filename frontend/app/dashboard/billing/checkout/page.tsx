'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth-context';
import { productsApi, clientsApi, billingApi } from '../../../lib/api';

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

interface ProductPricing {
  id: string;
  billing_cycle: string;
  price: string;
  setup_fee: string;
  currency: string;
  discount_percentage: string | null;
  active: boolean;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  type: string;
  short_description: string | null;
  description: string | null;
  badge_text: string | null;
  image_url: string | null;
  pricing: ProductPricing[];
  features: { key: string; value: string }[] | null;
}

interface BillingProfile {
  id: string;
  label: string;
  type: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  nif_cif: string | null;
  address_line1: string;
  city: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  one_time: 'Pago único',
};

const CYCLE_SAVINGS: Record<string, string> = {
  quarterly: '5%',
  semiannual: '10%',
  annual: '20%',
};

/* ═══════════════════════════════════════
   Steps
   ═══════════════════════════════════════ */

type Step = 'product' | 'pricing' | 'profile' | 'confirm';

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('product');
  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<BillingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Selections
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<ProductPricing | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<BillingProfile | null>(null);
  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  // Load products
  const loadProducts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await productsApi.list(token, { limit: 50, status: 'active' }) as { data: Product[] };
      setProducts(res.data.filter((p) => p.pricing.some((pr) => pr.active)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  // Load billing profiles
  const loadProfiles = useCallback(async () => {
    if (!token || !user?.id) return;
    try {
      const res = await clientsApi.getBillingProfiles(token, user.id) as BillingProfile[];
      setProfiles(Array.isArray(res) ? res : []);
      const defaultProfile = (Array.isArray(res) ? res : []).find((p: BillingProfile) => p.is_default);
      if (defaultProfile) setSelectedProfile(defaultProfile);
    } catch (e) { console.error(e); }
  }, [token, user?.id]);

  useEffect(() => { loadProducts(); loadProfiles(); }, [loadProducts, loadProfiles]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    const activePricing = product.pricing.filter((p) => p.active);
    if (activePricing.length === 1) {
      setSelectedPricing(activePricing[0]);
      setStep('profile');
    } else {
      setStep('pricing');
    }
  };

  const handleCheckout = async () => {
    if (!token || !selectedPricing || !user) return;
    setSubmitting(true);
    setError('');
    try {
      await billingApi.checkout(token, {
        product_pricing_id: selectedPricing.id,
        billing_profile_id: selectedProfile?.id,
        label: label || undefined,
        domain: domain || undefined,
      });
      router.push('/dashboard/billing');
    } catch (e: any) {
      setError(e?.message || 'Error al procesar el checkout');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (amount: string | number, currency = 'EUR') =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(amount));

  const steps: { key: Step; label: string; num: number }[] = [
    { key: 'product', label: 'Producto', num: 1 },
    { key: 'pricing', label: 'Plan', num: 2 },
    { key: 'profile', label: 'Facturación', num: 3 },
    { key: 'confirm', label: 'Confirmar', num: 4 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link href="/dashboard/billing" style={{ color: '#635BFF', textDecoration: 'none', fontSize: 13 }}>← Facturación</Link>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', margin: '8px 0 0' }}>Contratar servicio</h1>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
        {steps.map((s, i) => (
          <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700,
              background: i <= currentStepIndex ? '#635BFF' : '#f3f4f6',
              color: i <= currentStepIndex ? '#fff' : '#9ca3af',
              transition: 'all 0.3s',
            }}>{s.num}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: i <= currentStepIndex ? '#111827' : '#9ca3af' }}>{s.label}</span>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < currentStepIndex ? '#635BFF' : '#e5e7eb', borderRadius: 1, transition: 'background 0.3s' }} />
            )}
          </div>
        ))}
      </div>

      {/* STEP 1: Product selection */}
      {step === 'product' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#111827', marginBottom: 20 }}>Selecciona un producto</h2>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Cargando productos...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {products.map((product) => {
                const lowestPrice = product.pricing
                  .filter((p) => p.active)
                  .reduce((min, p) => Math.min(min, Number(p.price)), Infinity);
                return (
                  <button key={product.id} onClick={() => handleSelectProduct(product)} style={{
                    padding: 24, background: '#fff', border: '1px solid #f0f0f0', borderRadius: 16,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#635BFF'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,91,255,0.15)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>{product.name}</h3>
                      {product.badge_text && (
                        <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(99,91,255,0.1)', color: '#635BFF', fontSize: 11, fontWeight: 600 }}>
                          {product.badge_text}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px', lineHeight: 1.5 }}>
                      {product.short_description || product.description?.slice(0, 120) || ''}
                    </p>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#635BFF' }}>
                      {fmt(lowestPrice)}<span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af' }}>/mes</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Pricing selection */}
      {step === 'pricing' && selectedProduct && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Elige tu plan — {selectedProduct.name}</h2>
          <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>Selecciona el ciclo de facturación que prefieras</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {selectedProduct.pricing.filter((p) => p.active).map((pricing) => (
              <button key={pricing.id} onClick={() => { setSelectedPricing(pricing); setStep('profile'); }} style={{
                padding: 24, background: selectedPricing?.id === pricing.id ? 'rgba(99,91,255,0.04)' : '#fff',
                border: selectedPricing?.id === pricing.id ? '2px solid #635BFF' : '1px solid #f0f0f0',
                borderRadius: 16, cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
              }}
                onMouseEnter={(e) => { if (selectedPricing?.id !== pricing.id) e.currentTarget.style.borderColor = '#c7c5ff'; }}
                onMouseLeave={(e) => { if (selectedPricing?.id !== pricing.id) e.currentTarget.style.borderColor = '#f0f0f0'; }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  {CYCLE_LABELS[pricing.billing_cycle] || pricing.billing_cycle}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                  {fmt(pricing.price, pricing.currency)}
                </div>
                {Number(pricing.setup_fee) > 0 && (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>+ {fmt(pricing.setup_fee, pricing.currency)} setup</div>
                )}
                {CYCLE_SAVINGS[pricing.billing_cycle] && (
                  <div style={{ marginTop: 8, padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#16a34a', fontSize: 11, fontWeight: 600, display: 'inline-block' }}>
                    Ahorra {CYCLE_SAVINGS[pricing.billing_cycle]}
                  </div>
                )}
              </button>
            ))}
          </div>
          <button onClick={() => setStep('product')} style={{ marginTop: 16, padding: '8px 16px', border: 'none', background: 'none', color: '#635BFF', cursor: 'pointer', fontSize: 13 }}>
            ← Cambiar producto
          </button>
        </div>
      )}

      {/* STEP 3: Billing profile */}
      {step === 'profile' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Perfil de facturación</h2>
          <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>Selecciona el perfil para esta factura (opcional)</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
            {/* No profile option */}
            <button onClick={() => { setSelectedProfile(null); }} style={{
              padding: 20, background: !selectedProfile ? 'rgba(99,91,255,0.04)' : '#fff',
              border: !selectedProfile ? '2px solid #635BFF' : '1px solid #f0f0f0',
              borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}>
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                {user?.first_name} {user?.last_name}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>{user?.email}</div>
              <div style={{ fontSize: 11, color: '#b0aef0', fontStyle: 'italic' }}>Factura simplificada (sin NIF)</div>
            </button>

            {profiles.map((profile) => (
              <button key={profile.id} onClick={() => setSelectedProfile(profile)} style={{
                padding: 20, background: selectedProfile?.id === profile.id ? 'rgba(99,91,255,0.04)' : '#fff',
                border: selectedProfile?.id === profile.id ? '2px solid #635BFF' : '1px solid #f0f0f0',
                borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{profile.label}</span>
                  {profile.is_default && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#f0f0f0', color: '#6b7280' }}>Default</span>
                  )}
                </div>
                {profile.company_name && <div style={{ fontSize: 13, color: '#374151' }}>{profile.company_name}</div>}
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {profile.first_name} {profile.last_name}
                  {profile.nif_cif && <> · {profile.nif_cif}</>}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  {profile.address_line1}, {profile.postal_code} {profile.city}
                </div>
              </button>
            ))}
          </div>

          {/* Optional fields */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0', padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 16 }}>Datos del servicio (opcional)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>Etiqueta</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mi web principal"
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>Dominio</label>
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="midominio.com"
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('pricing')} style={{ padding: '10px 20px', border: 'none', background: 'none', color: '#635BFF', cursor: 'pointer', fontSize: 14 }}>
              ← Atrás
            </button>
            <button onClick={() => setStep('confirm')} style={{
              padding: '10px 24px', border: 'none', background: '#635BFF', color: '#fff',
              borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14, boxShadow: '0 2px 8px rgba(99,91,255,0.3)',
            }}>
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Confirmation */}
      {step === 'confirm' && selectedProduct && selectedPricing && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#111827', marginBottom: 20 }}>Confirmar pedido</h2>

          <div style={{
            background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 24,
          }}>
            {/* Summary header */}
            <div style={{ padding: 24, borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>{selectedProduct.name}</h3>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>
                    {CYCLE_LABELS[selectedPricing.billing_cycle]} · {selectedPricing.currency}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#635BFF' }}>{fmt(selectedPricing.price, selectedPricing.currency)}</div>
                  {Number(selectedPricing.setup_fee) > 0 && (
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>+ {fmt(selectedPricing.setup_fee, selectedPricing.currency)} setup</div>
                  )}
                </div>
              </div>
            </div>

            {/* Details */}
            <div style={{ padding: 24 }}>
              <table style={{ width: '100%', fontSize: 14 }}>
                <tbody>
                  {[
                    { label: 'Producto', value: selectedProduct.name },
                    { label: 'Ciclo', value: CYCLE_LABELS[selectedPricing.billing_cycle] },
                    { label: 'Facturación', value: selectedProfile ? `${selectedProfile.label} (${selectedProfile.nif_cif ? 'completa' : 'simplificada'})` : `${user?.first_name || ''} ${user?.last_name || ''} — Factura simplificada` },
                    ...(label ? [{ label: 'Etiqueta', value: label }] : []),
                    ...(domain ? [{ label: 'Dominio', value: domain }] : []),
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '10px 0', color: '#9ca3af', width: 160 }}>{row.label}</td>
                      <td style={{ padding: '10px 0', color: '#374151', fontWeight: 500 }}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total */}
            <div style={{ padding: '16px 24px', background: '#fafafa', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>Total a pagar</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>
                {fmt(Number(selectedPricing.price) + Number(selectedPricing.setup_fee), selectedPricing.currency)}
              </span>
            </div>
          </div>

          {/* Info box */}
          <div style={{
            padding: 16, background: 'rgba(99,91,255,0.04)', border: '1px solid rgba(99,91,255,0.15)',
            borderRadius: 12, marginBottom: 24, fontSize: 13, color: '#4c46b8',
          }}>
            💡 Al confirmar se creará un servicio en estado <strong>pendiente</strong> y una factura en <strong>borrador</strong>.
            El servicio se activará cuando la factura esté pagada.
          </div>

          {error && (
            <div style={{ padding: 14, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, marginBottom: 16, color: '#991B1B', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('profile')} style={{ padding: '12px 24px', border: 'none', background: 'none', color: '#635BFF', cursor: 'pointer', fontSize: 14 }}>
              ← Atrás
            </button>
            <button onClick={handleCheckout} disabled={submitting} style={{
              padding: '12px 32px', border: 'none',
              background: submitting ? '#a5a3ff' : 'linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%)',
              color: '#fff', borderRadius: 12, cursor: submitting ? 'wait' : 'pointer',
              fontWeight: 700, fontSize: 15, boxShadow: '0 4px 16px rgba(99,91,255,0.3)',
              transition: 'all 0.2s',
            }}>
              {submitting ? 'Procesando...' : '✓ Confirmar pedido'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
