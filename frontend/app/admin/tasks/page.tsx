'use client';

/* ═══════════════════════════════════════
   Tasks Page — List (UI_SPEC §5.15)
   Layout: ListPage + StatusTabs + FilterBar + Table
   Ref: DECISIONS.md §10, Regla 15
   ═══════════════════════════════════════ */

import { useTaskList } from './useTaskList';
import TaskTable from './TaskTable';
import NewTaskModal from './NewTaskModal';
import type { StatusTab } from '../../components/ui';
import {
  Button, SearchInput, Select,
  ListPage, FilterBar, StatusTabs,
  EmptyState, Skeleton,
} from '../../components/ui';
import { useAuth } from '../../lib/auth-context';

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'wow_call', label: 'WOW Call' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'maintenance_management', label: 'Mant. + Gestión' },
  { value: 'custom_work', label: 'Personalizada' },
  { value: 'support_setup', label: 'Setup soporte' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Todas las prioridades' },
  { value: 'critical', label: 'Crítica' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
];

export default function TasksPage() {
  const list = useTaskList();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';
  const isAdmin = ['superadmin', 'agent_full'].includes(roleSlug);

  /* StatusTabs — §3.2 */
  const tabs: StatusTab[] = [
    {
      label: 'Hoy', value: 'today',
      count: list.stats?.today ?? 0,
      variant: (list.stats?.today ?? 0) > 0 ? 'danger' : undefined,
    },
    {
      label: 'Esta semana', value: 'week',
      count: list.stats?.this_week ?? 0,
      variant: (list.stats?.this_week ?? 0) > 0 ? 'warning' : undefined,
    },
    {
      label: 'Pendientes', value: 'pending',
      count: list.stats?.pending ?? 0,
    },
    {
      label: 'Completadas', value: 'completed',
      count: list.stats?.completed ?? 0,
      variant: 'success',
    },
  ];

  const handleTabChange = (key: string) => {
    if (key === 'today') {
      list.setTimeRange('today');
      list.setStatusFilter('');
    } else if (key === 'week') {
      list.setTimeRange('week');
      list.setStatusFilter('');
    } else if (key === 'pending') {
      list.setTimeRange('');
      list.setStatusFilter('pending');
    } else if (key === 'completed') {
      list.setTimeRange('');
      list.setStatusFilter('completed');
    }
    list.setPage(1);
  };

  const activeTab = list.timeRange === 'today' ? 'today'
    : list.timeRange === 'week' ? 'week'
    : list.statusFilter === 'completed' ? 'completed'
    : 'pending';

  return (
    <ListPage
      title="Tareas"
      subtitle={isAdmin ? 'Gestión de tareas del equipo' : 'Mis tareas pendientes'}
      action={isAdmin ? (
        <Button onClick={() => list.setShowNewModal(true)}>Nueva tarea</Button>
      ) : undefined}
      statusTabs={
        <StatusTabs tabs={tabs} active={activeTab} onChange={handleTabChange} />
      }
      filterBar={
        <FilterBar
          search={
            <SearchInput
              value={list.search}
              onChange={e => list.setSearch(e.target.value)}
              placeholder="Buscar por título..."
            />
          }
          filters={
            <>
              <Select
                value={list.typeFilter}
                onChange={e => { list.setTypeFilter(e.target.value); list.setPage(1); }}
                options={TYPE_OPTIONS}
              />
              <Select
                value={list.priorityFilter}
                onChange={e => { list.setPriorityFilter(e.target.value); list.setPage(1); }}
                options={PRIORITY_OPTIONS}
              />
            </>
          }
        />
      }
    >
      {list.loading ? (
        <Skeleton height={400} />
      ) : list.error ? (
        <EmptyState title="Error" description={list.error} />
      ) : !list.tasks?.data?.length ? (
        <EmptyState
          title={isAdmin ? 'Sin tareas activas' : '¡Buen trabajo!'}
          description={isAdmin
            ? 'No hay tareas que coincidan con los filtros.'
            : 'No tienes tareas pendientes. Disfruta del momento.'}
        />
      ) : (
        <TaskTable
          data={list.tasks}
          page={list.page}
          onPageChange={list.setPage}
          showAgentColumn={isAdmin}
        />
      )}

      <NewTaskModal
        open={list.showNewModal}
        onClose={() => list.setShowNewModal(false)}
        onCreated={list.refresh}
      />
    </ListPage>
  );
}
