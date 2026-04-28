'use client';

import Link from 'next/link';
import { clientsApi } from '../../../lib/api';
import type { ClientNote } from '../../../lib/types';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   ClientNotesTab — Structured notes
   Ref: DECISIONS.md 7.H19
   ═══════════════════════════════════════ */

const NOTE_CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'conversation', label: 'Conversación' },
  { value: 'solution', label: 'Solución' },
  { value: 'billing', label: 'Facturación' },
  { value: 'technical', label: 'Técnico' },
  { value: 'general', label: 'General' },
];

const CAT_LABELS: Record<string, string> = {
  conversation: 'Conversación',
  solution: 'Solución',
  billing: 'Facturación',
  technical: 'Técnico',
  general: 'General',
};

interface ClientNotesTabProps {
  notes: ClientNote[];
  loading: boolean;
  noteFilter: string;
  onFilterChange: (v: string) => void;
  // Add note
  noteText: string;
  noteCategory: string;
  savingNote: boolean;
  noteSuccess: boolean;
  error: string | null;
  onNoteTextChange: (v: string) => void;
  onNoteCategoryChange: (v: string) => void;
  onAddNote: () => void;
  onRefresh: () => void;
}

export default function ClientNotesTab({
  notes, loading, noteFilter, onFilterChange,
  noteText, noteCategory, savingNote, noteSuccess, error,
  onNoteTextChange, onNoteCategoryChange, onAddNote, onRefresh,
}: ClientNotesTabProps) {
  return (
    <div className={styles.stack}>
      {/* Add note */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Añadir nota</h2>
        <textarea
          value={noteText}
          onChange={(e) => onNoteTextChange(e.target.value)}
          placeholder="Escribe una nota interna..."
          rows={3}
          className={styles.noteTextarea}
        />
        <div className={styles.noteFormRow}>
          <select value={noteCategory} onChange={(e) => onNoteCategoryChange(e.target.value)}
            className={styles.noteCategorySelect}>
            <option value="general">General</option>
            <option value="conversation">Conversación</option>
            <option value="solution">Solución</option>
            <option value="billing">Facturación</option>
            <option value="technical">Técnico</option>
          </select>
          <button onClick={onAddNote} disabled={!noteText.trim() || savingNote}
            className={styles.noteSubmitBtn}>
            {savingNote ? 'Guardando...' : 'Añadir nota'}
          </button>
          {noteSuccess && <span className={styles.noteSuccessMsg}>Nota guardada</span>}
          {error && <span className={styles.noteErrorMsg}>{error}</span>}
        </div>
      </div>

      {/* Filter */}
      <div className={styles.sectionSm}>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Filtrar:</span>
          {NOTE_CATEGORIES.map((f) => (
            <button key={f.value} onClick={() => onFilterChange(f.value)}
              className={`${styles.filterBtn} ${noteFilter === f.value ? styles.filterBtnActive : ''}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes list */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Notas ({notes.length})
        </h2>
        {loading ? (
          <div className={styles.emptyText}>Cargando notas...</div>
        ) : notes.length === 0 ? (
          <p className={styles.emptyText}>
            No hay notas{noteFilter ? ` de tipo "${noteFilter}"` : ''}
          </p>
        ) : (
          <div className={styles.stackSm}>
            {notes.map((note) => {
              const date = new Date(note.created_at);
              const dateStr = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
              const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={note.id} className={`${styles.noteItem} ${note.is_pinned ? styles.noteItemPinned : styles.noteItemDefault}`}>
                  {/* Note body — primary content */}
                  <p className={styles.noteBody}>
                    {note.body}
                  </p>
                  {note.conversation_id && (
                    <Link href={`/dashboard/support/${note.conversation_id}`}
                      className={styles.noteConvLink}>
                      Ver conversación origen
                    </Link>
                  )}
                  {/* Metadata row — author · category · date · action */}
                  <div className={styles.noteMetaRow}>
                    <div className={styles.noteMetaLeft}>
                      <span className={styles.noteAuthor}>{note.author_name}</span>
                      <span className={styles.noteDot}>·</span>
                      <span className={styles.noteCatBadge}>
                        {note.category ? (CAT_LABELS[note.category] || note.category) : ''}
                      </span>
                      <span className={styles.noteDot}>·</span>
                      <span className={styles.noteDate}>{dateStr} · {timeStr}</span>
                    </div>
                    <button
                      onClick={async () => {
                        const token = localStorage.getItem('access_token');
                        if (!token) return;
                        await clientsApi.toggleNotePin(token, note.id);
                        onRefresh();
                      }}
                      className={`${styles.notePinBtn} ${note.is_pinned ? styles.notePinBtnActive : styles.notePinBtnInactive}`}>
                      {note.is_pinned ? 'Desfijar' : 'Fijar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
