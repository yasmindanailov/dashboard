'use client';

/* ═══════════════════════════════════════
   CompleteTaskModal — Sprint 16 / ADR-079 §3.6.1 + §3.9 (amendment).
   Sprint 13 §13.AUTH Fase E: presentational puro — el submit lo
   gestiona el padre (TaskCard) via Server Action.

   Modal canónico unificado para cerrar una task. Soporta dos modos:
     - `bridge_complete` → `support_ticket`. Llama a
       `/tasks/:id/complete-ticket-bridge` con `ticket_action='resolve'`.
       El ticket pasa a `resolved` (estado transitorio) y se notifica al
       cliente con CTA al ticket. Cliente puede confirmar resolución,
       responder (reactiva → nueva task) o esperar al auto-close cron.
     - `complete_with_note` → `provisioning_manual` / `client_lifecycle` /
       `project`. Llama a `/tasks/:id/complete`. Nota obligatoria.

   Mantenimientos (`support_inside_slot`) NO usan este modal — usan
   `MaintenanceLogModal` (checklist + client_facing_notes), también
   inline desde la card.
   ═══════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { Modal, Button, Textarea } from '../../components/ui';
import type { InlineActionKind } from './source-labels';
import type { Task } from './types';
import s from './task-card.module.css';

const NOTE_MAX_LENGTH = 5000;

export interface CompleteTaskModalProps {
  open: boolean;
  task: Task | null;
  /** Acción seleccionada por la card. Null cuando el modal está cerrado. */
  action: InlineActionKind | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}

const CONFIG_BY_ACTION: Record<
  Exclude<InlineActionKind, 'complete_maintenance'>,
  {
    title: string;
    description: string;
    placeholder: string;
    submitLabel: string;
  }
> = {
  bridge_complete: {
    title: 'Completar tarea — resolver ticket',
    description:
      'Al completar, el ticket pasará a "Resuelto". El cliente recibirá una notificación con enlace al ticket y podrá responder si sigue necesitando ayuda (eso reabre el caso y genera una nueva tarea automáticamente) o confirmar la resolución para cerrarlo. Si no responde en 7 días, el ticket se cerrará por inactividad. La nota queda registrada en el cliente con trazabilidad.',
    placeholder:
      'Ej: Se actualizó el plugin a la versión X. Cliente confirmó que el problema se resolvió.',
    submitLabel: 'Completar y resolver',
  },
  complete_with_note: {
    title: 'Completar tarea',
    description:
      'La nota es obligatoria — queda en el historial del cliente con trazabilidad del sistema origen.',
    placeholder:
      'Resumen de lo realizado: setup ejecutado, llamada con el cliente, item del proyecto resuelto…',
    submitLabel: 'Completar',
  },
};

export default function CompleteTaskModal({
  open,
  task,
  action,
  loading,
  onClose,
  onSubmit,
}: CompleteTaskModalProps) {
  const [note, setNote] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- modal reset on close: limpia el note cuando el padre cierra el modal.
    if (!open) setNote('');
  }, [open]);

  if (!task || !action || action === 'complete_maintenance') return null;

  const config = CONFIG_BY_ACTION[action];
  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && !loading;

  return (
    <Modal open={open} onClose={onClose} title={config.title} size="sm">
      <p className={s.modalDesc}>{config.description}</p>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
        placeholder={config.placeholder}
        rows={5}
        maxLength={NOTE_MAX_LENGTH}
        autoFocus
      />
      <div className={s.modalMeta}>
        {note.length}/{NOTE_MAX_LENGTH}
      </div>
      <div className={s.modalActions}>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          onClick={() => onSubmit(trimmed)}
          disabled={!canSubmit}
          loading={loading}
        >
          {config.submitLabel}
        </Button>
      </div>
    </Modal>
  );
}
