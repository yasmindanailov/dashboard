'use client';

/* ═══════════════════════════════════════
   Task Detail Page — (UI_SPEC §5.16)
   Two-column layout: main + sidebar
   Ref: DECISIONS.md §10, Regla 15
   ═══════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { tasksApi, usersApi, type TaskNotePayload } from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';
import { useAuth } from '../../../lib/auth-context';
import { useToast } from '../../../components/ui/Toast/Toast';
import {
  DetailPage, Badge, Card, Button, Select,
  Skeleton, Modal,
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
import TaskCompletionModal, { type TicketAction } from './TaskCompletionModal';
import TaskInternalNotesCard from './TaskInternalNotesCard';

const ROLE_LABELS: Record<RoleSlug, string> = {
  superadmin: 'Superadmin',
  agent_full: 'Agente',
  agent_billing: 'Facturación',
  agent_support: 'Soporte',
  client: 'Cliente',
  partner: 'Partner',
};

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
  // Sprint 8 Fase B.9 (2026-04-30) — refactor de notas:
  //   - `clientNotes` (mensaje al cliente) ahora vive sólo en el modal
  //     de cierre — captado bajo demanda, no acumulado en pantalla.
  //   - `internalNotes` ya no es un textarea inline; se persisten una
  //     a una via `tasksApi.createNote` (cada nota = 1 row ClientNote
  //     `category=technical`). El estado `notes` mantiene la lista.
  const [completionNote, setCompletionNote] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [internalNotes, setInternalNotes] = useState<TaskNotePayload[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  // Sprint 8 Fase B.10 — ADR-074: en modo bridge (task con conversation_id),
  // el agente elige resolver o cerrar el ticket vinculado. Default: resolve.
  const [ticketAction, setTicketAction] = useState<TicketAction>('resolve');
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

  // Sprint 8 Fase B.9 (2026-04-30) — fetch lazy de notas internas. El
  // backend devuelve `category=technical` filtradas por task_id con autor
  // ya enriquecido (relación ClientNote.author). Se refresca cada vez que
  // el usuario añade una nota (callback `onCreated` del componente).
  const fetchNotes = useCallback(async () => {
    if (!token || !id) return;
    setNotesLoading(true);
    try {
      const list = await tasksApi.listNotes(token, id);
      setInternalNotes(list);
    } catch {
      // Degradación elegante: la página principal sigue funcionando.
    } finally {
      setNotesLoading(false);
    }
  }, [token, id]);

  useEffect(() => { void fetchNotes(); }, [fetchNotes]);

  const handleNoteCreated = (note: TaskNotePayload) => {
    setInternalNotes((prev) => [note, ...prev]);
  };

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
      // Sprint 8 Fase B.9 (2026-04-30) — refactor: la nota al cliente la
      // captura `TaskCompletionModal` bajo demanda en `completionNote`.
      // No hay textarea separada para internal_notes — esas notas se
      // persisten inline durante la ejecución (POST /tasks/:id/notes).
      // Si el agente quiere dejar nota interna AL CIERRE, lo hace antes
      // de pulsar Completar (la card permite añadir tantas como quiera).
      //
      // Sprint 8 Fase B.5 sigue intacto:
      //   - maintenance / maintenance_management → `recordMaintenanceLog`
      //     valida checklist requerido + emite `maintenance.completed`.
      //   - resto → `complete()` emite `task.completed`. Si el payload
      //     incluye `client_notes`, `TaskCompletedListener` despacha
      //     email + campana al cliente (Sprint 8 Fase B.9).
      const isMaintenance = ['maintenance', 'maintenance_management'].includes(
        task.type,
      );
      const isBridge = !!task.conversation_id;
      const note = completionNote.trim();

      if (isBridge) {
        // Sprint 8 Fase B.10 — ADR-074: cierre canónico del bridge.
        // Backend valida que `ticket_action` y `resolution_note` están
        // presentes. La notificación al cliente la dispara support.
        if (!note) {
          toast(
            'error',
            'La nota interna sobre la resolución del ticket es obligatoria.',
          );
          setCompleting(false);
          return;
        }
        await tasksApi.complete(token, id, {
          ticket_action: ticketAction,
          resolution_note: note,
        });
      } else if (isMaintenance) {
        if (!note) {
          toast(
            'error',
            'El resumen para el cliente es obligatorio en mantenimientos.',
          );
          setCompleting(false);
          return;
        }
        await tasksApi.recordMaintenanceLog(token, id, { notes: note });
      } else {
        await tasksApi.complete(token, id, {
          client_notes: note || undefined,
        });
      }
      toast(
        'success',
        isBridge
          ? `Ticket ${ticketAction === 'resolve' ? 'resuelto' : 'cerrado'} y tarea completada.`
          : note
            ? 'Tarea completada. Cliente notificado.'
            : 'Tarea completada.',
      );
      setShowCompleteModal(false);
      setCompletionNote('');
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
  const isProjectTaskType = task.type === 'project_task';
  // Sprint 8 Fase B.7 (2026-04-29) — ADR-073: el bloque "Datos del cliente
  // + plan" deja de ser exclusivo de `contact_client` y se renderiza
  // siempre que la tarea tenga `service_id` vinculado.
  const showServiceBlock = task.service != null;
  const tagAssignments = task.tag_assignments ?? [];

  /* Sprint 8 Fase B.9 (2026-04-30) — header con TODAS las acciones de
     ciclo de vida de la tarea (Iniciar / Completar / Cancelar). Antes
     vivían dispersas: "Iniciar" en el header, "Completar" + "Cancelar
     tarea" al final del main column como `actions` separadas. Ahora
     todo arriba a la derecha, junto a `Priority`, igual que
     `ConversationHeader` del módulo support.

     - "Completar" abre `TaskCompletionModal` (captura nota cliente).
     - "Cancelar" usa el flujo legacy `handleStatusChange('cancelled')`
       — sin modal porque cancelar no notifica al cliente. */
  const taskHeader = (
    <div className={styles.headerRow}>
      <div>
        <h1 className={styles.headerTitle}>{task.title}</h1>
        {/* Sprint 8 Fase B.7 — ADR-073: porqué humano como subtítulo. */}
        {task.reason && <p className={styles.taskReason}>{task.reason}</p>}
        <div className={styles.headerMeta}>
          <Badge variant="neutral">
            {TASK_TYPE_LABELS[task.type] || task.type}
          </Badge>
          {/* Status → badge SOLO en estado terminal (lectura). En estado
              abierto, la acción se muestra como botón a la derecha. */}
          {isClosed && (
            <Badge
              variant={
                (TASK_STATUS_VARIANTS[task.status] as BadgeVariant) || 'neutral'
              }
            >
              {TASK_STATUS_LABELS[task.status]}
            </Badge>
          )}
          {/* Priority → badge SOLO si la tarea está cerrada o el usuario
              no es admin (no puede editar). Si es admin y abierta, el
              <Select> de la derecha es la fuente de verdad. */}
          {(isClosed || !isAdmin) && (
            <Badge
              variant={
                task.priority === 'critical'
                  ? 'danger'
                  : task.priority === 'high'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {TASK_PRIORITY_LABELS[task.priority]}
            </Badge>
          )}
          {/* Sprint 8 Fase B.7 — ADR-073: chips de tags asignados. */}
          {tagAssignments.map((a) => (
            <span
              key={a.tag.id}
              className={styles.tagChip}
              style={
                a.tag.color
                  ? {
                      backgroundColor: `${a.tag.color}1A`,
                      color: a.tag.color,
                      borderColor: `${a.tag.color}33`,
                    }
                  : undefined
              }
            >
              {a.tag.label}
            </span>
          ))}
        </div>
      </div>

      {!isClosed && (
        <div className={styles.headerActions}>
          {isAdmin && (
            <Select
              value={task.priority}
              onChange={(e) => handlePriorityChange(e.target.value)}
              options={PRIORITY_OPTIONS}
              size="sm"
            />
          )}
          {task.status === 'pending' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStatusChange('in_progress')}
            >
              Iniciar
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setShowCompleteModal(true)}
          >
            {isMaintenanceType ? 'Completar y notificar' : 'Completar'}
          </Button>
          {isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStatusChange('cancelled')}
            >
              Cancelar
            </Button>
          )}
        </div>
      )}
    </div>
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
              Cada tipo de tarea tiene su superficie operativa específica.
              Sprint 8 Fase B.7 (ADR-073) — el bloque "Datos del cliente +
              servicio" deja de ser exclusivo de `contact_client` y se
              renderiza para CUALQUIER tipo cuando hay `service` vinculado. */}

          {showServiceBlock && task.service && (
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

          {/* Sprint 8 Fase B.9 (2026-04-30) — refactor de notas:
              - El textarea "Notas para el cliente" se ELIMINA del detail.
                Esa nota la captura `TaskCompletionModal` al pulsar
                "Completar" (header) y se envía al cliente vía email.
              - El textarea "Notas internas" se sustituye por una card
                con lista persistente + botón "Añadir nota". Cada nota es
                una `ClientNote(category=technical)` con autor y fecha.
                Visible siempre (incluso en tareas cerradas — auditoría),
                edición sólo si la tarea está abierta.
              - Los botones "Completar" / "Cancelar tarea" se han movido
                al header (junto a "Iniciar" + Priority). El footer
                actions desaparece. */}
          <TaskInternalNotesCard
            taskId={task.id}
            notes={internalNotes}
            loading={notesLoading}
            onCreated={handleNoteCreated}
            readOnly={isClosed}
          />
        </div>

        {/* Sidebar */}
        <div className={styles.sidebar}>
          {/* Sprint 8 Fase B.10 (2026-04-30) — ADR-074: card "Ticket
              origen" cuando la tarea es bridge. Permite al agente saltar
              al ticket vinculado para leer mensajes y contexto. */}
          {task.conversation_id && (
            <Card>
              <h3 className={styles.cardTitle}>Ticket origen</h3>
              <Link
                href={`/admin/support/${task.conversation_id}`}
                className={styles.clientNameLink}
              >
                Ver ticket vinculado →
              </Link>
              <p className={styles.emptyDescription} style={{ marginTop: 'var(--space-2)' }}>
                Esta tarea se generó al asignar un ticket de soporte. Al
                completarla aquí se cerrará/resolverá el ticket
                automáticamente — no hace falta abrir el ticket para cerrarlo.
              </p>
            </Card>
          )}

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

      {/* Sprint 8 Fase B.9 / B.10 — modal canónico de cierre. Modo
          simple (B.9) si la tarea no tiene `conversation_id`, modo
          bridge (B.10 / ADR-074) si la tiene: pide acción
          resolver/cerrar + nota interna obligatoria. */}
      <TaskCompletionModal
        open={showCompleteModal}
        taskType={task.type}
        taskTitle={task.title}
        conversationId={task.conversation_id ?? null}
        note={completionNote}
        loading={completing}
        onNoteChange={setCompletionNote}
        onSubmit={handleComplete}
        onClose={() => {
          setShowCompleteModal(false);
          setCompletionNote('');
        }}
        ticketAction={ticketAction}
        onTicketActionChange={setTicketAction}
      />
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

