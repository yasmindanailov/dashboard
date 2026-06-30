'use client';

import { useState } from 'react';
import {
  Button,
  EmptyState,
  Input,
  Modal,
  Textarea,
  useToast,
} from '../../components/ui';
import {
  createResponseTemplateAction,
  deleteResponseTemplateAction,
  updateResponseTemplateAction,
} from './_actions';
import type { ResponseTemplate } from './types';
import styles from './savedReplies.module.css';

/* ═══════════════════════════════════════
   MacrosManagerModal — gestión CRUD de respuestas guardadas (macros). F3·E12.

   Biblioteca de EQUIPO: cualquier staff de soporte crea/edita/borra. Dos
   vistas dentro del mismo Modal (lista ↔ formulario). Borrado con confirmación
   inline (D5, sin modal anidado). Tras cada mutación, `onChanged()` recarga la
   lista del picker (autoridad de datos única en el servidor, R5).
   ═══════════════════════════════════════ */

interface MacrosManagerModalProps {
  open: boolean;
  templates: ResponseTemplate[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

const EMPTY_FORM = { title: '', body: '', category: '' };

export function MacrosManagerModal({
  open,
  templates,
  onClose,
  onChanged,
}: MacrosManagerModalProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<ResponseTemplate | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // El padre monta este modal solo cuando se abre (render condicional), así que
  // cada apertura arranca en la vista 'list' con el estado inicial — sin efecto
  // de reset (evita `set-state-in-effect`).

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setMode('form');
  };

  const startEdit = (t: ResponseTemplate) => {
    setEditing(t);
    setForm({ title: t.title, body: t.body, category: t.category ?? '' });
    setMode('form');
  };

  const save = async () => {
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) return;
    setSaving(true);
    const payload = {
      title,
      body,
      category: form.category.trim() || undefined,
    };
    const res = editing
      ? await updateResponseTemplateAction(editing.id, payload)
      : await createResponseTemplateAction(payload);
    setSaving(false);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    toast('success', editing ? 'Respuesta actualizada.' : 'Respuesta creada.');
    await onChanged();
    setMode('list');
    setEditing(null);
  };

  const doDelete = async (id: string) => {
    setBusyId(id);
    const res = await deleteResponseTemplateAction(id);
    setBusyId(null);
    setConfirmId(null);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    toast('success', 'Respuesta borrada.');
    await onChanged();
  };

  const footer =
    mode === 'form' ? (
      <>
        <Button variant="secondary" onClick={() => setMode('list')}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={save}
          loading={saving}
          disabled={!form.title.trim() || !form.body.trim()}
        >
          {editing ? 'Guardar cambios' : 'Crear respuesta'}
        </Button>
      </>
    ) : (
      <Button variant="secondary" onClick={onClose}>
        Cerrar
      </Button>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Respuestas guardadas"
      size="lg"
      footer={footer}
    >
      {mode === 'form' ? (
        <div className={styles.formFields}>
          <Input
            label="Título"
            value={form.title}
            maxLength={120}
            placeholder="Ej: Saludo inicial"
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            autoFocus
          />
          <Input
            label="Categoría (opcional)"
            value={form.category}
            maxLength={60}
            placeholder="Ej: Bienvenida, Dominios, Cierre"
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
          <Textarea
            label="Mensaje"
            value={form.body}
            rows={5}
            maxLength={10000}
            showCount
            placeholder="El texto que se insertará en el chat."
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          }
          title="Aún no hay respuestas guardadas"
          description="Crea respuestas reutilizables para que todo el equipo responda más rápido."
          action={
            <Button variant="primary" onClick={startCreate}>
              Nueva respuesta
            </Button>
          }
        />
      ) : (
        <>
          <div className={styles.managerToolbar}>
            <p className={styles.managerHint}>
              Biblioteca compartida por el equipo de soporte ({templates.length}).
            </p>
            <Button variant="primary" size="sm" onClick={startCreate}>
              Nueva respuesta
            </Button>
          </div>

          <div className={styles.managerList}>
            {templates.map((t) => (
              <div key={t.id} className={styles.macroRow}>
                <div className={styles.macroHead}>
                  <div className={styles.macroTitleWrap}>
                    <span className={styles.macroTitle}>{t.title}</span>
                    {t.category && <span className={styles.catChip}>{t.category}</span>}
                  </div>
                  {confirmId === t.id ? (
                    <div className={styles.confirmRow}>
                      <span className={styles.confirmText}>¿Borrar?</span>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busyId === t.id}
                        onClick={() => doDelete(t.id)}
                      >
                        Sí, borrar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                        No
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.macroActions}>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmId(t.id)}>
                        Borrar
                      </Button>
                    </div>
                  )}
                </div>
                <p className={styles.macroPreview}>{t.body}</p>
                {t.creator_name && (
                  <div className={styles.macroMeta}>Creada por {t.creator_name}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
