/* ═══════════════════════════════════════
   useTaskList — State hook for Tasks List
   Ref: UI_SPEC.md §5.15, Regla 15
   ═══════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { tasksApi } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';
import type { TaskListResponse, TaskStats } from './types';

export type TaskScope = 'mine' | 'unassigned' | 'all';

export function useTaskList() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const [tasks, setTasks] = useState<TaskListResponse | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  // Sprint 8.B.1.bis: el tab "Pendientes" es la entrada por defecto del
  // tablero (UI_SPEC §5.15) — operativamente lo que un agente quiere ver
  // al abrir la página. Inicializar `statusFilter='pending'` evita la
  // incoherencia previa donde el activeTab decía "Pendientes" pero el
  // query NO filtraba por status, mostrando completadas/canceladas.
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [scope, setScope] = useState<TaskScope>('mine');
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit: 20, scope };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (timeRange) params.time_range = timeRange;
      // Filtro de agente concreto sólo aplicable en scope=all (admin/staff
      // filtrando por agente). En `mine` es redundante y en `unassigned`
      // contradictorio: el backend lo ignora pero aquí no lo enviamos.
      if (scope === 'all' && assigneeFilter) {
        params.assigned_to = assigneeFilter;
      }
      const res = await tasksApi.list(token, params) as TaskListResponse;
      setTasks(res);
    } catch (err) {
      setError(getErrorMessage(err) || 'Error al cargar tareas');
    } finally {
      setLoading(false);
    }
  }, [token, page, search, statusFilter, typeFilter, priorityFilter, assigneeFilter, timeRange, scope]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      // Sprint 8.B.1.bis: pasar scope para que los contadores reflejen el
      // segmento activo (Mis tareas / Sin asignar / Todas) — sin esto los
      // counts mienten cuando el usuario está fuera del scope global.
      const res = await tasksApi.getStats(token, scope) as TaskStats;
      setStats(res);
    } catch {
      // Stats are non-critical
    }
  }, [token, scope]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const refresh = useCallback(() => {
    fetchTasks();
    fetchStats();
  }, [fetchTasks, fetchStats]);

  return {
    tasks, stats, loading, error,
    page, setPage,
    search, setSearch,
    statusFilter, setStatusFilter,
    typeFilter, setTypeFilter,
    priorityFilter, setPriorityFilter,
    assigneeFilter, setAssigneeFilter,
    timeRange, setTimeRange,
    scope, setScope,
    showNewModal, setShowNewModal,
    refresh,
  };
}
