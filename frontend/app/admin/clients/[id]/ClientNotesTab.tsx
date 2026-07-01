'use client';

/* ═══════════════════════════════════════
   ClientNotesTab (F4·U22 → U24) — "Historial del cliente". El cromo (cabecera +
   chips + filtros + timeline) vive en el compartido `<NotesExplorer>` (mismo
   diseño que la tab Notas del servicio, decisión Yasmin). Aquí quedan la config
   propia del cliente (interactivo: fijar/desfijar + crear nota excepcional).
   Creación libre = nota excepcional (ADR-079 §3.8); el resto las generan los
   listeners canónicos.
   ═══════════════════════════════════════ */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui';
import type { ClientNote } from '../../../lib/types';
import ExceptionalNoteModal from '../../../_shared/notes/ExceptionalNoteModal';
import { NotesExplorer } from '../../../_shared/notes/NotesExplorer';
import { NOTE_SOURCE_FILTER_OPTIONS } from '../../../_shared/notes/note-meta';
import { toggleNotePinAction } from './_actions';

interface Props {
  clientId: string;
  notes: ClientNote[];
  loading: boolean;
  onRefresh: () => void;
}

export default function ClientNotesTab({
  clientId,
  notes,
  loading,
  onRefresh,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  async function handlePin(noteId: string) {
    await toggleNotePinAction(noteId, clientId);
    onRefresh();
  }

  return (
    <div>
      <NotesExplorer
        notes={notes}
        title="Historial del cliente"
        summarySuffix="Se crean solas al cerrar tickets, mantenimientos o tareas; las excepcionales las añade el agente."
        sourceOptions={NOTE_SOURCE_FILTER_OPTIONS}
        interactive
        onPin={(id) => void handlePin(id)}
        loading={loading}
        emptyLabel="Aún no hay notas de este cliente."
        headerAction={
          <Button
            variant="primary"
            leftIcon={<Plus size={15} strokeWidth={1.7} />}
            onClick={() => setModalOpen(true)}
          >
            Nota excepcional
          </Button>
        }
      />

      <ExceptionalNoteModal
        open={modalOpen}
        clientId={clientId}
        onClose={() => setModalOpen(false)}
        onCreated={onRefresh}
      />
    </div>
  );
}
