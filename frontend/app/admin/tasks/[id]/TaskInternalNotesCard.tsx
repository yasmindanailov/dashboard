'use client';

/* ═══════════════════════════════════════
   TaskInternalNotesCard — Sprint 8 Fase B.9 (2026-04-30)

   Card en la columna principal del task detail con:
     - Botón "Añadir nota" que abre un mini-modal con Textarea.
     - Lista cronológica descendente de notas (`category=technical`
       de `client_notes` filtradas por `task_id`) con autor + fecha.

   Comparte semántica con `_shared/support/conversation` (notas
   asociadas a la entidad de trabajo del agente) pero distinto storage:
   aquí persiste cada nota inmediatamente (POST `/tasks/:id/notes`)
   en lugar de acumular en estado local — el agente ve su nota en la
   lista al instante y queda persistida aunque salga del detail sin
   completar la tarea.
   ═══════════════════════════════════════ */

import { useState } from 'react';
import { Card, Button, Modal, Textarea } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast/Toast';
import { tasksApi, type TaskNotePayload } from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';
import s from './taskDetail.module.css';

interface TaskInternalNotesCardProps {
  taskId: string;
  notes: TaskNotePayload[];
  loading: boolean;
  onCreated: (note: TaskNotePayload) => void;
  /** Si la tarea está cerrada, deshabilitamos el botón de añadir. */
  readOnly: boolean;
}

const NOTE_MAX_LENGTH = 5000;

export default function TaskInternalNotesCard({
  taskId,
  notes,
  loading,
  onCreated,
  readOnly,
}: TaskInternalNotesCardProps) {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('access_token') || ''
      : '';
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!token || !body.trim()) return;
    setSaving(true);
    try {
      const note = await tasksApi.createNote(token, taskId, body.trim());
      onCreated(note);
      toast('success', 'Nota añadida');
      setBody('');
      setOpen(false);
    } catch (err) {
      toast('error', getErrorMessage(err) || 'No se pudo guardar la nota');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setBody('');
    setOpen(false);
  };

  return (
    <>
      <Card>
        <div className={s.notesHeader}>
          <h3 className={s.cardTitle}>Notas internas</h3>
          {!readOnly && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen(true)}
            >
              + Añadir nota
            </Button>
          )}
        </div>
        {loading ? (
          <p className={s.emptyDescription}>Cargando…</p>
        ) : notes.length === 0 ? (
          <p className={s.emptyDescription}>
            Aún no hay notas internas. Añade la primera para dejar trazabilidad
            del trabajo.
          </p>
        ) : (
          <ul className={s.notesList}>
            {notes.map((note) => (
              <li key={note.id} className={s.noteItem}>
                <div className={s.noteHeader}>
                  <span className={s.noteAuthor}>
                    {note.author.first_name} {note.author.last_name}
                  </span>
                  <span className={s.noteDate}>
                    {formatTimestamp(note.created_at)}
                  </span>
                </div>
                <p className={s.noteBody}>{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={open}
        onClose={handleCancel}
        title="Añadir nota interna"
        size="sm"
      >
        <p className={s.completionDesc}>
          Solo visible para el equipo. No se notifica al cliente.
        </p>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, NOTE_MAX_LENGTH))}
          placeholder="Apunte operativo: estado del trabajo, esperando respuesta del cliente, hallazgo técnico..."
          rows={5}
          maxLength={NOTE_MAX_LENGTH}
          autoFocus
        />
        <div className={s.completionMeta}>
          {body.length}/{NOTE_MAX_LENGTH}
        </div>
        <div className={s.completionActions}>
          <Button variant="secondary" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!body.trim() || saving}
            loading={saving}
          >
            Guardar nota
          </Button>
        </div>
      </Modal>
    </>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
