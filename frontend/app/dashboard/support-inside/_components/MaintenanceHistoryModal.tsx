'use client';

import { useEffect, useState } from 'react';
import { Check, Shield } from 'lucide-react';
import { Modal, Badge, Skeleton, IconWell } from '../../../components/ui';
import {
  loadMaintenanceHistoryAction,
  type MaintenanceHistoryResult,
} from '../_actions';
import type { SupportInsideMaintenanceHistory } from '../../../lib/api';
import s from './MaintenanceHistoryModal.module.css';

/* ═══════════════════════════════════════
   MaintenanceHistoryModal — Rediseño UI F3·E8
   Modal "Ver mantenimientos" del cliente. Carga el histórico del slot
   (endpoint nuevo) y lo lista 1:1 con el mockup `SupportInside.dc.html`:
   por mantenimiento → badge "Completado" + fecha + título + resumen +
   tareas hechas (checklist). Tokens-only.
   ═══════════════════════════════════════ */

interface MaintenanceHistoryModalProps {
  /** slot abierto; `null` = cerrado. */
  slotId: string | null;
  /** Nombre del servicio para el título (cae a la respuesta si falta). */
  serviceName?: string;
  onClose: () => void;
}

/** "2026-06" → "junio de 2026". */
function formatMonth(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m) return monthYear;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "14 jun 2026" */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function MaintenanceHistoryModal({
  slotId,
  serviceName,
  onClose,
}: MaintenanceHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SupportInsideMaintenanceHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slotId) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- carga del histórico al abrir el modal (one-shot por slotId); el reset previo evita mostrar datos del slot anterior. */
    setLoading(true);
    setData(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void loadMaintenanceHistoryAction(slotId).then(
      (res: MaintenanceHistoryResult) => {
        if (cancelled) return;
        if (res.ok) setData(res.data);
        else setError(res.error);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slotId]);

  const title =
    data?.service.label ||
    data?.service.domain ||
    data?.service.product_name ||
    serviceName ||
    'tu servicio';

  return (
    <Modal
      open={slotId !== null}
      onClose={onClose}
      title={`Mantenimientos · ${title}`}
    >
      <p className={s.intro}>Resumen mensual de lo que hicimos.</p>

      {loading && (
        <div className={s.loading}>
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
      )}

      {!loading && error && <p className={s.error}>{error}</p>}

      {!loading && !error && data && data.history.length === 0 && (
        <div className={s.empty}>
          <IconWell icon={Shield} tone="brand" size="md" />
          <p className={s.emptyText}>
            Aún no hay mantenimientos registrados para este servicio. El primer
            resumen llegará en el día aniversario de tu slot.
          </p>
        </div>
      )}

      {!loading && !error && data && data.history.length > 0 && (
        <ul className={s.timeline}>
          {data.history.map((entry) => (
            <li key={entry.id} className={s.entry}>
              <div className={s.entryHead}>
                <Badge variant="success">Completado</Badge>
                <span className={s.entryDate}>
                  {formatDate(entry.performed_at)}
                  {entry.performed_by ? ` · ${entry.performed_by}` : ''}
                </span>
              </div>
              <p className={s.entryTitle}>
                Mantenimiento de {formatMonth(entry.month_year)}
              </p>
              {entry.summary && <p className={s.entrySummary}>{entry.summary}</p>}
              {entry.tasks_done.length > 0 && (
                <ul className={s.tasks}>
                  {entry.tasks_done.map((task, i) => (
                    <li key={i} className={s.task}>
                      <Check size={15} strokeWidth={2.2} aria-hidden />
                      <span>{task}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className={s.footnote}>
        Recibes este resumen por email cada mes, en el día aniversario de tu
        slot.
      </p>
    </Modal>
  );
}
