'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  NotificationChannel,
  NotificationTemplateItem,
} from '../../../../lib/api';
import { previewTemplateAction, updateTemplateAction } from '../_actions';

/* ═══════════════════════════════════════
   TemplatesEditor — Sprint 13 §13.AUTH Fase E (Modelo A).
   Recibe la lista prehidratada por el SC. Filtros por canal /
   event_type viajan en searchParams (re-fetch SC). Editor inline:
     - Save → updateTemplateAction (revalidatePath).
     - Preview → previewTemplateAction (lectura, sin revalidar).
   El preview persiste primero los cambios en draft (igual que la
   versión cliente) para evitar drift "preview OK pero envío fallido".
   ═══════════════════════════════════════ */

const CHANNEL_OPTIONS: NotificationChannel[] = [
  'internal',
  'email',
  'whatsapp',
  'push',
];

interface Props {
  items: NotificationTemplateItem[];
  initialFilters: { eventType: string; channel: string };
}

interface DraftState {
  subject: string;
  body: string;
  active: boolean;
}

export default function TemplatesEditor({ items, initialFilters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [filterEvent, setFilterEvent] = useState(initialFilters.eventType);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(
    null,
  );
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((tpl) => tpl.id === selectedId) ?? null,
    [items, selectedId],
  );

  function pushFilters(next: { eventType?: string; channel?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const writeOrDelete = (k: string, v: string | undefined) => {
      if (v && v.length > 0) params.set(k, v);
      else params.delete(k);
    };
    if (next.eventType !== undefined) writeOrDelete('event_type', next.eventType);
    if (next.channel !== undefined) writeOrDelete('channel', next.channel);
    startTransition(() =>
      router.push(`/admin/notifications/templates?${params.toString()}`),
    );
  }

  function handleSelect(tpl: NotificationTemplateItem): void {
    setSelectedId(tpl.id);
    setDraft({ subject: tpl.subject, body: tpl.body, active: tpl.active });
    setEditError(null);
    setSavedAt(null);
    setPreview(null);
    setPreviewError(null);
  }

  async function handleSave(): Promise<void> {
    if (!selected || !draft) return;
    setSaving(true);
    setEditError(null);
    const result = await updateTemplateAction(selected.id, {
      subject: draft.subject,
      body: draft.body,
      active: draft.active,
    });
    if (!result.ok) {
      setEditError(result.error);
      setSaving(false);
      return;
    }
    setSavedAt(Date.now());
    setSaving(false);
  }

  async function handlePreview(): Promise<void> {
    if (!selected || !draft) return;
    setPreviewing(true);
    setPreviewError(null);
    /*
     * Si hay cambios pendientes, persistimos primero (igual que la versión
     * cliente original) para que el preview refleje lo que el cliente
     * realmente recibirá.
     */
    if (draft.subject !== selected.subject || draft.body !== selected.body) {
      const saveRes = await updateTemplateAction(selected.id, {
        subject: draft.subject,
        body: draft.body,
        active: draft.active,
      });
      if (!saveRes.ok) {
        setPreviewError(saveRes.error);
        setPreviewing(false);
        return;
      }
      setSavedAt(Date.now());
    }
    const result = await previewTemplateAction(selected.id);
    if (!result.ok) {
      setPreviewError(result.error);
      setPreviewing(false);
      return;
    }
    setPreview({ subject: result.subject, body: result.body });
    setPreviewing(false);
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value)}
          onBlur={() => pushFilters({ eventType: filterEvent })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushFilters({ eventType: filterEvent });
          }}
          placeholder="event_type (ej. invoice.paid)"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
            minWidth: 240,
          }}
        />
        <select
          value={initialFilters.channel}
          onChange={(e) => pushFilters({ channel: e.target.value })}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
          }}
        >
          <option value="">Todos los canales</option>
          {CHANNEL_OPTIONS.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) 2fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
        >
          {items.length === 0 ? (
            <p style={{ padding: 16, color: 'var(--text-secondary)' }}>
              Sin plantillas que coincidan.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {items.map((tpl) => {
                const active = tpl.id === selectedId;
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(tpl)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 16px',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        background: active
                          ? 'rgba(99, 91, 255, 0.06)'
                          : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {tpl.event_type}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {tpl.channel} · {tpl.locale} ·{' '}
                        {tpl.active ? 'activa' : 'inactiva'}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            minHeight: 400,
          }}
        >
          {!selected || !draft ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              Selecciona una plantilla a la izquierda para editarla.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <code style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {selected.event_type} · {selected.channel} · {selected.locale}
                </code>
              </div>

              <label style={labelStyle}>Asunto</label>
              <input
                value={draft.subject}
                onChange={(e) =>
                  setDraft((prev) => prev && { ...prev, subject: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  fontSize: 13,
                  marginBottom: 12,
                }}
              />

              <label style={labelStyle}>Cuerpo (Handlebars)</label>
              <textarea
                value={draft.body}
                onChange={(e) =>
                  setDraft((prev) => prev && { ...prev, body: e.target.value })
                }
                rows={14}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 12,
                  marginBottom: 12,
                  resize: 'vertical',
                }}
              />

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) =>
                    setDraft(
                      (prev) => prev && { ...prev, active: e.target.checked },
                    )
                  }
                />
                Activa (si se desmarca, el dispatcher la omite)
              </label>

              {selected.variables && (
                <details style={{ marginBottom: 16 }}>
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    Variables disponibles
                  </summary>
                  <pre
                    style={{
                      background: 'var(--surface-secondary)',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 11,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(selected.variables, null, 2)}
                  </pre>
                </details>
              )}

              {editError && (
                <div
                  style={{
                    padding: 8,
                    background: '#FEF2F2',
                    color: '#991B1B',
                    fontSize: 12,
                    borderRadius: 6,
                    marginBottom: 12,
                  }}
                >
                  {editError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  style={primaryBtn}
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={previewing}
                  style={secondaryBtn}
                >
                  {previewing ? 'Renderizando…' : 'Preview'}
                </button>
                {savedAt && (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Guardado · {new Date(savedAt).toLocaleTimeString('es-ES')}
                  </span>
                )}
              </div>

              {previewError && (
                <div
                  style={{
                    padding: 8,
                    background: '#FEF2F2',
                    color: '#991B1B',
                    fontSize: 12,
                    borderRadius: 6,
                    marginTop: 12,
                  }}
                >
                  {previewError}
                </div>
              )}

              {preview && (
                <div
                  style={{
                    marginTop: 16,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'var(--surface-secondary)',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <strong>Asunto:</strong> {preview.subject}
                  </div>
                  {selected.channel === 'email' ? (
                    <div
                      style={{ padding: 12, background: '#fff' }}
                      dangerouslySetInnerHTML={{ __html: preview.body }}
                    />
                  ) : (
                    <pre
                      style={{
                        padding: 12,
                        margin: 0,
                        background: '#fff',
                        fontSize: 13,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {preview.body}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 4,
};

const primaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  borderRadius: 8,
  background: 'var(--brand)',
  color: '#fff',
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};
