'use client';

/* ═══════════════════════════════════════
   MaintenanceLogModal — Sprint 16 / ADR-079 §3.6.1 + §3.8.
   Sprint 13 §13.AUTH Fase E (Modelo A): Server Actions checklist + log.

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
import {
  completeChecklistItemAction,
  getTaskChecklistAction,
  recordMaintenanceLogAction,
} from './_actions';
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
  const { toast } = useToast();

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [completions, setCompletions] = useState<ChecklistCompletion[]>([]);
  const [missing, setMissing] = useState<MissingRequired[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientFacingNotes, setClientFacingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchChecklist = useCallback(async () => {
    if (!task) return;
    setLoading(true);
    const result = await getTaskChecklistAction(task.id);
    if (result.ok) {
      setItems(result.items);
      setCompletions(result.completions);
    }
    setLoading(false);
  }, [task]);

  useEffect(() => {
    if (open && task) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy load on open: carga checklist del producto cuando el modal abre + reset on close.
      void fetchChecklist();
    } else if (!open) {
      setClientFacingNotes('');
      setMissing([]);
    }
  }, [open, task, fetchChecklist]);

  const handleToggleItem = async (item: ChecklistItem) => {
    if (!task) return;
    const isCompleted = completions.some(
      (c) => c.item_id === item.id && c.item_kind === item.kind,
    );
    if (isCompleted) {
      toast('info', 'Los items completados no se desmarcan (auditoría).');
      return;
    }
    const result = await completeChecklistItemAction(task.id, {
      item_id: item.id,
      item_kind: item.kind,
    });
    if (!result.ok) {
      toast('error', result.error || 'Error al marcar el item');
      return;
    }
    setMissing((prev) =>
      prev.filter((m) => !(m.id === item.id && m.kind === item.kind)),
    );
    await fetchChecklist();
  };

  const handleSubmit = async () => {
    if (!task) return;
    const cf = clientFacingNotes.trim();
    if (!cf) {
      toast('error', 'El resumen para el cliente es obligatorio.');
      return;
    }
    setSubmitting(true);
    setMissing([]);
    const result = await recordMaintenanceLogAction(task.id, {
      client_facing_notes: cf,
    });
    setSubmitting(false);
    if (result.ok) {
      toast('success', 'Mantenimiento completado. Cliente notificado.');
      onCompleted();
      onClose();
      return;
    }
    /*
     * El backend puede devolver `missing_required` cuando faltan items
     * checklist. La cadena de error la ServerFetchError la captura como
     * `message`; no expone el array. En este punto solo mostramos el
     * mensaje genérico — el agente reabre el modal y verifica el
     * checklist visualmente.
     */
    toast('error', result.error || 'Error al registrar el mantenimiento');
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
