'use client';

/* ═══════════════════════════════════════
   NotesExplorer (F4·U24) — cromo compartido de la tab "Notas": cabecera
   (título + resumen + acción) + chips de categoría con contador + filtro de
   origen + "solo fijadas" (modo interactivo) + timeline (`NotesTimeline`).

   Lo usan, con el MISMO diseño (decisión Yasmin):
     - detalle de CLIENTE (`ClientNotesTab`, interactive → fijar/desfijar +
       "solo fijadas" + botón de crear en `headerAction`), y
     - detalle de SERVICIO (`ServiceNotesCard`, read-only).

   El filtrado es client-side (las notas llegan completas del SC).
   ═══════════════════════════════════════ */

import { useMemo, useState, type ReactNode } from 'react';

import type {
  ClientNote,
  NoteCategory,
  NoteSourceSystem,
} from '../../lib/types';
import { NotesTimeline } from './NotesTimeline';
import { CATEGORY_COLOR, CATEGORY_LABELS } from './note-meta';
import styles from './notes-explorer.module.css';

export interface NotesExplorerSourceOption {
  value: NoteSourceSystem | '';
  label: string;
}

interface NotesExplorerProps {
  notes: ClientNote[];
  /** Título de la cabecera (h2). */
  title: string;
  /** Texto libre tras el resumen dinámico (contexto de origen de las notas). */
  summarySuffix?: string;
  /** Slot de acción a la derecha de la cabecera (botón crear / enlace). */
  headerAction?: ReactNode;
  /** Opciones del filtro de origen. */
  sourceOptions: NotesExplorerSourceOption[];
  /** Interactivo: habilita "solo fijadas" + fijar/desfijar en el timeline. */
  interactive?: boolean;
  /** Handler de fijar/desfijar (solo `interactive`). */
  onPin?: (id: string) => void;
  loading?: boolean;
  /** Mensaje cuando no hay ninguna nota (antes de filtrar). */
  emptyLabel?: string;
}

export function NotesExplorer({
  notes,
  title,
  summarySuffix,
  headerAction,
  sourceOptions,
  interactive = false,
  onPin,
  loading = false,
  emptyLabel = 'Aún no hay notas registradas.',
}: NotesExplorerProps) {
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

  return (
    <div>
      <div className={styles.topRow}>
        <div className={styles.topText}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.summary}>
            {filtered.length} {filtered.length === 1 ? 'nota' : 'notas'}
            {totalPinned > 0 ? ` · ${totalPinned} fijadas` : ''} · última
            actividad {lastWhen}.{summarySuffix ? ` ${summarySuffix}` : ''}
          </p>
        </div>
        {headerAction}
      </div>

      {loading ? (
        <div className={styles.loadingText}>Cargando notas…</div>
      ) : notes.length === 0 ? (
        <div className={styles.emptyCard}>{emptyLabel}</div>
      ) : (
        <>
          {/* Chips de categoría */}
          <div className={styles.chips}>
            <button
              type="button"
              onClick={() => setCategory('')}
              className={`${styles.chip} ${category === '' ? styles.chipActive : ''}`}
            >
              Todas
              <span className={styles.chipCount}>{notes.length}</span>
            </button>
            {presentCategories.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setCategory(k)}
                className={`${styles.chip} ${category === k ? styles.chipActive : ''}`}
              >
                <span
                  className={styles.chipDot}
                  style={{ background: CATEGORY_COLOR[k] }}
                />
                {CATEGORY_LABELS[k]}
                <span className={styles.chipCount}>{catCounts[k]}</span>
              </button>
            ))}
          </div>

          {/* Filtros: origen + (solo fijadas) + limpiar */}
          <div className={styles.filters}>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as NoteSourceSystem | '')}
              className={styles.select}
              aria-label="Filtrar por origen"
            >
              {sourceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {interactive && (
              <label className={styles.pinnedToggle}>
                <input
                  type="checkbox"
                  checked={pinnedOnly}
                  onChange={(e) => setPinnedOnly(e.target.checked)}
                />
                Solo fijadas
              </label>
            )}
            {anyFilter && (
              <button
                type="button"
                onClick={() => {
                  setCategory('');
                  setSource('');
                  setPinnedOnly(false);
                }}
                className={styles.clearBtn}
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className={styles.emptyCard}>
              No hay notas con esos filtros.
            </div>
          ) : (
            <NotesTimeline
              notes={filtered}
              pinnedOnly={pinnedOnly}
              onPin={interactive ? onPin : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
