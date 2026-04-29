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
import {
  tasksApi,
  clientsApi,
  usersApi,
  taskTagsApi,
  type TaskTagPayload,
} from '../../lib/api';
import styles from './tasks.module.css';

// Sprint 8 Fase B.7 (2026-04-29) — ADR-073: rename `wow_call` → `contact_client`.
// El enum representa qué bloque/automatización activa la tarea, no la
// intención humana — la intención vive en `reason` (texto libre <=100 chars)
// + `tag_ids` extensibles (catálogo gestionado por superadmin/agent_full).
const TYPE_OPTIONS = [
  { value: 'custom_work', label: 'Personalizada' },
  { value: 'contact_client', label: 'Contactar cliente' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'maintenance_management', label: 'Mantenimiento + Gestión' },
  { value: 'support_setup', label: 'Setup soporte' },
];

const REASON_MAX_LENGTH = 100;

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
  // Sprint 8 Fase B.7 (2026-04-29) — ADR-073: porqué humano + tags.
  const [reason, setReason] = useState('');
  const [availableTags, setAvailableTags] = useState<TaskTagPayload[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

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

  // Sprint 8 Fase B.7 (2026-04-29) — ADR-073: catálogo de tags.
  // Idéntico patrón de carga lazy que `agents` arriba. Se siembran 5 tags
  // canónicos en `prisma/seeds/sample-task-tags.ts` para que la lista no
  // esté vacía nunca en operativa real.
  useEffect(() => {
    if (!open || !token) return;
    if (availableTags.length > 0) return;
    void taskTagsApi
      .list(token)
      .then((res) => setAvailableTags(res))
      .catch(() => setAvailableTags([]));
  }, [open, token, availableTags.length]);

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreateTag = async () => {
    const label = newTagLabel.trim();
    if (!token || !label) return;
    setCreatingTag(true);
    try {
      const tag = await taskTagsApi.create(token, { label });
      setAvailableTags((prev) => [...prev, tag].sort((a, b) =>
        a.label.localeCompare(b.label),
      ));
      setSelectedTagIds((prev) => [...prev, tag.id]);
      setNewTagLabel('');
    } catch (err) {
      toast('error', getErrorMessage(err) || 'No se pudo crear el tag');
    } finally {
      setCreatingTag(false);
    }
  };

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
        // Sprint 8 Fase B.7 — ADR-073: porqué humano + tags.
        reason: reason.trim() || undefined,
        ...(selectedTagIds.length > 0 && { tag_ids: selectedTagIds }),
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
    setReason(''); setSelectedTagIds([]); setNewTagLabel('');
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
        {/* Sprint 8 Fase B.7 (2026-04-29) — ADR-073: porqué humano <=100. */}
        <div>
          <label className={styles.formLabel}>
            Motivo (opcional){' '}
            <span className={styles.formHint}>
              {reason.length}/{REASON_MAX_LENGTH}
            </span>
          </label>
          <Input
            value={reason}
            onChange={(e) =>
              setReason(e.target.value.slice(0, REASON_MAX_LENGTH))
            }
            placeholder='Ej: "Bienvenida primer servicio", "Renovación próxima a vencer"...'
            maxLength={REASON_MAX_LENGTH}
          />
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
        {/* Sprint 8 Fase B.7 (2026-04-29) — ADR-073: tags reutilizables.
            Chips clicables (toggle) + creador inline. Max 10 por tarea
            (validación backend ArrayMaxSize). */}
        <div>
          <label className={styles.formLabel}>Etiquetas</label>
          <div className={styles.tagsPicker}>
            {availableTags.length === 0 ? (
              <span className={styles.formHint}>
                Sin etiquetas. Crea la primera abajo.
              </span>
            ) : (
              availableTags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`${styles.tagChip} ${selected ? styles.tagChipSelected : ''}`}
                    style={
                      selected && tag.color
                        ? {
                            backgroundColor: `${tag.color}1A`,
                            color: tag.color,
                            borderColor: `${tag.color}66`,
                          }
                        : undefined
                    }
                  >
                    {tag.label}
                  </button>
                );
              })
            )}
          </div>
          <div className={styles.tagCreator}>
            <Input
              value={newTagLabel}
              onChange={(e) => setNewTagLabel(e.target.value.slice(0, 50))}
              placeholder="Nueva etiqueta…"
              maxLength={50}
            />
            <Button
              variant="secondary"
              onClick={handleCreateTag}
              loading={creatingTag}
              disabled={!newTagLabel.trim() || selectedTagIds.length >= 10}
            >
              Añadir
            </Button>
          </div>
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
