'use client';

/* ═══════════════════════════════════════
   ClientNotesTab (F4·U22) — "Historial del cliente" 1:1 con el mockup:
   chips de categoría (con contador), filtro de origen, "solo fijadas",
   grupo de fijadas y timeline agrupada por mes. El filtrado es client-side
   (las notas llegan completas desde el SC). Creación libre = nota excepcional
   (ADR-079 §3.8); el resto las generan los listeners canónicos.
   ═══════════════════════════════════════ */

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui';
import type {
  ClientNote,
  NoteCategory,
  NoteSourceSystem,
} from '../../../lib/types';
import ExceptionalNoteModal from '../../../_shared/notes/ExceptionalNoteModal';
import { NotesTimeline } from '../../../_shared/notes/NotesTimeline';
import {
  CATEGORY_COLOR,
  CATEGORY_LABELS,
} from '../../../_shared/notes/note-meta';
import { toggleNotePinAction } from './_actions';
import styles from './clientDetail.module.css';

const SOURCE_OPTIONS: { value: NoteSourceSystem | ''; label: string }[] = [
  { value: '', label: 'Todos los orígenes' },
  { value: 'ticket', label: 'Ticket de soporte' },
  { value: 'maintenance_log', label: 'Mantenimiento' },
  { value: 'task_completion', label: 'Cierre de tarea' },
  { value: 'service', label: 'Servicio (lifecycle)' },
  { value: 'exceptional', label: 'Nota excepcional' },
  { value: 'chat', label: 'Chat' },
];

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
  const [category, setCategory] = useState<NoteCategory | ''>('');
  const [source, setSource] = useState<NoteSourceSystem | ''>('');
  const [pinnedOnly, setPinnedOnly] = useState(false);

  const catCounts = useMemo(() => {
    const c: Partial<Record<NoteCategory, number>> = {};
    for (const n of notes) c[n.category] = (c[n.category] ?? 0) + 1;
    return c;
  }, [notes]);

  const filtered = useMemo(
    () =>
      notes
        .filter(
          (n) =>
            (!category || n.category === category) &&
            (!source || n.source_system === source) &&
            (!pinnedOnly || n.is_pinned),
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
    [notes, category, source, pinnedOnly],
  );

  const totalPinned = notes.filter((n) => n.is_pinned).length;
  const anyFilter = !!(category || source || pinnedOnly);
  const lastWhen = filtered.length
    ? new Date(filtered[0].created_at).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
      })
    : '—';

  const presentCategories = (
    Object.keys(CATEGORY_LABELS) as NoteCategory[]
  ).filter((k) => catCounts[k]);

  async function handlePin(noteId: string) {
    await toggleNotePinAction(noteId, clientId);
    onRefresh();
  }

  return (
    <div>
      <div className={styles.notesTopRow}>
        <div className={styles.notesTopText}>
          <h2 className={styles.notesTitle}>Historial del cliente</h2>
          <p className={styles.notesSummary}>
            {filtered.length} {filtered.length === 1 ? 'nota' : 'notas'}
            {totalPinned > 0 ? ` · ${totalPinned} fijadas` : ''} · última actividad{' '}
            {lastWhen}. Se crean solas al cerrar tickets, mantenimientos o tareas;
            las excepcionales las añade el agente.
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus size={15} strokeWidth={1.7} />}
          onClick={() => setModalOpen(true)}
        >
          Nota excepcional
        </Button>
      </div>

      {/* Chips de categoría */}
      <div className={styles.noteChips}>
        <button
          type="button"
          onClick={() => setCategory('')}
          className={`${styles.noteChip} ${category === '' ? styles.noteChipActive : ''}`}
        >
          Todas
          <span className={styles.noteChipCount}>{notes.length}</span>
        </button>
        {presentCategories.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setCategory(k)}
            className={`${styles.noteChip} ${category === k ? styles.noteChipActive : ''}`}
          >
            <span
              className={styles.noteChipDot}
              style={{ background: CATEGORY_COLOR[k] }}
            />
            {CATEGORY_LABELS[k]}
            <span className={styles.noteChipCount}>{catCounts[k]}</span>
          </button>
        ))}
      </div>

      {/* Filtros: origen + solo fijadas + limpiar */}
      <div className={styles.noteFilters}>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as NoteSourceSystem | '')}
          className={styles.noteSelect}
          aria-label="Filtrar por origen"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className={styles.notePinnedToggle}>
          <input
            type="checkbox"
            checked={pinnedOnly}
            onChange={(e) => setPinnedOnly(e.target.checked)}
          />
          Solo fijadas
        </label>
        {anyFilter && (
          <button
            type="button"
            onClick={() => {
              setCategory('');
              setSource('');
              setPinnedOnly(false);
            }}
            className={styles.noteClearBtn}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.emptyText}>Cargando notas…</div>
      ) : filtered.length === 0 ? (
        <div className={styles.notesEmptyCard}>No hay notas con esos filtros.</div>
      ) : (
        <NotesTimeline
          notes={filtered}
          pinnedOnly={pinnedOnly}
          onPin={(id) => void handlePin(id)}
        />
      )}

      <ExceptionalNoteModal
        open={modalOpen}
        clientId={clientId}
        onClose={() => setModalOpen(false)}
        onCreated={onRefresh}
      />
    </div>
  );
}
