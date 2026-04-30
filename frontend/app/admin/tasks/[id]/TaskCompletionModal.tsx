'use client';

/* ═══════════════════════════════════════
   TaskCompletionModal — Sprint 8 Fase B.9 / B.10 (2026-04-30)

   Modal canónico para cerrar una tarea. Replica el patrón de
   `_shared/support/conversation/DetailResolutionModal.tsx`.

   Modos:
     - **simple** (B.9, default): tarea sin `conversation_id`. Pide
       mensaje opcional al cliente — si está poblado, el listener
       `task.completed` lo envía por email + campana.
     - **ticket-bridge** (B.10, ADR-074): tarea con `conversation_id`
       (`type=support_ticket`). Pide selector "Resolver / Cerrar" y
       nota interna obligatoria. El backend delega en `SupportService.
       updateConversation` (sin email duplicado al cliente).
   ═══════════════════════════════════════ */

import { Modal, Textarea, Button } from '../../../components/ui';
import s from './taskDetail.module.css';

export type TicketAction = 'resolve' | 'close';

interface TaskCompletionModalProps {
  open: boolean;
  taskType: string;
  taskTitle: string;
  /** Si está presente, modo bridge: el cierre cierra/resuelve el ticket. */
  conversationId: string | null;
  note: string;
  loading: boolean;
  onNoteChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  /** Sólo en modo bridge — qué hacer con el ticket. Default: 'resolve'. */
  ticketAction?: TicketAction;
  onTicketActionChange?: (a: TicketAction) => void;
}

const NOTE_MAX_LENGTH = 5000;

export default function TaskCompletionModal({
  open,
  taskType,
  taskTitle,
  conversationId,
  note,
  loading,
  onNoteChange,
  onSubmit,
  onClose,
  ticketAction = 'resolve',
  onTicketActionChange,
}: TaskCompletionModalProps) {
  const isMaintenance =
    taskType === 'maintenance' || taskType === 'maintenance_management';
  const isContactClient = taskType === 'contact_client';
  const isBridge = !!conversationId;

  // Sprint 8 Fase B.10 — ADR-074: modo bridge tiene su propio shape.
  // Pide acción (resolver/cerrar) + nota interna obligatoria. La nota
  // NO va al cliente directamente (la notificación canónica la dispara
  // el módulo support al cambiar el status del ticket).
  const config = isBridge
    ? {
        title: 'Cerrar ticket vinculado',
        description:
          'Esta acción cierra el ticket de soporte y marca la tarea como completada. La notificación al cliente la envía el módulo de soporte automáticamente — aquí pides una nota interna que queda vinculada al ticket como solución.',
        placeholder:
          ticketAction === 'resolve'
            ? 'Ej: Se actualizó el plugin a la versión X. Cliente confirmó que el problema se resolvió.'
            : 'Ej: Cerrado tras 48h sin actividad. Cliente no respondió a las solicitudes de información.',
        buttonLabel:
          ticketAction === 'resolve'
            ? 'Resolver ticket y completar'
            : 'Cerrar ticket y completar',
        required: true,
      }
    : isMaintenance
      ? {
          title: 'Completar mantenimiento y notificar al cliente',
          description:
            'El cliente recibirá un email con este resumen del mantenimiento. Es obligatorio.',
          placeholder:
            'Resumen del mantenimiento realizado: actualizaciones, plugins revisados, optimizaciones, hallazgos...',
          buttonLabel: 'Completar y notificar',
          required: true,
        }
      : isContactClient
        ? {
            title: 'Completar tarea',
            description:
              'Si dejas un mensaje, el cliente lo recibirá por email. Si lo dejas vacío, la tarea se cierra sin notificarle.',
            placeholder:
              'Resumen de la conversación: dudas resueltas, próximos pasos acordados...',
            buttonLabel: 'Completar',
            required: false,
          }
        : {
            title: 'Completar tarea',
            description:
              'Si dejas un mensaje, el cliente lo recibirá por email sobre esta tarea. Si lo dejas vacío, la tarea se cierra sin notificarle.',
            placeholder: `Mensaje para el cliente sobre "${taskTitle}". Texto libre.`,
            buttonLabel: 'Completar',
            required: false,
          };

  return (
    <Modal open={open} onClose={onClose} title={config.title} size="sm">
      <p className={s.completionDesc}>{config.description}</p>

      {isBridge && onTicketActionChange && (
        <div className={s.bridgeActionPicker}>
          <button
            type="button"
            className={`${s.bridgeActionBtn} ${ticketAction === 'resolve' ? s.bridgeActionBtnActive : ''}`}
            onClick={() => onTicketActionChange('resolve')}
          >
            Resolver ticket
          </button>
          <button
            type="button"
            className={`${s.bridgeActionBtn} ${ticketAction === 'close' ? s.bridgeActionBtnActive : ''}`}
            onClick={() => onTicketActionChange('close')}
          >
            Cerrar ticket
          </button>
        </div>
      )}

      <Textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value.slice(0, NOTE_MAX_LENGTH))}
        placeholder={config.placeholder}
        rows={5}
        maxLength={NOTE_MAX_LENGTH}
        autoFocus
      />
      <div className={s.completionMeta}>
        {note.length}/{NOTE_MAX_LENGTH}
      </div>
      <div className={s.completionActions}>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={onSubmit}
          disabled={(config.required && !note.trim()) || loading}
          loading={loading}
        >
          {config.buttonLabel}
        </Button>
      </div>
    </Modal>
  );
}
