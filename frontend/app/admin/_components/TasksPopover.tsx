'use client';

import { SOURCE_LABELS } from '../../_shared/tasks/source-labels';
import type { Task } from '../../_shared/tasks/types';

import {
  PRIORITY_VAR,
  TYPE_BADGE,
  taskContext,
  taskTitle,
  type GroupedTasks,
} from './tasks-pill-helpers';
import styles from './TasksPill.module.css';

export interface TasksPopoverProps {
  grouped: GroupedTasks;
  onOpenTask: (task: Task) => void;
  onOpenAll: () => void;
}

/**
 * TasksPopover — panel del pill de tareas (mockup admin/Shell.dc.html
 * líneas 353-380): cabecera + banner de vencidas + grupos Vencidas/Hoy/Semana
 * con filas (badge de tipo + título + cliente·vencimiento + icono del sistema +
 * borde de prioridad). La fila navega al sistema vinculado.
 *
 * NOTA(ADR-079): el "completar inline con nota" del mockup NO se incluye —
 * `completeTaskAction` exige nota (y según el tipo, bridge/log de mantenimiento).
 * El popover es triage + navegación; el cierre con nota vive en el detalle de la
 * tarea. Inline-complete = follow-up (F3). Desviación dictada por regla (L18).
 */
export function TasksPopover({ grouped, onOpenTask, onOpenAll }: TasksPopoverProps) {
  return (
    <div className={styles.panel} role="menu">
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>Mis tareas</span>
        <span className={styles.panelMeta}>{grouped.total} pendientes</span>
      </header>

      {grouped.overdueCount > 0 && (
        <div className={styles.overdueBanner}>
          <span className={styles.overdueDot} aria-hidden="true" />
          <span>
            {grouped.overdueCount === 1
              ? '1 tarea vencida — requiere atención'
              : `${grouped.overdueCount} tareas vencidas — requieren atención`}
          </span>
        </div>
      )}

      <div className={styles.groups}>
        {grouped.total === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Todo al día</div>
            <div className={styles.emptySub}>No tienes tareas pendientes. Buen trabajo.</div>
          </div>
        ) : (
          grouped.groups.map((g) => (
            <div key={g.key} className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.groupDot} style={{ background: g.tone }} aria-hidden="true" />
                <span className={styles.groupLabel}>{g.label}</span>
                <span className={styles.groupCount}>{g.tasks.length}</span>
              </div>
              {g.tasks.map((t) => {
                const badge = TYPE_BADGE[t.source_system];
                const Icon = SOURCE_LABELS[t.source_system].icon;
                const isOverdue = g.key === 'overdue';
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={styles.row}
                    style={{ boxShadow: `inset 3px 0 0 ${PRIORITY_VAR[t.priority]}` }}
                    onClick={() => onOpenTask(t)}
                  >
                    <span className={styles.rowTop}>
                      <span className={`${styles.typeBadge} ${styles[`tone_${badge.tone}`]}`}>
                        {badge.label}
                      </span>
                      <span className={styles.rowTitle}>{taskTitle(t)}</span>
                    </span>
                    <span className={styles.rowBottom}>
                      <span className={`${styles.context} ${isOverdue ? styles.contextOverdue : ''}`}>
                        {taskContext(t, g.key)}
                      </span>
                      <Icon size={13} strokeWidth={1.6} className={styles.originIcon} aria-hidden="true" />
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <footer className={styles.panelFoot}>
        <button type="button" className={styles.footLink} onClick={onOpenAll}>
          Ver todas las tareas
        </button>
      </footer>
    </div>
  );
}
