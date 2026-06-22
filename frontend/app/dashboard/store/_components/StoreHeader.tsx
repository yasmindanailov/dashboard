'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import CartLink from '../../../_shared/cart/CartLink';

/* ═══════════════════════════════════════
   StoreHeader — cabecera de la Tienda (Sprint 15D Fase 15D.F.4).
   Sub-nav Productos | Dominios + acceso al carrito (con contador). El carrito
   vive AQUÍ, en la Tienda — NUNCA en el shell global del dashboard.
   ═══════════════════════════════════════ */

const TABS = [
  { label: 'Productos', href: '/dashboard/store' },
  { label: 'Dominios', href: '/dashboard/store/domains' },
];

export default function StoreHeader() {
  const pathname = usePathname();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Tienda</h1>
        <nav style={{ display: 'flex', gap: 18, marginTop: 14 }}>
          {TABS.map((t) => {
            const active =
              t.href === '/dashboard/store'
                ? pathname === t.href
                : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  paddingBottom: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                  color: active
                    ? 'var(--text-primary)'
                    : 'var(--text-tertiary)',
                  borderBottom: active
                    ? '2px solid var(--brand-600)'
                    : '2px solid transparent',
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <CartLink />
    </div>
  );
}
