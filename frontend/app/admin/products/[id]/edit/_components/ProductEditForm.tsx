'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertBanner,
  Button,
  Card,
  FormPage,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../../../../components/ui';
import {
  addPricingAction,
  deletePricingAction,
  updateProductAction,
  type PricingRowResult,
} from '../../../_actions';
import styles from '../../../productForm.module.css';

/* ═══════════════════════════════════════
   ProductEditForm — Sprint 13 §13.AUTH Fase E (Modelo A).
   Recibe el producto prehidratado por SC. Save → updateProductAction
   + revalidatePath. Pricing CRUD via add/deletePricingAction. Cero
   localStorage, cero useEffect+fetch.
   ═══════════════════════════════════════ */

const TYPE_LABELS: Record<string, string> = {
  hosting_web: 'Hosting Web',
  domain: 'Dominio',
  docker_service: 'Docker Service',
  support_inside: 'Support Inside',
  we_do_it: 'We Do It',
  custom_service: 'Proyecto Custom',
};

const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'one_time', label: 'Único' },
];

export interface InitialProduct {
  id: string;
  type: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  badge_text: string | null;
  provisioner: string | null;
  grace_period_days: number;
  suspension_days: number;
  cancellation_days: number;
  client_can_pause: boolean;
  partner_commission_pct: number | string | null;
  pricing: PricingRowResult[];
}

interface Props {
  initial: InitialProduct;
}

export default function ProductEditForm({ initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description ?? '');
  const [shortDescription, setShortDescription] = useState(
    initial.short_description ?? '',
  );
  const [badgeText, setBadgeText] = useState(initial.badge_text ?? '');
  const [provisioner, setProvisioner] = useState(initial.provisioner ?? '');
  const [gracePeriod, setGracePeriod] = useState(String(initial.grace_period_days));
  const [suspensionDays, setSuspensionDays] = useState(String(initial.suspension_days));
  const [cancellationDays, setCancellationDays] = useState(String(initial.cancellation_days));
  const [clientCanPause, setClientCanPause] = useState(initial.client_can_pause);
  const [partnerCommission, setPartnerCommission] = useState(
    initial.partner_commission_pct ? String(initial.partner_commission_pct) : '',
  );
  const [existingPricing, setExistingPricing] = useState<PricingRowResult[]>(
    initial.pricing,
  );
  const [newCycle, setNewCycle] = useState('monthly');
  const [newPrice, setNewPrice] = useState('');
  const [newSetup, setNewSetup] = useState('0');
  const [addingPrice, setAddingPrice] = useState(false);
  const [deletePricingId, setDeletePricingId] = useState<string | null>(null);

  const isAddon = initial.type === 'support_inside' || initial.type === 'we_do_it';
  const showLifecycle = !isAddon;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    const result = await updateProductAction(initial.id, {
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
      partner_commission_pct: partnerCommission
        ? parseFloat(partnerCommission)
        : undefined,
    });
    setSaving(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    toast('success', 'Producto actualizado correctamente.');
  }

  async function handleAddPricing() {
    if (!newPrice) return;
    setAddingPrice(true);
    const result = await addPricingAction(initial.id, {
      billing_cycle: newCycle,
      price: parseFloat(newPrice),
      setup_fee: parseFloat(newSetup) || 0,
    });
    setAddingPrice(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    setExistingPricing(result.pricing);
    setNewPrice('');
    setNewSetup('0');
    toast('success', 'Plan de precio añadido.');
  }

  async function handleDeletePricing(pricingId: string) {
    const result = await deletePricingAction(initial.id, pricingId);
    setDeletePricingId(null);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    setExistingPricing(existingPricing.filter((p) => p.id !== pricingId));
    toast('success', 'Plan de precio eliminado.');
  }

  const cycleLbl = (c: string) =>
    CYCLE_OPTIONS.find((o) => o.value === c)?.label || c;

  return (
    <FormPage
      breadcrumb={[
        { label: 'Productos', href: '/admin/products' },
        { label: name || slug, href: `/admin/products/${initial.id}` },
        { label: 'Editar' },
      ]}
      title="Editar producto"
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => router.push(`/admin/products/${initial.id}`)}
          >
            Cancelar
          </Button>
          <Button type="submit" form="edit-product-form" loading={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      {error && (
        <AlertBanner variant="danger" onClose={() => setError('')}>
          {error}
        </AlertBanner>
      )}

      <form id="edit-product-form" onSubmit={handleSave}>
        <Card>
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Identidad</h3>
            <p className={styles.subtitle}>
              {TYPE_LABELS[initial.type]} · {slug}
            </p>
            <div className={styles.formGrid}>
              <Input
                label="Nombre *"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label="Slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={styles.monoInput}
              />
              <Input
                label="Badge"
                value={badgeText}
                onChange={(e) => setBadgeText(e.target.value)}
              />
              <Input
                label="Comisión partner (%)"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={partnerCommission}
                onChange={(e) => setPartnerCommission(e.target.value)}
                placeholder="20"
              />
            </div>
            <div className={styles.mt4}>
              <Input
                label="Descripción corta"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className={styles.mt4}>
              <Textarea
                label="Descripción completa"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </Card>

        {!isAddon && (
          <div className={styles.mt6}>
            <Card>
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>Provisioning</h3>
                <div className={styles.formGrid}>
                  <Input
                    label="Provisioner"
                    value={provisioner}
                    onChange={(e) => setProvisioner(e.target.value)}
                  />
                </div>
              </div>
            </Card>
          </div>
        )}

        {showLifecycle && (
          <div className={styles.mt6}>
            <Card>
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>Ciclo de vida</h3>
                <div className={styles.pricingGrid}>
                  <Input
                    label="Gracia (días)"
                    type="number"
                    min="0"
                    value={gracePeriod}
                    onChange={(e) => setGracePeriod(e.target.value)}
                  />
                  <Input
                    label="Suspensión (días)"
                    type="number"
                    min="0"
                    value={suspensionDays}
                    onChange={(e) => setSuspensionDays(e.target.value)}
                  />
                  <Input
                    label="Cancelación (días)"
                    type="number"
                    min="0"
                    value={cancellationDays}
                    onChange={(e) => setCancellationDays(e.target.value)}
                  />
                  <div className={styles.pricingActions}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={clientCanPause}
                        onChange={(e) => setClientCanPause(e.target.checked)}
                        className={styles.checkboxInput}
                      />
                      Pausar
                    </label>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        <div className={styles.mt6}>
          <Card>
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Planes de precio</h3>
              {existingPricing.length > 0 && (
                <div className={styles.spaceY2}>
                  {existingPricing.map((p) => (
                    <div key={p.id} className={styles.pricingItem}>
                      <div>
                        <span className={styles.pricingItemName}>
                          {cycleLbl(p.billing_cycle)}
                        </span>
                        {Number(p.setup_fee) > 0 && (
                          <span className={styles.pricingItemSetup}>
                            + {Number(p.setup_fee).toFixed(2)} € setup
                          </span>
                        )}
                      </div>
                      <div className={styles.pricingRow}>
                        <span className={styles.pricingItemPrice}>
                          {Number(p.price).toFixed(2)} €
                        </span>
                        <button
                          type="button"
                          onClick={() => setDeletePricingId(p.id)}
                          className={styles.removeBtn}
                          title="Eliminar"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={`${styles.pricingRow} ${styles.mt4}`}>
                <Select
                  label="Ciclo"
                  value={newCycle}
                  onChange={(e) => setNewCycle(e.target.value)}
                  options={CYCLE_OPTIONS}
                />
                <Input
                  label="Precio (€)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="9.99"
                />
                <Input
                  label="Setup (€)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newSetup}
                  onChange={(e) => setNewSetup(e.target.value)}
                  placeholder="0"
                />
                <Button
                  onClick={handleAddPricing}
                  disabled={addingPrice || !newPrice}
                  loading={addingPrice}
                >
                  Añadir
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </form>

      <Modal
        open={deletePricingId !== null}
        onClose={() => setDeletePricingId(null)}
        title="Eliminar plan de precio"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletePricingId(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => deletePricingId && handleDeletePricing(deletePricingId)}
            >
              Eliminar
            </Button>
          </>
        }
      >
        <p className={styles.modalText}>
          ¿Eliminar este plan de precio? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </FormPage>
  );
}
