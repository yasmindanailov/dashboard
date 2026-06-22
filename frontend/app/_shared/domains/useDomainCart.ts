'use client';

import { useCallback, useSyncExternalStore } from 'react';

import type { DomainCartItem } from './types';

/**
 * useDomainCart — carrito de dominios client-side — Sprint 15D Fase 15D.F.4.
 *
 * Persistido en `localStorage` (datos NO sensibles: nombres + precio mostrado;
 * el precio se re-verifica server-side al pagar — R5). Usa `useSyncExternalStore`
 * (API canónica de React para stores externos mutables): suscribe todas las
 * islas (buscador, badge, carrito) vía un evento custom + el evento `storage`
 * (cross-pestaña), sin `setState`-en-`useEffect`. `getSnapshot` cachea por el raw
 * de localStorage → referencia estable cuando no cambia (evita renders en bucle).
 * `hydrated` (snapshot server=false/cliente=true) evita el mismatch SSR.
 */

const CART_KEY = 'aelium_domain_cart';
const CHANGED_EVENT = 'aelium-domain-cart-changed';
const EMPTY: DomainCartItem[] = [];

let cachedRaw: string | null = null;
let cachedItems: DomainCartItem[] = EMPTY;

function parse(raw: string | null): DomainCartItem[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DomainCartItem[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): DomainCartItem[] {
  const raw =
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(CART_KEY);
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  cachedItems = parse(raw);
  return cachedItems;
}

function getServerSnapshot(): DomainCartItem[] {
  return EMPTY;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGED_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function writeCart(items: DomainCartItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/* Subscriptores/snapshots estables para el flag `hydrated`. */
const noopSubscribe = (): (() => void) => () => undefined;
const clientTrue = (): boolean => true;
const serverFalse = (): boolean => false;

export interface UseDomainCart {
  items: DomainCartItem[];
  count: number;
  /** `false` durante SSR/hidratación inicial — guard contra mismatch. */
  hydrated: boolean;
  addItem: (item: DomainCartItem) => void;
  removeItem: (fqdn: string) => void;
  clear: () => void;
  has: (fqdn: string) => boolean;
}

export function useDomainCart(): UseDomainCart {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    clientTrue,
    serverFalse,
  );

  const addItem = useCallback((item: DomainCartItem): void => {
    const current = getSnapshot();
    if (current.some((i) => i.fqdn === item.fqdn)) return; // dedup por FQDN
    writeCart([...current, item]);
  }, []);

  const removeItem = useCallback((fqdn: string): void => {
    writeCart(getSnapshot().filter((i) => i.fqdn !== fqdn));
  }, []);

  const clear = useCallback((): void => writeCart(EMPTY), []);

  const has = useCallback(
    (fqdn: string): boolean => items.some((i) => i.fqdn === fqdn),
    [items],
  );

  return { items, count: items.length, hydrated, addItem, removeItem, clear, has };
}
