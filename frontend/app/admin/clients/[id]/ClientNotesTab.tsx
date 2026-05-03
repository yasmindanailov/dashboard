'use client';

// TODO(ADR-078, Sprint 13): migrar a Server Component cuando cierre §13.AUTH.

/* ═══════════════════════════════════════
   ClientNotesTab — Sprint 16 / ADR-079 §3.8.

   Listado canónico de `client_notes` con filtros de:
     - `category` (NoteCategory enum, 7 valores).
     - `source_system` (NoteSourceSystem enum, 5 valores).
     - `pinned_only` (toggle).

   La única vía de creación libre desde aquí es la nota EXCEPCIONAL —
   abierta vía `ExceptionalNoteModal`. El resto de notas las crean
   automáticamente los listeners canónicos al cerrar tickets,
   mantenimientos y tareas.

   Cada nota con `source_system` que tenga página de detalle por ID enlaza
   directo al detalle (ticket/chat → `/admin/support/[id]`). Los `source_
   system` que no tienen detalle separado por ID (`maintenance_log` apunta
   a slot, `task_completion` apunta a task — `/admin/tasks/[id]` eliminada
   en Sprint 16, `exceptional` no tiene origen) se renderizan como span
   sin link. Cuando llegue el módulo project (Sprint 22), DC.36 documenta
   el enriquecimiento de task_completion con task.source_system para
   permitir link al sistema vinculado de la task.
   ═══════════════════════════════════════ */

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '../../../components/ui';
import { clientsApi } from '../../../lib/api';
import type {
  ClientNote,
  NoteCategory,
  NoteSourceSystem,
} from '../../../lib/types';
import ExceptionalNoteModal from '../../../_shared/notes/ExceptionalNoteModal';
import styles from './clientDetail.module.css';

/**
 * Mapping canónico `source_system → href`. Devuelve `null` cuando el
 * sistema vinculado no tiene página de detalle separada por ID accesible
 * desde admin. Sólo enlazamos cuando el destino existe — evita 404s.
 */
function noteSourceHref(note: Pick<ClientNote, 'source_system' | 'source_id'>): string | null {
  if (!note.source_id) return null;
  switch (note.source_system) {
    case 'ticket':
    case 'chat':
      return `/admin/support/${note.source_id}`;
    case 'maintenance_log':
    case 'task_completion':
    case 'exceptional':
      return null;
    default:
      return null;
  }
}

const CATEGORY_OPTIONS: { value: NoteCategory | ''; label: string }[] = [
  { value: '', label: 'Todas las categorías' },
  { value: 'support', label: 'Soporte' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'billing', label: 'Facturación' },
  { value: 'project', label: 'Proyecto' },
  { value: 'technical_incident', label: 'Incidente técnico' },
  { value: 'exceptional', label: 'Excepcional' },
];

const SOURCE_OPTIONS: { value: NoteSourceSystem | ''; label: string }[] = [
  { value: '', label: 'Todos los sistemas' },
  { value: 'ticket', label: 'Ticket de soporte' },
  { value: 'maintenance_log', label: 'Mantenimiento' },
  { value: 'task_completion', label: 'Cierre de tarea' },
  { value: 'exceptional', label: 'Nota excepcional' },
  { value: 'chat', label: 'Chat (futuro)' },
];

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  support: 'Soporte',
  maintenance: 'Mantenimiento',
  onboarding: 'Onboarding',
  billing: 'Facturación',
  project: 'Proyecto',
  technical_incident: 'Incidente técnico',
  exceptional: 'Excepcional',
};

const SOURCE_LABELS: Record<NoteSourceSystem, string> = {
  ticket: 'Ticket',
  chat: 'Chat',
  maintenance_log: 'Mantenimiento',
  task_completion: 'Cierre de tarea',
  exceptional: 'Excepcional',
};

const ACTION_LABELS: Record<string, string> = {
  'ticket.resolved': 'Ticket resuelto',
  'ticket.closed': 'Ticket cerrado',
  'task.completed': 'Tarea completada',
  'maintenance.completed': 'Mantenimiento registrado',
  manual_entry: 'Entrada manual',
};

interface ClientNotesTabProps {
  clientId: string;
  notes: ClientNote[];
  loading: boolean;
  category: NoteCategory | '';
  sourceSystem: NoteSourceSystem | '';
  pinnedOnly: boolean;
  onCategoryChange: (v: NoteCategory | '') => void;
  onSourceChange: (v: NoteSourceSystem | '') => void;
  onPinnedToggle: (v: boolean) => void;
  onRefresh: () => void;
}

export default function ClientNotesTab({
  clientId,
  notes,
  loading,
  category,
  sourceSystem,
  pinnedOnly,
  onCategoryChange,
  onSourceChange,
  onPinnedToggle,
  onRefresh,
}: ClientNotesTabProps) {
  const [showExceptionalModal, setShowExceptionalModal] = useState(false);

  return (
    <div className={styles.stack}>
      {/* Add exceptional note */}
      <div className={styles.section}>
        <div className={styles.notesHeader}>
          <h2 className={styles.sectionTitle}>Notas del cliente</h2>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowExceptionalModal(true)}
          >
            + Añadir nota excepcional
          </Button>
        </div>
        <p className={styles.notesIntro}>
          Las notas se crean automáticamente al cerrar tickets, mantenimientos
          o tareas con su `source_system` correspondiente. Las notas
          excepcionales son entradas libres del agente sin actuador asociado.
        </p>
      </div>

      {/* Filters */}
      <div className={styles.sectionSm}>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Categoría:</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as NoteCategory | '')}
            className={styles.noteCategorySelect}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <span className={styles.filterLabel}>Sistema:</span>
          <select
            value={sourceSystem}
            onChange={(e) =>
              onSourceChange(e.target.value as NoteSourceSystem | '')
            }
            className={styles.noteCategorySelect}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className={styles.pinnedToggle}>
            <input
              type="checkbox"
              checked={pinnedOnly}
              onChange={(e) => onPinnedToggle(e.target.checked)}
            />
            <span>Solo fijadas</span>
          </label>
        </div>
      </div>

      {/* Notes list */}
      <div className={styles.section}>
        <h3 className={styles.sectionSubtitle}>
          {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
        </h3>
        {loading ? (
          <div className={styles.emptyText}>Cargando notas…</div>
        ) : notes.length === 0 ? (
          <p className={styles.emptyText}>
            No hay notas
            {category ? ` en categoría "${CATEGORY_LABELS[category]}"` : ''}
            {sourceSystem ? ` del sistema "${SOURCE_LABELS[sourceSystem]}"` : ''}
            {pinnedOnly ? ' fijadas' : ''}
            .
          </p>
        ) : (
          <div className={styles.stackSm}>
            {notes.map((note) => {
              const date = new Date(note.created_at);
              const dateStr = date.toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });
              const timeStr = date.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={note.id}
                  className={`${styles.noteItem} ${note.is_pinned ? styles.noteItemPinned : styles.noteItemDefault}`}
                >
                  <p className={styles.noteBody}>{note.body}</p>
                  <div className={styles.noteMetaRow}>
                    <div className={styles.noteMetaLeft}>
                      <span className={styles.noteAuthor}>
                        {note.author_name ?? 'Desconocido'}
                      </span>
                      <span className={styles.noteDot}>·</span>
                      <span className={styles.noteCatBadge}>
                        {CATEGORY_LABELS[note.category]}
                      </span>
                      <span className={styles.noteDot}>·</span>
                      {(() => {
                        const href = noteSourceHref(note);
                        return href ? (
                          <Link
                            href={href}
                            className={`${styles.noteSourceBadge} ${styles.noteSourceBadgeLink}`}
                            title={`Abrir ${SOURCE_LABELS[note.source_system].toLowerCase()} origen`}
                          >
                            {SOURCE_LABELS[note.source_system]} →
                          </Link>
                        ) : (
                          <span className={styles.noteSourceBadge}>
                            {SOURCE_LABELS[note.source_system]}
                          </span>
                        );
                      })()}
                      {note.triggered_by_action && (
                        <>
                          <span className={styles.noteDot}>·</span>
                          <span className={styles.noteAction}>
                            {ACTION_LABELS[note.triggered_by_action] ??
                              note.triggered_by_action}
                          </span>
                        </>
                      )}
                      <span className={styles.noteDot}>·</span>
                      <span className={styles.noteDate}>
                        {dateStr} · {timeStr}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        const token = localStorage.getItem('access_token');
                        if (!token) return;
                        await clientsApi.toggleNotePin(token, note.id);
                        onRefresh();
                      }}
                      className={`${styles.notePinBtn} ${note.is_pinned ? styles.notePinBtnActive : styles.notePinBtnInactive}`}
                    >
                      {note.is_pinned ? 'Desfijar' : 'Fijar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ExceptionalNoteModal
        open={showExceptionalModal}
        clientId={clientId}
        onClose={() => setShowExceptionalModal(false)}
        onCreated={onRefresh}
      />
    </div>
  );
}
