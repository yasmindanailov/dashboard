'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListChecks } from 'lucide-react';

import { listTasksAction } from '../../_shared/tasks/_actions';
import { SOURCE_LABELS } from '../../_shared/tasks/source-labels';
import type { Task } from '../../_shared/tasks/types';

import { groupTasks, taskContext, taskTitle } from './tasks-pill-helpers';
import { TasksPopover } from './TasksPopover';
import styles from './TasksPill.module.css';

const POLL_INTERVAL_MS = 60_000;

/**
 * TasksPill — indicador inteligente de tareas en el topbar admin (mockup
 * admin/Shell.dc.html líneas 150-159 + popover). Si hay tareas urgentes
 * (vencidas + hoy) muestra la más urgente con su contexto; si no, colapsa a un
 * botón-icono. Datos reales vía `listTasksAction` (scope 'mine', polling 60s,
 * mismo patrón que NotificationBell). Reemplaza el badge de tareas que vivía en
 * el item del sidebar (que se retira en el rebuild de AdminSidebar).
 */
export function TasksPill() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);

  const fetchTasks = useCallback(async () => {
    const res = await listTasksAction({ scope: 'mine', limit: 50 });
    if (res.ok) setTasks(res.tasks.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling canónico (igual que NotificationBell).
    void fetchTasks();
    const id = setInterval(() => void fetchTasks(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTasks]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const grouped = groupTasks(tasks);
  const { mostUrgent, overdueCount, total } = grouped;
  const hasUrgent = mostUrgent !== null;
  const isOverdue = overdueCount > 0;

  const openTask = (t: Task): void => {
    setOpen(false);
    router.push(SOURCE_LABELS[t.source_system].ctaHref(t));
  };
  const openAll = (): void => {
    setOpen(false);
    router.push('/admin/tasks');
  };

  const pillTitle = hasUrgent ? taskTitle(mostUrgent) : '';
  const pillSub = hasUrgent ? taskContext(mostUrgent, isOverdue ? 'overdue' : 'today') : '';
  const iconColor = isOverdue
    ? 'var(--task-overdue-fg)'
    : hasUrgent
      ? 'var(--wait-amber-fg)'
      : 'var(--nav-icon-idle)';

  const pillClass = hasUrgent
    ? `${styles.pill} ${isOverdue ? styles.pillOverdue : styles.pillUrgent}`
    : `${styles.pill} ${styles.pillIdle}`;

  return (
    <div ref={ref} className={styles.wrapper}>
      <button
        type="button"
        className={pillClass}
        onClick={() => setOpen((o) => !o)}
        title={hasUrgent ? `${pillTitle} · ${pillSub}` : `${total} tareas pendientes`}
        aria-label="Mis tareas"
        aria-expanded={open}
      >
        <ListChecks size={19} strokeWidth={1.7} color={iconColor} aria-hidden="true" />
        {hasUrgent && (
          <span className={styles.pillText}>
            <span className={`${styles.pillTitle} ${isOverdue ? styles.pillTitleOverdue : ''}`}>
              {pillTitle}
            </span>
            <span className={styles.pillSub}>{pillSub}</span>
          </span>
        )}
        {total > 0 && (
          <span className={`${styles.pillBadge} ${isOverdue ? styles.pillBadgeOverdue : ''}`}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && <TasksPopover grouped={grouped} onOpenTask={openTask} onOpenAll={openAll} />}
    </div>
  );
}
