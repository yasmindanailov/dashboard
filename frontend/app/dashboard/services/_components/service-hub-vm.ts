/**
 * service-hub-vm — Sprint F4·W3·U04.
 *
 * View-models PUROS (SC-compatibles) que traducen cada entidad del hub "Mis
 * servicios" (hosting · dominio · Support Inside) a la card 1:1 con
 * `MisServicios.dc.html`: header (icon + nombre + badge + subtítulo) + cuerpo de
 * key-values + footer de acciones. Fuera (decisión Yasmin / coste): gauges de
 * hosting y nameservers de dominio (getInfo, caro), detalles de "transferencia
 * en curso" (no vienen en la lista), el ⋯ y la tira de estado (redundantes).
 */
import type { BadgeVariant, StatusDotColor } from '../../../components/ui';
import type { ServiceListItem, SupportInsideSubscriptionPayload } from '../../../lib/api';
import type { DomainListItem } from '../../../_shared/domains/types';
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE } from '../../../_shared/services';

export type ServiceHubKind = 'service' | 'domain' | 'support_inside';

export interface CardFact {
  label: string;
  value: string;
  /** Muestra un check verde antes del valor (p. ej. "Auto-renovación · ✓ Activada"). */
  check?: boolean;
}

export interface CardAction {
  /** `sso` = lanza el panel del proveedor (client action); `link` = navega. */
  type: 'link' | 'sso';
  label: string;
  /** primary/secondary = botón DS; detail = enlace de texto "Ver detalle →". */
  variant: 'primary' | 'secondary' | 'detail';
  href?: string;
  serviceId?: string;
}

export interface ServiceCardData {
  id: string;
  kind: ServiceHubKind;
  /** Card destacada (Support Inside): borde/sombra de marca + header tintado. */
  highlight?: boolean;
  title: string;
  badge: { label: string; variant: BadgeVariant };
  subtitle: string;
  facts: CardFact[];
  actions: CardAction[];
  /** Tono de estado para agregar la salud global (no se pinta como tira). */
  tone: StatusDotColor;
}

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  hosting_web: 'Hosting',
  docker_service: 'Servicio',
  support_inside: 'Support Inside',
  we_do_it: 'Servicio gestionado',
  custom_service: 'Servicio a medida',
  domain: 'Dominio',
};

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

/* ── Servicio de hosting (grid 2-col) ── */
export function serviceCardData(svc: ServiceListItem): ServiceCardData {
  const key = serviceStatusKey(svc.status);
  const typeLabel = PRODUCT_TYPE_LABEL[svc.product.type] ?? 'Servicio';
  const renew = fmtDate(svc.next_due_date);

  const facts: CardFact[] = [];
  if (renew) facts.push({ label: 'Renueva', value: renew });
  // F4·W3 — estado real de auto-renovación (columna `Service.auto_renew`).
  if (key === 'active') {
    facts.push({
      label: 'Auto-renovación',
      value: svc.auto_renew ? 'Activada' : 'Desactivada',
      check: svc.auto_renew,
    });
  }

  const caps = svc.capabilities ?? null;
  const actions: CardAction[] = [];
  if (caps?.has_sso_panel) {
    actions.push({ type: 'sso', label: 'Abrir panel', variant: 'primary', serviceId: svc.id });
  }
  if (caps?.has_dns_management) {
    actions.push({
      type: 'link',
      label: 'Gestionar DNS',
      variant: 'secondary',
      href: `/dashboard/services/${svc.id}/dns`,
    });
  }
  actions.push({
    type: 'link',
    label: 'Ver detalle',
    variant: 'detail',
    href: `/dashboard/services/${svc.id}`,
  });

  return {
    id: svc.id,
    kind: 'service',
    title: svc.label ?? svc.domain ?? svc.product.name,
    badge: { label: SERVICE_STATUS_LABEL[key], variant: SERVICE_STATUS_TONE[key] },
    subtitle: `${svc.product.name} · ${typeLabel}`,
    facts,
    actions,
    tone: SERVICE_STATUS_TONE[key],
  };
}

/* ── Dominio (1 col) ── */
export function domainCardData(d: DomainListItem): ServiceCardData {
  const key = serviceStatusKey(d.status);
  const expiry = d.expires_at ?? d.next_due_date;
  const renew = fmtDate(expiry);
  const soon = key === 'active' && isWithinDays(expiry, 30);

  const badge = soon
    ? { label: 'Renueva pronto', variant: 'warning' as BadgeVariant }
    : { label: SERVICE_STATUS_LABEL[key], variant: SERVICE_STATUS_TONE[key] };
  const tone: StatusDotColor = soon ? 'warning' : SERVICE_STATUS_TONE[key];

  // F4·W3 — auto-renovación invoice-driven (Aelium genera la factura de
  // renovación; el registrador no auto-renueva). Estado real de la columna.
  const facts: CardFact[] = [];
  if (renew) facts.push({ label: 'Renueva', value: renew });
  if (key === 'active') {
    facts.push({
      label: 'Auto-renovación',
      value: d.auto_renew ? 'Activada' : 'Desactivada',
      check: d.auto_renew,
    });
  }

  return {
    id: d.id,
    kind: 'domain',
    title: d.fqdn ?? d.product_name,
    badge,
    subtitle: 'Dominio',
    facts,
    actions: [
      {
        type: 'link',
        label: 'Gestionar DNS',
        variant: 'primary',
        href: `/dashboard/domains/${d.id}`,
      },
      {
        type: 'link',
        label: 'Ver detalle',
        variant: 'detail',
        href: `/dashboard/domains/${d.id}`,
      },
    ],
    tone,
  };
}

/* ── Support Inside (1 col, card destacada) ── */
export function supportInsideCardData(
  sub: SupportInsideSubscriptionPayload,
): ServiceCardData {
  const cfg = sub.product.support_inside_config;
  const tech = sub.technician
    ? `${sub.technician.first_name} ${sub.technician.last_name}`.trim()
    : null;

  const facts: CardFact[] = [];
  if (cfg?.slots_included != null) {
    facts.push({ label: 'Mantenimientos', value: `${cfg.slots_included} al mes` });
  }
  if (cfg?.response_sla_hours != null) {
    const h = cfg.response_sla_hours;
    facts.push({ label: 'Respuesta', value: h <= 24 ? 'Menos de 24 h' : `${h} h` });
  }
  facts.push({ label: 'Tu técnico', value: tech ?? 'Sin asignar aún' });

  let badge: { label: string; variant: BadgeVariant };
  let tone: StatusDotColor;
  switch (sub.status) {
    case 'active':
      badge = { label: 'Activo', variant: 'success' };
      tone = 'success';
      break;
    case 'past_due':
      badge = { label: 'Pago pendiente', variant: 'warning' };
      tone = 'warning';
      break;
    default:
      badge = { label: 'Cancelado', variant: 'neutral' };
      tone = 'neutral';
  }

  // Evita "Support Inside · Support Inside X" si el nombre del plan ya lo incluye.
  const plan = sub.product.name.replace(/^support inside\s*/i, '').trim();
  const title = plan ? `Support Inside · ${plan}` : 'Support Inside';

  return {
    id: sub.id,
    kind: 'support_inside',
    highlight: true,
    title,
    badge,
    subtitle: 'Soporte de tu negocio, no solo del servidor',
    facts,
    actions: [
      {
        type: 'link',
        label: 'Gestionar mi plan',
        variant: 'primary',
        href: '/dashboard/support-inside',
      },
      {
        type: 'link',
        label: 'Ver planes superiores',
        variant: 'secondary',
        href: '/dashboard/support-inside',
      },
    ],
    tone,
  };
}

/** Salud global agregada: cualquier card en warning/danger → atención. */
export function aggregateHealth(cards: ServiceCardData[]): 'ok' | 'attention' {
  return cards.some((c) => c.tone === 'warning' || c.tone === 'danger')
    ? 'attention'
    : 'ok';
}
