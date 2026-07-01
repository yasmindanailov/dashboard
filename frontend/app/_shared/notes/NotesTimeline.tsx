import Link from 'next/link';

import type { ClientNote } from '../../lib/types';
import {
  ACTION_LABELS,
  CATEGORY_COLOR,
  NOTE_MONTHS,
  SOURCE_LABELS,
  noteSourceHref,
} from './note-meta';
import styles from './notes-timeline.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   NotesTimeline — render compartido de notas (F4·U24). Card de fijadas +
   timeline por mes de filas (punto de categoría + cuerpo + meta autor·origen·
   acción·fecha). 1:1 con el diseño de la tab "Notas" del cliente-detalle.

   Presentacional (sin hooks, sin 'use client') → sirve a un contenedor cliente
   (`ClientNotesTab`, pasa `onPin` interactivo) y a uno servidor
   (`ServiceNotesCard`, read-only sin `onPin`). Las notas llegan ya filtradas y
   ordenadas (desc) por el contenedor.
   ═══════════════════════════════════════════════════════════════════════════ */

interface NotesTimelineProps {
  notes: ClientNote[];
  /** Si true, oculta el flujo por mes (solo el grupo de fijadas). */
  pinnedOnly?: boolean;
  /** Si se pasa, cada fila muestra el botón Fijar/Desfijar (interactivo). */
  onPin?: (noteId: string) => void;
}

export function NotesTimeline({
  notes,
  pinnedOnly = false,
  onPin,
}: NotesTimelineProps) {
  const pinnedGroup = notes.filter((n) => n.is_pinned);
  const flow = pinnedOnly ? [] : notes.filter((n) => !n.is_pinned);

  const order: string[] = [];
  const byMonth: Record<string, ClientNote[]> = {};
  for (const n of flow) {
    const d = new Date(n.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!byMonth[key]) {
      byMonth[key] = [];
      order.push(key);
    }
    byMonth[key].push(n);
  }
  const groups = order.map((key) => {
    const [y, m] = key.split('-');
    return { key, label: `${NOTE_MONTHS[Number(m)]} ${y}`, notes: byMonth[key] };
  });

  return (
    <>
      {pinnedGroup.length > 0 && (
        <div className={styles.notesPinnedCard}>
          <div className={styles.notesPinnedHead}>
            Fijadas · {pinnedGroup.length}
          </div>
          {pinnedGroup.map((n, i) => (
            <NoteRow key={n.id} note={n} first={i === 0} onPin={onPin} />
          ))}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className={styles.notesMonthGroup}>
          <div className={styles.notesMonthLabel}>
            <span>{g.label}</span>
            <span className={styles.notesMonthLine} />
          </div>
          <div className={styles.notesMonthCard}>
            {g.notes.map((n, i) => (
              <NoteRow key={n.id} note={n} first={i === 0} onPin={onPin} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function NoteRow({
  note,
  first,
  onPin,
}: {
  note: ClientNote;
  first: boolean;
  onPin?: (noteId: string) => void;
}) {
  const href = noteSourceHref(note);
  const when = new Date(note.created_at).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div
      className={`${styles.noteRow} ${first ? '' : styles.noteRowDivider}`.trim()}
    >
      {/* Color de categoría = valor dinámico del dato (patrón establecido U22). */}
      <span
        className={styles.noteDotMark}
        style={{ background: CATEGORY_COLOR[note.category] }}
      />
      <div className={styles.noteRowBody}>
        <p className={styles.noteRowText}>{note.body}</p>
        <div className={styles.noteRowMeta}>
          <span className={styles.noteRowAuthor}>
            {note.author_name ?? 'Sistema'}
          </span>
          {href ? (
            <Link
              href={href}
              className={`${styles.noteSrcChip} ${styles.noteSrcChipLink}`}
            >
              {SOURCE_LABELS[note.source_system]} →
            </Link>
          ) : (
            <span className={styles.noteSrcChip}>
              {SOURCE_LABELS[note.source_system]}
            </span>
          )}
          {note.triggered_by_action && ACTION_LABELS[note.triggered_by_action] && (
            <>
              <span className={styles.metaDot}>·</span>
              <span>{ACTION_LABELS[note.triggered_by_action]}</span>
            </>
          )}
          <span className={styles.metaDot}>·</span>
          <span>{when}</span>
        </div>
      </div>
      {onPin && (
        <button
          type="button"
          onClick={() => onPin(note.id)}
          className={`${styles.notePinBtn} ${
            note.is_pinned ? styles.notePinBtnActive : styles.notePinBtnInactive
          }`}
        >
          {note.is_pinned ? 'Desfijar' : 'Fijar'}
        </button>
      )}
    </div>
  );
}
