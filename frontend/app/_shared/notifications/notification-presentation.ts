import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CreditCard,
  Globe,
  KeyRound,
  ListChecks,
  MessageSquare,
  Plug,
  RotateCcw,
  Server,
  Shield,
  ShieldAlert,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { IconWellTone } from '../../components/ui';

/* ═══════════════════════════════════════════════════════════════
   Presentación de notificaciones (F3·E10) — SOLO capa visual.

   La clasificación (event → categoría) es del BACKEND (fuente única,
   `notification-taxonomy.ts`, persistida en `notifications.category`). Aquí el
   front solo decide cómo PINTAR: categoría → {label, icono/tono por defecto} y
   un override fino por `event` para reflejar el matiz del mockup (un pago
   confirmado va en verde "success", una factura nueva en "brand", etc.).
   Robusto: si falta `event`, usa el default de la categoría; si falta la
   categoría, cae en `general`. R5: ninguna lógica de negocio aquí.
   ═══════════════════════════════════════════════════════════════ */

export type NotificationCategoryKey =
  | 'facturacion'
  | 'servicios'
  | 'dominios'
  | 'soporte'
  | 'seguridad'
  | 'tareas'
  | 'sistema'
  | 'plugins'
  | 'negocio'
  | 'general';

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  tone: IconWellTone;
}

const CATEGORY_META: Record<NotificationCategoryKey, CategoryMeta> = {
  facturacion: { label: 'Facturación', icon: CreditCard, tone: 'brand' },
  servicios: { label: 'Servicios', icon: Server, tone: 'brand' },
  dominios: { label: 'Dominios', icon: Globe, tone: 'brand' },
  soporte: { label: 'Soporte', icon: MessageSquare, tone: 'brand' },
  seguridad: { label: 'Seguridad', icon: Shield, tone: 'security' },
  tareas: { label: 'Tareas', icon: ListChecks, tone: 'brand' },
  sistema: { label: 'Sistema', icon: Server, tone: 'danger' },
  plugins: { label: 'Plugins', icon: Plug, tone: 'warning' },
  negocio: { label: 'Negocio', icon: TrendingUp, tone: 'brand' },
  general: { label: 'General', icon: Bell, tone: 'neutral' },
};

/** Override fino por evento (matiz del mockup). Parcial: hereda el de la categoría. */
const EVENT_OVERRIDE: Record<string, { icon?: LucideIcon; tone?: IconWellTone }> =
  {
    // Facturación
    'invoice.paid': { icon: CheckCircle2, tone: 'success' },
    // Servicios
    'service.suspended': { icon: AlertTriangle, tone: 'danger' },
    'service.unsuspended': { icon: CheckCircle2, tone: 'success' },
    'service.quota_threshold_crossed': { icon: AlertTriangle, tone: 'warning' },
    'service.cancellation_scheduled': { icon: AlertTriangle, tone: 'danger' },
    'service.cancelled': { icon: AlertTriangle, tone: 'danger' },
    'service.password_reset': { icon: KeyRound, tone: 'brand' },
    'maintenance.completed': { icon: Wrench, tone: 'brand' },
    // Dominios
    'domain.renewed': { icon: CheckCircle2, tone: 'success' },
    'domain.restored': { icon: CheckCircle2, tone: 'success' },
    'domain.transfer_completed': { icon: CheckCircle2, tone: 'success' },
    'domain.transfer_initiated': { tone: 'brand' },
    'domain.expiring_soon': { tone: 'warning' },
    'domain.expired': { tone: 'danger' },
    'domain.entered_redemption': { tone: 'danger' },
    'domain.transfer_failed': { tone: 'danger' },
    'domain.nameservers_changed': { icon: Shield, tone: 'security' },
    'domain.lock_changed': { icon: Shield, tone: 'security' },
    // Seguridad
    'auth.refresh_replay_detected': { icon: ShieldAlert, tone: 'security' },
    // Soporte
    'conversation.resolved': { icon: CheckCircle2, tone: 'success' },
    'conversation.created': { icon: MessageSquare, tone: 'brand' },
    'conversation.assigned': { icon: MessageSquare, tone: 'brand' },
    'conversation.auto_closed': { icon: MessageSquare, tone: 'brand' },
    'message.created': { icon: MessageSquare, tone: 'brand' },
    'task.completed': { icon: MessageSquare, tone: 'brand' },
    // Tareas
    'task.assigned': { icon: ListChecks, tone: 'brand' },
    'task.overdue': { icon: AlertTriangle, tone: 'warning' },
    'task.unassigned_overdue': { icon: AlertTriangle, tone: 'warning' },
    // Sistema
    'dlq.job_failed': { icon: RotateCcw, tone: 'danger' },
    'outbox.event_failed': { icon: AlertTriangle, tone: 'danger' },
    'system.error': { icon: AlertTriangle, tone: 'danger' },
    'maintenance.critical': { icon: AlertTriangle, tone: 'danger' },
    // Plugins
    'plugin.circuit_opened': { icon: Plug, tone: 'warning' },
    'plugin.circuit_closed': { icon: Plug, tone: 'success' },
  };

export interface NotificationVisual {
  icon: LucideIcon;
  tone: IconWellTone;
  categoryLabel: string;
}

function normalizeCategory(category: string | null | undefined): NotificationCategoryKey {
  if (category && category in CATEGORY_META) {
    return category as NotificationCategoryKey;
  }
  return 'general';
}

/** Extrae el `event` de `metadata.event` de forma segura (puede ser null). */
export function eventOf(metadata: Record<string, unknown> | null | undefined): string | null {
  if (metadata && typeof metadata.event === 'string') return metadata.event;
  return null;
}

/**
 * Resuelve icono + tono + etiqueta de categoría para pintar una notificación.
 * `category` viene del backend; `event` (opcional) afina el matiz visual.
 */
export function presentNotification(
  category: string | null | undefined,
  event: string | null | undefined,
): NotificationVisual {
  const key = normalizeCategory(category);
  const base = CATEGORY_META[key];
  const override = (event && EVENT_OVERRIDE[event]) || {};
  return {
    icon: override.icon ?? base.icon,
    tone: override.tone ?? base.tone,
    categoryLabel: base.label,
  };
}

/** Chips de filtro por categoría. `''` = todas (sin filtro server-side). */
export interface CategoryChip {
  value: string;
  label: string;
}

export const CLIENT_CATEGORY_CHIPS: CategoryChip[] = [
  { value: '', label: 'Todas' },
  { value: 'facturacion', label: 'Facturación' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'dominios', label: 'Dominios' },
  { value: 'soporte', label: 'Soporte' },
  { value: 'seguridad', label: 'Seguridad' },
];

export const ADMIN_CATEGORY_CHIPS: CategoryChip[] = [
  { value: '', label: 'Todas' },
  { value: 'tareas', label: 'Tareas' },
  { value: 'soporte', label: 'Soporte' },
  { value: 'sistema', label: 'Sistema' },
  { value: 'plugins', label: 'Plugins' },
  { value: 'seguridad', label: 'Seguridad' },
  { value: 'negocio', label: 'Negocio' },
];
