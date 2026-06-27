/* ═══════════════════════════════════════
   source-labels — Sprint 16 / ADR-079 §3.6.
   Mapeo canónico icono + label + sistema vinculado para cada
   `TaskSourceSystem`. Cada accionador inline canónico también vive aquí.
   ═══════════════════════════════════════ */

import type { LucideIcon } from 'lucide-react';
import { Ticket, Wrench, Settings, Phone, FolderKanban } from 'lucide-react';

import type { Task, TaskSourceSystem } from './types';

export interface SourceLabel {
  /** Icono del sistema vinculado (SVG, Lucide React — D1: nada de emojis).
      Distingue el sistema de un vistazo. F0.4/GL-27: antes era un glifo emoji
      por sistema (violación de D1 racionalizada en el código). */
  icon: LucideIcon;
  /** Etiqueta humana del sistema vinculado en español. */
  label: string;
  /** Etiqueta corta del sistema (footer "Abrir [sistema] completo →"). */
  shortLabel: string;
  /** URL al detalle del sistema vinculado para una task concreta. */
  ctaHref: (task: Pick<Task, 'source_id' | 'client_id'> & { service_id?: string | null }) => string;
}

export const SOURCE_LABELS: Record<TaskSourceSystem, SourceLabel> = {
  support_ticket: {
    icon: Ticket,
    label: 'Ticket Support',
    shortLabel: 'ticket',
    ctaHref: (t) => `/admin/support/${t.source_id}`,
  },
  support_inside_slot: {
    icon: Wrench,
    label: 'Mantenimiento mensual',
    shortLabel: 'servicio',
    ctaHref: (t) => `/admin/clients/${t.client_id}`,
  },
  provisioning_manual: {
    icon: Settings,
    label: 'Setup servicio',
    shortLabel: 'servicio',
    ctaHref: (t) => `/admin/services/${t.source_id}`,
  },
  client_lifecycle: {
    icon: Phone,
    label: 'Llamada bienvenida',
    shortLabel: 'cliente',
    ctaHref: (t) => `/admin/clients/${t.client_id}`,
  },
  project: {
    icon: FolderKanban,
    label: 'Proyecto',
    shortLabel: 'proyecto',
    ctaHref: (t) => `/admin/projects/${t.source_id}`,
  },
};

/* ── Catálogo cerrado de accionadores inline por sistema (§3.6.1).
   Cada accionador tiene un `kind` que la card mapea al modal/handler:
     - `bridge_complete` → CompleteTaskModal modo bridge (Sprint 16 amendment).
     - `complete_with_note` → CompleteTaskModal modo simple (nota obligatoria).
     - `complete_maintenance` → CTA al detalle (modal de log vive en /[id]).
   El catálogo es la única fuente — no hay condicionales `if (source==='X')`
   en la card (regla §3.6.1 cerrada). ── */

/* Sprint 16 amendment §3.6.1: `support_ticket` simplificado a 1 solo
   accionador. Doctrina: la task representa el trabajo del agente (1
   intención = "ya está hecho"). El estado del ticket (`resolved` con
   posible reactivación, `closed` archivado) lo gestiona el módulo support
   con su propio lifecycle (cliente confirma / responde / cron auto-cierra
   pasados N días). El "cerrar archivado manual" sigue accesible desde el
   detalle del ticket — no se duplica como accionador inline.
   `bridge_complete` envía `ticket_action='resolve'` al backend; el ticket
   pasa a `resolved` y dispara `conversation.resolved` (notif cliente). */
export type InlineActionKind =
  | 'bridge_complete'
  | 'complete_with_note'
  | 'complete_maintenance';

export interface InlineAction {
  kind: InlineActionKind;
  label: string;
  variant?: 'primary' | 'secondary';
}

export const INLINE_ACTIONS: Record<TaskSourceSystem, InlineAction[]> = {
  support_ticket: [
    { kind: 'bridge_complete', label: 'Completar', variant: 'primary' },
  ],
  support_inside_slot: [
    { kind: 'complete_maintenance', label: 'Completar mantenimiento', variant: 'primary' },
  ],
  provisioning_manual: [
    { kind: 'complete_with_note', label: 'Marcar setup completado', variant: 'primary' },
  ],
  client_lifecycle: [
    { kind: 'complete_with_note', label: 'Marcar como contactado', variant: 'primary' },
  ],
  project: [
    { kind: 'complete_with_note', label: 'Marcar item completado', variant: 'primary' },
  ],
};

/* Texto del CTA "abrir [sistema] completo →" en la card. */
export function ctaLabel(sourceSystem: TaskSourceSystem): string {
  return `Abrir ${SOURCE_LABELS[sourceSystem].shortLabel} completo →`;
}
