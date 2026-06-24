'use client';

import { useState } from 'react';

import {
  AlertBanner,
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
} from '../../../components/ui';
import {
  checkAvailabilityBulkAction,
  checkDomainAvailabilityAction,
  suggestDomainsAction,
} from '../../../_shared/domains/_actions';
import type {
  BulkAvailabilityResponse,
  CheckDomainAvailabilityResponse,
  DomainAvailabilityResult,
  DomainSuggestionsResponse,
} from '../../../_shared/domains/types';
import { formatMoney } from '../../../_shared/cart/types';
import { useCart, type UseCart } from '../../../_shared/cart/useCart';

/* ═══════════════════════════════════════
   DomainSearch — buscador RICO DENTRO de la Tienda (Sprint 15D.F.4 + 15D.II.S).
   Un nombre → disponibilidad×TLD + sugerencias de nombres comprables. Varios
   nombres (separados por coma/espacio) → búsqueda en bloque. Todo añade al MISMO
   carrito unificado. El precio SIEMPRE server-side (R5).
   ═══════════════════════════════════════ */

const SLD_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Extrae los SLDs de la query (primer label de cada token), deduplicados. */
function parseSlds(query: string): string[] {
  return [
    ...new Set(
      query
        .trim()
        .toLowerCase()
        .split(/[\s,]+/)
        .map((t) => t.split('.')[0])
        .filter((s) => SLD_RE.test(s)),
    ),
  ];
}

export default function DomainSearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CheckDomainAvailabilityResponse | null>(null);
  const [bulk, setBulk] = useState<BulkAvailabilityResponse | null>(null);
  const [suggestions, setSuggestions] =
    useState<DomainSuggestionsResponse | null>(null);
  const cart = useCart();

  function reset(): void {
    setData(null);
    setBulk(null);
    setSuggestions(null);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const slds = parseSlds(query);
    if (slds.length === 0) {
      setError(
        'Escribe un nombre válido (o varios separados por coma), p.ej. midominio.',
      );
      reset();
      return;
    }
    setLoading(true);
    setError(null);
    reset();

    if (slds.length === 1) {
      // Un nombre: disponibilidad exacta + sugerencias (en paralelo).
      const [availRes, sugRes] = await Promise.all([
        checkDomainAvailabilityAction({ sld: slds[0] }),
        suggestDomainsAction({ keyword: slds[0] }),
      ]);
      setLoading(false);
      if (!availRes.ok) {
        setError(availRes.error);
        return;
      }
      setData(availRes.data);
      if (sugRes.ok) setSuggestions(sugRes.data);
    } else {
      // Varios nombres: búsqueda en bloque (sin sugerencias).
      const res = await checkAvailabilityBulkAction({ slds });
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBulk(res.data);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              placeholder="midominio · o varios: uno, dos, tres"
              loading={loading}
            />
          </div>
          <Button
            type="submit"
            loading={loading}
            disabled={query.trim().length === 0}
          >
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
        <ResultsCard results={data.results} cart={cart} />
      )}

      {suggestions && suggestions.results.length > 0 && (
        <Card>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Sugerencias disponibles
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {suggestions.results.map((s, i) => (
              <div
                key={s.fqdn}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '14px 16px',
                  borderBottom:
                    i === suggestions.results.length - 1
                      ? 'none'
                      : '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>{s.fqdn}</span>
                  <Badge variant="success">Disponible</Badge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 600 }}>
                    {formatMoney(s.price)}
                    <span
                      style={{
                        color: 'var(--text-tertiary)',
                        fontWeight: 400,
                        fontSize: 12,
                      }}
                    >
                      {' '}
                      /año
                    </span>
                  </span>
                  {cart.hasKey(`domain:${s.fqdn}`) ? (
                    <Button variant="secondary" size="sm" disabled>
                      En el carrito ✓
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        cart.addItem({
                          kind: 'domain',
                          fqdn: s.fqdn,
                          tld: s.tld,
                          years: 1,
                          price: s.price,
                        })
                      }
                    >
                      Añadir
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {bulk &&
        bulk.results.map((group) => (
          <ResultsCard
            key={group.sld}
            title={group.sld}
            results={group.results}
            cart={cart}
          />
        ))}
    </div>
  );
}

function ResultsCard({
  title,
  results,
  cart,
}: {
  title?: string;
  results: DomainAvailabilityResult[];
  cart: UseCart;
}) {
  return (
    <Card>
      {title && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {results.map((r, i) => (
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
            isLast={i === results.length - 1}
          />
        ))}
      </div>
    </Card>
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
