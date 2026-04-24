'use client';

import Link from 'next/link';
import { clientsApi } from '../../../lib/api';

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
  notes: any[];
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
    <div className="space-y-6">
      {/* Add note */}
      <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Añadir nota</h2>
        <textarea
          value={noteText}
          onChange={(e) => onNoteTextChange(e.target.value)}
          placeholder="Escribe una nota interna..."
          rows={3}
          className="w-full px-4 py-3 text-sm rounded-lg outline-none transition-all duration-200 resize-none"
          style={{ border: '1px solid var(--border)', background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}
        />
        <div className="flex items-center gap-3 mt-3">
          <select value={noteCategory} onChange={(e) => onNoteCategoryChange(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>
            <option value="general">General</option>
            <option value="conversation">Conversación</option>
            <option value="solution">Solución</option>
            <option value="billing">Facturación</option>
            <option value="technical">Técnico</option>
          </select>
          <button onClick={onAddNote} disabled={!noteText.trim() || savingNote}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--brand)' }}>
            {savingNote ? 'Guardando...' : 'Añadir nota'}
          </button>
          {noteSuccess && <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>Nota guardada</span>}
          {error && <span className="text-sm" style={{ color: 'var(--danger)' }}>{error}</span>}
        </div>
      </div>

      {/* Filter */}
      <div className="rounded-xl p-4" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>Filtrar:</span>
          {NOTE_CATEGORIES.map((f) => (
            <button key={f.value} onClick={() => onFilterChange(f.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150"
              style={{
                background: noteFilter === f.value ? 'var(--brand-light)' : 'var(--surface-secondary)',
                color: noteFilter === f.value ? 'var(--brand)' : 'var(--text-secondary)',
                border: noteFilter === f.value ? '1px solid var(--brand)' : '1px solid transparent',
                cursor: 'pointer',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes list */}
      <div className="rounded-xl p-6" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Notas ({notes.length})
        </h2>
        {loading ? (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>Cargando notas...</div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
            No hay notas{noteFilter ? ` de tipo "${noteFilter}"` : ''}
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((note: any) => {
              const date = new Date(note.created_at);
              const dateStr = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
              const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={note.id} className="p-4 rounded-lg"
                  style={{
                    background: 'var(--surface-secondary)',
                    borderLeft: note.is_pinned ? '3px solid var(--brand)' : '3px solid transparent',
                  }}>
                  {/* Note body — primary content */}
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    {note.body}
                  </p>
                  {note.conversation_id && (
                    <Link href={`/dashboard/support/${note.conversation_id}`}
                      className="text-xs mt-1 inline-block"
                      style={{ color: 'var(--brand)', textDecoration: 'none' }}>
                      Ver conversación origen
                    </Link>
                  )}
                  {/* Metadata row — author · category · date · action */}
                  <div className="flex items-center justify-between mt-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{note.author_name}</span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>·</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                        {CAT_LABELS[note.category] || note.category}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>·</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{dateStr} · {timeStr}</span>
                    </div>
                    <button
                      onClick={async () => {
                        const token = localStorage.getItem('access_token');
                        if (!token) return;
                        await clientsApi.toggleNotePin(token, note.id);
                        onRefresh();
                      }}
                      className="text-xs font-medium"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: note.is_pinned ? 'var(--brand)' : 'var(--text-tertiary)' }}>
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
