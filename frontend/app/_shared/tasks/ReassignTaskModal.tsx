'use client';

/* ═══════════════════════════════════════
   ReassignTaskModal — Sprint 16 / ADR-079 amendment A2.
   Sprint 13 §13.AUTH Fase E (Modelo A): assignTaskAction Server Action.

   Modal canónico de reasignación de tasks (superadmin only). Doctrina:
     - Las tasks son **read-only** respecto al sistema vinculado. La única
       acción humana válida sobre una task es: agente la completa, o
       superadmin la reasigna. La cancelación es consecuencia automática
       de eventos del sistema vinculado, no decisión humana.
     - "Liberar a cola pública" = reasignar con `assigned_to=null`. Es la
       misma operación canónica via `PATCH /tasks/:id/assign`.

   Sprint 13 §13.AUTH Fase F (Yasmin 2026-05-04, Opción B):
     Para tasks `support_ticket` se OCULTA la opción "Liberar a cola
     pública" en este modal. Motivo doctrinal (ADR-074 EC#8 + ADR-079 §1):
     ticket sin agente ↔ task cancelada. El módulo Support es la cola
     canónica de tickets; un usuario que quiere "devolver el ticket a la
     cola" debe ir al ticket y desasignar desde ahí. Esto evita la
     confusión UX de "libero la task y la veo desaparecer".

   Lista de agentes filtrada por roles elegibles del `source_system` de
   la task (mismo mapping que `core/tasks/auto-assign.ts`):
     - support_ticket / support_inside_slot / provisioning_manual:
       agent_support + agent_full + superadmin.
     - client_lifecycle: + agent_billing.
     - project: cualquier admin (superadmin asigna manualmente).
   ═══════════════════════════════════════ */

import { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Select,
  Skeleton,
  useToast,
} from '../../components/ui';
import type { Agent, RoleSlug } from '../../lib/types';
import type { Task, TaskSourceSystem } from './types';
import { assignTaskAction, listAssignableAgentsAction } from './_actions';
import s from './task-card.module.css';

const ROLE_LABELS: Record<RoleSlug, string> = {
  superadmin: 'Superadmin',
  agent_full: 'Agente',
  agent_billing: 'Facturación',
  agent_support: 'Soporte',
  client: 'Cliente',
  partner: 'Partner',
};

/* Roles elegibles por sistema vinculado. Espejo de
   backend/src/core/tasks/auto-assign.ts → ROLES_BY_SOURCE.
   Superadmin siempre es elegible. */
const ELIGIBLE_ROLES: Record<TaskSourceSystem, RoleSlug[]> = {
  support_ticket: ['superadmin', 'agent_full', 'agent_support'],
  support_inside_slot: ['superadmin', 'agent_full', 'agent_support'],
  provisioning_manual: ['superadmin', 'agent_full', 'agent_support'],
  client_lifecycle: [
    'superadmin',
    'agent_full',
    'agent_support',
    'agent_billing',
  ],
  project: ['superadmin', 'agent_full', 'agent_support', 'agent_billing'],
};

export interface ReassignTaskModalProps {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onReassigned: () => void;
}

export default function ReassignTaskModal({
  open,
  task,
  onClose,
  onReassigned,
}: ReassignTaskModalProps) {
  const { toast } = useToast();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !task) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy load on open: carga agentes elegibles + selecciona actual cuando el modal abre.
    setLoadingAgents(true);
    setSelectedAgent(task.assigned_to ?? '');
    let cancelled = false;
    void (async () => {
      const result = await listAssignableAgentsAction({});
      if (cancelled) return;
      if (result.ok) {
        const eligible = ELIGIBLE_ROLES[task.source_system];
        const mapped: Agent[] = result.agents
          .filter((a) => eligible.includes(a.role as RoleSlug))
          .map((a) => ({
            id: a.id,
            email: a.email,
            first_name: a.first_name,
            last_name: a.last_name,
            full_name: a.full_name || `${a.first_name} ${a.last_name}`.trim(),
            role: a.role as RoleSlug,
            status: 'active',
            avatar_url: null,
          }));
        setAgents(mapped);
      } else {
        setAgents([]);
      }
      setLoadingAgents(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, task]);

  if (!task) return null;

  /*
   * Bridge `support_ticket`: la cola canónica de tickets es el módulo
   * Support, NO la cola pública de tasks. Ocultamos la opción de liberar
   * y enviamos al admin al ticket si quiere desasignar (Opción B,
   * Sprint 13 §13.AUTH Fase F — Yasmin 2026-05-04).
   */
  const isTicketBridge = task.source_system === 'support_ticket';
  const ticketHref = isTicketBridge
    ? `/admin/support/${task.source_id}`
    : null;

  const handleSubmit = async (target: string | null) => {
    if (target === (task.assigned_to ?? null)) {
      toast('info', 'No hay cambios de asignación.');
      return;
    }
    setSubmitting(true);
    const result = await assignTaskAction(task.id, target);
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    toast(
      'success',
      target
        ? 'Tarea reasignada al agente seleccionado.'
        : 'Tarea liberada a la cola pública.',
    );
    onReassigned();
    onClose();
  };

  const currentLabel = task.assignee
    ? `${task.assignee.first_name} ${task.assignee.last_name}`
    : 'Sin asignar (cola pública)';

  return (
    <Modal
      open={open}
      onClose={() => (submitting ? undefined : onClose())}
      title="Reasignar tarea"
      size="sm"
    >
      <p className={s.modalDesc}>
        La tarea está actualmente asignada a <strong>{currentLabel}</strong>.
        {isTicketBridge ? (
          <>
            {' '}Selecciona otro agente para reasignarla. Si quieres devolver
            el ticket a la cola sin agente,{' '}
            <a href={ticketHref!}>desasígnalo desde el propio ticket</a>: la
            tarea se cerrará automáticamente.
          </>
        ) : (
          <>
            {' '}Selecciona un nuevo agente o libérala a la cola pública para
            que cualquier agente elegible pueda recogerla.
          </>
        )}
      </p>

      {loadingAgents ? (
        <Skeleton height={48} />
      ) : (
        <Select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          disabled={submitting}
          options={[
            ...(isTicketBridge
              ? [{ value: '', label: 'Selecciona un agente…' }]
              : [{ value: '', label: 'Cola pública (sin asignar)' }]),
            ...agents.map((a) => ({
              value: a.id,
              label: `${a.full_name} · ${ROLE_LABELS[a.role] ?? a.role}`,
            })),
          ]}
          aria-label="Nuevo agente asignado"
        />
      )}

      <div className={s.modalActions}>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        {!isTicketBridge && (
          <Button
            variant="secondary"
            onClick={() => handleSubmit(null)}
            disabled={submitting || loadingAgents}
            loading={submitting && selectedAgent === ''}
          >
            Liberar a cola pública
          </Button>
        )}
        <Button
          onClick={() => handleSubmit(selectedAgent || null)}
          disabled={submitting || loadingAgents || !selectedAgent}
          loading={submitting && selectedAgent !== ''}
        >
          Reasignar
        </Button>
      </div>
    </Modal>
  );
}
