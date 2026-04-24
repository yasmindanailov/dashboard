'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { productsApi } from '../../../../lib/api';
import { Card, Input, Select, Textarea, Button, AlertBanner, Skeleton, FormPage, Modal, useToast } from '../../../../components/ui';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════
   Edit Product — Update existing product
   Layout: FormPage (§2.6)
   Components: Card, Input, Select, Textarea,
   Button, AlertBanner, Skeleton
   Ref: UI_SPEC.md §2.6, ROADMAP.md D24
   ═══════════════════════════════════════ */

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

interface Pricing { id: string; billing_cycle: string; price: string; setup_fee: string; currency: string; active: boolean; }

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); // validation only — network errors use toast
  const [productType, setProductType] = useState('');
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
  const [existingPricing, setExistingPricing] = useState<Pricing[]>([]);
  const [newCycle, setNewCycle] = useState('monthly');
  const [newPrice, setNewPrice] = useState('');
  const [newSetup, setNewSetup] = useState('0');
  const [addingPrice, setAddingPrice] = useState(false);
  const [deletePricingId, setDeletePricingId] = useState<string | null>(null);
  const { toast } = useToast();

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
    setError('');
    if (!name.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    try {
      await productsApi.update(token, id, {
        name: name.trim(),
        slug: slug.trim() || undefined,
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
      toast('success', 'Producto actualizado correctamente.');
    } catch (err: any) {
      toast('error', err?.message || 'Error al guardar.');
    } finally { setSaving(false); }
  };

  const handleAddPricing = async () => {
    if (!newPrice) return;
    setAddingPrice(true);
    try {
      await productsApi.addPricing(token, id, {
        billing_cycle: newCycle, price: parseFloat(newPrice), setup_fee: parseFloat(newSetup) || 0,
      });
      const data: any = await productsApi.get(token, id);
      setExistingPricing(data.pricing || []);
      setNewPrice(''); setNewSetup('0');
      toast('success', 'Plan de precio añadido.');
    } catch (err: any) {
      toast('error', err?.message || 'Error al añadir precio.');
    }
    setAddingPrice(false);
  };

  const handleDeletePricing = async (pricingId: string) => {
    try {
      await productsApi.deletePricing(token, pricingId);
      setExistingPricing(existingPricing.filter(p => p.id !== pricingId));
      toast('success', 'Plan de precio eliminado.');
    } catch (err: any) {
      toast('error', err?.message || 'Error al eliminar precio.');
    }
    setDeletePricingId(null);
  };

  const cycleLbl = (c: string) => CYCLE_OPTIONS.find(o => o.value === c)?.label || c;

  if (loading) {
    return (
      <FormPage
        breadcrumb={[{ label: 'Productos', href: '/dashboard/products' }, { label: 'Cargando...' }]}
        title="Editar producto"
      >
        <Card>
          <div className={styles.formSectionSpaced}>
            <Skeleton width="40%" height={24} />
            <Skeleton width="100%" height={40} />
            <Skeleton width="100%" height={40} />
            <Skeleton width="60%" height={40} />
          </div>
        </Card>
      </FormPage>
    );
  }

  return (
    <FormPage
      breadcrumb={[
        { label: 'Productos', href: '/dashboard/products' },
        { label: name || slug, href: `/dashboard/products/${id}` },
        { label: 'Editar' },
      ]}
      title="Editar producto"
      actions={
        <>
          <Button variant="secondary" onClick={() => router.push(`/dashboard/products/${id}`)}>Cancelar</Button>
          <Button type="submit" form="edit-product-form" loading={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      {error && <AlertBanner variant="danger" onClose={() => setError('')}>{error}</AlertBanner>}

      <form id="edit-product-form" onSubmit={handleSave}>
        {/* Card: Identity */}
        <Card>
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Identidad</h3>
            <p className={styles.subtitle}>{TYPE_LABELS[productType]} · {slug}</p>
            <div className={styles.formGrid}>
              <Input label="Nombre *" value={name} onChange={e => setName(e.target.value)} />
              <Input label="Slug" value={slug} onChange={e => setSlug(e.target.value)} className={styles.monoInput} />
              <Input label="Badge" value={badgeText} onChange={e => setBadgeText(e.target.value)} />
              <Input label="Comisión partner (%)" type="number" step="0.01" min="0" max="100"
                value={partnerCommission} onChange={e => setPartnerCommission(e.target.value)} placeholder="20" />
            </div>
            <div className={styles.mt4}>
              <Input label="Descripción corta" value={shortDescription} onChange={e => setShortDescription(e.target.value)} maxLength={500} />
            </div>
            <div className={styles.mt4}>
              <Textarea label="Descripción completa" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
        </Card>

        {/* Card: Provisioning */}
        {!isAddon && (
          <div className={styles.mt6}>
            <Card>
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>Provisioning</h3>
                <div className={styles.formGrid}>
                  <Input label="Provisioner" value={provisioner} onChange={e => setProvisioner(e.target.value)} />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Card: Lifecycle */}
        {showLifecycle && (
          <div className={styles.mt6}>
            <Card>
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>Ciclo de vida</h3>
                <div className={styles.pricingGrid}>
                  <Input label="Gracia (días)" type="number" min="0" value={gracePeriod} onChange={e => setGracePeriod(e.target.value)} />
                  <Input label="Suspensión (días)" type="number" min="0" value={suspensionDays} onChange={e => setSuspensionDays(e.target.value)} />
                  <Input label="Cancelación (días)" type="number" min="0" value={cancellationDays} onChange={e => setCancellationDays(e.target.value)} />
                  <div className={styles.pricingActions}>
                    <label className={styles.checkboxLabel}>
                      <input type="checkbox" checked={clientCanPause} onChange={e => setClientCanPause(e.target.checked)} className={styles.checkboxInput} />
                      Pausar
                    </label>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Card: Pricing */}
        <div className={styles.mt6}>
          <Card>
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Planes de precio</h3>
              {existingPricing.length > 0 && (
                <div className={styles.spaceY2}>
                  {existingPricing.map(p => (
                    <div key={p.id} className={styles.pricingItem}>
                      <div>
                        <span className={styles.pricingItemName}>{cycleLbl(p.billing_cycle)}</span>
                        {Number(p.setup_fee) > 0 && <span className={styles.pricingItemSetup}>+ {Number(p.setup_fee).toFixed(2)} € setup</span>}
                      </div>
                      <div className={styles.pricingRow}>
                        <span className={styles.pricingItemPrice}>{Number(p.price).toFixed(2)} €</span>
                        <button type="button" onClick={() => setDeletePricingId(p.id)} className={styles.removeBtn} title="Eliminar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={`${styles.pricingRow} ${styles.mt4}`}>
                <Select label="Ciclo" value={newCycle} onChange={e => setNewCycle(e.target.value)} options={CYCLE_OPTIONS} />
                <Input label="Precio (€)" type="number" step="0.01" min="0" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="9.99" />
                <Input label="Setup (€)" type="number" step="0.01" min="0" value={newSetup} onChange={e => setNewSetup(e.target.value)} placeholder="0" />
                <Button onClick={handleAddPricing} disabled={addingPrice || !newPrice} loading={addingPrice}>Añadir</Button>
              </div>
            </div>
          </Card>
        </div>
      </form>

      {/* Delete pricing confirmation modal (§4.2) */}
      <Modal
        open={deletePricingId !== null}
        onClose={() => setDeletePricingId(null)}
        title="Eliminar plan de precio"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletePricingId(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => deletePricingId && handleDeletePricing(deletePricingId)}>Eliminar</Button>
          </>
        }
      >
        <p className={styles.modalText}>¿Eliminar este plan de precio? Esta acción no se puede deshacer.</p>
      </Modal>
    </FormPage>
  );
}
