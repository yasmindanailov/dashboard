'use client';

/* ═══════════════════════════════════════
   TaskCard — Sprint 16 / ADR-079 §3.6 (amendment A2).
   Sprint 13 §13.AUTH Fase E (Modelo A): mutaciones via Server Actions.

   Una sola línea visible + contexto + accionadores inline.
   Sin tabs, sin pestañas, sin secciones expandibles. Cada accionador
   delega 100% en el servicio del sistema vinculado (§3.6.1).

   La card es agnóstica del sistema: usa los mapeos canónicos
   `SOURCE_LABELS` + `INLINE_ACTIONS` de `./source-labels.ts` — cero
   `if (source_system === 'X')` aquí dentro.

   Doctrina canónica del listado:
     - Las tasks son **read-only** respecto al sistema vinculado.
     - Acciones humanas válidas:
         · Agente: completar (vía accionador inline → modal/maintenance).
         · Superadmin: reasignar (vía botón "Reasignar" → modal).
     - **No hay "cancelar tarea"** desde la UI. La cancelación es
       consecuencia automática de eventos del sistema vinculado (slot
       liberado, servicio cancelado, ticket desasignado, item del
       checklist eliminado) y la disparan los listeners cross-sistema.
   ═══════════════════════════════════════ */

import { useState } from 'react';
import Link from 'next/link';
import { Button, useToast } from '../../components/ui';
import {
  SOURCE_LABELS,
  INLINE_ACTIONS,
  ctaLabel,
  type InlineActionKind,
} from './source-labels';
import { computeSlaTone, type Task } from './types';
import CompleteTaskModal from './CompleteTaskModal';
import MaintenanceLogModal from './MaintenanceLogModal';
import ReassignTaskModal from './ReassignTaskModal';
import {
  completeTaskAction,
  completeTicketBridgeTaskAction,
} from './_actions';
import s from './task-card.module.css';

export interface TaskCardProps {
  task: Task;
  /** Línea de contexto (subject del ticket / "Mantenimiento octubre 2026" /
      nombre del proyecto / producto del setup). El listado puede
      enriquecerla cuando tenga acceso al dato; el fallback es genérico. */
  contextLine?: string | null;
  /** Mostrar el agente asignado en el chip de la card (vista superadmin
      `Ver todas`). Para `Mis tareas` se omite — es redundante. */
  showAssignee?: boolean;
  /** Sprint 16 / ADR-079 amendment A2: permite reasignar la task desde la
      card (superadmin only). Abre `ReassignTaskModal` con dropdown de
      agentes elegibles + opción liberar a cola pública. */
  canReassign?: boolean;
  /** Disparado tras cualquier acción exitosa para que el listado refresque. */
  onChanged?: () => void;
}

const CONTEXT_FALLBACK: Record<Task['source_system'], string> = {
  support_ticket: 'Ticket de soporte vinculado',
  support_inside_slot: 'Mantenimiento Support Inside',
  provisioning_manual: 'Setup manual de servicio',
  client_lifecycle: 'Llamada de bienvenida primer servicio',
  project: 'Item de proyecto delegado',
};

const SLA_TONE_LABEL: Record<'safe' | 'warn' | 'danger', string> = {
  safe: 'A tiempo',
  warn: 'Plazo ajustado',
  danger: 'Vencida',
};

const SLA_TONE_CLASS: Record<'safe' | 'warn' | 'danger', string> = {
  safe: s.slaSafe,
  warn: s.slaWarn,
  danger: s.slaDanger,
};

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export default function TaskCard({
  task,
  contextLine,
  showAssignee = false,
  canReassign = false,
  onChanged,
}: TaskCardProps) {
  const { toast } = useToast();
  const labels = SOURCE_LABELS[task.source_system];
  const actions = INLINE_ACTIONS[task.source_system];
  const [pendingAction, setPendingAction] = useState<InlineActionKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);

  const sla = computeSlaTone(task.created_at, task.due_date, task.status);
  const isClosed = ['completed', 'cancelled', 'not_completed_in_time'].includes(
    task.status,
  );

  const ctaHref = labels.ctaHref({
    source_id: task.source_id,
    client_id: task.client_id,
  });

  const handleActionClick = (kind: InlineActionKind) => {
    if (kind === 'complete_maintenance') {
      setShowMaintenanceModal(true);
      return;
    }
    setPendingAction(kind);
  };

  const handleSubmit = async (note: string) => {
    if (!pendingAction) return;
    setSubmitting(true);
    let result: { ok: boolean; error?: string } | null = null;
    if (pendingAction === 'bridge_complete') {
      /*
       * Sprint 16 amendment: la task de bridge ticket siempre resuelve
       * el ticket (`resolved`, transitorio). El cierre archivado lo
       * hace el cliente al confirmar, el cron auto-close pasados N
       * días, o el agente desde el detalle del ticket.
       */
      result = await completeTicketBridgeTaskAction(task.id, {
        ticket_action: 'resolve',
        resolution_note: note,
      });
      if (result.ok) {
        toast(
          'success',
          'Tarea completada. Ticket resuelto — cliente notificado para confirmar.',
        );
      }
    } else if (pendingAction === 'complete_with_note') {
      result = await completeTaskAction(task.id, note);
      if (result.ok) {
        toast('success', 'Tarea completada. Nota registrada en el cliente.');
      }
    }
    setSubmitting(false);
    if (!result || !result.ok) {
      toast('error', result?.error || 'No se pudo completar la tarea');
      return;
    }
    setPendingAction(null);
    onChanged?.();
  };

  const tier = task.client.support_inside_tier ?? null;
  const showSiBadge = task.source_system === 'support_ticket' && !!tier;

  return (
    <article className={`${s.card} ${isClosed ? s.cardClosed : ''}`}>
      <div className={s.row1}>
        <span className={s.iconLabel} aria-label={labels.label}>
          <span className={s.icon} aria-hidden="true">
            {labels.icon}
          </span>
          <span className={s.label}>{labels.label}</span>
        </span>
        {showSiBadge && tier && (
          <span className={`${s.siBadge} ${s[`siBadge_${tier}`]}`}>
            SI {tier === 'pro' ? 'Pro' : tier === 'medium' ? 'Medium' : 'Basic'}
          </span>
        )}
        <span className={s.dot} aria-hidden="true">·</span>
        <Link href={`/admin/clients/${task.client_id}`} className={s.client}>
          {task.client.first_name} {task.client.last_name}
        </Link>
        <span className={s.dot} aria-hidden="true">·</span>
        <span className={s.age}>{formatRelative(task.created_at)}</span>
        {sla && (
          <>
            <span className={s.dot} aria-hidden="true">·</span>
            <span
              className={`${s.sla} ${SLA_TONE_CLASS[sla]}`}
              title={SLA_TONE_LABEL[sla]}
            >
              {formatSla(task.due_date, sla)}
            </span>
          </>
        )}
        {showAssignee && (
          <>
            <span className={s.dot} aria-hidden="true">·</span>
            {task.assignee ? (
              <span className={s.assignee}>
                {task.assignee.first_name} {task.assignee.last_name}
              </span>
            ) : (
              <span className={`${s.assignee} ${s.assigneeUnassigned}`}>
                Sin asignar
              </span>
            )}
          </>
        )}
        {isClosed && (
          <>
            <span className={s.dot} aria-hidden="true">·</span>
            <span className={s.closedBadge}>{statusLabel(task.status)}</span>
          </>
        )}
        {task.source_system === 'support_ticket' && task.priority !== 'medium' && (
          <>
            <span className={s.dot} aria-hidden="true">·</span>
            <span className={`${s.priority} ${s[`priority_${task.priority}`]}`}>
              {PRIORITY_LABEL[task.priority]}
            </span>
          </>
        )}
      </div>

      <p className={s.context}>
        {contextLine ?? CONTEXT_FALLBACK[task.source_system]}
      </p>

      <div className={s.row3}>
        <div className={s.actions}>
          {!isClosed &&
            actions.map((a) => (
              <Button
                key={a.kind}
                size="sm"
                variant={a.variant ?? 'primary'}
                onClick={() => handleActionClick(a.kind)}
                disabled={submitting}
              >
                {a.label}
              </Button>
            ))}
          {!isClosed && canReassign && (
            <button
              type="button"
              className={s.cancelPill}
              onClick={() => setShowReassignModal(true)}
              disabled={submitting}
              title="Reasignar tarea (superadmin)"
            >
              Reasignar
            </button>
          )}
        </div>
        <Link href={ctaHref} className={s.cta}>
          {ctaLabel(task.source_system)}
        </Link>
      </div>

      <CompleteTaskModal
        open={pendingAction !== null && pendingAction !== 'complete_maintenance'}
        task={task}
        action={pendingAction}
        loading={submitting}
        onClose={() => (submitting ? undefined : setPendingAction(null))}
        onSubmit={handleSubmit}
      />

      <MaintenanceLogModal
        open={showMaintenanceModal}
        task={task}
        onClose={() => setShowMaintenanceModal(false)}
        onCompleted={() => {
          onChanged?.();
        }}
      />

      <ReassignTaskModal
        open={showReassignModal}
        task={task}
        onClose={() => setShowReassignModal(false)}
        onReassigned={() => onChanged?.()}
      />
    </article>
  );
}

function formatRelative(iso: string): string {
  const created = new Date(iso).getTime();
  const diffMs = Date.now() - created;
  if (diffMs < 0) return 'ahora mismo';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks} sem`;
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });
}

function formatSla(dueIso: string | null, tone: 'safe' | 'warn' | 'danger'): string {
  if (!dueIso) return '';
  const due = new Date(dueIso).getTime();
  const diff = due - Date.now();
  if (tone === 'danger' && diff < 0) {
    const overdueHours = Math.floor(-diff / 3_600_000);
    if (overdueHours < 24) return `vencida ${overdueHours} h`;
    const days = Math.floor(overdueHours / 24);
    return `vencida ${days} d`;
  }
  const remainingMin = Math.max(0, Math.floor(diff / 60_000));
  if (remainingMin < 60) return `vence ${remainingMin} min`;
  const remainingH = Math.floor(remainingMin / 60);
  if (remainingH < 24) return `vence ${remainingH} h`;
  const days = Math.floor(remainingH / 24);
  return `vence ${days} d`;
}

function statusLabel(status: Task['status']): string {
  switch (status) {
    case 'completed':
      return 'Completada';
    case 'cancelled':
      return 'Cancelada';
    case 'not_completed_in_time':
      return 'Vencida';
    default:
      return status;
  }
}
