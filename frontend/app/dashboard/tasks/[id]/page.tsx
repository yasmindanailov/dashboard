'use client';

/* ═══════════════════════════════════════
   Task Detail Page — (UI_SPEC §5.16)
   Two-column layout: main + sidebar
   Ref: DECISIONS.md §10, Regla 15
   ═══════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { tasksApi } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { useToast } from '../../../components/ui/Toast/Toast';
import {
  DetailPage, Badge, Card, Button, Select,
  Textarea, Skeleton, Modal,
} from '../../../components/ui';
import type { Task } from '../types';
import {
  TASK_TYPE_LABELS, TASK_STATUS_LABELS, TASK_PRIORITY_LABELS,
  TASK_STATUS_VARIANTS,
} from '../types';
import styles from './taskDetail.module.css';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const id = params?.id as string;
  const roleSlug = user?.role?.slug || '';
  const isAdmin = ['superadmin', 'agent_full'].includes(roleSlug);

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientNotes, setClientNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completing, setCompleting] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const res = await tasksApi.get(token, id) as Task;
      setTask(res);
    } catch {
      toast('error', 'Error al cargar la tarea');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  const handleStatusChange = async (newStatus: string) => {
    if (!token || !id) return;
    try {
      await tasksApi.update(token, id, { status: newStatus });
      toast('success', `Estado actualizado a: ${TASK_STATUS_LABELS[newStatus]}`);
      fetchTask();
    } catch (err: any) {
      toast('error', err.message || 'Error al actualizar');
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!token || !id) return;
    try {
      await tasksApi.update(token, id, { priority: newPriority });
      toast('success', 'Prioridad actualizada');
      fetchTask();
    } catch (err: any) {
      toast('error', err.message || 'Error al actualizar');
    }
  };

  const handleComplete = async () => {
    if (!token || !id) return;
    setCompleting(true);
    try {
      await tasksApi.complete(token, id, {
        client_notes: clientNotes || undefined,
        internal_notes: internalNotes || undefined,
      });
      toast('success', 'Tarea completada. Cliente notificado.');
      setShowCompleteModal(false);
      router.push('/dashboard/tasks');
    } catch (err: any) {
      toast('error', err.message || 'Error al completar');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <DetailPage
        breadcrumb={[{ label: 'Tareas', href: '/dashboard/tasks' }, { label: 'Cargando...' }]}
        header={<Skeleton height={40} />}
      >
        <Skeleton height={500} />
      </DetailPage>
    );
  }

  if (!task) {
    return (
      <DetailPage
        breadcrumb={[{ label: 'Tareas', href: '/dashboard/tasks' }, { label: 'No encontrada' }]}
        header={<h2>Tarea no encontrada</h2>}
      >
        <Card><p>La tarea solicitada no existe o no tienes permisos para verla.</p></Card>
      </DetailPage>
    );
  }

  const isClosed = ['completed', 'cancelled'].includes(task.status);
  const isMaintenanceType = ['maintenance', 'maintenance_management'].includes(task.type);

  const taskHeader = (
    <>
      <h2>{task.title}</h2>
      <div className={styles.headerBadges}>
        <Badge variant="neutral">{TASK_TYPE_LABELS[task.type] || task.type}</Badge>
        <Badge variant={TASK_STATUS_VARIANTS[task.status] as any || 'neutral'}>
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
        <Badge variant={task.priority === 'critical' ? 'danger' : task.priority === 'high' ? 'warning' : 'neutral'}>
          {TASK_PRIORITY_LABELS[task.priority]}
        </Badge>
      </div>
      {!isClosed && (
        <div className={styles.headerControls}>
          <Select
            value={task.status}
            onChange={e => handleStatusChange(e.target.value)}
            options={STATUS_OPTIONS}
          />
          {isAdmin && (
            <Select
              value={task.priority}
              onChange={e => handlePriorityChange(e.target.value)}
              options={PRIORITY_OPTIONS}
            />
          )}
        </div>
      )}
    </>
  );

  return (
    <DetailPage
      breadcrumb={[
        { label: 'Tareas', href: '/dashboard/tasks' },
        { label: task.title },
      ]}
      header={taskHeader}
    >
      {/* Two columns */}
      <div className={styles.twoColumns}>
        {/* Main column */}
        <div className={styles.mainColumn}>
          <Card>
            <h3 className={styles.cardTitle}>Descripción</h3>
            {task.description ? (
              <p className={styles.description}>{task.description}</p>
            ) : (
              <p className={styles.emptyDescription}>Sin descripción.</p>
            )}
          </Card>

          {task.client_note && (
            <Card>
              <h3 className={styles.cardTitle}>Nota del cliente</h3>
              <p className={styles.description}>{task.client_note}</p>
            </Card>
          )}

          {!isClosed && (
            <Card>
              <h3 className={styles.cardTitle}>Notas para el cliente</h3>
              <Textarea
                value={clientNotes}
                onChange={e => setClientNotes(e.target.value)}
                placeholder="Estas notas se incluirán en la notificación al cliente..."
                rows={3}
              />
            </Card>
          )}

          {!isClosed && (
            <Card>
              <h3 className={styles.cardTitle}>Notas internas</h3>
              <Textarea
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                placeholder="Solo visibles para el equipo..."
                rows={3}
              />
            </Card>
          )}

          {!isClosed && (
            <div className={styles.actions}>
              <Button onClick={() => setShowCompleteModal(true)}>
                {isMaintenanceType ? 'Completar y notificar' : 'Completar'}
              </Button>
              {isAdmin && (
                <Button variant="danger" onClick={() => handleStatusChange('cancelled')}>
                  Cancelar tarea
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className={styles.sidebar}>
          {/* Client card */}
          <Card>
            <h3 className={styles.cardTitle}>Cliente</h3>
            <div className={styles.clientCard}>
              <div className={styles.clientInfo}>
                <div className={styles.clientName}>
                  {task.client.first_name} {task.client.last_name}
                </div>
                {task.client.email && (
                  <div className={styles.clientEmail}>{task.client.email}</div>
                )}
              </div>
            </div>
            <Link href={`/dashboard/clients/${task.client.id}`} className={styles.profileLink}>
              Ver perfil →
            </Link>
          </Card>

          {/* Assignee */}
          <Card>
            <h3 className={styles.cardTitle}>Agente asignado</h3>
            {task.assignee ? (
              <div className={styles.clientName}>
                {task.assignee.first_name} {task.assignee.last_name}
              </div>
            ) : (
              <div className={styles.emptyDescription}>Sin asignar</div>
            )}
          </Card>

          {/* Timeline */}
          <Card>
            <h3 className={styles.cardTitle}>Historial</h3>
            <div className={styles.timeline}>
              <div className={styles.timelineEntry}>
                <span className={styles.timelineIcon}>📋</span>
                <span className={styles.timelineText}>Creada</span>
                <span className={styles.timelineDate}>{formatDate(task.created_at)}</span>
              </div>
              {task.assignee && (
                <div className={styles.timelineEntry}>
                  <span className={styles.timelineIcon}>👤</span>
                  <span className={styles.timelineText}>Asignada a {task.assignee.first_name}</span>
                  <span className={styles.timelineDate}>{formatDate(task.updated_at)}</span>
                </div>
              )}
              {task.completed_at && (
                <div className={styles.timelineEntry}>
                  <span className={styles.timelineIcon}>✅</span>
                  <span className={styles.timelineText}>Completada</span>
                  <span className={styles.timelineDate}>{formatDate(task.completed_at)}</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Complete confirmation modal — §4.2 */}
      <Modal
        open={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        title="Confirmar finalización"
      >
        <p>
          {isMaintenanceType
            ? 'Se notificará al cliente por email. ¿Confirmar?'
            : '¿Seguro que quieres marcar esta tarea como completada?'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" onClick={() => setShowCompleteModal(false)}>Cancelar</Button>
          <Button onClick={handleComplete} loading={completing}>Confirmar</Button>
        </div>
      </Modal>
    </DetailPage>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

