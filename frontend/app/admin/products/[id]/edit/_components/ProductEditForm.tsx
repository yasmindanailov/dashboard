'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import validator from '@rjsf/validator-ajv8';
import type { RJSFSchema } from '@rjsf/utils';

import {
  AlertBanner,
  Button,
  Card,
  FormPage,
  Input,
  Modal,
  Select,
  useToast,
} from '../../../../../components/ui';
import type { AdminPluginListItem } from '../../../../../lib/api';
import { CYCLE_OPTIONS } from '../../../new/constants';
import { IdentitySection } from '../../../_components/form/IdentitySection';
import { ProvisioningSection } from '../../../_components/form/ProvisioningSection';
import { LifecycleSection } from '../../../_components/form/LifecycleSection';
import { buildProvisionerOptions } from '../../../_components/form/provisioner-options';
import {
  addPricingAction,
  deletePricingAction,
  updateProductAction,
  type PricingRowResult,
} from '../../../_actions';
import styles from '../../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   ProductEditForm — edición de producto (F4·U27 reskin 1:1). Reusa las secciones
   compartidas con el alta (`_components/form/`). Orden alineado con el alta
   (decisión Yasmin): Identidad → Pricing → Provisioning → Ciclo de vida. `type`
   es inmutable (PROD-INV-2) → subtítulo, no editable. Pricing = planes
   persistidos (CRUD atómico via add/deletePricingAction), no filas inline.
   Mutación canónica via Server Actions + revalidatePath (ADR-078 A1).
   ═══════════════════════════════════════════════════════════════════════════ */

const TYPE_LABELS: Record<string, string> = {
  hosting_web: 'Hosting Web',
  domain: 'Dominio',
  docker_service: 'Docker Service',
  support_inside: 'Support Inside',
  we_do_it: 'We Do It',
  custom_service: 'Proyecto Custom',
};

export interface InitialProduct {
  id: string;
  type: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  badge_text: string | null;
  provisioner: string | null;
  /**
   * ADR-080 Amendment B. Persistido en `Product.provisioner_config` (jsonb).
   * Inyectado en `ProvisionContext.productConfig` durante `provision()`.
   */
  provisioner_config: Record<string, unknown> | null;
  grace_period_days: number;
  suspension_days: number;
  cancellation_days: number;
  client_can_pause: boolean;
  partner_commission_pct: number | string | null;
  pricing: PricingRowResult[];
}

interface Props {
  initial: InitialProduct;
  initialPlugins: readonly AdminPluginListItem[];
}

export default function ProductEditForm({ initial, initialPlugins }: Props) {
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
  const [provisionerConfig, setProvisionerConfig] = useState<
    Record<string, unknown>
  >(initial.provisioner_config ?? {});
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

  const isAddon =
    initial.type === 'support_inside' || initial.type === 'we_do_it';
  // Sprint 15D.F.4 — "Dominio" no usa ProductPricing (precio por TLD en
  // `domain_tld_pricing`, ADR-084 §1); su ciclo de vida lo gobierna el registrar.
  const isDomain = initial.type === 'domain';
  const showLifecycle = !isAddon && !isDomain;

  // ADR-080 Amendment B — schema declarativo del provisioner seleccionado.
  const selectedPlugin = initialPlugins.find((p) => p.slug === provisioner);
  const productConfigSchema = selectedPlugin?.manifest?.productConfigSchema;
  const hasProductConfigSchema =
    productConfigSchema !== undefined &&
    Object.keys(productConfigSchema.properties ?? {}).length > 0;

  const provisionerOptions = buildProvisionerOptions(initialPlugins, provisioner);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    // ADR-080 Amendment B — validación form-side (UX). Defense-in-depth canónica
    // vive en el plugin runtime (`provision()` lanza `INVALID_PAYLOAD`).
    if (hasProductConfigSchema) {
      const result = validator.validateFormData(
        provisionerConfig,
        productConfigSchema as RJSFSchema,
      );
      if (result.errors.length > 0) {
        const firstError = result.errors[0];
        setError(
          `Configuración del provisioner: ${firstError.stack ?? firstError.message ?? 'inválida'}`,
        );
        return;
      }
    }

    setSaving(true);
    const result = await updateProductAction(initial.id, {
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description || undefined,
      short_description: shortDescription || undefined,
      badge_text: badgeText || undefined,
      provisioner: provisioner || undefined,
      // Sin schema → `null` limpia config residual de un provisioner anterior.
      provisioner_config: hasProductConfigSchema ? provisionerConfig : null,
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
      headerActions={
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

      <form
        id="edit-product-form"
        onSubmit={handleSave}
        className={styles.formSections}
      >
        <IdentitySection
          name={name}
          onNameChange={setName}
          slug={slug}
          onSlugChange={setSlug}
          badgeText={badgeText}
          onBadgeChange={setBadgeText}
          partnerCommission={partnerCommission}
          onPartnerCommissionChange={setPartnerCommission}
          shortDescription={shortDescription}
          onShortDescriptionChange={setShortDescription}
          description={description}
          onDescriptionChange={setDescription}
          subtitle={`${TYPE_LABELS[initial.type] ?? initial.type} · ${slug}`}
        />

        {!isDomain && (
          <Card>
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Planes de precio</h3>
              {existingPricing.length > 0 && (
                <div className={styles.pricingList}>
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
                      <div className={styles.pricingItemRight}>
                        <span className={styles.pricingItemPrice}>
                          {Number(p.price).toFixed(2)} €
                        </span>
                        <button
                          type="button"
                          onClick={() => setDeletePricingId(p.id)}
                          className={styles.removeBtn}
                          aria-label="Eliminar plan"
                        >
                          <X size={14} strokeWidth={1.6} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.pricingAddRow}>
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
        )}

        {!isAddon && (
          <ProvisioningSection
            provisioner={provisioner}
            onProvisionerChange={(v) => {
              setProvisioner(v);
              setProvisionerConfig({});
            }}
            options={provisionerOptions}
            hasProductConfigSchema={hasProductConfigSchema}
            productConfigSchema={productConfigSchema as RJSFSchema | undefined}
            provisionerConfig={provisionerConfig}
            onConfigChange={setProvisionerConfig}
          />
        )}

        {showLifecycle && (
          <LifecycleSection
            gracePeriod={gracePeriod}
            onGraceChange={setGracePeriod}
            suspensionDays={suspensionDays}
            onSuspensionChange={setSuspensionDays}
            cancellationDays={cancellationDays}
            onCancellationChange={setCancellationDays}
            clientCanPause={clientCanPause}
            onClientCanPauseChange={setClientCanPause}
          />
        )}
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
