'use client';

/**
 * SuspendServiceModal — Sprint 15C.II Fase F (ADR-077 Amendment A4) +
 * Fase F.6 (notas operativas vía `ClientNote`).
 *
 * CC admin-only que materializa los botones "Suspender servicio…" /
 * "Reanudar servicio" del `<AdminServiceOperationsCard>`. Dos modos:
 *
 *   - `mode='suspend'`: flujo de operación administrativa **reversible** —
 *       1. Advertencia (`AlertBanner variant="warning"`): qué pasa (el cliente
 *          pierde el acceso, los datos se conservan en el proveedor) + que es
 *          reversible + cuándo usarlo en vez de cancelar.
 *       2. Motivo canónico obligatorio (dropdown — taxonomía `SuspensionReason`,
 *          va al audit log y se muestra al cliente como etiqueta localizada).
 *       3. **Nota interna OBLIGATORIA** (F.6 §F.6.1 + R2 §A.11.10.3.2). No se
 *          muestra al cliente. Vive en `ClientNote.body` para que aparezca en
 *          el timeline `/admin/clients/[id]` → "Notas".
 *       4. Toggle "Notificar al cliente" (default ON) → controla si el listener
 *          `notifications-on-service-suspended` envía email + campana.
 *       NO usa typing-confirm (la suspensión es reversible — L17: solo las
 *       acciones irreversibles destructivas lo exigen). Botón variant `warning`.
 *
 *   - `mode='unsuspend'` (F.6): confirmación + **nota interna OBLIGATORIA**.
 *       Toda transición manual de lifecycle deja traza con razón humana —
 *       coherencia con `suspend`/`cancel`. El path auto (listener
 *       `reactivate-services-on-invoice-paid`) NO pasa por este modal:
 *       compone el body con el nº de factura backend-side.
 *
 * Tras OK: toast success + `router.refresh()` → el SC parent re-renderiza
 * (banner amarillo "Servicio suspendido" / sin banner). NO redirige.
 *
 * Auth: invocar este componente requiere staff (filtrado server-side por el SC
 * parent). Los endpoints `POST /admin/services/:id/suspend|unsuspend` están
 * protegidos por triple guard (Jwt + AdminOnly + Policies — `Action.Update`
 * sobre `Subject.Service`, solo superadmin/agent_full). Validación R2 backend
 * cierra el path bypass con curl.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  AlertBanner,
  Button,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../../../components/ui';
import {
  suspendServiceAction,
  unsuspendServiceAction,
  type SuspendServiceReason,
} from '../../../../_shared/services/_actions';

interface Props {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  /** Nombre legible del servicio (`info.display.primary` — el dominio). Solo para los textos del modal. */
  serviceDisplayName: string;
  mode: 'suspend' | 'unsuspend';
}

/**
 * Etiquetas de los motivos (cliente-seguras — coherentes con el i18n
 * `service.suspension_reason.*` del frontend y con `SUSPENSION_REASON_LABEL_ES`
 * del listener backend; para `other` el cliente recibe un email genérico que
 * dirige a soporte — la nota interna NUNCA viaja al cliente).
 */
const REASON_OPTIONS: ReadonlyArray<{
  value: SuspendServiceReason;
  label: string;
}> = [
  { value: 'overdue_payment', label: 'Falta de pago (impago vencido)' },
  { value: 'abuse_investigation', label: 'Revisión de seguridad / uso indebido' },
  { value: 'scheduled_maintenance', label: 'Mantenimiento programado' },
  { value: 'gdpr_restriction', label: 'Restricción del tratamiento (RGPD art. 18)' },
  { value: 'other', label: 'Otro motivo' },
];

export function SuspendServiceModal({
  open,
  onClose,
  serviceId,
  serviceDisplayName,
  mode,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState<SuspendServiceReason>('overdue_payment');
  const [internalNote, setInternalNote] = useState('');
  const [notifyClient, setNotifyClient] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function handleClose(): void {
    setReason('overdue_payment');
    setInternalNote('');
    setNotifyClient(true);
    setSubmitting(false);
    onClose();
  }

  // F.6 + R2: la nota es obligatoria en ambos modos para admin/manual.
  // Defense-in-depth: el backend lo refuerza; este guard local mejora UX
  // (botón disabled, sin viaje al backend para un 400 evitable).
  const noteValid = internalNote.trim().length > 0;

  async function handleSubmit(): Promise<void> {
    if (!noteValid) {
      // Salvaguarda — el botón ya queda disabled, pero defendemos contra un
      // submit programático.
      toast('error', 'La nota interna es obligatoria.');
      return;
    }
    setSubmitting(true);
    const result =
      mode === 'suspend'
        ? await suspendServiceAction(serviceId, {
            reason,
            internal_note: internalNote.trim(),
            notify_client: notifyClient,
          })
        : await unsuspendServiceAction(serviceId, {
            internal_note: internalNote.trim(),
          });
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    if (mode === 'suspend') {
      toast(
        'success',
        notifyClient
          ? 'Servicio suspendido. El cliente recibirá un email con el motivo.'
          : 'Servicio suspendido. No se ha notificado al cliente.',
      );
    } else {
      toast('success', 'Servicio reactivado. El cliente recibirá un email de confirmación.');
    }
    handleClose();
    router.refresh();
  }

  if (mode === 'unsuspend') {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Reanudar servicio"
        size="md"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={handleClose} disabled={submitting}>
              Volver
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting || !noteValid}
              loading={submitting}
            >
              {submitting ? 'Reanudando…' : 'Reanudar servicio'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            El servicio <strong>{serviceDisplayName}</strong> volverá a estar
            activo y el cliente recuperará el acceso. Se le notificará por
            email.
          </p>
          <Textarea
            label="Nota interna *"
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Motivo de la reactivación — p. ej. cliente regularizó pago en banco, llamada confirmada con factura X, etc."
            helperText="Obligatoria. No se muestra al cliente — queda como traza en el historial del servicio. (máx 1000 caracteres)."
            disabled={submitting}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Suspender servicio"
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Volver
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleSubmit()}
            disabled={submitting || !noteValid}
            loading={submitting}
          >
            {submitting ? 'Suspendiendo…' : 'Suspender servicio'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AlertBanner variant="warning">
          <strong>Esta acción es reversible.</strong> El servicio se desactiva
          en el proveedor — el cliente pierde el acceso, pero{' '}
          <strong>sus datos se conservan</strong>. Útil para impago temporal,
          uso indebido en investigación, mantenimiento o restricción RGPD. Para
          dar de baja definitivamente el servicio (eliminando el recurso),
          usa <strong>Cancelar servicio</strong> en su lugar.
        </AlertBanner>

        <Select
          label="Motivo de la suspensión *"
          value={reason}
          onChange={(e) => setReason(e.target.value as SuspendServiceReason)}
          options={REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          helperText="Queda registrado en el audit log. El cliente verá la etiqueta del motivo en su email (no la nota interna)."
          disabled={submitting}
        />

        <Textarea
          label="Nota interna *"
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Contexto para el equipo — p. ej. número de ticket, decisión, etc."
          helperText="Obligatoria. No se muestra al cliente (ni siquiera para «Otro motivo»). Queda como traza en el historial del servicio y en el audit log (máx 1000 caracteres)."
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
              El cliente recibirá un email explicando la suspensión y, según el
              motivo, cómo resolverla (regularizar el pago, contactar con
              soporte). Desactívalo solo en casos especiales (cuentas de test,
              fraude confirmado).
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
