'use client';

import type { ResolutionModalState } from './types';
import { Modal, Textarea, Button } from '../../../components/ui';
import styles from './chats.module.css';

/* ═══════════════════════════════════════
   ResolutionModal — Resolution note modal
   Used for resolve, close, and escalate
   actions. Requires mandatory note (7.H17).
   Ref: DECISIONS.md §42
   ═══════════════════════════════════════ */

interface ResolutionModalProps {
  open: boolean;
  modal: ResolutionModalState | null;
  note: string;
  loading: boolean;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const MODAL_CONFIG: Record<ResolutionModalState['type'], {
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
  variant: 'primary' | 'danger';
}> = {
  resolve: {
    title: 'Resolver conversación',
    description: 'Describe cómo se ha resuelto este caso. Esta nota quedará vinculada al historial.',
    placeholder: 'Ej: Se actualizó el plugin WooCommerce a la versión 8.x...',
    submitLabel: 'Resolver',
    variant: 'primary',
  },
  close: {
    title: 'Cerrar conversación',
    description: 'Indica el motivo del cierre. Esta nota quedará registrada en el historial del cliente.',
    placeholder: 'Ej: Cliente confirmó que el problema se resolvió...',
    submitLabel: 'Cerrar',
    variant: 'primary',
  },
  escalate: {
    title: 'Escalar a ticket',
    description: 'Describe el motivo de la escalación y el contexto para el ticket.',
    placeholder: 'Ej: El cliente necesita revisión técnica del servidor...',
    submitLabel: 'Escalar',
    variant: 'primary',
  },
};

export default function ResolutionModal({
  open, modal, note, loading,
  onNoteChange, onSubmit, onCancel,
}: ResolutionModalProps) {
  if (!modal) return null;

  const config = MODAL_CONFIG[modal.type];

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={config.title}
      size="md"
      footer={
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant={config.variant}
            onClick={onSubmit}
            disabled={!note.trim()}
            loading={loading}
          >
            {config.submitLabel}
          </Button>
        </div>
      }
    >
      <p className={styles.resolutionDescription}>{config.description}</p>
      <Textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder={config.placeholder}
        rows={4}
        resizable={false}
        autoFocus
      />
    </Modal>
  );
}
