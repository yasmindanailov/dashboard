/* ═══════════════════════════════════════
   Migas del topbar cliente (F2) — derivadas del pathname.
   El mockup muestra "Sección > entidad"; el nombre real de la entidad lo
   conoce la página, no el shell, así que aquí damos una hoja genérica por
   patrón de ruta. TODO(F4): enriquecer con el nombre real vía un contexto
   de breadcrumbs poblado por cada página de detalle.
   ═══════════════════════════════════════ */

import type { Crumb } from './Breadcrumbs';

interface Section {
  prefix: string;
  label: string;
}

/* Orden: prefijos más específicos primero (match por longitud). */
const SECTIONS: Section[] = [
  { prefix: '/dashboard/store', label: 'Tienda' },
  { prefix: '/dashboard/services', label: 'Mis servicios' },
  { prefix: '/dashboard/domains', label: 'Dominios' },
  { prefix: '/dashboard/billing', label: 'Mis facturas' },
  { prefix: '/dashboard/support-inside', label: 'Support Inside' },
  { prefix: '/dashboard/support', label: 'Soporte' },
  { prefix: '/dashboard/profile', label: 'Mi perfil' },
  { prefix: '/dashboard/transparency', label: 'Transparencia de datos' },
  { prefix: '/dashboard/notifications', label: 'Notificaciones' },
  { prefix: '/dashboard/cart', label: 'Carrito' },
];

const LEAVES: { test: RegExp; label: string }[] = [
  { test: /^\/dashboard\/services\/[^/]+\/dns/, label: 'DNS' },
  { test: /^\/dashboard\/services\/[^/]+\/audit/, label: 'Auditoría' },
  { test: /^\/dashboard\/services\/[^/]+/, label: 'Detalle del servicio' },
  { test: /^\/dashboard\/domains\/[^/]+\/transfer/, label: 'Transferencia' },
  { test: /^\/dashboard\/domains\/[^/]+/, label: 'Detalle del dominio' },
  { test: /^\/dashboard\/billing\/[^/]+/, label: 'Factura' },
  { test: /^\/dashboard\/store\/cart/, label: 'Carrito' },
  { test: /^\/dashboard\/store\/[^/]+/, label: 'Producto' },
];

function humanize(segment: string): string {
  const s = segment.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getClientCrumbs(pathname: string): Crumb[] {
  if (pathname === '/dashboard') return [{ label: 'Inicio' }];

  const section = SECTIONS.find((s) => pathname === s.prefix || pathname.startsWith(s.prefix + '/'));
  if (!section) {
    const last = pathname.split('/').filter(Boolean).pop() ?? 'Inicio';
    return [{ label: 'Inicio', href: '/dashboard' }, { label: humanize(last) }];
  }

  if (pathname === section.prefix) return [{ label: section.label }];

  const leaf = LEAVES.find((l) => l.test.test(pathname));
  const leafLabel = leaf?.label ?? humanize(pathname.split('/').filter(Boolean).pop() ?? '');
  return [
    { label: section.label, href: section.prefix },
    { label: leafLabel },
  ];
}
