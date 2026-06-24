'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { type CartItem, cartItemKey } from './types';

/**
 * useCart — carrito unificado client-side (producto + dominio) — 15D.F.4.
 *
 * Persistido en `localStorage` (datos NO sensibles; el precio se re-verifica
 * server-side al pagar — R5). `useSyncExternalStore` sincroniza todas las islas
 * (catálogo, buscador, badge, carrito) sin `setState`-en-`useEffect`; snapshot
 * cacheado por el raw → referencia estable. `hydrated` evita el mismatch SSR.
 * Dedup por `cartItemKey` (producto por plan, dominio por FQDN).
 */

const CART_KEY = 'aelium_cart';
const CHANGED_EVENT = 'aelium-cart-changed';
const EMPTY: CartItem[] = [];

let cachedRaw: string | null = null;
let cachedItems: CartItem[] = EMPTY;

function parse(raw: string | null): CartItem[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): CartItem[] {
  const raw =
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(CART_KEY);
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  cachedItems = parse(raw);
  return cachedItems;
}

function getServerSnapshot(): CartItem[] {
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

function writeCart(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

const noopSubscribe = (): (() => void) => () => undefined;
const clientTrue = (): boolean => true;
const serverFalse = (): boolean => false;

export interface UseCart {
  items: CartItem[];
  count: number;
  hydrated: boolean;
  addItem: (item: CartItem) => void;
  removeKey: (key: string) => void;
  clear: () => void;
  hasKey: (key: string) => boolean;
}

export function useCart(): UseCart {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(noopSubscribe, clientTrue, serverFalse);

  const addItem = useCallback((item: CartItem): void => {
    const key = cartItemKey(item);
    const current = getSnapshot();
    if (current.some((i) => cartItemKey(i) === key)) return; // dedup
    writeCart([...current, item]);
  }, []);

  const removeKey = useCallback((key: string): void => {
    writeCart(getSnapshot().filter((i) => cartItemKey(i) !== key));
  }, []);

  const clear = useCallback((): void => writeCart(EMPTY), []);

  const hasKey = useCallback(
    (key: string): boolean => items.some((i) => cartItemKey(i) === key),
    [items],
  );

  return { items, count: items.length, hydrated, addItem, removeKey, clear, hasKey };
}
