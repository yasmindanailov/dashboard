'use client';

import { useMemo, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  EmptyState,
  FilterBar,
  Select,
  StatusTabs,
} from '../../../components/ui';
import type { StatusTab } from '../../../components/ui';
import TaskCard from '../../../_shared/tasks/TaskCard';
import { SOURCE_LABELS } from '../../../_shared/tasks/source-labels';
import type {
  Task,
  TaskListResponse,
  TaskStats,
  TaskSourceSystem,
} from '../../../_shared/tasks/types';
import type { TaskScope } from '../../../lib/api';
import styles from '../tasks.module.css';

/* ═══════════════════════════════════════
   TasksView — Sprint 13 §13.AUTH Fase E (Modelo A).
   Recibe tasks + stats prehidratados por SC. Filtros (scope, source,
   status, focus) viajan en searchParams. TaskCard sigue CC con
   localStorage hasta Batch 5 (componentes _shared interactivos);
   `onChanged` invoca router.refresh() para recargar el SC tras una
   mutación inline de la card.
   ═══════════════════════════════════════ */

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los sistemas' },
  { value: 'support_ticket', label: SOURCE_LABELS.support_ticket.label },
  { value: 'support_inside_slot', label: SOURCE_LABELS.support_inside_slot.label },
  { value: 'provisioning_manual', label: SOURCE_LABELS.provisioning_manual.label },
  { value: 'client_lifecycle', label: SOURCE_LABELS.client_lifecycle.label },
  { value: 'project', label: SOURCE_LABELS.project.label },
];

const BLOCK_DEFINITIONS: {
  key: 'support_ticket' | 'rest';
  title: string;
  predicate: (t: Task) => boolean;
}[] = [
  {
    key: 'support_ticket',
    title: 'Tickets de soporte',
    predicate: (t) => t.source_system === 'support_ticket',
  },
  {
    key: 'rest',
    title: 'Otras tareas',
    predicate: (t) => t.source_system !== 'support_ticket',
  },
];

interface Props {
  tasks: TaskListResponse | null;
  stats: TaskStats | null;
  errorMessage: string | null;
  filters: {
    scope: TaskScope;
    sourceSystem: TaskSourceSystem | '';
    status: 'pending' | 'completed';
    focusId: string | null;
  };
  isAdmin: boolean;
}

export default function TasksView({
  tasks,
  stats,
  errorMessage,
  filters,
  isAdmin,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function pushFilters(next: {
    scope?: TaskScope;
    source?: string;
    status?: string;
  }) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    const writeOrDelete = (k: string, v: string | undefined) => {
      if (v && v.length > 0) params.set(k, v);
      else params.delete(k);
    };
    if (next.scope !== undefined) writeOrDelete('scope', next.scope);
    if (next.source !== undefined) writeOrDelete('source', next.source);
    if (next.status !== undefined) writeOrDelete('status', next.status);
    params.delete('page');
    startTransition(() => router.push(`/admin/tasks?${params.toString()}`));
  }

  function clearFocus() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('focus');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `/admin/tasks?${qs}` : '/admin/tasks'));
  }

  const grouped = useMemo(() => {
    let data = tasks?.data ?? [];
    /*
     * El backend no soporta `status IN (pending, in_progress,
     * not_completed_in_time)` en una query; pedimos sin filtro y
     * descartamos completed/cancelled aquí. Ajuste local sin coste
     * relevante (limit=30).
     */
    if (filters.status === 'pending') {
      data = data.filter(
        (t) => t.status !== 'completed' && t.status !== 'cancelled',
      );
    }
    const overdue = data.filter((t) => t.status === 'not_completed_in_time');
    const live = data.filter((t) => t.status !== 'not_completed_in_time');
    return {
      overdue,
      blocks: BLOCK_DEFINITIONS.map((b) => ({
        ...b,
        items: live.filter(b.predicate),
      })).filter((b) => b.items.length > 0),
      total: data.length,
    };
  }, [tasks, filters.status]);

  const focusedExists =
    !!filters.focusId &&
    (tasks?.data ?? []).some((t) => t.id === filters.focusId);

  const statusTabsArr: StatusTab[] = [
    { label: 'Pendientes', value: 'pending', count: stats?.pending ?? 0 },
    {
      label: 'Completadas',
      value: 'completed',
      count: stats?.completed ?? 0,
      variant: 'success',
    },
  ];

  return (
    <>
      {isAdmin && (
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.toggleAll} ${filters.scope === 'all' ? styles.toggleAllActive : ''}`}
            onClick={() =>
              pushFilters({ scope: filters.scope === 'all' ? 'mine' : 'all' })
            }
          >
            {filters.scope === 'all' ? 'Ver mis tareas' : 'Ver todas las tareas'}
          </button>
        </div>
      )}

      <StatusTabs
        tabs={statusTabsArr}
        active={filters.status}
        onChange={(key) =>
          pushFilters({ status: key === 'completed' ? 'completed' : 'pending' })
        }
      />
      <FilterBar
        search={null}
        filters={
          <Select
            value={filters.sourceSystem}
            onChange={(e) => pushFilters({ source: e.target.value })}
            options={SOURCE_OPTIONS}
            aria-label="Filtrar por sistema vinculado"
          />
        }
      />

      {filters.focusId && focusedExists && (
        <div className={styles.focusBanner}>
          <span>
            Tarea destacada — proviene del widget del dashboard. Está
            resaltada en el listado para que la tomes ahora.
          </span>
          <button type="button" onClick={clearFocus}>
            Quitar foco
          </button>
        </div>
      )}

      {errorMessage ? (
        <EmptyState title="Error" description={errorMessage} />
      ) : grouped.total === 0 ? (
        <EmptyState
          title={
            filters.scope === 'all'
              ? 'Sin tareas con estos filtros'
              : filters.status === 'completed'
                ? 'Aún no has completado tareas'
                : '¡Buen trabajo!'
          }
          description={
            filters.scope === 'all'
              ? 'Ajusta el sistema vinculado o el estado.'
              : filters.status === 'completed'
                ? 'Cuando cierres alguna, aparecerá aquí.'
                : 'No tienes tareas pendientes. Disfruta del momento.'
          }
        />
      ) : (
        <div className={styles.layout}>
          {grouped.overdue.length > 0 && (
            <div className={styles.block}>
              <div className={styles.overdueBanner}>
                {grouped.overdue.length === 1
                  ? '1 tarea vencida — atiéndela primero'
                  : `${grouped.overdue.length} tareas vencidas — atiéndelas primero`}
              </div>
              <div className={styles.cards}>
                {grouped.overdue.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    showAssignee={isAdmin && filters.scope === 'all'}
                    canReassign={isAdmin}
                    onChanged={() => router.refresh()}
                  />
                ))}
              </div>
            </div>
          )}

          {grouped.blocks.map((block) => (
            <div className={styles.block} key={block.key}>
              <div className={styles.blockHeader}>
                <h3 className={styles.blockTitle}>{block.title}</h3>
                <span className={styles.blockCount}>
                  {block.items.length}{' '}
                  {block.items.length === 1 ? 'tarea' : 'tareas'}
                </span>
              </div>
              <div className={styles.cards}>
                {block.items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    showAssignee={isAdmin && filters.scope === 'all'}
                    canReassign={isAdmin}
                    onChanged={() => router.refresh()}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
