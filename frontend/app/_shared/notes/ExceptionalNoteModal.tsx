'use client';

/* ═══════════════════════════════════════
   ExceptionalNoteModal — Sprint 16 / ADR-079 §3.8.
   Sprint 13 §13.AUTH Fase E (Modelo A): Server Action para crear.

   Modal canónico para crear una nota EXCEPCIONAL desde el perfil cliente.
   Es la única vía pública de creación de `client_notes` libre — el resto
   de notas las crean los listeners canónicos al cerrar ticket /
   mantenimiento / task. Persiste con:
     - source_system='exceptional'
     - source_id=null
     - triggered_by_action='manual_entry'
     - category='exceptional'
   ═══════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { Modal, Button, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui';
import { createExceptionalNoteAction } from './_actions';
import s from './exceptional-note-modal.module.css';

const NOTE_MAX_LENGTH = 5000;

export interface ExceptionalNoteModalProps {
  open: boolean;
  clientId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function ExceptionalNoteModal({
  open,
  clientId,
  onClose,
  onCreated,
}: ExceptionalNoteModalProps) {
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setBody('');
      setIsPinned(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    const result = await createExceptionalNoteAction(clientId, {
      body: trimmed,
      is_pinned: isPinned,
    });
    setSaving(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    toast('success', 'Nota excepcional añadida');
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Añadir nota excepcional" size="sm">
      <p className={s.desc}>
        Las notas excepcionales son entradas libres del agente sobre el
        cliente. Para notas vinculadas a un ticket, mantenimiento o tarea,
        usa el sistema correspondiente — esa nota se generará automáticamente
        al cerrar el flujo.
      </p>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, NOTE_MAX_LENGTH))}
        placeholder="Apunte libre: contexto del cliente, detalle no encajable en otro flujo, recordatorio interno…"
        rows={5}
        maxLength={NOTE_MAX_LENGTH}
        autoFocus
      />
      <div className={s.row}>
        <label className={s.pinLabel}>
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
          />
          <span>Fijar al inicio del listado</span>
        </label>
        <span className={s.meta}>
          {body.length}/{NOTE_MAX_LENGTH}
        </span>
      </div>
      <div className={s.actions}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!body.trim() || saving}
          loading={saving}
        >
          Guardar nota
        </Button>
      </div>
    </Modal>
  );
}
