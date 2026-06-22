'use client';

import { useState } from 'react';
import Link from 'next/link';

import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../../../../components/ui';
import {
  checkoutDomainCartAction,
  type CheckoutCartResult,
} from '../../../../_shared/domains/_actions';
import {
  formatDomainPrice,
  type CartCheckoutResult,
} from '../../../../_shared/domains/types';
import { useDomainCart } from '../../../../_shared/domains/useDomainCart';

/* ═══════════════════════════════════════
   DomainCart — isla cliente del carrito (Sprint 15D Fase 15D.F.4).
   Registra los dominios del carrito en un único checkout multi-ítem.
   ═══════════════════════════════════════ */

export default function DomainCart() {
  const cart = useDomainCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ineligible, setIneligible] = useState(false);
  const [done, setDone] = useState<CartCheckoutResult | null>(null);

  const currency = cart.items[0]?.price.currency ?? 'EUR';
  const total = cart.items.reduce((sum, i) => sum + Number(i.price.amount), 0);

  async function handleCheckout() {
    if (cart.items.length === 0) return;
    setSubmitting(true);
    setError(null);
    setIneligible(false);
    const res: CheckoutCartResult = await checkoutDomainCartAction({
      items: cart.items.map((i) => ({ domain_name: i.fqdn, years: i.years })),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      setIneligible(res.code === 'REGISTRANT_INELIGIBLE');
      return;
    }
    cart.clear();
    setDone(res.data);
  }

  /* ── Éxito ── */
  if (done) {
    return (
      <Card>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AlertBanner variant="success">
            Pedido creado. Se ha generado la factura{' '}
            <strong>{done.invoice_number}</strong> con {done.services.length}{' '}
            dominio{done.services.length === 1 ? '' : 's'}. El registro se
            completará al confirmarse el pago.
          </AlertBanner>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/dashboard/billing">
              <Button>Ver mis facturas</Button>
            </Link>
            <Link href="/dashboard/domains">
              <Button variant="secondary">Ir a mis dominios</Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  /* ── Hidratando ── */
  if (!cart.hydrated) {
    return (
      <Card>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
        </div>
      </Card>
    );
  }

  /* ── Vacío ── */
  if (cart.items.length === 0) {
    return (
      <EmptyState
        title="Tu carrito está vacío"
        description="Busca un nombre de dominio y añade los que quieras registrar."
        action={
          <Link href="/dashboard/domains/search">
            <Button>Buscar dominios</Button>
          </Link>
        }
      />
    );
  }

  /* ── Con ítems ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {cart.items.map((item, i) => (
            <div
              key={item.fqdn}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                borderBottom:
                  i === cart.items.length - 1
                    ? 'none'
                    : '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{item.fqdn}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Registro · {item.years} año{item.years === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontWeight: 600 }}>
                  {formatDomainPrice(item.price)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => cart.removeItem(item.fqdn)}
                  disabled={submitting}
                >
                  Quitar
                </Button>
              </div>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderTop: '1px solid var(--border-default)',
              fontWeight: 700,
            }}
          >
            <span>Total</span>
            <span>{formatDomainPrice({ amount: String(total), currency })}</span>
          </div>
        </div>
      </Card>

      {error && (
        <AlertBanner variant={ineligible ? 'warning' : 'danger'}>
          {error}
          {ineligible && (
            <>
              {' '}
              Completa tus datos de registrante en tu perfil y vuelve a
              intentarlo.
            </>
          )}
        </AlertBanner>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <Link href="/dashboard/domains/search">
          <Button variant="ghost" disabled={submitting}>
            ← Seguir buscando
          </Button>
        </Link>
        <Button onClick={handleCheckout} loading={submitting}>
          Registrar {cart.items.length} dominio
          {cart.items.length === 1 ? '' : 's'}
        </Button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
        Se emitirá una factura simplificada. El registro de cada dominio se
        completa al confirmarse el pago.
      </p>
    </div>
  );
}
