'use client';

import { Badge, Button, Card, EmptyState } from '../../../components/ui';
import {
  CYCLE_LABELS,
  fmt,
  type Product,
  type ProductPricing,
} from '../../../_shared/billing/checkout/types';
import { useCart } from '../../../_shared/cart/useCart';

/* ═══════════════════════════════════════
   StoreView — catálogo cliente (Sprint 15D Fase 15D.F.4).
   Añade productos (plan elegido) al carrito unificado. El precio del carrito se
   re-verifica server-side al pagar (R5).
   ═══════════════════════════════════════ */

interface Props {
  products: Product[];
  errorMessage: string | null;
}

export default function StoreView({ products, errorMessage }: Props) {
  const cart = useCart();

  if (errorMessage) {
    return <EmptyState title="No se pudo cargar la tienda" description={errorMessage} />;
  }
  if (products.length === 0) {
    return (
      <EmptyState
        title="No hay productos disponibles"
        description="Cuando haya productos contratables aparecerán aquí."
      />
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
      }}
    >
      {products.map((product) => (
        <Card key={product.id}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                {product.name}
              </h3>
              {product.badge_text && (
                <Badge variant="info">{product.badge_text}</Badge>
              )}
            </div>
            {(product.short_description || product.description) && (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
                {product.short_description ??
                  product.description?.slice(0, 120) ??
                  ''}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {product.pricing
                .filter((p) => p.active)
                .map((pricing) => (
                  <PricingRow
                    key={pricing.id}
                    productName={product.name}
                    pricing={pricing}
                    inCart={cart.hasKey(`product:${pricing.id}`)}
                    onAdd={() =>
                      cart.addItem({
                        kind: 'product',
                        productPricingId: pricing.id,
                        productName: product.name,
                        cycleLabel:
                          CYCLE_LABELS[pricing.billing_cycle] ??
                          pricing.billing_cycle,
                        price: {
                          amount: pricing.price,
                          currency: pricing.currency,
                        },
                      })
                    }
                  />
                ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PricingRow({
  productName,
  pricing,
  inCart,
  onAdd,
}: {
  productName: string;
  pricing: ProductPricing;
  inCart: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 12px',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          {CYCLE_LABELS[pricing.billing_cycle] ?? pricing.billing_cycle}
        </div>
        <div style={{ fontWeight: 600 }}>
          {fmt(pricing.price, pricing.currency)}
        </div>
      </div>
      {inCart ? (
        <Button variant="secondary" size="sm" disabled>
          En el carrito ✓
        </Button>
      ) : (
        <Button size="sm" onClick={onAdd} aria-label={`Añadir ${productName}`}>
          Añadir
        </Button>
      )}
    </div>
  );
}
