'use client';

/**
 * CancelServiceModal — Sprint 15C.II Fase E (GAP-15CII-J).
 *
 * CC admin-only que materializa el botón "Cancelar servicio…" del
 * `<AdminServiceOperationsCard>`. Flujo destructivo de grado profesional:
 *   1. Advertencia clara (irreversible, recurso eliminado en el proveedor,
 *      datos del cliente pueden quedar irrecuperables — distinto de suspender).
 *   2. Motivo canónico obligatorio (dropdown `cancelled` / `expired` /
 *      `admin_override` — taxonomía billing, va al audit log).
 *   3. Nota interna opcional (no se muestra al cliente — solo audit log).
 *   4. Toggle "Notificar al cliente" (default ON) → controla si el listener
 *      `notifications-on-service-cancelled` envía email + campana.
 *   5. Typing-confirm: el admin debe escribir el nombre del servicio exacto
 *      para habilitar el botón destructivo (estándar GitHub / AWS / Vercel).
 *
 * Tras OK: toast success + `router.refresh()` → el SC parent re-renderiza con
 * el banner terminal `service.terminal.cancelled.admin` y oculta operaciones
 * futiles. NO redirige — el detalle admin del service cancelado sigue siendo
 * útil para el audit trail.
 *
 * Auth: invocar este componente requiere staff (filtrado server-side por el
 * SC parent). El backend endpoint `POST /admin/services/:id/deprovision` está
 * protegido por triple guard (Jwt + AdminOnly + Policies — `Action.Update`
 * sobre `Subject.Service`, solo superadmin/agent_full).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { AlertBanner, Button, Input, Modal, Select, Textarea, useToast } from '../../../../components/ui';
import {
  deprovisionServiceAction,
  type DeprovisionServiceReason,
} from '../../../../_shared/services/_actions';

interface Props {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  /** Nombre legible del servicio (típicamente `info.display.primary` — el dominio). Lo que el admin debe tipear para confirmar. */
  serviceDisplayName: string;
}

const REASON_OPTIONS: ReadonlyArray<{ value: DeprovisionServiceReason; label: string }> = [
  { value: 'cancelled', label: 'Baja voluntaria del cliente' },
  { value: 'expired', label: 'Contrato / suscripción vencido' },
  { value: 'admin_override', label: 'Decisión administrativa' },
];

export function CancelServiceModal({
  open,
  onClose,
  serviceId,
  serviceDisplayName,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState<DeprovisionServiceReason>('cancelled');
  const [notes, setNotes] = useState('');
  const [notifyClient, setNotifyClient] = useState(true);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const typedMatches = typed.trim() === serviceDisplayName.trim();
  const canSubmit = typedMatches && !submitting;

  function handleClose(): void {
    setReason('cancelled');
    setNotes('');
    setNotifyClient(true);
    setTyped('');
    setSubmitting(false);
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    if (!typedMatches) return;
    setSubmitting(true);
    const result = await deprovisionServiceAction(serviceId, {
      reason,
      notes: notes.trim() || undefined,
      notify_client: notifyClient,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    toast(
      'success',
      notifyClient
        ? 'Servicio cancelado. El cliente recibirá un email de confirmación.'
        : 'Servicio cancelado. No se ha notificado al cliente.',
    );
    handleClose();
    // El SC parent re-resuelve el detalle → banner terminal + ocultar ops.
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Cancelar servicio"
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Volver
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            loading={submitting}
          >
            {submitting ? 'Cancelando…' : 'Cancelar servicio'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AlertBanner variant="danger">
          <strong>Esta acción es irreversible.</strong> El servicio se dará de
          baja en el proveedor de forma definitiva — el recurso se elimina y
          los datos del cliente pueden quedar irrecuperables. Si solo quieres
          desactivarlo temporalmente (impago, abuso en investigación),{' '}
          <strong>suspéndelo</strong> en lugar de cancelarlo (la suspensión es
          reversible).
        </AlertBanner>

        <Select
          label="Motivo de la cancelación *"
          value={reason}
          onChange={(e) => setReason(e.target.value as DeprovisionServiceReason)}
          options={REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          helperText="Queda registrado en el audit log. No se muestra al cliente."
          disabled={submitting}
        />

        <Textarea
          label="Nota interna (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Contexto para el equipo — p. ej. número de ticket, decisión, etc."
          helperText="No se muestra al cliente. Se añade al registro de auditoría (máx 500 caracteres)."
          disabled={submitting}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            fontSize: 14,
            cursor: submitting ? 'default' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={notifyClient}
            onChange={(e) => setNotifyClient(e.target.checked)}
            disabled={submitting}
            style={{ marginTop: 3 }}
          />
          <span>
            Notificar al cliente por email
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                marginTop: 2,
              }}
            >
              El cliente recibirá un email confirmando la cancelación.
              Desactívalo solo en casos especiales (cuentas de test, fraude
              confirmado).
            </span>
          </span>
        </label>

        <div>
          <Input
            label={`Para confirmar, escribe el nombre del servicio: ${serviceDisplayName}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={serviceDisplayName}
            autoComplete="off"
            disabled={submitting}
          />
          {typed.length > 0 && !typedMatches && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--danger-600)' }}>
              No coincide con <code>{serviceDisplayName}</code>.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
