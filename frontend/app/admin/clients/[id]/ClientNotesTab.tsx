'use client';

/* ═══════════════════════════════════════
   ClientNotesTab (F4·U22) — "Historial del cliente" 1:1 con el mockup:
   chips de categoría (con contador), filtro de origen, "solo fijadas",
   grupo de fijadas y timeline agrupada por mes. El filtrado es client-side
   (las notas llegan completas desde el SC). Creación libre = nota excepcional
   (ADR-079 §3.8); el resto las generan los listeners canónicos.
   ═══════════════════════════════════════ */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui';
import type {
  ClientNote,
  NoteCategory,
  NoteSourceSystem,
} from '../../../lib/types';
import ExceptionalNoteModal from '../../../_shared/notes/ExceptionalNoteModal';
import { toggleNotePinAction } from './_actions';
import styles from './clientDetail.module.css';

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  support: 'Soporte',
  maintenance: 'Mantenimiento',
  onboarding: 'Onboarding',
  billing: 'Facturación',
  project: 'Proyecto',
  technical_incident: 'Incidente técnico',
  exceptional: 'Excepcional',
  lifecycle: 'Lifecycle',
};

/** Paleta por categoría (fg = color del punto/acento), 1:1 con el mockup. */
const CATEGORY_COLOR: Record<NoteCategory, string> = {
  support: '#3B82F6',
  maintenance: '#0E8C5F',
  onboarding: '#7C5CCB',
  billing: '#B27A12',
  project: '#0E7490',
  technical_incident: '#D14343',
  exceptional: '#64748B',
  lifecycle: '#475569',
};

const SOURCE_LABELS: Record<NoteSourceSystem, string> = {
  ticket: 'Ticket',
  chat: 'Chat',
  maintenance_log: 'Mantenimiento',
  task_completion: 'Cierre de tarea',
  exceptional: 'Excepcional',
  service: 'Servicio',
};

const SOURCE_OPTIONS: { value: NoteSourceSystem | ''; label: string }[] = [
  { value: '', label: 'Todos los orígenes' },
  { value: 'ticket', label: 'Ticket de soporte' },
  { value: 'maintenance_log', label: 'Mantenimiento' },
  { value: 'task_completion', label: 'Cierre de tarea' },
  { value: 'service', label: 'Servicio (lifecycle)' },
  { value: 'exceptional', label: 'Nota excepcional' },
  { value: 'chat', label: 'Chat' },
];

const ACTION_LABELS: Record<string, string> = {
  'ticket.resolved': 'Ticket resuelto',
  'ticket.closed': 'Ticket cerrado',
  'task.completed': 'Tarea completada',
  'maintenance.completed': 'Mantenimiento registrado',
  manual_entry: 'Entrada manual',
  'service.cancelled': 'Servicio cancelado',
  'service.suspended': 'Servicio suspendido',
  'service.unsuspended': 'Servicio reactivado',
  'service.auto_suspended_overdue': 'Suspendido por impago',
  'service.auto_unsuspended_overdue': 'Reactivado al pagar',
};

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function noteSourceHref(
  note: Pick<ClientNote, 'source_system' | 'source_id'>,
): string | null {
  if (!note.source_id) return null;
  switch (note.source_system) {
    case 'ticket':
    case 'chat':
      return `/admin/support/${note.source_id}`;
    case 'service':
      return `/admin/services/${note.source_id}`;
    default:
      return null;
  }
}

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

  const pinnedGroup = filtered.filter((n) => n.is_pinned);

  const timelineGroups = useMemo(() => {
    const flowNotes = pinnedOnly ? [] : filtered.filter((n) => !n.is_pinned);
    const order: string[] = [];
    const byMonth: Record<string, ClientNote[]> = {};
    for (const n of flowNotes) {
      const d = new Date(n.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!byMonth[key]) {
        byMonth[key] = [];
        order.push(key);
      }
      byMonth[key].push(n);
    }
    return order.map((key) => {
      const [y, m] = key.split('-');
      return {
        key,
        label: `${MONTHS[Number(m)]} ${y}`,
        notes: byMonth[key],
      };
    });
  }, [filtered, pinnedOnly]);

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

  function noteRow(n: ClientNote, first: boolean) {
    const color = CATEGORY_COLOR[n.category];
    const href = noteSourceHref(n);
    const when = new Date(n.created_at).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <div
        key={n.id}
        className={styles.noteRow}
        style={first ? undefined : { borderTop: '1px solid var(--border)' }}
      >
        <span className={styles.noteDotMark} style={{ background: color }} />
        <div className={styles.noteRowBody}>
          <p className={styles.noteRowText}>{n.body}</p>
          <div className={styles.noteRowMeta}>
            <span className={styles.noteRowAuthor}>
              {n.author_name ?? 'Sistema'}
            </span>
            {href ? (
              <Link href={href} className={styles.noteSrcChip} style={{ color: 'var(--brand)' }}>
                {SOURCE_LABELS[n.source_system]} →
              </Link>
            ) : (
              <span className={styles.noteSrcChip}>
                {SOURCE_LABELS[n.source_system]}
              </span>
            )}
            {n.triggered_by_action && ACTION_LABELS[n.triggered_by_action] && (
              <>
                <span className={styles.metaDot}>·</span>
                <span>{ACTION_LABELS[n.triggered_by_action]}</span>
              </>
            )}
            <span className={styles.metaDot}>·</span>
            <span>{when}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handlePin(n.id)}
          className={`${styles.notePinBtn} ${n.is_pinned ? styles.notePinBtnActive : styles.notePinBtnInactive}`}
        >
          {n.is_pinned ? 'Desfijar' : 'Fijar'}
        </button>
      </div>
    );
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
        <>
          {pinnedGroup.length > 0 && (
            <div className={styles.notesPinnedCard}>
              <div className={styles.notesPinnedHead}>
                Fijadas · {pinnedGroup.length}
              </div>
              {pinnedGroup.map((n, i) => noteRow(n, i === 0))}
            </div>
          )}

          {timelineGroups.map((g) => (
            <div key={g.key} className={styles.notesMonthGroup}>
              <div className={styles.notesMonthLabel}>
                <span>{g.label}</span>
                <span className={styles.notesMonthLine} />
              </div>
              <div className={styles.notesMonthCard}>
                {g.notes.map((n, i) => noteRow(n, i === 0))}
              </div>
            </div>
          ))}
        </>
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
