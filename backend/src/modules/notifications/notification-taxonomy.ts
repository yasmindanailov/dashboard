import { NotificationCategory } from '@prisma/client';

/**
 * Taxonomía canónica `event_type → NotificationCategory` (F3·E10).
 *
 * Fuente ÚNICA de verdad de la clasificación de notificaciones. El
 * `InAppChannel` la usa para persistir `category` en la fila al crearla;
 * el frontend NO reclasifica — recibe `category` y solo presenta
 * (categoría → icono/tono). Esto evita el drift front/back (R5: la
 * clasificación es lógica de dominio, vive en el backend).
 *
 * Cada `event_type` con plantilla `internal`
 * (ver `prisma/seeds/notification-templates.ts`) mapea a EXACTAMENTE una
 * categoría. Los eventos de cliente y de admin/agente comparten el enum;
 * el destinatario (a quién se despacha) — no la categoría — decide en qué
 * bandeja aparece. Cualquier evento sin entrada cae en `general`.
 *
 * ⚠️ Si añades un `event_type` con plantilla `internal`, añádelo aquí: el
 * test `notification-taxonomy.spec.ts` verifica que todos los eventos
 * `internal` seedeados tienen categoría explícita (sin caer en el fallback).
 */
const EVENT_CATEGORY: Readonly<Record<string, NotificationCategory>> = {
  // ─── Facturación (cliente) ───
  'invoice.paid': 'facturacion',

  // ─── Servicios (cliente) ───
  'service.suspended': 'servicios',
  'service.unsuspended': 'servicios',
  'service.quota_threshold_crossed': 'servicios',
  'service.cancellation_scheduled': 'servicios',
  'service.cancelled': 'servicios',
  'service.password_reset': 'servicios',
  'maintenance.completed': 'servicios',

  // ─── Dominios (cliente) ───
  'domain.renewed': 'dominios',
  'domain.restored': 'dominios',
  'domain.transfer_initiated': 'dominios',
  'domain.transfer_completed': 'dominios',
  'domain.transfer_failed': 'dominios',
  'domain.expiring_soon': 'dominios',
  'domain.expired': 'dominios',
  'domain.entered_redemption': 'dominios',

  // ─── Seguridad (cliente + admin) ───
  'domain.nameservers_changed': 'seguridad',
  'domain.lock_changed': 'seguridad',
  'auth.refresh_replay_detected': 'seguridad',

  // ─── Soporte (cliente + admin/agente) ───
  'conversation.created': 'soporte',
  'conversation.resolved': 'soporte',
  'conversation.assigned': 'soporte',
  'conversation.auto_closed': 'soporte',
  'message.created': 'soporte',
  'task.completed': 'soporte',

  // ─── Tareas (admin/agente) ───
  'task.assigned': 'tareas',
  'task.overdue': 'tareas',
  'task.unassigned_overdue': 'tareas',

  // ─── Sistema (admin) ───
  'dlq.job_failed': 'sistema',
  'outbox.event_failed': 'sistema',
  'system.error': 'sistema',
  'maintenance.critical': 'sistema',

  // ─── Plugins (admin) ───
  'plugin.circuit_opened': 'plugins',
  'plugin.circuit_closed': 'plugins',
};

/**
 * Resuelve la categoría de un evento. Robusto a `metadata.event` ausente o
 * no-string (notificaciones legacy sin `metadata.event`) → `general`.
 */
export function categoryForEvent(
  event: string | null | undefined,
): NotificationCategory {
  if (typeof event !== 'string') return 'general';
  return EVENT_CATEGORY[event] ?? 'general';
}

/** Mapa crudo (solo lectura) — expuesto para el test de cobertura del seed. */
export const NOTIFICATION_EVENT_CATEGORY = EVENT_CATEGORY;
