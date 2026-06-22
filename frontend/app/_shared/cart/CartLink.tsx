'use client';

import Link from 'next/link';

import { Button } from '../../components/ui';
import { useCart } from './useCart';

/**
 * CartLink — acceso al carrito con contador (Sprint 15D Fase 15D.F.4).
 * Isla cliente reutilizable en cabeceras (tienda, buscador). El contador solo
 * se muestra tras hidratar (guard contra mismatch SSR).
 */
export default function CartLink() {
  const cart = useCart();
  const suffix = cart.hydrated && cart.count > 0 ? ` (${cart.count})` : '';
  return (
    <Link href="/dashboard/cart">
      <Button variant="secondary">Carrito{suffix}</Button>
    </Link>
  );
}
