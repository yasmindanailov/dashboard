'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  notificationTemplatesApi,
  type NotificationTemplateItem,
  type NotificationChannel,
} from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';

/* ═══════════════════════════════════════
   /admin/notifications/templates — Sprint 9.5 (ADR-042 + ADR-065).

   Listado de plantillas (read-only en columna izquierda) + editor inline
   en la derecha con preview en vivo. Los cambios se persisten al pulsar
   "Guardar"; el preview se calcula contra la versión actual editada
   (no la persistida) y respeta el render real del backend (Handlebars +
   muestras canónicas por event_type).

   Limitaciones aceptadas Sprint 9.5:
    - No soporta crear plantillas nuevas (solo edición). Crear se hace
      vía seed o migración + redeploy. Justificación: el catálogo de
      eventos lo controla el código (rules.md D-NN), no el admin.
    - No soporta i18n de la UI (la página está en español por convención
      proyecto). Las plantillas sí pueden tener distintos `locale`.
    - Sin filtros avanzados ni búsqueda fuzzy. Filtro por canal y por
      event_type literal son suficientes para el catálogo actual (~13).
   ═══════════════════════════════════════ */

const CHANNEL_OPTIONS: NotificationChannel[] = [
  'internal',
  'email',
  'whatsapp',
  'push',
];

export default function NotificationTemplatesAdminPage() {
  const [items, setItems] = useState<NotificationTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState<string>('');
  const [filterEvent, setFilterEvent] = useState<string>('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    subject: string;
    body: string;
    active: boolean;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(
    null,
  );
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setListError(null);
    try {
      const res = await notificationTemplatesApi.list(token, {
        event_type: filterEvent || undefined,
        channel: (filterChannel as NotificationChannel) || undefined,
        limit: 200,
      });
      setItems(res.data);
    } catch (err) {
      setListError(getErrorMessage(err) || 'Error al cargar plantillas');
    } finally {
      setLoading(false);
    }
  }, [token, filterEvent, filterChannel]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => items.find((tpl) => tpl.id === selectedId) ?? null,
    [items, selectedId],
  );

  function handleSelect(tpl: NotificationTemplateItem): void {
    setSelectedId(tpl.id);
    setDraft({
      subject: tpl.subject,
      body: tpl.body,
      active: tpl.active,
    });
    setEditError(null);
    setSavedAt(null);
    setPreview(null);
    setPreviewError(null);
  }

  async function handleSave(): Promise<void> {
    if (!token || !selected || !draft) return;
    setSaving(true);
    setEditError(null);
    try {
      await notificationTemplatesApi.update(token, selected.id, {
        subject: draft.subject,
        body: draft.body,
        active: draft.active,
      });
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setEditError(getErrorMessage(err) || 'No se pudo guardar la plantilla');
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview(): Promise<void> {
    if (!token || !selected) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      // Si hay cambios sin guardar, persistimos primero para que el
      // preview refleje exactamente lo que el cliente recibirá. Esto
      // evita la falsa sensación de "preview correcto pero envío fallido".
      if (
        draft &&
        (draft.subject !== selected.subject || draft.body !== selected.body)
      ) {
        await notificationTemplatesApi.update(token, selected.id, {
          subject: draft.subject,
          body: draft.body,
          active: draft.active,
        });
        setSavedAt(Date.now());
        await load();
      }
      const rendered = await notificationTemplatesApi.preview(token, selected.id);
      setPreview({ subject: rendered.subject, body: rendered.body });
    } catch (err) {
      setPreviewError(
        getErrorMessage(err) || 'No se pudo renderizar el preview',
      );
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Plantillas de notificaciones
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          {items.length} plantilla{items.length === 1 ? '' : 's'} activa
          {items.length === 1 ? '' : 's'}. El asunto y el cuerpo soportan
          Handlebars (helpers <code>lt</code>/<code>gt</code>/<code>eq</code>).
        </p>
      </header>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value)}
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
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
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

      {listError && (
        <div
          style={{
            padding: 12,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            color: '#991B1B',
            marginBottom: 16,
          }}
        >
          {listError}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) 2fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* Listado */}
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
          {loading ? (
            <p style={{ padding: 16, color: 'var(--text-secondary)' }}>
              Cargando…
            </p>
          ) : items.length === 0 ? (
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

        {/* Editor */}
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
                <code
                  style={{
                    fontSize: 12,
                    color: 'var(--text-tertiary)',
                  }}
                >
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
                  <span
                    style={{ fontSize: 12, color: 'var(--text-tertiary)' }}
                  >
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
    </div>
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
  background: '#635BFF',
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
