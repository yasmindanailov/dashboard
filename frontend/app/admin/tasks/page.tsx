'use client';

// TODO(ADR-078, Sprint 13): migrar a Server Component cuando cierre §13.AUTH.

/* ═══════════════════════════════════════
   /admin/tasks — Tasks list canónica Sprint 16 / ADR-079.

   Vista única (sin tabs scope mine/unassigned/all). Toggle "Ver todas"
   admin-only para alternar entre `mine` y `all`. La regla de orden
   canónica §3.3 la aplica el backend en `applyCanonicalOrdering`; el
   frontend agrupa visualmente por bloques (overdue → support_ticket →
   resto). Cada item es una `TaskCard` shared con accionadores inline.

   Sin creación manual (POST /tasks no existe — ADR-079 §1).
   Sin filtros pesados (search/type/priority eliminados — la doctrina
   §3.6 dice que la card es la herramienta; los filtros que sobreviven
   son mecánicos: scope + source_system).
   ═══════════════════════════════════════ */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ListPage,
  FilterBar,
  Select,
  EmptyState,
  Skeleton,
  StatusTabs,
} from '../../components/ui';
import type { StatusTab } from '../../components/ui';
import { useAuth } from '../../lib/auth-context';
import { isStaffRole, isAdminRole } from '../../lib/portal';
import { tasksApi, type TaskScope } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';
import TaskCard from '../../_shared/tasks/TaskCard';
import { SOURCE_LABELS } from '../../_shared/tasks/source-labels';
import type {
  Task,
  TaskListResponse,
  TaskStats,
  TaskSourceSystem,
} from '../../_shared/tasks/types';
import styles from './tasks.module.css';

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los sistemas' },
  { value: 'support_ticket', label: SOURCE_LABELS.support_ticket.label },
  {
    value: 'support_inside_slot',
    label: SOURCE_LABELS.support_inside_slot.label,
  },
  {
    value: 'provisioning_manual',
    label: SOURCE_LABELS.provisioning_manual.label,
  },
  { value: 'client_lifecycle', label: SOURCE_LABELS.client_lifecycle.label },
  { value: 'project', label: SOURCE_LABELS.project.label },
];

/* Bloques visuales canónicos §3.3. El orden DB-side ya viene resuelto;
   aquí solo agrupamos los resultados sin reordenar dentro de cada bloque. */
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

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams?.get('focus') ?? null;

  const { user } = useAuth();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const roleSlug = user?.role?.slug || '';
  const isStaff = isStaffRole(roleSlug);
  const isAdmin = isAdminRole(roleSlug);

  const [tasks, setTasks] = useState<TaskListResponse | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState<TaskScope>('mine');
  const [sourceFilter, setSourceFilter] = useState<TaskSourceSystem | ''>('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [page, setPage] = useState(1);

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof tasksApi.list>[1] = {
        page,
        limit: 30,
        scope,
      };
      if (sourceFilter) params.source_system = sourceFilter;
      // El backend acepta `status` literal del enum. Para el tab
      // "Pendientes" cubrimos pending|in_progress|not_completed_in_time —
      // pedimos sin filtro y el frontend descarta completed/cancelled.
      if (statusFilter === 'completed') params.status = 'completed';
      const res = (await tasksApi.list(token, params)) as TaskListResponse;
      // Filtrado adicional para el tab "Pendientes" (cubre los 3 estados
      // vivos del flujo del agente). El backend no soporta `status IN` en
      // un solo query — ajuste local sin coste relevante (limit=30).
      if (statusFilter === 'pending') {
        res.data = res.data.filter(
          (t) => t.status !== 'completed' && t.status !== 'cancelled',
        );
      }
      setTasks(res);
    } catch (err) {
      setError(getErrorMessage(err) || 'Error al cargar tareas');
    } finally {
      setLoading(false);
    }
  }, [token, scope, sourceFilter, statusFilter, page]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = (await tasksApi.getStats(token, scope)) as TaskStats;
      setStats(res);
    } catch {
      // Stats no críticas — no rompemos la página por esto.
    }
  }, [token, scope]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleStatusTab = (key: string) => {
    setStatusFilter(key === 'completed' ? 'completed' : 'pending');
    setPage(1);
  };

  const grouped = useMemo(() => {
    const data = tasks?.data ?? [];
    const overdue = data.filter((t) => t.status === 'not_completed_in_time');
    const live = data.filter((t) => t.status !== 'not_completed_in_time');
    return {
      overdue,
      blocks: BLOCK_DEFINITIONS.map((b) => ({
        ...b,
        items: live.filter(b.predicate),
      })).filter((b) => b.items.length > 0),
    };
  }, [tasks]);

  const focusedExists =
    !!focusId && (tasks?.data ?? []).some((t) => t.id === focusId);

  const statusTabsArr: StatusTab[] = [
    {
      label: 'Pendientes',
      value: 'pending',
      count: stats?.pending ?? 0,
    },
    {
      label: 'Completadas',
      value: 'completed',
      count: stats?.completed ?? 0,
      variant: 'success',
    },
  ];

  if (!isStaff) {
    return (
      <ListPage title="Tareas">
        <EmptyState
          title="Sin acceso"
          description="Solo el equipo Aelium puede ver el tablero de tareas."
        />
      </ListPage>
    );
  }

  return (
    <ListPage
      title="Tareas"
      subtitle={
        scope === 'all'
          ? 'Todas las tareas del equipo'
          : 'Mis tareas — bridge unidireccional desde tickets, mantenimientos, setup, llamadas y proyectos'
      }
      action={
        isAdmin ? (
          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.toggleAll} ${scope === 'all' ? styles.toggleAllActive : ''}`}
              onClick={() => {
                const next: TaskScope = scope === 'all' ? 'mine' : 'all';
                setScope(next);
                setPage(1);
              }}
            >
              {scope === 'all' ? 'Ver mis tareas' : 'Ver todas las tareas'}
            </button>
          </div>
        ) : undefined
      }
      statusTabs={
        <StatusTabs
          tabs={statusTabsArr}
          active={statusFilter}
          onChange={handleStatusTab}
        />
      }
      filterBar={
        <FilterBar
          search={null}
          filters={
            <Select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as TaskSourceSystem | '');
                setPage(1);
              }}
              options={SOURCE_OPTIONS}
              aria-label="Filtrar por sistema vinculado"
            />
          }
        />
      }
    >
      {focusId && focusedExists && (
        <div className={styles.focusBanner}>
          <span>
            Tarea destacada — proviene del widget del dashboard. Está
            resaltada en el listado para que la tomes ahora.
          </span>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams ?? undefined);
              params.delete('focus');
              const qs = params.toString();
              router.replace(qs ? `/admin/tasks?${qs}` : '/admin/tasks');
            }}
          >
            Quitar foco
          </button>
        </div>
      )}

      {loading ? (
        <Skeleton height={400} />
      ) : error ? (
        <EmptyState title="Error" description={error} />
      ) : !tasks?.data?.length ? (
        <EmptyState
          title={
            scope === 'all'
              ? 'Sin tareas con estos filtros'
              : statusFilter === 'completed'
                ? 'Aún no has completado tareas'
                : '¡Buen trabajo!'
          }
          description={
            scope === 'all'
              ? 'Ajusta el sistema vinculado o el estado.'
              : statusFilter === 'completed'
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
                    showAssignee={isAdmin && scope === 'all'}
                    canReassign={isAdmin}
                    onChanged={() => {
                      fetchTasks();
                      fetchStats();
                    }}
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
                    showAssignee={isAdmin && scope === 'all'}
                    canReassign={isAdmin}
                    onChanged={() => {
                      fetchTasks();
                      fetchStats();
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ListPage>
  );
}
