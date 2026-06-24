'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';

import { createProductAction } from '../../_actions';
import { PRODUCT_TYPES, CYCLE_OPTIONS } from '../constants';
import type { PricingRow } from '../constants';
import {
  Card,
  Input,
  Select,
  Textarea,
  Button,
  AlertBanner,
  FormPage,
  useToast,
} from '../../../../components/ui';
import type { AdminPluginListItem } from '../../../../lib/api';
import { t, translateSchema } from '../../../../_shared/i18n';
import {
  aeliumDsTemplates,
  aeliumDsWidgets,
} from '../../../../_shared/plugins/rjsf-theme';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   NewProductForm — Sprint 13 §13.AUTH Fase E (Modelo A) + Sprint 15C
   Fase 15C.E.2 (ADR-080 Amendment B).

   - Step 1: Type selection.
   - Step 2: Form (identidad + pricing + provisioning + lifecycle).
   - Provisioner pasa de free Input a Select alimentado por la lista
     `initialPlugins` del SC parent (`GET /admin/plugins`).
   - Cuando el plugin seleccionado declara `manifest.productConfigSchema`
     (ej. enhance_cp con `enhance_plan_id`), se renderiza un sub-form
     dinámico via `@rjsf/core` + tema DS. El JSON resultante se manda
     al backend como `provisioner_config` y se guarda en
     `Product.provisioner_config` (jsonb) — el plugin lo recibe en
     `ProvisionContext.productConfig` durante `provision()`.

   Mutación canónica via `createProductAction` (Server Action).
   ADR-078 Amendment A1.
   ═══════════════════════════════════════════════════════════════════════════ */

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
  const isSupportInside = selectedType === 'support_inside';
  const isWeDoIt = selectedType === 'we_do_it';
  const isCustomService = selectedType === 'custom_service';
  // Sprint 15D Fase 15D.F.4 — un producto "Dominio" NO lleva ProductPricing: el
  // precio vive en `domain_tld_pricing` por TLD (lo rellena el cron del
  // registrar, ADR-084 §1). Por eso ocultamos la card "Pricing" y saltamos el
  // requisito de plan. El markup% + TLDs ofertados se configuran en los ajustes
  // del plugin RC.
  const isDomain = selectedType === 'domain';
  // El ciclo de vida de un dominio lo gobierna el registrar (expires_at / ICANN),
  // no las políticas de gracia/suspensión/cancelación en días → card oculta.
  const showLifecycle = !isSupportInside && !isWeDoIt && !isDomain;

  // ADR-080 Amendment B — schema del provisioner seleccionado.
  // Si el plugin no declara `productConfigSchema` o no tiene properties,
  // el sub-form NO se renderiza (plugins triviales internal/manual).
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
    setProvisionerConfig({}); // se reinicia al cambiar tipo (cambia provisioner default).
    if (typeValue === 'custom_service') {
      setPricingRows([
        { billing_cycle: 'one_time', price: '', setup_fee: '0' },
      ]);
    }
  };

  const handleProvisionerChange = (val: string) => {
    setProvisioner(val);
    // Reset config al cambiar de plugin: el nuevo schema puede ser distinto.
    setProvisionerConfig({});
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

    // ADR-080 Amendment B — validación form-side (UX) del sub-form
    // dinámico. La defense-in-depth canónica vive en el plugin runtime
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
    const result = await createProductAction({
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
      provisioner_config: hasProductConfigSchema
        ? provisionerConfig
        : undefined,
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

  const breadcrumb = selectedType
    ? [
        { label: 'Productos', href: '/admin/products' },
        { label: `Nuevo ${typeMeta?.label || 'producto'}` },
      ]
    : [
        { label: 'Productos', href: '/admin/products' },
        { label: 'Nuevo producto' },
      ];

  return (
    <FormPage
      breadcrumb={breadcrumb}
      title={!selectedType ? 'Nuevo producto' : `Nuevo ${typeMeta?.label}`}
      actions={
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

      {/* ── STEP 1: Type Selection ── */}
      {!selectedType && (
        <Card>
          <div className={styles.formSection}>
            <p className={styles.stepDesc}>
              ¿Qué tipo de producto quieres crear?
            </p>
            <div className={styles.typeGrid}>
              {PRODUCT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleTypeSelect(t.value)}
                  className={styles.typeCard}
                >
                  <div className={styles.typeCardHeader}>
                    <span className={styles.typeLabel}>{t.label}</span>
                    {t.isAddon && (
                      <span className={styles.addonBadge}>Addon</span>
                    )}
                  </div>
                  <p className={styles.typeDesc}>{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ── STEP 2: Form ── */}
      {selectedType && (
        <form id="product-form" onSubmit={handleSubmit}>
          {isAddonType && (
            <AlertBanner variant="info">
              <span className={styles.addonBadgeLabel}>Addon</span> —
              {isSupportInside &&
                ' Global de cuenta · Requiere producto activo previo'}
              {isWeDoIt &&
                ' Por producto · Solo aplica a hosting_web y docker_service'}
            </AlertBanner>
          )}

          {/* Card: Identity */}
          <Card>
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Identidad</h3>
              <div className={styles.formGrid}>
                <Input
                  label="Nombre *"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={
                    isSupportInside ? 'Support Inside Básico' : 'Hosting Starter'
                  }
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
                  placeholder="Más popular"
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

          {/* Card: Pricing — oculta para dominios (precio por TLD en
              domain_tld_pricing, no en ProductPricing). */}
          {!isDomain && (
          <div className={styles.mt6}>
            <Card>
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>Pricing</h3>
                <div className={styles.spaceY2}>
                  {pricingRows.map((row, idx) => (
                    <div key={idx} className={styles.pricingRow}>
                      <Select
                        label="Ciclo"
                        value={row.billing_cycle}
                        onChange={(e) =>
                          updatePricingRow(idx, 'billing_cycle', e.target.value)
                        }
                        options={CYCLE_OPTIONS}
                      />
                      <Input
                        label="Precio (€) *"
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.price}
                        onChange={(e) =>
                          updatePricingRow(idx, 'price', e.target.value)
                        }
                        placeholder="9.99"
                      />
                      <Input
                        label="Setup fee (€)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.setup_fee}
                        onChange={(e) =>
                          updatePricingRow(idx, 'setup_fee', e.target.value)
                        }
                        placeholder="0"
                      />
                      <button
                        type="button"
                        onClick={() => removePricingRow(idx)}
                        disabled={pricingRows.length <= 1}
                        className={styles.removeBtn}
                      >
                        <svg
                          width="16"
                          height="16"
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
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addPricingRow}
                  className={styles.addPricingBtn}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Añadir plan
                </button>
              </div>
            </Card>
          </div>
          )}

          {/* Card: Provisioning (non-addons only) */}
          {!isAddonType && (
            <div className={styles.mt6}>
              <Card>
                <div className={styles.formSection}>
                  <h3 className={styles.sectionTitle}>Provisioning</h3>
                  <div className={styles.formGrid}>
                    <Select
                      label="Provisioner"
                      value={provisioner}
                      onChange={(e) =>
                        handleProvisionerChange(e.target.value)
                      }
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
                        // id="product-form"> wrapper rompería la hidratación.
                        // El submit unitario del wrapper invoca a
                        // `validator.validateFormData(provisionerConfig, schema)`
                        // antes del POST/PATCH para enforcement form-side.
                        tagName="div"
                        schema={translateSchema(productConfigSchema as RJSFSchema)}
                        formData={provisionerConfig}
                        widgets={aeliumDsWidgets}
                        templates={aeliumDsTemplates}
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

          {/* Card: Lifecycle (products only) */}
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

          {(isSupportInside || isWeDoIt || isCustomService || isDomain) && (
            <div className={styles.mt4}>
              <AlertBanner variant="info">
                {isDomain && (
                  <>
                    <strong>Dominios</strong> — El precio se calcula por extensión
                    (TLD) desde la tabla de pricing, que rellena el cron del
                    registrar. El markup y los TLDs ofertados se configuran en los
                    ajustes del plugin del registrar.
                  </>
                )}
                {isSupportInside && (
                  <>
                    <strong>Support Inside</strong> — Los canales, SLA, y
                    configuración de slots se definirán en el Sprint de Soporte.
                  </>
                )}
                {isWeDoIt && (
                  <>
                    <strong>We Do It For You</strong> — La vinculación a
                    productos específicos se gestionará en el Sprint de
                    Provisioning.
                  </>
                )}
                {isCustomService && (
                  <>
                    <strong>Proyecto Custom</strong> — Se crea manualmente para
                    cada proyecto. El agente recibe una tarea al activarse.
                  </>
                )}
              </AlertBanner>
            </div>
          )}
        </form>
      )}
    </FormPage>
  );
}

/**
 * Construye las opciones del Select de provisioner desde la lista del
 * backend. Etiqueta humana del manifest si existe; si no, fallback al slug.
 *
 * Mantenemos `manual` siempre disponible aunque no llegue del backend
 * (plugin trivial bootstrap). El manifest del backend lo expone, pero
 * defensivo por si la lista llegase vacía en boot.
 */
function buildProvisionerOptions(
  plugins: readonly AdminPluginListItem[],
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
  }
  return options;
}
