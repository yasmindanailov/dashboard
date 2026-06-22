'use client';

import { useState } from 'react';
import Link from 'next/link';

import {
  AlertBanner,
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
} from '../../../../components/ui';
import {
  checkDomainAvailabilityAction,
  type CheckAvailabilityResult,
} from '../../../../_shared/domains/_actions';
import type {
  CheckDomainAvailabilityResponse,
  DomainAvailabilityResult,
} from '../../../../_shared/domains/types';
import { formatMoney } from '../../../../_shared/cart/types';
import { useCart } from '../../../../_shared/cart/useCart';

/* ═══════════════════════════════════════
   DomainSearch — isla cliente del buscador (Sprint 15D Fase 15D.F.4).
   Extrae el SLD (1ª etiqueta), consulta disponibilidad+precio server-side
   y permite añadir los comprables al carrito (localStorage, dedup por FQDN).
   ═══════════════════════════════════════ */

const SLD_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export default function DomainSearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CheckDomainAvailabilityResponse | null>(null);
  const cart = useCart();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const label = query.trim().toLowerCase().split('.')[0];
    if (!SLD_RE.test(label)) {
      setError(
        'Escribe un nombre válido (letras, números y guiones internos), p.ej. midominio.',
      );
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res: CheckAvailabilityResult = await checkDomainAvailabilityAction({
      sld: label,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setData(null);
      return;
    }
    setData(res.data);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {cart.hydrated && cart.count > 0 && (
        <AlertBanner variant="info">
          Tienes {cart.count} {cart.count === 1 ? 'ítem' : 'ítems'} en el
          carrito.{' '}
          <Link href="/dashboard/cart" style={{ fontWeight: 600 }}>
            Ir al carrito →
          </Link>
        </AlertBanner>
      )}

      <Card>
        <form
          onSubmit={handleSearch}
          style={{ display: 'flex', gap: 12, alignItems: 'flex-end', padding: 16 }}
        >
          <div style={{ flex: 1 }}>
            <SearchInput
              label="Nombre del dominio"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="midominio"
              loading={loading}
            />
          </div>
          <Button type="submit" loading={loading} disabled={query.trim().length === 0}>
            Buscar
          </Button>
        </form>
      </Card>

      {error && <AlertBanner variant="danger">{error}</AlertBanner>}

      {data && data.results.length === 0 && !error && (
        <EmptyState
          title="No hay extensiones disponibles"
          description="No hay TLDs ofertados ahora mismo. Inténtalo más tarde."
        />
      )}

      {data && data.results.length > 0 && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.results.map((r, i) => (
              <ResultRow
                key={r.fqdn}
                result={r}
                inCart={cart.hasKey(`domain:${r.fqdn}`)}
                onAdd={() =>
                  r.price &&
                  cart.addItem({
                    kind: 'domain',
                    fqdn: r.fqdn,
                    tld: r.tld,
                    years: 1,
                    price: r.price,
                  })
                }
                isLast={i === data.results.length - 1}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ResultRow({
  result,
  inCart,
  onAdd,
  isLast,
}: {
  result: DomainAvailabilityResult;
  inCart: boolean;
  onAdd: () => void;
  isLast: boolean;
}) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 600 }}>{result.fqdn}</span>
        <StatusBadge result={result} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {result.purchasable && result.price && (
          <span style={{ fontWeight: 600 }}>
            {formatMoney(result.price)}
            <span
              style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: 12 }}
            >
              {' '}
              /año
            </span>
          </span>
        )}
        {result.purchasable ? (
          inCart ? (
            <Button variant="secondary" size="sm" disabled>
              En el carrito ✓
            </Button>
          ) : (
            <Button size="sm" onClick={onAdd}>
              Añadir
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ result }: { result: DomainAvailabilityResult }) {
  if (result.error) return <Badge variant="neutral">No se pudo comprobar</Badge>;
  if (!result.available) return <Badge variant="danger">No disponible</Badge>;
  if (result.premium) return <Badge variant="warning">Premium</Badge>;
  return <Badge variant="success">Disponible</Badge>;
}
