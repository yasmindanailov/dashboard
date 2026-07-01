'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import validator from '@rjsf/validator-ajv8';
import type { RJSFSchema } from '@rjsf/utils';

import { createProductAction } from '../../_actions';
import { PRODUCT_TYPES } from '../constants';
import type { PricingRow } from '../constants';
import { Button, AlertBanner, FormPage, useToast } from '../../../../components/ui';
import type { AdminPluginListItem } from '../../../../lib/api';
import { IdentitySection } from '../../_components/form/IdentitySection';
import { ProvisioningSection } from '../../_components/form/ProvisioningSection';
import { LifecycleSection } from '../../_components/form/LifecycleSection';
import {
  AddonBanner,
  ProductInfoBanner,
} from '../../_components/form/ProductBanners';
import { buildProvisionerOptions } from '../../_components/form/provisioner-options';
import { TypeSelectorGrid } from './TypeSelectorGrid';
import { PricingRowsEditor } from './PricingRowsEditor';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   NewProductForm — alta de producto (F4·U27 reskin 1:1 con
   `admin/ProductoForm.dc.html`). Paso 1: selección de tipo. Paso 2: form por
   secciones (Identidad → Pricing → Provisioning → Ciclo de vida → nota). Las
   secciones compartidas con editar viven en `_components/form/` (R15 DRY).

   `support_inside` NO es creable aquí (ADR-075 — se gestiona en
   `/admin/support-inside-plans`). Provisioner = Select de plugins reales +
   sub-form dinámico `provisioner_config` (@rjsf, ADR-080 Amendment B).
   Mutación canónica via `createProductAction` (Server Action, ADR-078 A1).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Nota informativa por tipo (banner gris) — 1:1 con el mockup. */
const TYPE_INFO: Record<string, { title: string; text: string }> = {
  domain: {
    title: 'Dominios',
    text: 'El precio se calcula por extensión (TLD) desde la tabla de pricing del registrar. El markup y los TLDs ofertados se configuran en los ajustes del plugin.',
  },
  we_do_it: {
    title: 'We Do It For You',
    text: 'La vinculación a productos específicos se gestiona en el módulo de provisioning.',
  },
  custom_service: {
    title: 'Proyecto Custom',
    text: 'Se crea manualmente para cada proyecto. El agente recibe una tarea al activarse.',
  },
};

interface Props {
  initialPlugins: readonly AdminPluginListItem[];
}

export default function NewProductForm({ initialPlugins }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [badgeText, setBadgeText] = useState('');
  const [provisioner, setProvisioner] = useState('manual');
  const [provisionerConfig, setProvisionerConfig] = useState<
    Record<string, unknown>
  >({});
  const [gracePeriod, setGracePeriod] = useState('0');
  const [suspensionDays, setSuspensionDays] = useState('7');
  const [cancellationDays, setCancellationDays] = useState('30');
  const [clientCanPause, setClientCanPause] = useState(false);
  const [partnerCommission, setPartnerCommission] = useState('');
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([
    { billing_cycle: 'monthly', price: '', setup_fee: '0' },
  ]);

  const typeMeta = PRODUCT_TYPES.find((t) => t.value === selectedType);
  const isAddonType = typeMeta?.isAddon ?? false;
  const isWeDoIt = selectedType === 'we_do_it';
  const isCustomService = selectedType === 'custom_service';
  // Sprint 15D.F.4 — "Dominio" NO lleva ProductPricing (el precio vive por TLD en
  // `domain_tld_pricing`, ADR-084 §1) → card Pricing oculta. Su ciclo de vida lo
  // gobierna el registrar (expires_at / ICANN) → card Ciclo de vida oculta.
  const isDomain = selectedType === 'domain';
  const showLifecycle = !isWeDoIt && !isDomain;
  const info = selectedType ? TYPE_INFO[selectedType] : undefined;

  // ADR-080 Amendment B — schema del provisioner seleccionado. Si el plugin no
  // declara `productConfigSchema` (o sin properties), no se renderiza sub-form.
  const selectedPlugin = initialPlugins.find((p) => p.slug === provisioner);
  const productConfigSchema = selectedPlugin?.manifest?.productConfigSchema;
  const hasProductConfigSchema =
    productConfigSchema !== undefined &&
    Object.keys(productConfigSchema.properties ?? {}).length > 0;

  const provisionerOptions = buildProvisionerOptions(initialPlugins);

  const generateSlug = (val: string) =>
    val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === generateSlug(name)) setSlug(generateSlug(val));
  };

  const handleTypeSelect = (typeValue: string) => {
    const meta = PRODUCT_TYPES.find((t) => t.value === typeValue)!;
    setSelectedType(typeValue);
    setProvisioner(meta.defaultProvisioner);
    setProvisionerConfig({}); // reinicia al cambiar tipo (cambia provisioner default).
    if (typeValue === 'custom_service') {
      setPricingRows([{ billing_cycle: 'one_time', price: '', setup_fee: '0' }]);
    }
  };

  const handleProvisionerChange = (val: string) => {
    setProvisioner(val);
    setProvisionerConfig({}); // el schema nuevo puede ser distinto.
  };

  const addPricingRow = () =>
    setPricingRows([
      ...pricingRows,
      { billing_cycle: 'annual', price: '', setup_fee: '0' },
    ]);
  const removePricingRow = (idx: number) =>
    setPricingRows(pricingRows.filter((_, i) => i !== idx));
  const updatePricingRow = (
    idx: number,
    field: keyof PricingRow,
    val: string,
  ) => {
    const rows = [...pricingRows];
    rows[idx] = { ...rows[idx], [field]: val };
    setPricingRows(rows);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!isCustomService && !isDomain && !pricingRows.some((r) => r.price)) {
      setError('Debe haber al menos un plan de precio.');
      return;
    }

    // ADR-080 Amendment B — validación form-side (UX) del sub-form dinámico. La
    // defense-in-depth canónica vive en el plugin runtime (`provision()` lanza
    // `INVALID_PAYLOAD` si el shape no coincide).
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
    const result = await createProductAction({
      name: name.trim(),
      slug: slug.trim() || undefined,
      type: selectedType,
      description: description || undefined,
      short_description: shortDescription || undefined,
      badge_text: badgeText || undefined,
      is_addon: isAddonType,
      is_global_addon: false,
      requires_existing_product: isWeDoIt,
      provisioner,
      provisioner_config: hasProductConfigSchema ? provisionerConfig : undefined,
      grace_period_days: parseInt(gracePeriod) || 0,
      suspension_days: parseInt(suspensionDays) || 7,
      cancellation_days: parseInt(cancellationDays) || 30,
      client_can_pause: clientCanPause,
      partner_commission_pct: partnerCommission
        ? parseFloat(partnerCommission)
        : undefined,
      pricing: pricingRows
        .filter((r) => r.price)
        .map((r) => ({
          billing_cycle: r.billing_cycle,
          price: parseFloat(r.price),
          setup_fee: parseFloat(r.setup_fee) || 0,
        })),
    });
    if (!result.ok) {
      toast('error', result.error);
      setSaving(false);
      return;
    }
    router.push('/admin/products');
  };

  const breadcrumb = [
    { label: 'Productos', href: '/admin/products' },
    { label: selectedType ? `Nuevo ${typeMeta?.label}` : 'Nuevo producto' },
  ];

  return (
    <FormPage
      breadcrumb={breadcrumb}
      title={!selectedType ? 'Nuevo producto' : `Nuevo ${typeMeta?.label}`}
      headerActions={
        selectedType ? (
          <>
            <Button variant="secondary" onClick={() => setSelectedType(null)}>
              Cambiar tipo
            </Button>
            <Button type="submit" form="product-form" loading={saving}>
              {saving ? 'Guardando...' : `Crear ${typeMeta?.label}`}
            </Button>
          </>
        ) : undefined
      }
    >
      {error && (
        <AlertBanner variant="danger" onClose={() => setError('')}>
          {error}
        </AlertBanner>
      )}

      {!selectedType && <TypeSelectorGrid onSelect={handleTypeSelect} />}

      {selectedType && (
        <form
          id="product-form"
          onSubmit={handleSubmit}
          className={styles.formSections}
        >
          {isAddonType && (
            <AddonBanner text="Por producto · Solo aplica a hosting_web y docker_service. No lleva provisioner propio." />
          )}

          <IdentitySection
            name={name}
            onNameChange={handleNameChange}
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
            namePlaceholder={typeMeta?.namePlaceholder}
          />

          {!isDomain && (
            <PricingRowsEditor
              rows={pricingRows}
              onAdd={addPricingRow}
              onRemove={removePricingRow}
              onUpdate={updatePricingRow}
            />
          )}

          {!isAddonType && (
            <ProvisioningSection
              provisioner={provisioner}
              onProvisionerChange={handleProvisionerChange}
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

          {info && <ProductInfoBanner title={info.title} text={info.text} />}
        </form>
      )}
    </FormPage>
  );
}
