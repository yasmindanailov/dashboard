'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/ui';
import { listResponseTemplatesAction } from './_actions';
import { MacrosManagerModal } from './MacrosManagerModal';
import type { ResponseTemplate } from './types';
import styles from './savedReplies.module.css';

/* ═══════════════════════════════════════
   SavedRepliesPicker — "Respuestas guardadas" (macros de soporte). F3·E12.

   1:1 con admin/ChatsWorkspace.dc.html: botón en el composer que abre un
   popover con la biblioteca de equipo; al elegir una, inserta su cuerpo en el
   borrador (`onInsert`). Incluye acceso al gestor (CRUD colaborativo) — el
   mockup insinúa el picker; la gestión la añade el DS (Nivel 3 del plan).

   Carga perezosa (al primer abrir) para no tirar de la API en cada montaje del
   panel de chats. Self-contained: posee la lista y la recarga tras gestionar.
   ═══════════════════════════════════════ */

interface SavedRepliesPickerProps {
  /** Inserta el cuerpo de la respuesta elegida en el borrador del composer. */
  onInsert: (body: string) => void;
}

const ZAP_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export function SavedRepliesPicker({ onInsert }: SavedRepliesPickerProps) {
  const { toast } = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listResponseTemplatesAction();
    setLoading(false);
    setLoaded(true);
    if (res.ok) setTemplates(res.templates);
    else toast('error', res.error);
  }, [toast]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && !loaded) void reload();
      return next;
    });
  };

  /* Cierre por click fuera / Escape. */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (template: ResponseTemplate) => {
    onInsert(template.body);
    setOpen(false);
  };

  const openManager = () => {
    setOpen(false);
    if (!loaded) void reload();
    setManagerOpen(true);
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {ZAP_ICON}
        Respuestas guardadas
      </button>

      {open && (
        <div className={styles.popover} role="menu">
          <div className={styles.popoverLabel}>Respuestas guardadas</div>

          {loading ? (
            <div className={styles.popoverMsg}>Cargando…</div>
          ) : templates.length === 0 ? (
            <div className={styles.popoverMsg}>
              Aún no hay respuestas. Crea la primera desde &laquo;Gestionar&raquo;.
            </div>
          ) : (
            <div className={styles.list}>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  className={styles.item}
                  onClick={() => pick(t)}
                  title={t.body}
                >
                  <span className={styles.itemTitle}>{t.title}</span>
                  {t.category && <span className={styles.itemCat}>{t.category}</span>}
                </button>
              ))}
            </div>
          )}

          <div className={styles.manageRow}>
            <button type="button" className={styles.manageBtn} onClick={openManager}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Gestionar respuestas
            </button>
          </div>
        </div>
      )}

      {managerOpen && (
        <MacrosManagerModal
          open
          templates={templates}
          onClose={() => setManagerOpen(false)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
