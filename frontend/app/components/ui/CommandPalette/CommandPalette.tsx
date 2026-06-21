'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { canAccess, type AppModule } from '../../../lib/permissions';
import styles from './CommandPalette.module.css';

/* ═══════════════════════════════════════
   CommandPalette — Aelium Design System

   Activated with Cmd+K / Ctrl+K or via Topbar.
   Sections: Navigate, Quick Actions, Recent.
   Filtered by role (PBAC).

   Usage:
     <CommandPalette open={open} onClose={() => setOpen(false)} />

   Ref: docs/40-reference/DESIGN_SYSTEM.md, UI_SPEC §4.10
   ═══════════════════════════════════════ */

/* ── Types ── */

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  href?: string;
  action?: () => void;
  shortcut?: string;
  section: 'navigate' | 'action' | 'recent';
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/* ── Icons ── */

const IconNav = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconClients = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
  </svg>
);
const IconProducts = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);
const IconBilling = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);
const IconSupport = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconChat = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);
const IconPlus = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconSettings = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const IconClock = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconSearch = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/* ── Recent history (localStorage) ── */

const RECENT_KEY = 'aelium_cmd_recent';
const MAX_RECENT = 5;

interface RecentEntry {
  label: string;
  href: string;
  timestamp: number;
}

function getRecent(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch (err) { console.warn('[CommandPalette] search failed:', err); return []; }
}

function addRecent(label: string, href: string) {
  const entries = getRecent().filter((e) => e.href !== href);
  entries.unshift({ label, href, timestamp: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)));
}

/* ── Navigation items per role ── */

function buildItems(roleSlug: string): PaletteItem[] {
  const can = (mod: AppModule) => canAccess(roleSlug, mod);
  const isAdmin = ['superadmin', 'agent_full', 'agent_billing', 'agent_support'].includes(roleSlug);
  const isClient = roleSlug === 'client';
  const isPartner = ['partner', 'partner_pending'].includes(roleSlug);

  const items: PaletteItem[] = [];

  // ── Navigation ──
  items.push({ id: 'nav-dashboard', label: 'Dashboard', description: 'Ir al resumen', icon: IconNav, href: '/dashboard', section: 'navigate', keywords: ['inicio', 'home', 'resumen'] });

  if (isAdmin && can('Client'))
    items.push({ id: 'nav-clients', label: 'Clientes', description: 'Lista de clientes', icon: IconClients, href: '/admin/clients', section: 'navigate', keywords: ['crm', 'users'] });

  if (isAdmin && can('Product'))
    items.push({ id: 'nav-products', label: 'Productos', description: 'Catálogo de productos', icon: IconProducts, href: '/admin/products', section: 'navigate', keywords: ['planes', 'hosting'] });

  if (can('Invoice'))
    items.push({ id: 'nav-billing', label: isClient ? 'Mis facturas' : 'Facturación', description: isClient ? 'Tus facturas' : 'Todas las facturas', icon: IconBilling, href: '/dashboard/billing', section: 'navigate', keywords: ['facturas', 'pagos', 'cobros'] });

  if (can('Conversation')) {
    items.push({ id: 'nav-tickets', label: isClient ? 'Soporte' : 'Tickets', description: isClient ? 'Tus tickets de soporte' : 'Tickets de soporte', icon: IconSupport, href: '/dashboard/support', section: 'navigate', keywords: ['soporte', 'ayuda', 'incidencias'] });
    if (isAdmin)
      items.push({ id: 'nav-chats', label: 'Chat en vivo', description: 'Conversaciones en tiempo real', icon: IconChat, href: '/admin/support/chats', section: 'navigate', keywords: ['chat', 'mensajes', 'live'] });
  }

  if (isAdmin && can('Setting'))
    items.push({ id: 'nav-settings', label: 'Configuración', description: 'Ajustes del sistema', icon: IconSettings, href: '/admin/settings', section: 'navigate', keywords: ['config', 'ajustes'] });

  if (isPartner && can('PartnerClient'))
    items.push({ id: 'nav-my-clients', label: 'Mis clientes', description: 'Clientes referidos', icon: IconClients, href: '/dashboard/my-clients', section: 'navigate', keywords: ['referidos'] });

  // ── Quick actions ──
  if (isAdmin && can('Product'))
    items.push({ id: 'act-new-product', label: 'Nuevo producto', description: 'Crear producto', icon: IconPlus, href: '/admin/products/new', section: 'action', keywords: ['crear', 'añadir', 'producto'] });

  if (can('Conversation'))
    items.push({ id: 'act-new-ticket', label: 'Nuevo ticket', description: 'Crear ticket de soporte', icon: IconPlus, href: '/dashboard/support', section: 'action', keywords: ['crear', 'ticket', 'soporte'] });

  if (can('Invoice') && isClient)
    items.push({ id: 'act-checkout', label: 'Contratar servicio', description: 'Ir al checkout', icon: IconPlus, href: '/dashboard/billing/checkout', section: 'action', keywords: ['comprar', 'contratar', 'checkout'] });

  return items;
}

/* ── Component ── */

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Build palette items
  const allItems = useMemo(() => buildItems(roleSlug), [roleSlug]);

  // Add recent entries
  const recentItems: PaletteItem[] = useMemo(() => {
    return getRecent().map((r, i) => ({
      id: `recent-${i}`,
      label: r.label,
      icon: IconClock,
      href: r.href,
      section: 'recent' as const,
    }));
  }, [open]);

  // Filter items by query
  const filteredItems = useMemo(() => {
    const all = [...allItems, ...recentItems];
    if (!query.trim()) return all;

    const q = query.toLowerCase();
    return all.filter((item) => {
      const searchable = [item.label, item.description, ...(item.keywords || [])].join(' ').toLowerCase();
      return searchable.includes(q);
    });
  }, [allItems, recentItems, query]);

  // Group by section
  const sections = useMemo(() => {
    const groups: { key: string; label: string; items: PaletteItem[] }[] = [];

    const nav = filteredItems.filter((i) => i.section === 'navigate');
    const act = filteredItems.filter((i) => i.section === 'action');
    const rec = filteredItems.filter((i) => i.section === 'recent');

    if (rec.length > 0) groups.push({ key: 'recent', label: 'Recientes', items: rec });
    if (nav.length > 0) groups.push({ key: 'navigate', label: 'Navegar', items: nav });
    if (act.length > 0) groups.push({ key: 'action', label: 'Acciones rápidas', items: act });

    return groups;
  }, [filteredItems]);

  // Flat list for keyboard nav
  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- modal reset on open: limpia búsqueda + selección al abrir paleta.
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Clamp activeIndex
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp invariante: cuando la lista de items se acorta, fuerza el índice activo dentro de rango.
    if (activeIndex >= flatItems.length) setActiveIndex(Math.max(0, flatItems.length - 1));
  }, [flatItems.length, activeIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (!resultRef.current) return;
    const el = resultRef.current.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Execute item
  const executeItem = useCallback(
    (item: PaletteItem) => {
      if (item.href) {
        addRecent(item.label, item.href);
        router.push(item.href);
      }
      if (item.action) item.action();
      onClose();
    },
    [router, onClose],
  );

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i < flatItems.length - 1 ? i + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : flatItems.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatItems[activeIndex]) executeItem(flatItems[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [flatItems, activeIndex, executeItem, onClose],
  );

  if (!open) return null;

  let itemIndex = 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.palette}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Paleta de comandos"
      >
        {/* Search input */}
        <div className={styles.searchRow}>
          <span className={styles.searchIcon}>{IconSearch}</span>
          <input
            ref={inputRef}
            className={styles.searchInput}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Buscar página, acción o entidad..."
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={styles.searchKbd}>ESC</kbd>
        </div>

        {/* Results */}
        <div className={styles.results} ref={resultRef}>
          {flatItems.length === 0 ? (
            <div className={styles.empty}>
              No se encontraron resultados para &quot;{query}&quot;
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key}>
                <div className={styles.sectionLabel}>{section.label}</div>
                {section.items.map((item) => {
                  const idx = itemIndex++;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      className={`${styles.item} ${idx === activeIndex ? styles.itemActive : ''}`}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      type="button"
                    >
                      <span className={`${styles.itemIcon} ${item.section === 'action' ? styles.itemIconBrand : ''}`}>
                        {item.icon}
                      </span>
                      <span className={styles.itemContent}>
                        <span className={styles.itemLabel}>{item.label}</span>
                        {item.description && <span className={styles.itemDesc}>{item.description}</span>}
                      </span>
                      {item.shortcut && <kbd className={styles.itemShortcut}>{item.shortcut}</kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className={styles.footer}>
          <span className={styles.footerHint}>
            <kbd className={styles.footerKbd}>↑</kbd>
            <kbd className={styles.footerKbd}>↓</kbd>
            navegar
          </span>
          <span className={styles.footerHint}>
            <kbd className={styles.footerKbd}>↵</kbd>
            abrir
          </span>
          <span className={styles.footerHint}>
            <kbd className={styles.footerKbd}>esc</kbd>
            cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
