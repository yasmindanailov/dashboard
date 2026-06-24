'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Card,
  Input,
  Button,
  Modal,
  AlertBanner,
  useToast,
} from '../../components/ui';
import { useAuth } from '../../lib/auth-context';
import {
  changePasswordAction,
  set2faAction,
  revokeSessionAction,
  logoutAllAction,
  type AccountMe,
  type AccountSession,
} from './_actions';
import styles from './AccountView.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Sección Seguridad (ADR-085): cambio de contraseña + 2FA opt-in (Amendment A1
   de ADR-013) + gestión de sesiones activas (ADR-060 §B).
   ═══════════════════════════════════════════════════════════════════════════ */

const MANDATORY_2FA_ROLES = [
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
];

interface Props {
  me: AccountMe;
  sessions: AccountSession[];
}

export default function SecurityPanel({ me, sessions }: Props) {
  const { toast } = useToast();
  const { logout } = useAuth();
  const router = useRouter();
  const mandatory2fa = MANDATORY_2FA_ROLES.includes(me.role.slug);

  return (
    <>
      <PasswordCard
        onChanged={() => {
          toast('success', 'Contraseña actualizada.');
          router.refresh();
        }}
        toastError={(msg) => toast('error', msg)}
      />
      <TwoFactorCard
        enabled={me.two_factor_enabled}
        mandatory={mandatory2fa}
        toast={toast}
        onChanged={() => router.refresh()}
      />
      <SessionsCard
        sessions={sessions}
        timezone={me.timezone}
        toast={toast}
        onLoggedOutEverywhere={() => void logout()}
        onRevoked={() => router.refresh()}
      />
    </>
  );
}

/* ─── Contraseña ─── */

function PasswordCard({
  onChanged,
  toastError,
}: {
  onChanged: () => void;
  toastError: (msg: string) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (next.length < 8) {
      toastError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (next !== confirm) {
      toastError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setSaving(true);
    const res = await changePasswordAction({
      current_password: current,
      new_password: next,
    });
    setSaving(false);
    if (!res.ok) {
      toastError(res.error);
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    onChanged();
  };

  return (
    <Card>
      <h2 className={styles.sectionTitle}>Contraseña</h2>
      <p className={styles.sectionHint}>
        Al cambiarla se cerrará la sesión en los demás dispositivos.
      </p>
      <div className={styles.grid}>
        <Input
          label="Contraseña actual"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={styles.full}
        />
        <Input
          label="Nueva contraseña"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          helperText="Mínimo 8, con mayúscula, minúscula y número."
        />
        <Input
          label="Repite la nueva contraseña"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={saving}
          disabled={!current || !next || !confirm}
          onClick={() => void submit()}
        >
          Cambiar contraseña
        </Button>
      </div>
    </Card>
  );
}

/* ─── 2FA ─── */

function TwoFactorCard({
  enabled,
  mandatory,
  toast,
  onChanged,
}: {
  enabled: boolean;
  mandatory: boolean;
  toast: (variant: 'success' | 'error', msg: string) => void;
  onChanged: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const intendedEnable = !enabled; // el botón hace lo contrario al estado actual

  const submit = async () => {
    setBusy(true);
    const res = await set2faAction(intendedEnable, password);
    setBusy(false);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    setModalOpen(false);
    setPassword('');
    toast('success', res.data.message);
    onChanged();
  };

  return (
    <Card>
      <h2 className={styles.sectionTitle}>Verificación en dos pasos</h2>
      <p className={styles.sectionHint}>
        Te pediremos un código enviado a tu email al iniciar sesión.
      </p>
      <div className={styles.twoFaRow}>
        {enabled ? (
          <span className={styles.badgeOn}>
            <span className={styles.dot} /> Activada
          </span>
        ) : (
          <span className={styles.badgeOff}>
            <span className={styles.dot} /> Desactivada
          </span>
        )}

        {mandatory ? (
          <span className={styles.sessionSub}>Exigida por tu rol</span>
        ) : (
          <Button
            variant={enabled ? 'secondary' : 'primary'}
            onClick={() => setModalOpen(true)}
          >
            {enabled ? 'Desactivar' : 'Activar'}
          </Button>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={intendedEnable ? 'Activar verificación' : 'Desactivar verificación'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant={intendedEnable ? 'primary' : 'danger'}
              loading={busy}
              disabled={!password}
              onClick={() => void submit()}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <div className={styles.modalForm}>
          <p className={styles.sectionHint}>
            Confirma tu contraseña para continuar.
          </p>
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </Modal>
    </Card>
  );
}

/* ─── Sesiones ─── */

function SessionsCard({
  sessions,
  timezone,
  toast,
  onLoggedOutEverywhere,
  onRevoked,
}: {
  sessions: AccountSession[];
  timezone: string;
  toast: (variant: 'success' | 'error', msg: string) => void;
  onLoggedOutEverywhere: () => void;
  onRevoked: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Formato con timeZone FIJO (el del usuario) → determinista server↔client:
  // sin hydration mismatch y sin setState-in-effect (deuda DC.6).
  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    const opts: Intl.DateTimeFormatOptions = {
      dateStyle: 'medium',
      timeStyle: 'short',
    };
    try {
      return new Date(iso).toLocaleString('es-ES', { ...opts, timeZone: timezone });
    } catch {
      return new Date(iso).toLocaleString('es-ES', { ...opts, timeZone: 'UTC' });
    }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    const res = await revokeSessionAction(id);
    setRevoking(null);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    toast('success', 'Sesión cerrada.');
    onRevoked();
  };

  const logoutAll = async () => {
    setBusy(true);
    const res = await logoutAllAction();
    setBusy(false);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    onLoggedOutEverywhere();
  };

  return (
    <Card>
      <div className={styles.cardHeaderRow}>
        <div>
          <h2 className={styles.sectionTitle}>Sesiones activas</h2>
          <p className={styles.sectionHint}>
            Dispositivos donde tu cuenta está abierta.
          </p>
        </div>
        {sessions.length > 0 && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            Cerrar todas
          </Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className={styles.empty}>No hay sesiones activas registradas.</p>
      ) : (
        <div className={styles.sessionList}>
          {sessions.map((s) => (
            <div key={s.id} className={styles.sessionRow}>
              <div className={styles.sessionMeta}>
                <span className={styles.sessionDevice}>
                  {s.device_label ?? 'Dispositivo'}
                </span>
                <span className={styles.sessionSub}>
                  {s.ip_address ?? 'IP desconocida'} · activa {fmt(s.last_used_at)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={revoking === s.id}
                onClick={() => void revoke(s.id)}
              >
                Cerrar
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Cerrar todas las sesiones"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void logoutAll()}>
              Cerrar todas
            </Button>
          </>
        }
      >
        <AlertBanner variant="warning">
          Se cerrará la sesión en <strong>todos los dispositivos, incluido
          este</strong>. Tendrás que volver a iniciar sesión.
        </AlertBanner>
      </Modal>
    </Card>
  );
}
