'use client';

/**
 * RestoreDomainModal — Sprint 15D.II.R (ADR-081 A7.2).
 *
 * Restore RGP de un dominio en redención (admin/soporte). Recupera el dominio con
 * la tarifa especial del registrar — que se cobra de forma **inmediata e
 * irreversible** — y genera la factura del fee al cliente. Typing-confirm + motivo
 * obligatorio (acción de alto coste). NO es destructiva como "Eliminar dominio".
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  AlertBanner,
  Button,
  Input,
  Modal,
  Textarea,
  useToast,
} from '../../../../components/ui';
import { restoreDomainAction } from '../../../../_shared/domains/_admin-actions';

interface Props {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  serviceDisplayName: string;
}

export function RestoreDomainModal({
  open,
  onClose,
  serviceId,
  serviceDisplayName,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const typedMatches = typed.trim() === serviceDisplayName.trim();
  const reasonValid = reason.trim().length > 0;
  const canSubmit = typedMatches && reasonValid && !submitting;

  function handleClose(): void {
    setReason('');
    setTyped('');
    setSubmitting(false);
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await restoreDomainAction(serviceId, reason.trim());
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    toast(
      'success',
      `Dominio restaurado. Fee facturado: ${result.data.fee.amount} ${result.data.fee.currency}.`,
    );
    handleClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Restaurar dominio (redención RGP)"
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Volver
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            loading={submitting}
          >
            {submitting ? 'Restaurando…' : 'Restaurar dominio'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AlertBanner variant="warning">
          La tarifa de restauración (RGP) es <strong>alta</strong> y el registrador
          la cobra de forma <strong>inmediata e irreversible</strong>. Se generará
          una factura del fee al cliente. Confirma que el cliente ha aceptado el
          coste antes de continuar.
        </AlertBanner>

        <Textarea
          label="Motivo *"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Contexto para el equipo — p. ej. número de ticket, cliente aceptó el fee por teléfono."
          helperText="Obligatorio. Queda en el audit log; no se muestra al cliente."
          disabled={submitting}
        />

        <div>
          <Input
            label={`Para confirmar, escribe el nombre del dominio: ${serviceDisplayName}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={serviceDisplayName}
            autoComplete="off"
            disabled={submitting}
          />
          {typed.length > 0 && !typedMatches && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 12,
                color: 'var(--danger-600)',
              }}
            >
              No coincide con <code>{serviceDisplayName}</code>.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
