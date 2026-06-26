'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  Badge,
  Button,
  Input,
  Modal,
  Select,
  Table,
  useToast,
  type TableColumn,
} from '../../../components/ui';
import {
  createStaffAction,
  setStaffStatusAction,
  updateStaffRoleAction,
} from '../_actions';
import {
  ROLE_LABELS,
  ROLE_OPTIONS,
  STATUS_META,
  type StaffMember,
  type StaffRole,
} from '../types';
import s from '../staff.module.css';

/* ═══════════════════════════════════════
   Client island: gestión de cuentas de staff (GL-21). Crear · editar rol ·
   activar/desactivar (offboarding). Auto-protección reflejada en UI (los
   botones sobre la propia cuenta se deshabilitan); el backend reaplica TODA
   la autorización + invariantes (último superadmin, sesiones revocadas, etc.).
   ═══════════════════════════════════════ */

const EMPTY_FORM = {
  email: '',
  first_name: '',
  last_name: '',
  role: 'agent_support' as StaffRole,
  password: '',
};

export default function StaffManager({
  staff,
  currentUserId,
}: {
  staff: StaffMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [editRole, setEditRole] = useState<StaffRole>('agent_support');
  const [savingRole, setSavingRole] = useState(false);

  async function submitCreate() {
    if (
      !form.email.trim() ||
      !form.first_name.trim() ||
      !form.last_name.trim() ||
      !form.password
    ) {
      toast('error', 'Completa todos los campos.');
      return;
    }
    setCreating(true);
    const r = await createStaffAction(form);
    setCreating(false);
    if (r.ok) {
      toast('success', 'Cuenta de staff creada.');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      router.refresh();
    } else {
      toast('error', r.error);
    }
  }

  function openEdit(m: StaffMember) {
    setEditTarget(m);
    setEditRole(m.role);
  }

  async function submitRole() {
    if (!editTarget) return;
    setSavingRole(true);
    const r = await updateStaffRoleAction(editTarget.id, editRole);
    setSavingRole(false);
    if (r.ok) {
      toast('success', 'Rol actualizado.');
      setEditTarget(null);
      router.refresh();
    } else {
      toast('error', r.error);
    }
  }

  function toggleStatus(m: StaffMember) {
    const next = m.status === 'active' ? 'inactive' : 'active';
    if (
      next === 'inactive' &&
      !window.confirm(
        `¿Desactivar la cuenta de ${m.email}? Se cerrarán todas sus sesiones al instante.`,
      )
    ) {
      return;
    }
    setBusyId(m.id);
    startTransition(async () => {
      const r = await setStaffStatusAction(m.id, next);
      setBusyId(null);
      if (r.ok) {
        toast(
          'success',
          next === 'inactive' ? 'Cuenta desactivada.' : 'Cuenta reactivada.',
        );
        router.refresh();
      } else {
        toast('error', r.error);
      }
    });
  }

  const columns: TableColumn<StaffMember>[] = [
    {
      key: 'name',
      header: 'Cuenta',
      render: (m) => (
        <div className={s.nameCell}>
          <span className={s.name}>{m.full_name || '—'}</span>
          <span className={s.email}>{m.email}</span>
        </div>
      ),
    },
    { key: 'role', header: 'Rol', render: (m) => ROLE_LABELS[m.role] },
    {
      key: 'two_factor',
      header: '2FA',
      align: 'center',
      render: (m) => (
        <Badge variant={m.two_factor_enabled ? 'success' : 'neutral'}>
          {m.two_factor_enabled ? 'Sí' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (m) => {
        const meta = STATUS_META[m.status] ?? {
          label: m.status,
          variant: 'neutral' as const,
        };
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
    {
      key: 'last_login',
      header: 'Último acceso',
      render: (m) =>
        m.last_login_at ? (
          new Date(m.last_login_at).toLocaleString('es-ES')
        ) : (
          <span className={s.muted}>Nunca</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => {
        const isSelf = m.id === currentUserId;
        const isActive = m.status === 'active';
        return (
          <div className={s.actions}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(m)}
              disabled={isSelf}
              title={isSelf ? 'No puedes cambiar tu propio rol' : undefined}
            >
              Editar rol
            </Button>
            <Button
              variant={isActive ? 'danger' : 'secondary'}
              size="sm"
              onClick={() => toggleStatus(m)}
              disabled={isSelf || busyId === m.id}
              title={
                isSelf ? 'No puedes desactivar tu propia cuenta' : undefined
              }
            >
              {busyId === m.id ? '…' : isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className={s.toolbar}>
        <span className={s.count}>{staff.length} cuenta(s) de staff</span>
        <Button onClick={() => setCreateOpen(true)}>Crear cuenta</Button>
      </div>

      <Table
        columns={columns}
        data={staff}
        rowKey={(m) => m.id}
        emptyTitle="Sin cuentas de staff"
        emptyDescription="Crea la primera cuenta de agente."
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Crear cuenta de staff"
        footer={
          <div className={s.formActions}>
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={submitCreate} loading={creating}>
              Crear
            </Button>
          </div>
        }
      >
        <div className={s.form}>
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="agente@aelium.net"
          />
          <Input
            label="Nombre"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />
          <Input
            label="Apellidos"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          />
          <Select
            label="Rol"
            options={ROLE_OPTIONS}
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as StaffRole })
            }
          />
          <Input
            label="Contraseña inicial"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            helperText="Mín. 8 caracteres con mayúscula, minúscula y número. El agente podrá cambiarla desde su cuenta."
          />
        </div>
      </Modal>

      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Editar rol"
        footer={
          <div className={s.formActions}>
            <Button
              variant="secondary"
              onClick={() => setEditTarget(null)}
              disabled={savingRole}
            >
              Cancelar
            </Button>
            <Button onClick={submitRole} loading={savingRole}>
              Guardar
            </Button>
          </div>
        }
      >
        {editTarget && (
          <div className={s.form}>
            <p className={s.email}>{editTarget.email}</p>
            <Select
              label="Rol"
              options={ROLE_OPTIONS}
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as StaffRole)}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
