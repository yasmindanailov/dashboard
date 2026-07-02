/**
 * service-hub-vm — Sprint F4·W3·U04.
 *
 * View-models PUROS (SC-compatibles, sin fetch/estado) que traducen cada
 * entidad del hub "Mis servicios" (servicio de hosting · dominio · Support
 * Inside) a los datos de la card ficha (`Servicios Cards Spec` Variante A):
 * identidad + badge de estado + metadata inline + tira de estado en lenguaje
 * claro (voz Aelium, UI_SPEC §1.2 P5 · §4.3). Sin gauges (viven en el detalle).
 */
import type { BadgeVariant, StatusDotColor } from '../../../components/ui';
import type { ServiceListItem, SupportInsideSubscriptionPayload } from '../../../lib/api';
import type { DomainListItem } from '../../../_shared/domains/types';
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE } from '../../../_shared/services';

export type ServiceHubKind = 'service' | 'domain' | 'support_inside';

export interface ServiceCardData {
  /** `service.id` (o `subscription.id` en SI) — id de React + trazabilidad. */
  id: string;
  kind: ServiceHubKind;
  /** Destino de la card entera. */
  href: string;
  title: string;
  badge: { label: string; variant: BadgeVariant };
  /** Metadata inline (una línea). */
  meta: string;
  /** Tira de estado (footer) en lenguaje claro. */
  strip: { tone: StatusDotColor; text: string };
  /** Quick-action "Gestionar DNS" del menú ⋯ (si el plugin la soporta). */
  dnsHref?: string | null;
  /** Quick-action "Abrir panel" (SSO) del menú ⋯ (si el plugin la soporta). */
  sso?: { serviceId: string; panelLabel: string | null } | null;
}

const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES', DATE_FMT);
}

/** ISO en los próximos `days` días (y no pasado). */
function isWithinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  return t >= now && t - now <= days * 24 * 60 * 60 * 1000;
}

/** Etiqueta legible del tipo de producto (para la metadata inline de la ficha). */
const PRODUCT_TYPE_LABEL: Record<string, string> = {
  hosting_web: 'Hosting',
  docker_service: 'Servicio',
  support_inside: 'Support Inside',
  we_do_it: 'Servicio gestionado',
  custom_service: 'Servicio a medida',
  domain: 'Dominio',
};

/** Normaliza el `status` crudo del backend al set canónico de labels/tonos. */
function serviceStatusKey(status: string): keyof typeof SERVICE_STATUS_LABEL {
  switch (status) {
    case 'active':
    case 'pending':
    case 'suspended':
    case 'expired':
    case 'failed':
    case 'cancelled':
      return status;
    case 'provisioning':
      return 'pending';
    case 'terminated':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/** Tira de estado en lenguaje claro por estado canónico (voz Aelium). */
function baseStrip(
  key: keyof typeof SERVICE_STATUS_LABEL,
): { tone: StatusDotColor; text: string } {
  switch (key) {
    case 'active':
      return { tone: 'success', text: 'Todo en orden · sin incidencias' };
    case 'pending':
      return { tone: 'info', text: 'Estamos preparando tu servicio' };
    case 'suspended':
      return { tone: 'warning', text: 'Servicio en pausa' };
    case 'expired':
      return { tone: 'warning', text: 'Ha caducado · renuévalo para reactivarlo' };
    case 'failed':
      return { tone: 'danger', text: 'Necesita atención · te echamos una mano' };
    case 'cancelled':
      return { tone: 'neutral', text: 'Servicio cancelado' };
    default:
      return { tone: 'neutral', text: 'Comprobando el estado…' };
  }
}

/* ── Servicio de hosting ── */
export function serviceCardData(svc: ServiceListItem): ServiceCardData {
  const key = serviceStatusKey(svc.status);
  const renew = fmtDate(svc.next_due_date);
  const metaParts = [svc.product.name];
  const typeLabel = PRODUCT_TYPE_LABEL[svc.product.type];
  if (typeLabel) metaParts.push(typeLabel);
  if (renew) metaParts.push(`Renueva ${renew}`);
  // "Auto-renovación activada" es un hecho del sistema para servicios activos
  // con ciclo de facturación (Aelium renueva automáticamente; no hay opt-out):
  // se muestra derivado, sin fabricar una columna/toggle inexistente.
  if (key === 'active' && svc.next_due_date) metaParts.push('Auto-renovación activada');
  const caps = svc.capabilities ?? null;
  return {
    id: svc.id,
    kind: 'service',
    href: `/dashboard/services/${svc.id}`,
    title: svc.label ?? svc.domain ?? svc.product.name,
    badge: { label: SERVICE_STATUS_LABEL[key], variant: SERVICE_STATUS_TONE[key] },
    meta: metaParts.join(' · '),
    strip: baseStrip(key),
    dnsHref: caps?.has_dns_management
      ? `/dashboard/services/${svc.id}/dns`
      : null,
    sso: caps?.has_sso_panel
      ? { serviceId: svc.id, panelLabel: svc.panel_label ?? null }
      : null,
  };
}

/* ── Dominio ── */
export function domainCardData(d: DomainListItem): ServiceCardData {
  const key = serviceStatusKey(d.status);
  const expiry = d.expires_at ?? d.next_due_date;
  const renew = fmtDate(expiry);
  const soon = key === 'active' && isWithinDays(expiry, 30);

  const badge = soon
    ? { label: 'Renueva pronto', variant: 'warning' as BadgeVariant }
    : { label: SERVICE_STATUS_LABEL[key], variant: SERVICE_STATUS_TONE[key] };
  const strip = soon
    ? {
        tone: 'warning' as StatusDotColor,
        text: renew
          ? `Se renueva el ${renew} · te avisaremos antes`
          : 'Se renueva pronto · te avisaremos antes',
      }
    : baseStrip(key);

  const metaParts = ['Dominio'];
  if (renew) metaParts.push(`Renueva ${renew}`);
  return {
    id: d.id,
    kind: 'domain',
    href: `/dashboard/domains/${d.id}`,
    title: d.fqdn ?? d.product_name,
    badge,
    meta: metaParts.join(' · '),
    strip,
  };
}

/* ── Support Inside (una card resumen de la suscripción del cliente) ── */
export function supportInsideCardData(
  sub: SupportInsideSubscriptionPayload,
): ServiceCardData {
  const tech = sub.technician
    ? `${sub.technician.first_name} ${sub.technician.last_name}`.trim()
    : null;
  const metaParts = [sub.product.name];
  if (tech) metaParts.push(`Tu técnico: ${tech}`);

  let badge: { label: string; variant: BadgeVariant };
  let strip: { tone: StatusDotColor; text: string };
  switch (sub.status) {
    case 'active':
      badge = { label: 'Activo', variant: 'success' };
      strip = { tone: 'success', text: 'Tu negocio, cuidado · sin incidencias' };
      break;
    case 'past_due':
      badge = { label: 'Pago pendiente', variant: 'warning' };
      strip = {
        tone: 'warning',
        text: 'Pago pendiente · regularízalo para seguir cubierto',
      };
      break;
    default:
      badge = { label: 'Cancelado', variant: 'neutral' };
      strip = { tone: 'neutral', text: 'Plan cancelado' };
  }

  return {
    id: sub.id,
    kind: 'support_inside',
    href: '/dashboard/support-inside',
    title: 'Support Inside',
    badge,
    meta: metaParts.join(' · '),
    strip,
  };
}

/** Salud global agregada del hub: cualquier tira warning/danger → atención. */
export function aggregateHealth(cards: ServiceCardData[]): 'ok' | 'attention' {
  return cards.some((c) => c.strip.tone === 'warning' || c.strip.tone === 'danger')
    ? 'attention'
    : 'ok';
}
