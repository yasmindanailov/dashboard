/* ═══════════════════════════════════════
   Config de navegación del portal cliente (/dashboard) — módulo puro.
   Separado de Sidebar.tsx para (a) testear la matriz de nav sin arrastrar
   Server Actions / 'use client', y (b) R15. Ref: ADR-066, UI_SPEC §2.0.
   ═══════════════════════════════════════ */

import {
  LayoutDashboard,
  ShoppingBag,
  Monitor,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  Users,
  Coins,
  Link2,
  type LucideIcon,
} from 'lucide-react';

import { canAccess, type AppModule } from '../lib/permissions';

export interface NavItem {
  label: string;
  href: string;
  requiredModule: AppModule;
  icon: LucideIcon;
  section?: 'main' | 'admin' | 'partner' | 'client';
}

/**
 * Nav del portal cliente. **F2 (decisión Yasmin): el sidebar cliente del mockup
 * tiene 6 items** — Inicio, Tienda, Mis servicios, Mis facturas, Soporte, Support
 * Inside. "Dominios" se alcanza desde Mis servicios/Tienda y "Mi perfil" vive en
 * el menú de perfil del topbar (ambos fuera del sidebar, IA reordenada).
 *
 * Los items `partner` se conservan intactos (portal partner futuro, Sprint 19);
 * solo se tocó la sección `client`. Los items `admin` viven en AdminSidebar (DC.7).
 */
export const ALL_NAV_ITEMS: NavItem[] = [
  { label: 'Inicio', href: '/dashboard', requiredModule: 'Dashboard', icon: LayoutDashboard, section: 'main' },
  { label: 'Tienda', href: '/dashboard/store', requiredModule: 'Invoice', icon: ShoppingBag, section: 'client' },
  { label: 'Mis servicios', href: '/dashboard/services', requiredModule: 'Service', icon: Monitor, section: 'client' },
  { label: 'Mis facturas', href: '/dashboard/billing', requiredModule: 'Invoice', icon: CreditCard, section: 'client' },
  { label: 'Soporte', href: '/dashboard/support', requiredModule: 'Conversation', icon: MessageSquare, section: 'client' },
  { label: 'Support Inside', href: '/dashboard/support-inside', requiredModule: 'SupportInside', icon: ShieldCheck, section: 'client' },
  { label: 'Mis clientes', href: '/dashboard/my-clients', requiredModule: 'PartnerClient', icon: Users, section: 'partner' },
  { label: 'Comisiones', href: '/dashboard/commissions', requiredModule: 'PartnerCommission', icon: Coins, section: 'partner' },
  { label: 'Mi enlace', href: '/dashboard/my-link', requiredModule: 'Partner', icon: Link2, section: 'partner' },
];

export function getNavItemsForRole(roleSlug: string): NavItem[] {
  const isClient = roleSlug === 'client';
  const isPartner = ['partner', 'partner_pending'].includes(roleSlug);

  return ALL_NAV_ITEMS.filter((item) => {
    if (!canAccess(roleSlug, item.requiredModule)) return false;
    if (item.section === 'admin') return false;
    if (item.section === 'client' && !isClient) return false;
    if (item.section === 'partner' && !isPartner) return false;
    return true;
  });
}
