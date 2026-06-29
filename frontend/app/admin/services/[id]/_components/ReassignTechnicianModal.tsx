'use client';

/**
 * ReassignTechnicianModal — Rediseño UI F3·E8 (DS-A18).
 *
 * Picker para reasignar el "técnico asignado" (cuidador estable) de una
 * suscripción Support Inside, desde el menú "Más acciones" del detalle de
 * servicio admin. Lista los agentes de soporte elegibles (misma doctrina de
 * roles que la auto-asignación, server-side) con avatar + presencia + carga de
 * mantenimiento activa, marca el actual, permite buscar y desasignar.
 *
 * Backend: `PATCH /admin/support-inside/subscriptions/:id/technician` (ya
 * existente, F3·E8 B2) vía `assignTechnicianAction`. Tras OK: toast +
 * `router.refresh()` → el SC parent re-renderiza la sección "Plan de soporte".
 *
 * Nota (decisión Yasmin): claude design reskineará este picker más adelante;
 * esta versión es funcional sobre las primitivas del DS (no bloquea).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Avatar,
  Button,
  Modal,
  SearchInput,
  Skeleton,
  useToast,
} from '../../../../components/ui';
import type {
  PresenceStatus,
  SupportInsideEligibleTechnician,
} from '../../../../lib/api';
import { PresenceDot } from '../../../../_shared/support-inside/PresenceDot';
import {
  assignTechnicianAction,
  listEligibleTechniciansAction,
} from '../_actions';
import s from './ReassignTechnicianModal.module.css';

const ROLE_LABELS: Record<string, string> = {
  agent_support: 'Soporte',
  agent_full: 'Agente',
  agent_billing: 'Facturación',
  superadmin: 'Superadmin',
};

const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: 'En línea',
  away: 'Ausente',
  offline: 'Desconectado',
};

export interface ReassignTechnicianModalProps {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  subscriptionId: string;
  currentTechnicianId: string | null;
}

export function ReassignTechnicianModal({
  open,
  onClose,
  serviceId,
  subscriptionId,
  currentTechnicianId,
}: ReassignTechnicianModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [techs, setTechs] = useState<SupportInsideEligibleTechnician[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(currentTechnicianId);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy load on open: carga técnicos elegibles + reinicia el estado del picker al abrir.
    setLoading(true);
    setSelected(currentTechnicianId);
    setQuery('');
    setLoadError(null);
    let cancelled = false;
    void (async () => {
      const res = await listEligibleTechniciansAction();
      if (cancelled) return;
      if (res.ok) {
        setTechs(res.technicians);
      } else {
        setTechs([]);
        setLoadError(res.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentTechnicianId]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? techs.filter((tech) =>
        tech.full_name.toLowerCase().includes(normalizedQuery),
      )
    : techs;

  function handleClose(): void {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    if (selected === currentTechnicianId) {
      toast('info', 'No hay cambios de asignación.');
      return;
    }
    setSubmitting(true);
    const res = await assignTechnicianAction(
      subscriptionId,
      selected,
      serviceId,
    );
    setSubmitting(false);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    toast(
      'success',
      selected
        ? 'Técnico reasignado. Las tareas de mantenimiento pendientes pasan al nuevo técnico.'
        : 'Técnico desasignado.',
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Reasignar técnico"
      size="md"
      footer={
        <div className={s.actions}>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || loading}
            loading={submitting}
          >
            Reasignar
          </Button>
        </div>
      }
    >
      <div className={s.body}>
        <p className={s.callout}>
          Al reasignar, la tarea de mantenimiento del mes en curso pasa al nuevo
          técnico solo si está pendiente; las futuras las hereda automáticamente.
        </p>

        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder="Buscar agente…"
          aria-label="Buscar agente"
          disabled={submitting}
        />

        {loading ? (
          <div className={s.list}>
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : loadError ? (
          <p className={s.error}>{loadError}</p>
        ) : (
          <div className={s.list} role="radiogroup" aria-label="Técnicos disponibles">
            <button
              type="button"
              className={`${s.row} ${selected === null ? s.rowSelected : ''}`}
              onClick={() => setSelected(null)}
              role="radio"
              aria-checked={selected === null}
              disabled={submitting}
            >
              <span className={`${s.avatar} ${s.avatarEmpty}`} aria-hidden>
                —
              </span>
              <span className={s.rowBody}>
                <span className={s.rowName}>Sin técnico (desasignar)</span>
                <span className={s.rowMeta}>
                  El cron asignará por carga al crear la tarea del mes
                </span>
              </span>
            </button>

            {filtered.map((tech) => (
              <button
                key={tech.id}
                type="button"
                className={`${s.row} ${selected === tech.id ? s.rowSelected : ''}`}
                onClick={() => setSelected(tech.id)}
                role="radio"
                aria-checked={selected === tech.id}
                disabled={submitting}
              >
                <Avatar
                  name={tech.full_name}
                  src={tech.avatar_url ?? undefined}
                  size="sm"
                />
                <span className={s.rowBody}>
                  <span className={s.rowName}>
                    {tech.full_name}
                    {tech.id === currentTechnicianId && (
                      <span className={s.current}> · actual</span>
                    )}
                  </span>
                  <span className={s.rowMeta}>
                    <PresenceDot status={tech.presence} size="sm" />
                    {PRESENCE_LABELS[tech.presence]} ·{' '}
                    {ROLE_LABELS[tech.role] ?? tech.role} ·{' '}
                    {tech.active_maintenance_tasks}{' '}
                    {tech.active_maintenance_tasks === 1
                      ? 'tarea activa'
                      : 'tareas activas'}
                  </span>
                </span>
              </button>
            ))}

            {filtered.length === 0 && (
              <p className={s.empty}>
                {techs.length === 0
                  ? 'No hay agentes de soporte elegibles.'
                  : 'Sin resultados para tu búsqueda.'}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
