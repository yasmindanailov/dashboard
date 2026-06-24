'use client';

import { useState } from 'react';
import Link from 'next/link';

import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../../../components/ui';
import {
  checkoutCartAction,
  type CartCheckoutData,
  type CheckoutCartResult,
  type CheckoutItemPayload,
} from '../../../_shared/cart/_actions';
import {
  cartItemKey,
  formatMoney,
  type CartItem,
} from '../../../_shared/cart/types';
import { useCart } from '../../../_shared/cart/useCart';

/* ═══════════════════════════════════════
   CartView — carrito unificado (producto + dominio) — Sprint 15D Fase 15D.F.4.
   Un único checkout multi-ítem → /billing/checkout/items.
   ═══════════════════════════════════════ */

function isTransfer(i: CartItem): boolean {
  return i.kind === 'domain' && i.operation === 'transfer_in';
}

export default function CartView() {
  const cart = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ineligible, setIneligible] = useState(false);
  const [done, setDone] = useState<CartCheckoutData | null>(null);
  const [doneTransfers, setDoneTransfers] = useState(0);

  const currency = cart.items[0]?.price.currency ?? 'EUR';
  // El total a PAGAR ahora excluye las transferencias (cobro al completar, A2.3).
  const billableItems = cart.items.filter((i) => !isTransfer(i));
  const transferItems = cart.items.filter(isTransfer);
  const total = billableItems.reduce((s, i) => s + Number(i.price.amount), 0);
  const transfersTotal = transferItems.reduce(
    (s, i) => s + Number(i.price.amount),
    0,
  );

  async function handleCheckout() {
    if (cart.items.length === 0) return;
    setSubmitting(true);
    setError(null);
    setIneligible(false);
    const payload: CheckoutItemPayload[] = cart.items.map((i) =>
      i.kind === 'product'
        ? {
            kind: 'product',
            product_pricing_id: i.productPricingId,
            ...(i.domain ? { domain: i.domain } : {}),
          }
        : {
            kind: 'domain',
            domain_name: i.fqdn,
            years: i.years,
            operation: i.operation ?? 'register',
          },
    );
    const res: CheckoutCartResult = await checkoutCartAction({ items: payload });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      setIneligible(res.code === 'REGISTRANT_INELIGIBLE');
      return;
    }
    setDoneTransfers(transferItems.length);
    cart.clear();
    setDone(res.data);
  }

  /* ── Éxito ── */
  if (done) {
    const transferPlural = doneTransfers === 1 ? 'transferencia' : 'transferencias';
    return (
      <Card>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {done.invoice_id ? (
            <AlertBanner variant="success">
              Pedido creado. Se ha generado la factura{' '}
              <strong>{done.invoice_number}</strong> con {done.services.length}{' '}
              {done.services.length === 1 ? 'servicio' : 'servicios'}. Se activarán
              al confirmarse el pago.
            </AlertBanner>
          ) : (
            <AlertBanner variant="success">
              Hemos registrado tus {transferPlural}. No se cobra nada hasta que se
              completen.
            </AlertBanner>
          )}

          {/* Transferencias: el cliente debe aportar el código EPP en cada dominio. */}
          {doneTransfers > 0 && (
            <AlertBanner variant="info">
              Para iniciar {doneTransfers === 1 ? 'tu' : 'tus'} {transferPlural},
              aporta el <strong>código de autorización (EPP)</strong> en cada
              dominio desde{' '}
              <Link href="/dashboard/domains" style={{ fontWeight: 600 }}>
                Mis dominios
              </Link>
              .
            </AlertBanner>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            {done.invoice_id && (
              <Link href="/dashboard/billing">
                <Button>Ver mis facturas</Button>
              </Link>
            )}
            <Link href="/dashboard/domains">
              <Button variant={done.invoice_id ? 'secondary' : 'primary'}>
                Mis dominios
              </Button>
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
        description="Añade productos desde la tienda o busca un dominio para registrar."
        action={
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/dashboard/store">
              <Button>Ver tienda</Button>
            </Link>
            <Link href="/dashboard/store/domains">
              <Button variant="secondary">Buscar dominio</Button>
            </Link>
          </div>
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
            <CartRow
              key={cartItemKey(item)}
              item={item}
              isLast={i === cart.items.length - 1}
              disabled={submitting}
              onRemove={() => cart.removeKey(cartItemKey(item))}
            />
          ))}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '14px 16px',
              borderTop: '1px solid var(--border-default)',
            }}
          >
            {billableItems.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                }}
              >
                <span>Total a pagar ahora</span>
                <span>{formatMoney({ amount: String(total), currency })}</span>
              </div>
            )}
            {transferItems.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  color: 'var(--text-tertiary)',
                }}
              >
                <span>Transferencias (se cobran al completar)</span>
                <span>
                  {formatMoney({ amount: String(transfersTotal), currency })}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {error && (
        <AlertBanner variant={ineligible ? 'warning' : 'danger'}>
          {error}
          {ineligible && (
            <> Completa tus datos de registrante en tu perfil y reinténtalo.</>
          )}
        </AlertBanner>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <Link href="/dashboard/store">
          <Button variant="ghost" disabled={submitting}>
            ← Seguir comprando
          </Button>
        </Link>
        <Button onClick={handleCheckout} loading={submitting}>
          {billableItems.length === 0
            ? `Iniciar ${transferItems.length} ${transferItems.length === 1 ? 'transferencia' : 'transferencias'}`
            : `Pagar ${cart.items.length} ${cart.items.length === 1 ? 'ítem' : 'ítems'}`}
        </Button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
        {billableItems.length === 0
          ? 'No se cobra nada ahora. Cada transferencia se factura al completarse.'
          : 'Se emitirá una factura simplificada. Cada servicio se activa al confirmarse el pago.'}
        {transferItems.length > 0 &&
          billableItems.length > 0 &&
          ' Las transferencias se cobran al completarse.'}
      </p>
    </div>
  );
}

function CartRow({
  item,
  isLast,
  disabled,
  onRemove,
}: {
  item: CartItem;
  isLast: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const title = item.kind === 'product' ? item.productName : item.fqdn;
  const subtitle =
    item.kind === 'product'
      ? item.domain
        ? `${item.cycleLabel} · ${item.domain}`
        : item.cycleLabel
      : item.operation === 'transfer_in'
        ? 'Transferencia · se cobra al completar'
        : `Registro · ${item.years} año${item.years === 1 ? '' : 's'}`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 600 }}>{formatMoney(item.price)}</span>
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={disabled}>
          Quitar
        </Button>
      </div>
    </div>
  );
}
