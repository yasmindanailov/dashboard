import Link from 'next/link';

import { Badge, Button, Card, EmptyState } from '../../../components/ui';
import { fmt, type Product } from '../../../_shared/billing/checkout/types';

/* ═══════════════════════════════════════
   StoreView — catálogo cliente (Sprint 15D Fase 15D.F.4).
   Presentacional (sin estado): cada producto enlaza a su ficha de configuración
   (`/store/[slug]`) donde se elige el ciclo (y, para hosting, el dominio). El
   catálogo NO añade al carrito directamente — patrón WHMCS/Hostinger.
   ═══════════════════════════════════════ */

interface Props {
  products: Product[];
  errorMessage: string | null;
}

function lowestPrice(product: Product): { amount: number; currency: string } | null {
  const active = product.pricing.filter((p) => p.active);
  if (active.length === 0) return null;
  const min = active.reduce(
    (acc, p) => (Number(p.price) < acc.amount ? { amount: Number(p.price), currency: p.currency } : acc),
    { amount: Number(active[0].price), currency: active[0].currency },
  );
  return min;
}

export default function StoreView({ products, errorMessage }: Props) {
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
      {products.map((product) => {
        const from = lowestPrice(product);
        return (
          <Card key={product.id}>
            <div
              style={{
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                height: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                  {product.name}
                </h3>
                {product.badge_text && (
                  <Badge variant="info">{product.badge_text}</Badge>
                )}
              </div>
              {(product.short_description || product.description) && (
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-tertiary)',
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {product.short_description ??
                    product.description?.slice(0, 120) ??
                    ''}
                </p>
              )}
              {from && (
                <div style={{ fontSize: 14 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>desde </span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(from.amount, from.currency)}
                  </span>
                </div>
              )}
              <Link href={`/dashboard/store/${product.slug}`}>
                <Button fullWidth>Configurar</Button>
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
