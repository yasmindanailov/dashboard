'use client';

/* ═══════════════════════════════════════
   TasksWidget — Sprint 16 / ADR-079 §3.11.
   Sprint 13 §13.AUTH Fase E (Modelo A): listTasksAction Server Action.

   Widget en posición prominente del dashboard `/admin`. Top-5 tasks del
   agente ordenadas por la regla canónica §3.3 (la aplica el backend en
   `applyCanonicalOrdering`). Cada item es una card simplificada (sin
   accionadores inline; el click va a `/admin/tasks?focus=<id>`).
   Footer: "Ver todas las tareas →" → `/admin/tasks`.
   ═══════════════════════════════════════ */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Skeleton } from '../../components/ui';
import { listTasksAction } from '../tasks/_actions';
import { SOURCE_LABELS } from '../tasks/source-labels';
import type { Task } from '../tasks/types';
import { computeSlaTone } from '../tasks/types';
import s from './tasks-widget.module.css';

const WIDGET_LIMIT = 5;

const SLA_TONE_CLASS = {
  safe: s.slaSafe,
  warn: s.slaWarn,
  danger: s.slaDanger,
} as const;

export default function TasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial widget (one-shot post-mount); el cancel flag protege de race conditions on unmount.
    setLoading(true);
    setError(false);
    void (async () => {
      /*
       * Sin filtro de status — el backend solo acepta valor único del
       * enum; descartamos completed/cancelled a mano para incluir
       * pending|in_progress|not_completed_in_time en una sola request.
       */
      const result = await listTasksAction({
        scope: 'mine',
        limit: WIDGET_LIMIT * 3,
      });
      if (cancelled) return;
      if (!result.ok) {
        setError(true);
        setLoading(false);
        return;
      }
      const all = result.tasks.data ?? [];
      const open = all
        .filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
        .slice(0, WIDGET_LIMIT);
      setTasks(open);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <div className={s.header}>
        <h2 className={s.title}>Tu trabajo de hoy</h2>
        <Link href="/admin/tasks" className={s.viewAll}>
          Ver todas →
        </Link>
      </div>
      {loading ? (
        <div className={s.list}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : error ? (
        <p className={s.empty}>No se pudieron cargar las tareas.</p>
      ) : tasks.length === 0 ? (
        <p className={s.empty}>
          Sin tareas pendientes. Disfruta del momento.
        </p>
      ) : (
        <ul className={s.list}>
          {tasks.map((task) => {
            const labels = SOURCE_LABELS[task.source_system];
            const sla = computeSlaTone(task.created_at, task.due_date, task.status);
            return (
              <li key={task.id}>
                <Link
                  href={`/admin/tasks?focus=${task.id}`}
                  className={s.row}
                  aria-label={`${labels.label} · ${task.client.first_name} ${task.client.last_name}`}
                >
                  <span className={s.icon} aria-hidden="true">
                    {labels.icon}
                  </span>
                  <span className={s.body}>
                    <span className={s.bodyTop}>
                      <span className={s.system}>{labels.label}</span>
                      <span className={s.dot} aria-hidden="true">·</span>
                      <span className={s.client}>
                        {task.client.first_name} {task.client.last_name}
                      </span>
                    </span>
                    {sla && (
                      <span className={`${s.sla} ${SLA_TONE_CLASS[sla]}`}>
                        {formatSla(task.due_date, sla)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function formatSla(
  dueIso: string | null,
  tone: 'safe' | 'warn' | 'danger',
): string {
  if (!dueIso) return '';
  const due = new Date(dueIso).getTime();
  const diff = due - Date.now();
  if (tone === 'danger' && diff < 0) {
    const overdueH = Math.floor(-diff / 3_600_000);
    if (overdueH < 24) return `vencida ${overdueH} h`;
    return `vencida ${Math.floor(overdueH / 24)} d`;
  }
  const remainingMin = Math.max(0, Math.floor(diff / 60_000));
  if (remainingMin < 60) return `vence ${remainingMin} min`;
  const remainingH = Math.floor(remainingMin / 60);
  if (remainingH < 24) return `vence ${remainingH} h`;
  return `vence ${Math.floor(remainingH / 24)} d`;
}
