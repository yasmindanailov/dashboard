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
    setLoadingAgents(true);
    setSelectedAgent(task.assigned_to ?? '');
    let cancelled = false;
    void (async () => {
      const result = await listAssignableAgentsAction({});
      if (cancelled) return;
      if (result.ok) {
        const eligible = ELIGIBLE_ROLES[task.source_system];
        const mapped: Agent[] = result.agents
          .filter((a) => eligible.includes(a.role.slug as RoleSlug))
          .map((a) => ({
            id: a.id,
            email: a.email,
            first_name: a.first_name,
            last_name: a.last_name,
            full_name: `${a.first_name} ${a.last_name}`.trim(),
            role: a.role.slug as RoleSlug,
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
        Selecciona un nuevo agente o libérala a la cola pública para que
        cualquier agente elegible pueda recogerla.
      </p>

      {loadingAgents ? (
        <Skeleton height={48} />
      ) : (
        <Select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          disabled={submitting}
          options={[
            { value: '', label: 'Cola pública (sin asignar)' },
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
        <Button
          variant="secondary"
          onClick={() => handleSubmit(null)}
          disabled={submitting || loadingAgents}
          loading={submitting && selectedAgent === ''}
        >
          Liberar a cola pública
        </Button>
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
