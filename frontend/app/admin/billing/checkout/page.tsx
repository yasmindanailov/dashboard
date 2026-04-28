'use client';

import { useCheckout } from '../../../_shared/billing/checkout/useCheckout';
import { CYCLE_LABELS, CYCLE_SAVINGS, fmt } from '../../../_shared/billing/checkout/types';
import StepConfirm from '../../../_shared/billing/checkout/StepConfirm';
import { FormPage, Card, Input, Button, Badge, SearchInput, Skeleton } from '../../../components/ui';
import styles from '../../../_shared/billing/checkout/checkout.module.css';

/* ═══════════════════════════════════════
   Admin Checkout — Portal de Administración (ADR-066 Fase E.2)
   Crear servicio para cliente: 5 steps incluyendo selector de cliente.
   Audiencia: superadmin / agent_full / agent_billing (CASL Manage Invoice).
   El cliente final tiene `/dashboard/billing/checkout` (4 steps sin cliente).

   El hook `useCheckout` resuelve `isAdmin` desde AuthContext y construye
   el array `allSteps` con o sin step 'client' según el rol del caller.
   Esta page sólo renderiza el resultado.
   Ref: UI_SPEC §2.6, ADR-066, ADR-067
   ═══════════════════════════════════════ */

export default function AdminCheckoutPage() {
  const c = useCheckout();

  return (
    <FormPage
      breadcrumb={[
        { label: 'Facturación', href: '/admin/billing' },
        { label: 'Crear servicio para cliente' },
      ]}
      title="Crear servicio para cliente"
    >
      {/* Step indicator */}
      <div className={styles.steps}>
        {c.allSteps.map((s, i) => (
          <div key={s.key} className={styles.step}>
            <div className={`${styles.stepCircle} ${i <= c.currentStepIndex ? styles.stepCircleActive : styles.stepCircleInactive}`}>
              {s.num}
            </div>
            <span className={`${styles.stepLabel} ${i <= c.currentStepIndex ? styles.stepLabelActive : styles.stepLabelInactive}`}>
              {s.label}
            </span>
            {i < c.allSteps.length - 1 && (
              <div className={`${styles.stepLine} ${i < c.currentStepIndex ? styles.stepLineActive : styles.stepLineInactive}`} />
            )}
          </div>
        ))}
      </div>

      {/* STEP: Client selector (admin-only entry point) */}
      {c.step === 'client' && (
        <Card>
          <div className={styles.cardPadding}>
            <h2 className={styles.stepTitle}>Selecciona un cliente</h2>
            <p className={styles.stepDescription}>Busca al cliente para el que quieres contratar el servicio</p>

            <SearchInput
              value={c.clientSearch}
              onChange={e => c.setClientSearch(e.target.value)}
              placeholder="Buscar por nombre o email..."
            />

            {c.searchingClients && <p className={styles.searchingText}>Buscando...</p>}

            {c.selectedClient && (
              <div className={styles.selectedCard}>
                <div>
                  <div className={styles.selectedName}>{c.selectedClient.first_name} {c.selectedClient.last_name}</div>
                  <div className={styles.selectedEmail}>{c.selectedClient.email}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={c.clearSelectedClient}>Cambiar</Button>
              </div>
            )}

            {c.clientResults.length > 0 && !c.selectedClient && (
              <div className={styles.clientGrid}>
                {c.clientResults.map((client) => (
                  <button key={client.id} onClick={() => c.handleSelectClient(client)} className={styles.clientItem}>
                    <div className={styles.clientAvatar}>
                      {client.first_name?.[0]}{client.last_name?.[0]}
                    </div>
                    <div>
                      <div className={styles.clientName}>{client.first_name} {client.last_name}</div>
                      <div className={styles.clientEmail}>{client.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {c.selectedClient && (
              <div className={styles.navEnd}>
                <Button onClick={() => c.setStep('product')}>Continuar →</Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* STEP: Product selection */}
      {c.step === 'product' && (
        <div>
          <h2 className={styles.stepTitle}>Selecciona un producto</h2>
          {c.loading ? (
            <div className={styles.productGrid}>
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <div className={styles.cardPaddingSkeleton}>
                    <Skeleton width="60%" height={20} />
                    <Skeleton width="100%" height={14} />
                    <Skeleton width="40%" height={24} />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className={styles.productGrid}>
              {c.products.map((product) => {
                const lowestPrice = product.pricing.filter((p) => p.active).reduce((min, p) => Math.min(min, Number(p.price)), Infinity);
                return (
                  <button key={product.id} onClick={() => c.handleSelectProduct(product)} className={styles.productCard}>
                    <div className={styles.productHeader}>
                      <h3 className={styles.productName}>{product.name}</h3>
                      {product.badge_text && <Badge variant="info">{product.badge_text}</Badge>}
                    </div>
                    <p className={styles.productDesc}>
                      {product.short_description || product.description?.slice(0, 120) || ''}
                    </p>
                    <div className={styles.productPrice}>
                      {fmt(lowestPrice)}<span className={styles.productPriceSuffix}>/mes</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STEP: Pricing */}
      {c.step === 'pricing' && c.selectedProduct && (
        <div>
          <h2 className={styles.stepTitle}>Elige el plan — {c.selectedProduct.name}</h2>
          <p className={styles.stepDescription}>Selecciona el ciclo de facturación que prefieras</p>
          <div className={styles.pricingGrid}>
            {c.selectedProduct.pricing.filter((p) => p.active).map((pricing) => (
              <button
                key={pricing.id}
                onClick={() => { c.setSelectedPricing(pricing); c.setStep('profile'); }}
                className={`${styles.pricingCard} ${c.selectedPricing?.id === pricing.id ? styles.pricingCardSelected : styles.pricingCardDefault}`}
              >
                <div className={styles.pricingCycle}>{CYCLE_LABELS[pricing.billing_cycle] || pricing.billing_cycle}</div>
                <div className={styles.pricingAmount}>{fmt(pricing.price, pricing.currency)}</div>
                {Number(pricing.setup_fee) > 0 && (
                  <div className={styles.pricingSetup}>+ {fmt(pricing.setup_fee, pricing.currency)} setup</div>
                )}
                {CYCLE_SAVINGS[pricing.billing_cycle] && (
                  <Badge variant="success">{`Ahorra ${CYCLE_SAVINGS[pricing.billing_cycle]}`}</Badge>
                )}
              </button>
            ))}
          </div>
          <div className={styles.navStart}>
            <Button variant="ghost" onClick={() => c.setStep('product')}>← Cambiar producto</Button>
          </div>
        </div>
      )}

      {/* STEP: Billing profile */}
      {c.step === 'profile' && (
        <div>
          <h2 className={styles.stepTitle}>Perfil de facturación</h2>
          <p className={styles.stepDescription}>Selecciona el perfil para esta factura (opcional)</p>
          <div className={styles.profileGrid}>
            <button
              onClick={() => c.setSelectedProfile(null)}
              className={`${styles.profileCard} ${!c.selectedProfile ? styles.profileCardSelected : styles.profileCardDefault}`}
            >
              <div className={styles.profileLabel}>{c.targetUserName}</div>
              <div className={styles.profileMeta}>{c.targetUserEmail}</div>
              <div className={styles.profileInvoiceHint}>Factura simplificada (sin NIF)</div>
            </button>
            {c.profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => c.setSelectedProfile(profile)}
                className={`${styles.profileCard} ${c.selectedProfile?.id === profile.id ? styles.profileCardSelected : styles.profileCardDefault}`}
              >
                <div className={styles.profileHeaderRow}>
                  <span className={styles.profileLabel}>{profile.label}</span>
                  {profile.is_default && <Badge variant="neutral">Default</Badge>}
                </div>
                {profile.company_name && <div className={styles.profileCompany}>{profile.company_name}</div>}
                <div className={styles.profileMeta}>
                  {profile.first_name} {profile.last_name}
                  {profile.nif_cif && <> · {profile.nif_cif}</>}
                </div>
                <div className={styles.profileMeta}>
                  {profile.address_line1}, {profile.postal_code} {profile.city}
                </div>
              </button>
            ))}
          </div>

          {/* Optional service fields */}
          <Card>
            <div className={styles.cardPadding}>
              <h3 className={styles.serviceFieldsTitle}>Datos del servicio (opcional)</h3>
              <div className={styles.serviceFieldsGrid}>
                <Input label="Etiqueta" value={c.label} onChange={e => c.setLabel(e.target.value)} placeholder="Mi web principal" />
                <Input label="Dominio" value={c.domain} onChange={e => c.setDomain(e.target.value)} placeholder="midominio.com" />
              </div>
            </div>
          </Card>

          <div className={styles.navBetween}>
            <Button variant="ghost" onClick={() => c.setStep('pricing')}>← Atrás</Button>
            <Button onClick={() => c.setStep('confirm')}>Continuar →</Button>
          </div>
        </div>
      )}

      {/* STEP: Confirm */}
      {c.step === 'confirm' && c.selectedProduct && c.selectedPricing && (
        <StepConfirm
          isAdmin={c.isAdmin}
          selectedProduct={c.selectedProduct}
          selectedPricing={c.selectedPricing}
          selectedProfile={c.selectedProfile}
          selectedClient={c.selectedClient}
          targetUserName={c.targetUserName || ''}
          label={c.label}
          domain={c.domain}
          submitting={c.submitting}
          error={c.error}
          onBack={() => c.setStep('profile')}
          onCheckout={c.handleCheckout}
        />
      )}
    </FormPage>
  );
}
