'use client';

// TODO(ADR-078, Sprint 13): migrar a Server Action cuando cierre §13.AUTH.

/* ═══════════════════════════════════════
   MaintenanceLogModal — Sprint 16 / ADR-079 §3.6.1 + §3.8.

   Modal canónico para cerrar una task `support_inside_slot`. Vive inline
   en TaskCard — la página de detalle de tareas se eliminó porque la
   doctrina §3.6 dice "el sistema de tasks es un listado, no un detalle":
   toda acción avanzada vive en el sistema vinculado.

   Captura:
     - Items del checklist del service/product (con marcado individual).
     - Resumen para el cliente (`client_facing_notes`, obligatorio) →
       email al cliente vía `maintenance.completed`.

   NO captura `internal_notes` — eliminado del flujo: las notas internas
   las generan exclusivamente los listeners canónicos (ADR-079 §3.8 cierra
   las 3 mecanismos legacy de nota; las notas vivas son sólo las cinco
   `NoteSourceSystem`).
   ═══════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Textarea, Skeleton, useToast } from '../../components/ui';
import { tasksApi } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';
import type { Task } from './types';
import s from './task-card.module.css';

const NOTES_MAX = 10000;

interface ChecklistItem {
  id: string;
  label: string;
  is_required: boolean;
  order_index: number;
  kind: 'service' | 'product';
}

interface ChecklistCompletion {
  id: string;
  task_id: string;
  item_id: string;
  item_kind: 'service' | 'product';
  completed_by: string;
  completed_at: string;
  notes: string | null;
}

interface MissingRequired {
  id: string;
  label: string;
  kind: 'service' | 'product';
}

export interface MaintenanceLogModalProps {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onCompleted: () => void;
}

export default function MaintenanceLogModal({
  open,
  task,
  onClose,
  onCompleted,
}: MaintenanceLogModalProps) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const { toast } = useToast();

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [completions, setCompletions] = useState<ChecklistCompletion[]>([]);
  const [missing, setMissing] = useState<MissingRequired[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientFacingNotes, setClientFacingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchChecklist = useCallback(async () => {
    if (!token || !task) return;
    setLoading(true);
    try {
      const res = (await tasksApi.getChecklist(token, task.id)) as {
        items: ChecklistItem[];
        completions: ChecklistCompletion[];
      };
      setItems(res.items);
      setCompletions(res.completions);
    } catch {
      // Degradación elegante.
    } finally {
      setLoading(false);
    }
  }, [token, task]);

  useEffect(() => {
    if (open && task) {
      void fetchChecklist();
    } else if (!open) {
      setClientFacingNotes('');
      setMissing([]);
    }
  }, [open, task, fetchChecklist]);

  const handleToggleItem = async (item: ChecklistItem) => {
    if (!token || !task) return;
    const isCompleted = completions.some(
      (c) => c.item_id === item.id && c.item_kind === item.kind,
    );
    if (isCompleted) {
      toast('info', 'Los items completados no se desmarcan (auditoría).');
      return;
    }
    try {
      await tasksApi.completeChecklistItem(token, task.id, {
        item_id: item.id,
        item_kind: item.kind,
      });
      setMissing((prev) =>
        prev.filter((m) => !(m.id === item.id && m.kind === item.kind)),
      );
      await fetchChecklist();
    } catch (err) {
      toast('error', getErrorMessage(err) || 'Error al marcar el item');
    }
  };

  const handleSubmit = async () => {
    if (!token || !task) return;
    const cf = clientFacingNotes.trim();
    if (!cf) {
      toast('error', 'El resumen para el cliente es obligatorio.');
      return;
    }
    setSubmitting(true);
    setMissing([]);
    try {
      await tasksApi.recordMaintenanceLog(token, task.id, {
        client_facing_notes: cf,
      });
      toast('success', 'Mantenimiento completado. Cliente notificado.');
      onCompleted();
      onClose();
    } catch (err: unknown) {
      const m =
        err && typeof err === 'object' && 'missing_required' in err
          ? (err as { missing_required?: unknown }).missing_required
          : null;
      if (Array.isArray(m)) {
        setMissing(m as MissingRequired[]);
        toast('error', 'Hay items obligatorios sin completar.');
      } else {
        toast('error', getErrorMessage(err) || 'Error al registrar el mantenimiento');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!task) return null;

  const progress = `${completions.length} / ${items.length || '?'} completados`;

  return (
    <Modal
      open={open}
      onClose={() => (submitting ? undefined : onClose())}
      title="Completar mantenimiento"
      size="md"
    >
      <p className={s.modalDesc}>
        El cliente recibirá un email con el resumen público.
      </p>

      <div className={s.maintBlock}>
        <div className={s.maintBlockHeader}>
          <span className={s.maintBlockTitle}>Checklist del servicio</span>
          {items.length > 0 && (
            <span className={s.maintBlockProgress}>{progress}</span>
          )}
        </div>
        {loading ? (
          <Skeleton height={120} />
        ) : items.length === 0 ? (
          <p className={s.maintEmpty}>
            Este servicio no tiene checklist asociado todavía.
          </p>
        ) : (
          <ul className={s.maintList}>
            {items.map((item) => {
              const completion = completions.find(
                (c) => c.item_id === item.id && c.item_kind === item.kind,
              );
              const isMissing = missing.some(
                (m) => m.id === item.id && m.kind === item.kind,
              );
              return (
                <li
                  key={`${item.kind}:${item.id}`}
                  className={`${s.maintItem} ${
                    completion ? s.maintItemDone : ''
                  } ${isMissing ? s.maintItemMissing : ''}`}
                >
                  <label className={s.maintLabel}>
                    <input
                      type="checkbox"
                      checked={!!completion}
                      disabled={!!completion}
                      onChange={() => handleToggleItem(item)}
                    />
                    <span>
                      {item.label}
                      {item.is_required && (
                        <span
                          className={s.maintRequired}
                          aria-label="obligatorio"
                        >
                          {' *'}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={s.maintField}>
        <label className={s.maintFieldLabel}>Resumen para el cliente *</label>
        <Textarea
          value={clientFacingNotes}
          onChange={(e) =>
            setClientFacingNotes(e.target.value.slice(0, NOTES_MAX))
          }
          rows={4}
          placeholder="Resumen del mantenimiento realizado: actualizaciones, plugins revisados, optimizaciones, hallazgos…"
          maxLength={NOTES_MAX}
        />
        <div className={s.modalMeta}>
          {clientFacingNotes.length}/{NOTES_MAX}
        </div>
      </div>

      <div className={s.modalActions}>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!clientFacingNotes.trim() || submitting}
          loading={submitting}
        >
          Completar y notificar
        </Button>
      </div>
    </Modal>
  );
}
