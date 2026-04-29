'use client';

/* ═══════════════════════════════════════
   Tasks Page — List (UI_SPEC §5.15)
   Layout: Tabs (scope) + ListPage + StatusTabs + FilterBar + Table
   Sprint 8 Fase B.1.bis (2026-04-29):
     - Tabs jerárquicos: Mis tareas / Sin asignar / Todas
     - Filtro de agente cuando scope=all (UI_SPEC §5.15 admin-only)
     - Empty states diferenciados por scope/rol
     - Helpers canónicos isStaffRole / isAdminRole (Opción A: los 4 staff
       pueden reasignar; CTA "Nueva tarea" sólo admin pleno)
   Ref: DECISIONS.md §10, ADR-066 (portal admin), ADR-067 (CASL roles).
   ═══════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { useTaskList } from './useTaskList';
import TaskTable from './TaskTable';
import NewTaskModal from './NewTaskModal';
import type { StatusTab } from '../../components/ui';
import {
  Button, SearchInput, Select,
  ListPage, FilterBar, StatusTabs, Tabs,
  EmptyState, Skeleton,
} from '../../components/ui';
import { useAuth } from '../../lib/auth-context';
import { isStaffRole, isAdminRole } from '../../lib/portal';
import { usersApi } from '../../lib/api';
import type { Agent, Pagination } from '../../lib/types';

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
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const roleSlug = user?.role?.slug || '';
  const isStaff = isStaffRole(roleSlug);
  const isAdmin = isAdminRole(roleSlug);

  // Lista de agentes para el filtro "Asignado a" — sólo se carga si el
  // usuario está en scope=all (única vista donde el filtro es visible).
  // Lazy: evita request si nunca cambia a 'all'.
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    if (!token || !isStaff || list.scope !== 'all') return;
    if (agents.length > 0) return;
    void usersApi
      .listAgents(token, { limit: 50 })
      .then((res) => {
        const payload = res as Pagination<Agent>;
        setAgents(payload.data || []);
      })
      .catch(() => setAgents([]));
  }, [token, isStaff, list.scope, agents.length]);

  /* Tabs scope — Sprint 8 Fase B.1.bis (UI_SPEC §5.15 + Opción A CASL).
     Para staff: las 3 vistas. Para client (no debería llegar aquí por
     guard, pero defensivo): solo 'mine' visible. */
  const scopeTabs = isStaff
    ? [
        { id: 'mine', label: 'Mis tareas' },
        { id: 'unassigned', label: 'Sin asignar' },
        { id: 'all', label: 'Todas' },
      ]
    : [{ id: 'mine', label: 'Mis tareas' }];

  /* StatusTabs — §3.2 */
  const statusTabsArr: StatusTab[] = [
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

  const handleScopeChange = (newScope: string) => {
    if (newScope === 'mine' || newScope === 'unassigned' || newScope === 'all') {
      list.setScope(newScope);
      // Limpiar filtro de agente al salir de scope=all (donde es el único
      // sitio que tiene sentido). Evita que un filtro huérfano inviolente
      // a 'mine' devuelva 0 resultados sin que el usuario sepa por qué.
      if (newScope !== 'all') list.setAssigneeFilter('');
      list.setPage(1);
    }
  };

  // Sprint 8.B.1.bis — `activeStatusTab` debe reflejar el filtro REAL
  // (no un fallback que mienta). Si statusFilter='pending' y timeRange='',
  // estamos en Pendientes. Si nada está activo, ningún tab queda
  // resaltado (cadena vacía → StatusTabs no marca ninguno como activo).
  const activeStatusTab = list.timeRange === 'today' ? 'today'
    : list.timeRange === 'week' ? 'week'
    : list.statusFilter === 'completed' ? 'completed'
    : list.statusFilter === 'pending' ? 'pending'
    : '';

  const hasActiveFilter =
    !!list.search ||
    !!list.typeFilter ||
    !!list.priorityFilter ||
    !!list.assigneeFilter ||
    !!list.timeRange ||
    !!list.statusFilter;

  /* Empty state contextualizado por scope + status (UI_SPEC §5.15 + tono
     de marca P5: "la cercanía viene de las palabras y el ritmo"). El
     mensaje cambia según el cruce real, no sólo según un eje. */
  const emptyStateProps = (() => {
    // Búsqueda explícita o filtros laterales (tipo, prioridad, agente):
    // ningún resultado es ruido del filtro, no del scope.
    if (list.search || list.typeFilter || list.priorityFilter || list.assigneeFilter) {
      return {
        title: 'Sin resultados',
        description: 'Prueba con otros filtros o términos de búsqueda.',
      };
    }
    // Cruce scope × status: mensajes específicos para los pares más
    // frecuentes; resto cae a un fallback razonable.
    if (list.scope === 'unassigned') {
      if (list.statusFilter === 'completed') {
        return {
          title: 'Sin tareas sin asignar completadas',
          description: 'Aún no se ha completado ninguna tarea sin asignar.',
        };
      }
      if (list.statusFilter === 'pending' || hasActiveFilter) {
        return {
          title: 'Ninguna tarea sin asignar pendiente',
          description: 'Toda la cola sin asignar está cerrada o cancelada.',
        };
      }
      return {
        title: 'No hay tareas sin asignar',
        description: 'Cuando se cree una tarea sin agente, aparecerá aquí para que la tomes.',
      };
    }
    if (list.scope === 'all') {
      return {
        title: 'Sin tareas activas',
        description: 'No hay tareas que coincidan con los filtros.',
      };
    }
    // scope === 'mine'
    if (list.statusFilter === 'completed') {
      return {
        title: 'Aún no has completado tareas',
        description: 'Cuando completes alguna, aparecerá aquí.',
      };
    }
    return {
      title: '¡Buen trabajo!',
      description: 'No tienes tareas pendientes. Disfruta del momento.',
    };
  })();

  return (
    <ListPage
      title="Tareas"
      subtitle={
        list.scope === 'unassigned' ? 'Tareas sin agente — disponibles para tomar'
        : list.scope === 'all' ? 'Todas las tareas del equipo'
        : 'Mis tareas pendientes'
      }
      action={isAdmin ? (
        <Button onClick={() => list.setShowNewModal(true)}>Nueva tarea</Button>
      ) : undefined}
      statusTabs={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Tabs
            tabs={scopeTabs}
            activeTab={list.scope}
            onChange={handleScopeChange}
          />
          <StatusTabs tabs={statusTabsArr} active={activeStatusTab} onChange={handleTabChange} />
        </div>
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
              {/* Filtro agente sólo en scope=all (UI_SPEC §5.15) */}
              {isStaff && list.scope === 'all' && (
                <Select
                  value={list.assigneeFilter}
                  onChange={e => { list.setAssigneeFilter(e.target.value); list.setPage(1); }}
                  options={[
                    { value: '', label: agents.length === 0 ? 'Cargando agentes…' : 'Todos los agentes' },
                    ...agents.map(a => ({ value: a.id, label: a.full_name })),
                  ]}
                  disabled={agents.length === 0}
                />
              )}
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
        <EmptyState {...emptyStateProps} />
      ) : (
        <TaskTable
          data={list.tasks}
          page={list.page}
          onPageChange={list.setPage}
          showAgentColumn={list.scope !== 'mine'}
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
