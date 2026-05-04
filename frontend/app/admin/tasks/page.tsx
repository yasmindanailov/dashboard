/**
 * /admin/tasks — Sprint 13 §13.AUTH Fase E (Modelo A).
 *
 * Server Component nativo. Carga lista + stats server-side via
 * serverFetch; filtros (scope, source, status, focus) viajan en
 * searchParams. La UI orquesta TaskCards interactivos en
 * `TasksView` (CC). Sin creación manual (POST /tasks no existe —
 * ADR-079 §1). ADR-078 Amendment A1.
 */

import {
  EmptyState,
  ListPage,
} from '../../components/ui';
import {
  requireServerSession,
  serverFetch,
  ServerFetchError,
} from '../../lib/server-auth';
import { isStaffRole, isAdminRole } from '../../lib/portal';
import type { TaskScope } from '../../lib/api';
import type {
  TaskListResponse,
  TaskStats,
  TaskSourceSystem,
} from '../../_shared/tasks/types';
import TasksView from './_components/TasksView';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

const VALID_SCOPES: TaskScope[] = ['mine', 'unassigned', 'all'];

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await requireServerSession();
  const roleSlug = session.user.role?.slug || '';
  const isStaff = isStaffRole(roleSlug);
  const isAdmin = isAdminRole(roleSlug);

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

  const params = await searchParams;
  const scopeRaw = singleParam(params.scope) as TaskScope;
  const scope: TaskScope = VALID_SCOPES.includes(scopeRaw) ? scopeRaw : 'mine';
  const source = singleParam(params.source) as TaskSourceSystem | '';
  const statusFilter =
    singleParam(params.status) === 'completed' ? 'completed' : 'pending';
  const focusId = singleParam(params.focus) || null;
  const page = Math.max(1, parseInt(singleParam(params.page), 10) || 1);

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('limit', '30');
  query.set('scope', scope);
  if (source) query.set('source_system', source);
  if (statusFilter === 'completed') query.set('status', 'completed');

  let tasks: TaskListResponse | null = null;
  let stats: TaskStats | null = null;
  let errorMessage: string | null = null;
  try {
    const [list, statsRes] = await Promise.all([
      serverFetch<TaskListResponse>(`/tasks?${query.toString()}`),
      serverFetch<TaskStats>(`/tasks/stats?scope=${scope}`).catch(() => null),
    ]);
    tasks = list;
    stats = statsRes;
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError ? err.message : 'Error al cargar tareas';
  }

  return (
    <ListPage
      title="Tareas"
      subtitle={
        scope === 'all'
          ? 'Todas las tareas del equipo'
          : 'Mis tareas — bridge unidireccional desde tickets, mantenimientos, setup, llamadas y proyectos'
      }
    >
      <TasksView
        tasks={tasks}
        stats={stats}
        errorMessage={errorMessage}
        filters={{
          scope,
          sourceSystem: source,
          status: statusFilter,
          focusId,
        }}
        isAdmin={isAdmin}
      />
    </ListPage>
  );
}
