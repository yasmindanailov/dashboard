'use client';

/* ═══════════════════════════════════════
   Task Detail Page — (UI_SPEC §5.16)
   Two-column layout: main + sidebar
   Ref: DECISIONS.md §10, Regla 15
   ═══════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { tasksApi, usersApi } from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';
import { useAuth } from '../../../lib/auth-context';
import { useToast } from '../../../components/ui/Toast/Toast';
import {
  DetailPage, Badge, Card, Button, Select,
  Textarea, Skeleton, Modal,
} from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import type { Agent, Pagination, RoleSlug } from '../../../lib/types';
import { isStaffRole, isAdminRole } from '../../../lib/portal';
import type { Task } from '../types';
import {
  TASK_TYPE_LABELS, TASK_STATUS_LABELS, TASK_PRIORITY_LABELS,
  TASK_STATUS_VARIANTS,
} from '../types';
import styles from './taskDetail.module.css';

const ROLE_LABELS: Record<RoleSlug, string> = {
  superadmin: 'Superadmin',
  agent_full: 'Agente',
  agent_billing: 'Facturación',
  agent_support: 'Soporte',
  client: 'Cliente',
  partner: 'Partner',
};

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
  // Granularidad CASL Opción A (Sprint 8.B.1.bis): los 4 staff pueden
  // reasignar tareas (backend Manage.Task permitido a todos los staff,
  // ADR-067). El subset admin pleno (superadmin + agent_full) reserva
  // las acciones más sensibles (cambiar prioridad, cancelar tarea) por
  // UI_SPEC §5.16.
  const canManageTask = isStaffRole(roleSlug);
  const isAdmin = isAdminRole(roleSlug);

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientNotes, setClientNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  // Sprint 8 Fase B.5 — checklist state. Items vienen del backend con su
  // tipo (`service`/`product`) y la lista de completions ya hechas. El
  // toggle persiste inmediatamente vía API (UI_SPEC §5.16).
  interface ChecklistItem {
    id: string;
    label: string;
    is_required: boolean;
    order_index: number;
    kind: 'service' | 'product';
  }
  interface ChecklistCompletion {
    id: string;
    task_id: string;
    item_id: string;
    item_kind: 'service' | 'product';
    completed_by: string;
    completed_at: string;
    notes: string | null;
  }
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistCompletions, setChecklistCompletions] = useState<
    ChecklistCompletion[]
  >([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [missingRequired, setMissingRequired] = useState<
    { id: string; label: string; kind: 'service' | 'product' }[]
  >([]);
  const [reassigning, setReassigning] = useState(false);

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

  // Sprint 8 Fase B.5 — carga checklist + completions cuando la task es
  // de mantenimiento. Re-dispara cuando se completa un item para refrescar
  // el estado (el backend devuelve la completion creada/actualizada).
  const fetchChecklist = useCallback(async () => {
    if (!token || !id || !task) return;
    if (!['maintenance', 'maintenance_management'].includes(task.type)) return;
    setChecklistLoading(true);
    try {
      const res = (await tasksApi.getChecklist(token, id)) as {
        items: ChecklistItem[];
        completions: ChecklistCompletion[];
      };
      setChecklistItems(res.items);
      setChecklistCompletions(res.completions);
    } catch {
      // Degradación elegante: si falla, no bloqueamos la página entera
    } finally {
      setChecklistLoading(false);
    }
  }, [token, id, task]);

  useEffect(() => { void fetchChecklist(); }, [fetchChecklist]);

  const handleToggleChecklistItem = async (
    itemId: string,
    itemKind: 'service' | 'product',
  ) => {
    if (!token || !id) return;
    const isCompleted = checklistCompletions.some(
      (c) => c.item_id === itemId && c.item_kind === itemKind,
    );
    if (isCompleted) {
      // Sprint 8 Fase B.5: el endpoint actual sólo soporta marcar como
      // completado (idempotente). Desmarcar requeriría DELETE — aspiracional
      // (EC potencial: un agente podría querer "reabrir" un item por
      // error). Por ahora, los items completados son inmutables — la
      // doctrina canónica de auditoría (ADR-041) lo prefiere así.
      toast('info', 'Los items completados no se pueden desmarcar (auditoría).');
      return;
    }
    try {
      await tasksApi.completeChecklistItem(token, id, {
        item_id: itemId,
        item_kind: itemKind,
      });
      // Limpiar la lista de "missing" — el item ya no falta
      setMissingRequired((prev) =>
        prev.filter((m) => !(m.id === itemId && m.kind === itemKind)),
      );
      await fetchChecklist();
    } catch (err) {
      toast('error', getErrorMessage(err) || 'Error al marcar el item');
    }
  };

  // Sprint 8 Fase B.1 — carga lazy de agentes para reasignación. Sólo se
  // dispara una vez por montaje de la página (la lista cambia con muy poca
  // frecuencia). Si el endpoint falla, el dropdown queda vacío y la UI sigue
  // siendo lectura-only del agente actual (degradación elegante).
  useEffect(() => {
    if (!token || !canManageTask) return;
    if (agents.length > 0) return;
    void usersApi
      .listAgents(token, { limit: 50 })
      .then((res) => {
        const payload = res as Pagination<Agent>;
        setAgents(payload.data || []);
      })
      .catch(() => setAgents([]));
  }, [token, canManageTask, agents.length]);

  const handleReassign = async (newAssignedTo: string) => {
    if (!token || !id) return;
    if (newAssignedTo === (task?.assigned_to ?? '')) return;
    setReassigning(true);
    try {
      // El backend acepta `assigned_to: null` para desasignar; aquí usamos
      // string vacío en la UI y lo convertimos a null antes del PATCH.
      await tasksApi.update(token, id, {
        assigned_to: newAssignedTo || null,
      });
      toast(
        'success',
        newAssignedTo
          ? 'Tarea reasignada — nuevo agente notificado'
          : 'Asignación retirada',
      );
      fetchTask();
    } catch (err) {
      toast('error', getErrorMessage(err) || 'Error al reasignar');
    } finally {
      setReassigning(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!token || !id) return;
    try {
      await tasksApi.update(token, id, { status: newStatus });
      toast('success', `Estado actualizado a: ${TASK_STATUS_LABELS[newStatus]}`);
      fetchTask();
    } catch (err) {
      toast('error', getErrorMessage(err) || 'Error al actualizar');
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!token || !id) return;
    try {
      await tasksApi.update(token, id, { priority: newPriority });
      toast('success', 'Prioridad actualizada');
      fetchTask();
    } catch (err) {
      toast('error', getErrorMessage(err) || 'Error al actualizar');
    }
  };

  const handleComplete = async () => {
    if (!token || !id || !task) return;
    setCompleting(true);
    setMissingRequired([]);
    try {
      // Sprint 8 Fase B.5: flujo adaptativo según TaskType.
      //
      //   - maintenance / maintenance_management → usa
      //     `recordMaintenanceLog` que crea `maintenance_log`, valida
      //     items requeridos del checklist (EC-T8-01) y emite
      //     `maintenance.completed` para notificar al cliente.
      //   - resto → usa `complete()` legacy.
      const isMaintenance = ['maintenance', 'maintenance_management'].includes(
        task.type,
      );
      if (isMaintenance) {
        if (!clientNotes.trim()) {
          toast(
            'error',
            'El resumen para el cliente es obligatorio en mantenimientos.',
          );
          setCompleting(false);
          return;
        }
        await tasksApi.recordMaintenanceLog(token, id, {
          notes: clientNotes,
          internal_notes: internalNotes || undefined,
        });
      } else {
        await tasksApi.complete(token, id, {
          client_notes: clientNotes || undefined,
          internal_notes: internalNotes || undefined,
        });
      }
      toast('success', 'Tarea completada. Cliente notificado.');
      setShowCompleteModal(false);
      router.push('/admin/tasks');
    } catch (err: unknown) {
      // Si falla por items requeridos sin completar (EC-T8-01), el
      // backend devuelve `missing_required: [{id, label, kind}]` en el
      // body. Lo extraemos para resaltarlos en el checklist y guiar
      // al agente.
      const errBody =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: unknown; missing_required?: unknown }).message
          : null;
      const missing =
        err && typeof err === 'object' && 'missing_required' in err
          ? (err as { missing_required?: unknown }).missing_required
          : null;
      if (Array.isArray(missing)) {
        setMissingRequired(
          missing as { id: string; label: string; kind: 'service' | 'product' }[],
        );
        toast(
          'error',
          'Hay items obligatorios sin completar. Revisa el checklist.',
        );
        setShowCompleteModal(false);
      } else {
        toast(
          'error',
          (typeof errBody === 'string' ? errBody : null) ||
            getErrorMessage(err) ||
            'Error al completar',
        );
      }
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <DetailPage
        breadcrumb={[{ label: 'Tareas', href: '/admin/tasks' }, { label: 'Cargando...' }]}
        header={<Skeleton height={40} />}
      >
        <Skeleton height={500} />
      </DetailPage>
    );
  }

  if (!task) {
    return (
      <DetailPage
        breadcrumb={[{ label: 'Tareas', href: '/admin/tasks' }, { label: 'No encontrada' }]}
        header={<h2>Tarea no encontrada</h2>}
      >
        <Card><p>La tarea solicitada no existe o no tienes permisos para verla.</p></Card>
      </DetailPage>
    );
  }

  const isClosed = ['completed', 'cancelled', 'not_completed_in_time'].includes(task.status);
  const isMaintenanceType = ['maintenance', 'maintenance_management'].includes(task.type);
  const isWowCallType = task.type === 'wow_call';
  const isProjectTaskType = task.type === 'project_task';
  // UI_SPEC §5.16 — etiqueta del campo "Notas para el cliente" cambia
  // según el tipo de task. Para wow_call se llama "Resumen de la
  // llamada" (es lo que el agente apunta tras hablar con el cliente);
  // para maintenance es "Notas para el cliente" (van al email de cierre).
  const clientNotesLabel = isWowCallType
    ? 'Resumen de la llamada'
    : 'Notas para el cliente';
  const clientNotesPlaceholder = isWowCallType
    ? 'Resume la conversación con el cliente: dudas resueltas, próximos pasos...'
    : 'Estas notas se incluirán en la notificación al cliente...';

  const taskHeader = (
    <>
      <h2>{task.title}</h2>
      <div className={styles.headerBadges}>
        <Badge variant="neutral">{TASK_TYPE_LABELS[task.type] || task.type}</Badge>
        <Badge variant={(TASK_STATUS_VARIANTS[task.status] as BadgeVariant) || 'neutral'}>
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
        { label: 'Tareas', href: '/admin/tasks' },
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

          {/* Sprint 8 Fase B.2 — bloques adaptativos por TaskType (UI_SPEC §5.16).
              Cada tipo de tarea tiene su superficie operativa específica. */}

          {/* wow_call: bloque "Datos del cliente" con info contratada */}
          {isWowCallType && task.service && (
            <Card>
              <h3 className={styles.cardTitle}>Datos del cliente</h3>
              <dl className={styles.dataList}>
                <div className={styles.dataRow}>
                  <dt>Cliente</dt>
                  <dd>
                    {task.client.first_name} {task.client.last_name}
                    {task.client.email && (
                      <span className={styles.dataMuted}> · {task.client.email}</span>
                    )}
                  </dd>
                </div>
                <div className={styles.dataRow}>
                  <dt>Servicio</dt>
                  <dd>
                    {task.service.label || task.service.product?.name || '—'}
                    {task.service.domain && (
                      <span className={styles.dataMuted}> · {task.service.domain}</span>
                    )}
                  </dd>
                </div>
                {task.service.product?.name && task.service.label && (
                  <div className={styles.dataRow}>
                    <dt>Producto</dt>
                    <dd>{task.service.product.name}</dd>
                  </div>
                )}
                <div className={styles.dataRow}>
                  <dt>Plan</dt>
                  <dd>
                    {formatAmount(task.service.amount, task.service.currency)}
                    <span className={styles.dataMuted}> / {translateCycle(task.service.billing_cycle)}</span>
                  </dd>
                </div>
              </dl>
            </Card>
          )}

          {/* maintenance / maintenance_management: bloque Checklist real
              — Sprint 8 Fase B.5 (UI_SPEC §5.16). */}
          {isMaintenanceType && (
            <Card>
              <div className={styles.checklistHeader}>
                <h3 className={styles.cardTitle}>Checklist del servicio</h3>
                {checklistItems.length > 0 && (
                  <span className={styles.checklistProgress}>
                    {checklistCompletions.length} / {checklistItems.length} completados
                  </span>
                )}
              </div>
              {checklistLoading ? (
                <Skeleton height={120} />
              ) : checklistItems.length === 0 ? (
                <p className={styles.emptyDescription}>
                  Este servicio no tiene checklist asociado todavía. Los
                  items se popularán al provisionar el servicio (Sprint 11).
                </p>
              ) : (
                <ul className={styles.checklist}>
                  {checklistItems.map((item) => {
                    const completion = checklistCompletions.find(
                      (c) => c.item_id === item.id && c.item_kind === item.kind,
                    );
                    const isMissing = missingRequired.some(
                      (m) => m.id === item.id && m.kind === item.kind,
                    );
                    return (
                      <li
                        key={`${item.kind}:${item.id}`}
                        className={`${styles.checklistItem} ${
                          completion ? styles.checklistItemDone : ''
                        } ${isMissing ? styles.checklistItemMissing : ''}`}
                      >
                        <label className={styles.checklistLabel}>
                          <input
                            type="checkbox"
                            checked={!!completion}
                            disabled={isClosed || !!completion}
                            onChange={() =>
                              handleToggleChecklistItem(item.id, item.kind)
                            }
                            className={styles.checklistCheckbox}
                          />
                          <span className={styles.checklistText}>
                            {item.label}
                            {item.is_required && (
                              <span className={styles.checklistRequired} aria-label="obligatorio">
                                *
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {/* project_task: link al proyecto (Sprint 22 — placeholder hoy) */}
          {isProjectTaskType && (
            <Card>
              <h3 className={styles.cardTitle}>Proyecto vinculado</h3>
              <p className={styles.emptyDescription}>
                El módulo de proyectos llegará en Sprint 22. Hasta entonces,
                las tareas `project_task` viven sin link explícito.
              </p>
            </Card>
          )}

          {!isClosed && (
            <Card>
              <h3 className={styles.cardTitle}>{clientNotesLabel}</h3>
              <Textarea
                value={clientNotes}
                onChange={e => setClientNotes(e.target.value)}
                placeholder={clientNotesPlaceholder}
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
          {/* Client card — UI_SPEC §5.16: nombre clicable (link al perfil)
              + email. Sin CTA "Ver perfil" separado: la convención DS es
              que el nombre es el target del enlace, igual que en Tickets. */}
          <Card>
            <h3 className={styles.cardTitle}>Cliente</h3>
            <div className={styles.clientCard}>
              <div className={styles.clientInfo}>
                <Link
                  href={`/admin/clients/${task.client.id}?from=task:${task.id}`}
                  className={styles.clientNameLink}
                >
                  {task.client.first_name} {task.client.last_name}
                </Link>
                {task.client.email && (
                  <div className={styles.clientEmail}>{task.client.email}</div>
                )}
              </div>
            </div>
          </Card>

          {/* Service card — UI_SPEC §5.16 sidebar "Servicio" — Sprint 8 Fase B.2.
              Sólo si la task tiene `service_id` poblado. Nombre +
              estado del servicio + link al detalle. El backend
              (`findOne` con INCLUDE_RELATIONS_DETAIL) trae product +
              pricing; aquí mostramos lo esencial. */}
          {task.service && (
            <Card>
              <h3 className={styles.cardTitle}>Servicio</h3>
              <div className={styles.serviceCard}>
                <div className={styles.clientName}>
                  {task.service.label || task.service.product?.name || 'Servicio'}
                </div>
                {task.service.domain && (
                  <div className={styles.clientEmail}>{task.service.domain}</div>
                )}
                <div className={styles.serviceMeta}>
                  <Badge
                    variant={
                      task.service.status === 'active' ? 'success'
                      : task.service.status === 'suspended' ? 'warning'
                      : task.service.status === 'cancelled' ? 'danger'
                      : 'neutral'
                    }
                  >
                    {translateServiceStatus(task.service.status)}
                  </Badge>
                  <span className={styles.dataMuted}>
                    {formatAmount(task.service.amount, task.service.currency)} / {translateCycle(task.service.billing_cycle)}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Assignee — Sprint 8 Fase B.1: reasignación inline para admin/agent_full */}
          <Card>
            <h3 className={styles.cardTitle}>Agente asignado</h3>
            {task.assignee ? (
              <div className={styles.clientName}>
                {task.assignee.first_name} {task.assignee.last_name}
              </div>
            ) : (
              <div className={styles.emptyDescription}>Sin asignar</div>
            )}
            {canManageTask && !isClosed && (
              <div className={styles.assigneeReassign}>
                <Select
                  value={task.assigned_to ?? ''}
                  onChange={(e) => handleReassign(e.target.value)}
                  disabled={reassigning || agents.length === 0}
                  options={[
                    {
                      value: '',
                      label: agents.length === 0
                        ? 'Cargando agentes…'
                        : 'Sin asignar',
                    },
                    ...agents.map((a) => ({
                      value: a.id,
                      label: `${a.full_name} · ${ROLE_LABELS[a.role] ?? a.role}`,
                    })),
                  ]}
                />
              </div>
            )}
          </Card>

          {/* Timeline — UI_SPEC §5.16: cada entry = metaLine con texto +
              timestamp. Sin emoticonos (D1, voz de marca P5: "la cercanía
              viene de las palabras y el ritmo, no de los emojis"). El dot
              minimalista sustituye al icono — coherente con DS tipográfico. */}
          <Card>
            <h3 className={styles.cardTitle}>Historial</h3>
            <div className={styles.timeline}>
              <div className={styles.timelineEntry}>
                <span className={styles.timelineDot} aria-hidden="true" />
                <span className={styles.timelineText}>Creada</span>
                <span className={styles.timelineDate}>{formatDate(task.created_at)}</span>
              </div>
              {task.assignee && (
                <div className={styles.timelineEntry}>
                  <span className={styles.timelineDot} aria-hidden="true" />
                  <span className={styles.timelineText}>
                    Asignada a {task.assignee.first_name}
                  </span>
                  <span className={styles.timelineDate}>{formatDate(task.updated_at)}</span>
                </div>
              )}
              {task.completed_at && (
                <div className={styles.timelineEntry}>
                  <span className={styles.timelineDot} aria-hidden="true" />
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
        <div className={styles.confirmModalActions}>
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

/**
 * Sprint 8 Fase B.2 — formato canónico monetario para sidebar Servicio
 * + bloque wow_call. Usa Intl.NumberFormat con currency real (EUR/USD/...).
 * Si el `amount` viene como string (Prisma Decimal lo serializa así), se
 * convierte; si es null/inválido devuelve un placeholder neutro.
 */
function formatAmount(
  amount: string | number | null | undefined,
  currency: string = 'EUR',
): string {
  if (amount === null || amount === undefined) return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return '—';
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${num} ${currency}`;
  }
}

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'mes',
  quarterly: 'trimestre',
  semi_annually: 'semestre',
  yearly: 'año',
  biennial: '2 años',
  triennial: '3 años',
};
function translateCycle(cycle: string): string {
  return CYCLE_LABELS[cycle] ?? cycle;
}

const SERVICE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
  paused: 'Pausado',
};
function translateServiceStatus(status: string): string {
  return SERVICE_STATUS_LABELS[status] ?? status;
}

