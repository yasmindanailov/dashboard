'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';

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
import type { AdminPluginListItem } from '../../../../../lib/api';
import { t, translateSchema } from '../../../../../_shared/i18n';
import { aeliumDsWidgets } from '../../../../../_shared/plugins/rjsf-theme';
import {
  addPricingAction,
  deletePricingAction,
  updateProductAction,
  type PricingRowResult,
} from '../../../_actions';
import styles from '../../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   ProductEditForm — Sprint 13 §13.AUTH Fase E (Modelo A) + Sprint 15C
   Fase 15C.E.2 (ADR-080 Amendment B).

   Recibe producto + lista plugins prehidratados por SC. Save →
   updateProductAction + revalidatePath. Pricing CRUD via
   add/deletePricingAction. Cero localStorage, cero useEffect+fetch.

   Provisioner es un Select alimentado por `initialPlugins` (manifest
   serializado del backend). Si el plugin seleccionado declara
   `manifest.productConfigSchema`, se renderiza sub-form dinámico
   via `@rjsf/core` y el JSON resultante se envía como
   `provisioner_config` al backend.
   ═══════════════════════════════════════════════════════════════════════════ */

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
  /**
   * Sprint 15C Fase 15C.E.2 — ADR-080 Amendment B.
   * Persistido en `Product.provisioner_config` (jsonb). Inyectado en
   * `ProvisionContext.productConfig` durante `provision()`.
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

  const isAddon = initial.type === 'support_inside' || initial.type === 'we_do_it';
  const showLifecycle = !isAddon;

  // ADR-080 Amendment B — schema declarativo del provisioner seleccionado.
  const selectedPlugin = initialPlugins.find((p) => p.slug === provisioner);
  const productConfigSchema = selectedPlugin?.manifest?.productConfigSchema;
  const hasProductConfigSchema =
    productConfigSchema !== undefined &&
    Object.keys(productConfigSchema.properties ?? {}).length > 0;

  const provisionerOptions = buildProvisionerOptions(initialPlugins, provisioner);

  const handleProvisionerChange = (val: string) => {
    setProvisioner(val);
    // Reset config al cambiar de plugin: el schema nuevo puede ser distinto.
    setProvisionerConfig({});
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    // ADR-080 Amendment B — validación form-side (UX) del sub-form
    // dinámico. Defense-in-depth canónica vive en plugin runtime
    // (`provision()` lanza `INVALID_PAYLOAD` si el shape no coincide).
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
      // Si el plugin no declara schema enviamos `null` para limpiar config
      // residual de un provisioner anterior. Si declara schema enviamos el
      // JSON validado.
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
                  <Select
                    label="Provisioner"
                    value={provisioner}
                    onChange={(e) => handleProvisionerChange(e.target.value)}
                    options={provisionerOptions}
                    helperText="Plugins disponibles registrados en /admin/settings/plugins"
                  />
                </div>

                {hasProductConfigSchema && (
                  <div className={styles.mt4}>
                    <h4
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        margin: '12px 0 8px',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Configuración del provisioner
                    </h4>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-tertiary)',
                        margin: '0 0 12px',
                      }}
                    >
                      Campos definidos por el manifest del plugin{' '}
                      <code>{provisioner}</code>. Se persisten en{' '}
                      <code>products.provisioner_config</code>.
                    </p>
                    <Form
                      // tagName="div" evita que @rjsf/core renderice un
                      // <form> interno — anidado dentro del <form
                      // id="edit-product-form"> wrapper rompería la
                      // hidratación. El submit unitario del wrapper invoca
                      // a `validator.validateFormData(provisionerConfig,
                      // schema)` antes del PATCH para enforcement form-side.
                      tagName="div"
                      schema={translateSchema(productConfigSchema as RJSFSchema)}
                      formData={provisionerConfig}
                      widgets={aeliumDsWidgets}
                      validator={validator}
                      onChange={(e: IChangeEvent) =>
                        setProvisionerConfig(
                          (e.formData ?? {}) as Record<string, unknown>,
                        )
                      }
                      uiSchema={{
                        'ui:submitButtonOptions': { norender: true },
                      }}
                      showErrorList={false}
                    />
                  </div>
                )}
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

/**
 * Construye las opciones del Select de provisioner desde la lista del
 * backend. Etiqueta humana del manifest si existe; si no, fallback al slug.
 *
 * Si el `currentSlug` no coincide con ningún plugin (ej. plugin removido o
 * registry caído), se añade igualmente como opción con sufijo "(no
 * registrado)" para no perder el valor del producto.
 *
 * Mantenemos `manual` siempre disponible aunque no llegue del backend
 * (plugin trivial bootstrap). Defensivo por si la lista llegase vacía.
 */
function buildProvisionerOptions(
  plugins: readonly AdminPluginListItem[],
  currentSlug: string,
): { value: string; label: string }[] {
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const p of plugins) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    options.push({
      value: p.slug,
      label: p.manifest?.label ? `${t(p.manifest.label)} (${p.slug})` : p.slug,
    });
  }
  if (!seen.has('manual')) {
    options.push({ value: 'manual', label: 'manual' });
    seen.add('manual');
  }
  if (currentSlug && !seen.has(currentSlug)) {
    options.push({
      value: currentSlug,
      label: `${currentSlug} (no registrado)`,
    });
  }
  return options;
}
