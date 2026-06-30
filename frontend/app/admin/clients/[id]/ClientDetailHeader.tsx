'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CircleAlert,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  Modal,
  Tooltip,
  useToast,
  type BadgeVariant,
  type DropdownItem,
} from '../../../components/ui';
import type { ClientDetail } from './types';
import { setClientSuspendedAction } from './_actions';
import ClientEditModal from './ClientEditModal';
import ClientContratarModal from './ClientContratarModal';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   Client Detail Header (F4·U22) — avatar pastel + nombre + estado + pill
   Support Inside + meta + "Editar" + kebab (Contratar / Suspender / Eliminar).
   Monta los modales de Editar y Contratar; "Eliminar" enruta al flujo RGPD.
   ═══════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activo', variant: 'success' },
  pending_verification: { label: 'Pendiente', variant: 'warning' },
  blocked: { label: 'Suspendida', variant: 'danger' },
  inactive: { label: 'Inactiva', variant: 'neutral' },
};

const PRIORITY_LABEL: Record<string, string> = {
  standard: 'Estándar',
  high: 'Alta',
  max: 'Máxima',
};
const CHANNEL_LABEL: Record<string, string> = {
  webchat: 'Chat web',
  email: 'Email',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
};

interface Props {
  client: ClientDetail;
}

export default function ClientDetailHeader({ client }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [contratarOpen, setContratarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const s = STATUS_MAP[client.status] || STATUS_MAP.inactive;
  const isSuspended = client.status === 'blocked';
  const fullName = `${client.first_name} ${client.last_name}`;
  const si = client.support_inside_subscription;
  const siActive = si && si.status === 'active';
  const cfg = si?.product.support_inside_config;
  const tooltipText =
    siActive && cfg
      ? `SLA respuesta ${cfg.response_sla_hours}h · Prioridad ${PRIORITY_LABEL[cfg.priority_tier] ?? cfg.priority_tier} · Canales: ${cfg.channels_active.map((c) => CHANNEL_LABEL[c] ?? c).join(', ')}`
      : null;

  function handleToggleSuspend() {
    startTransition(async () => {
      const result = await setClientSuspendedAction(client.id, !isSuspended);
      if (result.ok) {
        setSuspendOpen(false);
        toast(
          'success',
          isSuspended ? 'Cuenta reactivada.' : 'Cuenta suspendida (login bloqueado).',
        );
      } else {
        toast('error', result.error);
      }
    });
  }

  const menuItems: DropdownItem[] = [
    {
      label: 'Contratar servicio',
      icon: <Plus size={15} strokeWidth={1.7} />,
      onClick: () => setContratarOpen(true),
    },
    {
      label: isSuspended ? 'Reactivar cuenta' : 'Suspender cuenta',
      icon: isSuspended ? (
        <Play size={15} strokeWidth={1.7} />
      ) : (
        <CircleAlert size={15} strokeWidth={1.7} />
      ),
      onClick: () => setSuspendOpen(true),
    },
    { divider: true },
    {
      label: 'Eliminar cliente',
      icon: <Trash2 size={15} strokeWidth={1.7} />,
      danger: true,
      onClick: () => setDeleteOpen(true),
    },
  ];

  return (
    <>
      <div className={styles.header}>
        <Avatar name={fullName} size="xl" tone="soft" />
        <div className={styles.headerInfo}>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.headerName}>{fullName}</h1>
            <Badge variant={s.variant}>{s.label}</Badge>
            {siActive && cfg && tooltipText && (
              <Tooltip content={tooltipText}>
                <Link
                  href={`/admin/support-inside-plans/${si.product.slug}`}
                  style={{ textDecoration: 'none' }}
                  aria-label={`Plan Support Inside del cliente: ${si.product.name}`}
                >
                  <Badge variant="brand">
                  <Shield size={13} strokeWidth={1.7} />
                  {si.product.name}
                </Badge>
                </Link>
              </Tooltip>
            )}
          </div>
          <div className={styles.headerMeta}>
            <span>{client.email}</span>
            {client.client_profile?.phone && (
              <>
                <span className={styles.metaDot}>·</span>
                <span>{client.client_profile.phone}</span>
              </>
            )}
            {client.client_profile?.company_name && (
              <>
                <span className={styles.metaDot}>·</span>
                <span>{client.client_profile.company_name}</span>
              </>
            )}
            <span className={styles.metaDot}>·</span>
            <span className={styles.metaMuted}>
              Cliente desde {new Date(client.created_at).toLocaleDateString('es-ES')}
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            leftIcon={<Pencil size={15} strokeWidth={1.7} />}
            onClick={() => setEditOpen(true)}
          >
            Editar
          </Button>
          <Dropdown
            align="right"
            triggerAsChild
            trigger={
              <Button
                variant="secondary"
                iconOnly
                disabled={pending}
                aria-label="Más acciones"
              >
                <MoreVertical size={18} strokeWidth={1.7} />
              </Button>
            }
            items={menuItems}
          />
        </div>
      </div>

      <ClientEditModal
        client={client}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <ClientContratarModal
        clientId={client.id}
        clientName={fullName}
        open={contratarOpen}
        onClose={() => setContratarOpen(false)}
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar cliente (RGPD)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeleteOpen(false);
                router.push('/admin/account-deletion');
              }}
            >
              Ir a Borrado de cuentas →
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          El borrado de una cuenta sigue el proceso RGPD (derecho al olvido): se
          gestiona en <strong>Borrado de cuentas</strong>, donde un superadmin lo
          revisa (sin servicios vivos ni facturas impagadas) y lo ejecuta —
          anonimización irreversible, conservando facturas y auditoría por
          obligación legal. No es un borrado inmediato desde aquí.
        </p>
      </Modal>

      <Modal
        open={suspendOpen}
        onClose={() => (pending ? undefined : setSuspendOpen(false))}
        title={isSuspended ? 'Reactivar cuenta' : 'Suspender cuenta'}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setSuspendOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant={isSuspended ? 'primary' : 'danger'}
              loading={pending}
              onClick={handleToggleSuspend}
            >
              {isSuspended ? 'Reactivar' : 'Suspender'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {isSuspended ? (
            <>¿Reactivar la cuenta de <strong>{fullName}</strong>? Volverá a poder iniciar sesión.</>
          ) : (
            <>¿Suspender la cuenta de <strong>{fullName}</strong>? No podrá iniciar sesión hasta que la reactives. Sus servicios siguen activos (se gestionan por separado en /admin/services).</>
          )}
        </p>
      </Modal>
    </>
  );
}
