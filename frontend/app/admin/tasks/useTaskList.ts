/* ═══════════════════════════════════════
   useTaskList — State hook for Tasks List
   Ref: UI_SPEC.md §5.15, Regla 15
   ═══════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { tasksApi } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';
import type { TaskListResponse, TaskStats } from './types';

export function useTaskList() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const [tasks, setTasks] = useState<TaskListResponse | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (timeRange) params.time_range = timeRange;
      const res = await tasksApi.list(token, params) as TaskListResponse;
      setTasks(res);
    } catch (err) {
      setError(getErrorMessage(err) || 'Error al cargar tareas');
    } finally {
      setLoading(false);
    }
  }, [token, page, search, statusFilter, typeFilter, priorityFilter, timeRange]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await tasksApi.getStats(token) as TaskStats;
      setStats(res);
    } catch {
      // Stats are non-critical
    }
  }, [token]);

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
    timeRange, setTimeRange,
    showNewModal, setShowNewModal,
    refresh,
  };
}
