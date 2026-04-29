'use client';

/* ═══════════════════════════════════════
   NewTaskModal — Create task form
   Ref: UI_SPEC.md §5.15, §4.1 (modal for create)
   Sprint 8 Fase B.1 (2026-04-29) — añade selector de agente que consume
   GET /api/v1/admin/users (UsersController, Sprint 8 Fase A.3).
   ═══════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { Modal, Input, Textarea, Select, Button } from '../../components/ui';
import { useToast } from '../../components/ui/Toast/Toast';
import { getErrorMessage } from '../../lib/error';
import type { Agent, Client, Pagination, RoleSlug } from '../../lib/types';
import { tasksApi, clientsApi, usersApi } from '../../lib/api';
import styles from './tasks.module.css';

const TYPE_OPTIONS = [
  { value: 'custom_work', label: 'Personalizada' },
  { value: 'wow_call', label: 'WOW Call' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'maintenance_management', label: 'Mantenimiento + Gestión' },
  { value: 'support_setup', label: 'Setup soporte' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

const ROLE_LABELS: Record<RoleSlug, string> = {
  superadmin: 'Superadmin',
  agent_full: 'Agente',
  agent_billing: 'Facturación',
  agent_support: 'Soporte',
  client: 'Cliente',
  partner: 'Partner',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewTaskModal({ open, onClose, onCreated }: Props) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('custom_work');
  const [priority, setPriority] = useState('medium');
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Carga lazy de agentes al abrir el modal — evita request si nunca se abre.
  // Sprint 8 Fase A.3: el backend ya filtra por ASSIGNABLE_ROLE_SLUGS y
  // status=active por defecto, así que aquí basta con `limit=50` (no
  // esperamos más de ~10 agentes en operativa real).
  useEffect(() => {
    if (!open || !token) return;
    if (agents.length > 0) return; // ya cargados en una apertura previa
    setAgentsLoading(true);
    void usersApi
      .listAgents(token, { limit: 50 })
      .then((res) => {
        const payload = res as Pagination<Agent>;
        setAgents(payload.data || []);
      })
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
  }, [open, token, agents.length]);

  const searchClients = async (query: string) => {
    setClientSearch(query);
    if (!token || query.length < 2) { setClients([]); return; }
    try {
      const res = (await clientsApi.list(token, { search: query, limit: 10 })) as Pagination<Client>;
      setClients(res.data || []);
    } catch { setClients([]); }
  };

  const handleSubmit = async () => {
    if (!token || !title.trim() || !clientId) return;
    setLoading(true);
    try {
      await tasksApi.create(token, {
        type, title: title.trim(), description: description.trim() || undefined,
        priority, client_id: clientId,
        assigned_to: assignedTo || undefined,
        due_date: dueDate || undefined,
      });
      toast('success', assignedTo ? 'Tarea creada y asignada' : 'Tarea creada (sin asignar)');
      onCreated();
      handleClose();
    } catch (err) {
      toast('error', getErrorMessage(err) || 'Error al crear la tarea');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle(''); setDescription(''); setType('custom_work');
    setPriority('medium'); setClientId(''); setClientSearch('');
    setClients([]); setDueDate(''); setAssignedTo('');
    onClose();
  };

  const clientOptions = clients.map(c => ({
    value: c.id,
    label: `${c.first_name} ${c.last_name} (${c.email})`,
  }));

  const agentOptions = [
    { value: '', label: agentsLoading ? 'Cargando agentes…' : 'Sin asignar (asignar luego)' },
    ...agents.map((a) => ({
      value: a.id,
      label: `${a.full_name} · ${ROLE_LABELS[a.role] ?? a.role}`,
    })),
  ];

  return (
    <Modal open={open} onClose={handleClose} title="Nueva tarea" size="md">
      <div className={styles.formStack}>
        <div>
          <label className={styles.formLabel}>Título *</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Describe la tarea..." />
        </div>
        <div className={styles.formRow}>
          <div>
            <label className={styles.formLabel}>Tipo</label>
            <Select value={type} onChange={e => setType(e.target.value)} options={TYPE_OPTIONS} />
          </div>
          <div>
            <label className={styles.formLabel}>Prioridad</label>
            <Select value={priority} onChange={e => setPriority(e.target.value)} options={PRIORITY_OPTIONS} />
          </div>
        </div>
        <div>
          <label className={styles.formLabel}>Cliente *</label>
          <Input
            value={clientSearch}
            onChange={e => searchClients(e.target.value)}
            placeholder="Buscar cliente por nombre o email..."
          />
          {clients.length > 0 && !clientId && (
            <Select
              value={clientId}
              onChange={e => {
                setClientId(e.target.value);
                const selected = clients.find(c => c.id === e.target.value);
                if (selected) setClientSearch(`${selected.first_name} ${selected.last_name}`);
              }}
              options={[{ value: '', label: 'Seleccionar cliente...' }, ...clientOptions]}
            />
          )}
        </div>
        <div>
          <label className={styles.formLabel}>Asignar a</label>
          <Select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            options={agentOptions}
            disabled={agentsLoading}
          />
        </div>
        <div>
          <label className={styles.formLabel}>Fecha de vencimiento</label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className={styles.formLabel}>Descripción</label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalles adicionales..." rows={3} />
        </div>
      </div>
      <div className={styles.modalActions}>
        <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
        <Button onClick={handleSubmit} loading={loading} disabled={!title.trim() || !clientId}>
          Crear tarea
        </Button>
      </div>
    </Modal>
  );
}
