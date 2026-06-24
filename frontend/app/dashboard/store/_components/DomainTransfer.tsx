'use client';

import { useState } from 'react';

import {
  AlertBanner,
  Badge,
  Button,
  Card,
  SearchInput,
} from '../../../components/ui';
import {
  transferQuoteAction,
  type TransferQuoteResult,
} from '../../../_shared/domains/_actions';
import type { DomainTransferQuote } from '../../../_shared/domains/types';
import { formatMoney } from '../../../_shared/cart/types';
import { useCart } from '../../../_shared/cart/useCart';

/* ═══════════════════════════════════════
   DomainTransfer — entrada de transferencia DENTRO de la Tienda (15D.II.T2c.3).
   El cliente escribe un dominio que YA posee → cotiza el precio de transferencia
   (server-side R5) → lo añade al carrito único como `transfer_in` (deferBilling:
   cobro al completar). El código EPP se aporta DESPUÉS, en el detalle del dominio
   (nunca en el carrito): es secreto y no debe bloquear el checkout. Patrón WHMCS/OVH.
   ═══════════════════════════════════════ */

const FQDN_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export default function DomainTransfer() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<DomainTransferQuote | null>(null);
  const cart = useCart();

  async function handleQuote(e: React.FormEvent) {
    e.preventDefault();
    const fqdn = query.trim().toLowerCase();
    if (!FQDN_RE.test(fqdn)) {
      setError(
        'Escribe el dominio completo que quieres transferir, p.ej. midominio.com.',
      );
      setQuote(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res: TransferQuoteResult = await transferQuoteAction({ fqdn });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setQuote(null);
      return;
    }
    setQuote(res.data);
  }

  const inCart = quote ? cart.hasKey(`domain:${quote.fqdn}`) : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AlertBanner variant="info">
        Transfiere a Aelium un dominio que ya tienes en otro registrador. Tras el
        pedido te pediremos el <strong>código de autorización (EPP)</strong> del
        dominio. <strong>No se cobra nada</strong> hasta que la transferencia se
        complete (suele tardar 5–7 días).
      </AlertBanner>

      <Card>
        <form
          onSubmit={handleQuote}
          style={{ display: 'flex', gap: 12, alignItems: 'flex-end', padding: 16 }}
        >
          <div style={{ flex: 1 }}>
            <SearchInput
              label="Dominio que ya posees"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="midominio.com"
              loading={loading}
            />
          </div>
          <Button
            type="submit"
            loading={loading}
            disabled={query.trim().length === 0}
          >
            Cotizar
          </Button>
        </form>
      </Card>

      {error && <AlertBanner variant="danger">{error}</AlertBanner>}

      {quote && (
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 600 }}>{quote.fqdn}</span>
              {quote.offered ? (
                <Badge variant="success">Transferible</Badge>
              ) : (
                <Badge variant="neutral">No ofrecemos este TLD</Badge>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {quote.offered && quote.price && (
                <span style={{ fontWeight: 600 }}>
                  {formatMoney(quote.price)}
                  <span
                    style={{
                      color: 'var(--text-tertiary)',
                      fontWeight: 400,
                      fontSize: 12,
                    }}
                  >
                    {' '}
                    /transferencia
                  </span>
                </span>
              )}
              {quote.offered && quote.price ? (
                inCart ? (
                  <Button variant="secondary" size="sm" disabled>
                    En el carrito ✓
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      quote.price &&
                      cart.addItem({
                        kind: 'domain',
                        fqdn: quote.fqdn,
                        tld: quote.tld,
                        years: 1,
                        price: quote.price,
                        operation: 'transfer_in',
                      })
                    }
                  >
                    Añadir al carrito
                  </Button>
                )
              ) : null}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
