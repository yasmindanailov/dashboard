'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AlertBanner, Badge, Button, Card } from '../../../../components/ui';
import {
  CYCLE_LABELS,
  CYCLE_SAVINGS,
  fmt,
  type Product,
  type ProductPricing,
} from '../../../../_shared/billing/checkout/types';
import type { ProductPurchaseContext } from '../../../../_shared/cart/types';
import { useCart } from '../../../../_shared/cart/useCart';

/* ═══════════════════════════════════════
   ProductConfig — paso de configuración del producto (Sprint 15D Fase 15D.F.4).
   Aquí se elige el ciclo de facturación (no en el catálogo). Para hosting, el
   paso de dominio se añade en un commit posterior. → "Añadir al carrito".
   ═══════════════════════════════════════ */

function defaultPricing(pricings: ProductPricing[]): ProductPricing | null {
  const active = pricings.filter((p) => p.active);
  if (active.length === 0) return null;
  return active.find((p) => p.billing_cycle === 'annual') ?? active[0];
}

export default function ProductConfig({
  product,
  context,
}: {
  product: Product;
  context: ProductPurchaseContext | null;
}) {
  const router = useRouter();
  const cart = useCart();
  const active = product.pricing.filter((p) => p.active);
  const [selectedId, setSelectedId] = useState<string>(
    () => defaultPricing(product.pricing)?.id ?? '',
  );

  const selected = active.find((p) => p.id === selectedId) ?? null;
  const inCart = selected ? cart.hasKey(`product:${selected.id}`) : false;

  const ownsGlobal = context?.reason === 'owns_global_addon';
  const atLimit = context?.reason === 'at_quantity_limit';

  function handleAdd() {
    if (!selected) return;
    cart.addItem({
      kind: 'product',
      productPricingId: selected.id,
      productName: product.name,
      cycleLabel: CYCLE_LABELS[selected.billing_cycle] ?? selected.billing_cycle,
      price: { amount: selected.price, currency: selected.currency },
    });
    router.push('/dashboard/store/cart');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link
        href="/dashboard/store"
        style={{
          color: 'var(--text-tertiary)',
          textDecoration: 'none',
          fontSize: 13,
        }}
      >
        ← Volver al catálogo
      </Link>

      <Card>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                {product.name}
              </h2>
              {product.badge_text && (
                <Badge variant="info">{product.badge_text}</Badge>
              )}
            </div>
            {(product.short_description || product.description) && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                {product.short_description ?? product.description}
              </p>
            )}
          </div>

          {ownsGlobal ? (
            <AlertBanner variant="info">
              Ya tienes un plan de este servicio activo. Puedes cambiarlo o
              cancelarlo desde tu panel.{' '}
              <Link
                href="/dashboard/support-inside"
                style={{ fontWeight: 600 }}
              >
                Gestionar tu plan →
              </Link>
            </AlertBanner>
          ) : (
            <>
              {/* Paso: ciclo de facturación */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>
                  Elige el ciclo de facturación
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {active.map((pricing) => (
                    <CycleOption
                      key={pricing.id}
                      pricing={pricing}
                      selected={pricing.id === selectedId}
                      onSelect={() => setSelectedId(pricing.id)}
                    />
                  ))}
                </div>
              </div>

              {atLimit && context && (
                <AlertBanner variant="warning">
                  Has alcanzado el máximo de {context.maxQuantity} servicio
                  {context.maxQuantity === 1 ? '' : 's'} de este tipo. Cancela uno
                  para contratar otro.
                </AlertBanner>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                {inCart ? (
                  <Link href="/dashboard/store/cart">
                    <Button variant="secondary">
                      En el carrito ✓ · Ir al carrito
                    </Button>
                  </Link>
                ) : (
                  <Button onClick={handleAdd} disabled={!selected || atLimit}>
                    Añadir al carrito
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function CycleOption({
  pricing,
  selected,
  onSelect,
}: {
  pricing: ProductPricing;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 10,
        border: selected
          ? '2px solid var(--brand-600)'
          : '1px solid var(--border-default)',
        background: selected ? 'var(--surface-raised, transparent)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 600 }}>
          {CYCLE_LABELS[pricing.billing_cycle] ?? pricing.billing_cycle}
        </span>
        {CYCLE_SAVINGS[pricing.billing_cycle] && (
          <Badge variant="success">{`Ahorra ${CYCLE_SAVINGS[pricing.billing_cycle]}`}</Badge>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700 }}>
          {fmt(pricing.price, pricing.currency)}
        </div>
        {Number(pricing.setup_fee) > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            + {fmt(pricing.setup_fee, pricing.currency)} setup
          </div>
        )}
      </div>
    </button>
  );
}
