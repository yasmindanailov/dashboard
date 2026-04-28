'use client';

import type { ResolutionType } from './types';
import { Modal, Textarea, Button } from '../../../components/ui';
import s from './conversationDetail.module.css';

/* ═══════════════════════════════════════
   DetailResolutionModal — Resolution note modal
   DS components: Modal (§4.2), Textarea, Button
   Config-driven: supports resolve, close,
   reopen, and escalate actions with note.
   Ref: UI_SPEC §4.2, ROADMAP.md D25
   ═══════════════════════════════════════ */

const MODAL_CONFIG: Record<ResolutionType, {
  title: string;
  description: string;
  placeholder: string;
  buttonLabel: string;
}> = {
  resolve: {
    title: 'Resolver conversación',
    description: 'Describe cómo se ha resuelto este caso. Esta nota quedará vinculada al historial.',
    placeholder: 'Ej: Se actualizó el plugin WooCommerce a la versión 8.x...',
    buttonLabel: 'Resolver',
  },
  close: {
    title: 'Cerrar conversación',
    description: 'Describe cómo se ha resuelto este caso. Esta nota quedará vinculada al historial.',
    placeholder: 'Ej: Cerrado sin actividad tras 48h...',
    buttonLabel: 'Cerrar',
  },
  reopen: {
    title: 'Reabrir conversación',
    description: 'Indica por qué se reabre esta conversación. Esta nota quedará registrada en el historial del cliente.',
    placeholder: 'Ej: El problema ha reaparecido tras la actualización...',
    buttonLabel: 'Reabrir',
  },
  escalate: {
    title: 'Escalar a ticket',
    description: 'Describe el motivo de la escalación y el contexto para el ticket.',
    placeholder: 'Ej: El cliente necesita revisión técnica del servidor...',
    buttonLabel: 'Escalar',
  },
};

interface DetailResolutionModalProps {
  type: ResolutionType;
  note: string;
  loading: boolean;
  onNoteChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function DetailResolutionModal({
  type, note, loading, onNoteChange, onSubmit, onClose,
}: DetailResolutionModalProps) {
  const config = MODAL_CONFIG[type];

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={config.title}
      size="sm"
    >
      <p className={s.resolutionDesc}>
        {config.description}
      </p>
      <Textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder={config.placeholder}
        rows={4}
        autoFocus
      />
      <div className={s.resolutionActions}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={onSubmit}
          disabled={!note.trim() || loading}
          loading={loading}
        >
          {config.buttonLabel}
        </Button>
      </div>
    </Modal>
  );
}
