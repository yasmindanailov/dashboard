'use client';

/* ═══════════════════════════════════════
   TaskCompletionModal — Sprint 8 Fase B.9 (2026-04-30)

   Modal canónico para cerrar una tarea. Replica el patrón de
   `_shared/support/conversation/DetailResolutionModal.tsx` (mismo
   shape: title + description + textarea + actions). El operador
   introduce aquí la nota que se enviará al cliente — pasa al payload
   del endpoint `/tasks/:id/complete` (o `/maintenance/log` si la tarea
   es de mantenimiento) como `client_notes`.

   Sprint 8 Fase B.10 (ADR-074) extenderá este componente con un
   selector "¿Qué hacemos con el ticket vinculado?" cuando la tarea
   tenga `conversation_id` poblado — ver TODO al final.
   ═══════════════════════════════════════ */

import { Modal, Textarea, Button } from '../../../components/ui';
import s from './taskDetail.module.css';

interface TaskCompletionModalProps {
  open: boolean;
  taskType: string;
  taskTitle: string;
  note: string;
  loading: boolean;
  onNoteChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const NOTE_MAX_LENGTH = 5000;

export default function TaskCompletionModal({
  open,
  taskType,
  taskTitle,
  note,
  loading,
  onNoteChange,
  onSubmit,
  onClose,
}: TaskCompletionModalProps) {
  const isMaintenance =
    taskType === 'maintenance' || taskType === 'maintenance_management';
  const isContactClient = taskType === 'contact_client';

  // Copy adaptativo según tipo. Mantenimiento exige nota técnica
  // (resumen del trabajo) — coherente con el flujo previo a B.9.
  // Contact_client espera resumen de la llamada. Resto: descripción
  // del trabajo realizado para el cliente.
  const config = isMaintenance
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
