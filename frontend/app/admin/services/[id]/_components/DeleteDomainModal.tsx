'use client';

/**
 * DeleteDomainModal — Sprint 15D Fase 15D.G·2 (ADR-081 A3.1).
 *
 * Borrado DESTRUCTIVO de un dominio en período de gracia (con reembolso) +
 * cancelación del servicio. Distinto de "Cancelar servicio" (que NO borra el
 * dominio del registrador): esto lo elimina de verdad. Typing-confirm + motivo
 * obligatorio (estándar de operaciones de alto impacto).
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
import { deleteDomainAction } from '../../../../_shared/domains/_admin-actions';

interface Props {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  serviceDisplayName: string;
}

export function DeleteDomainModal({
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
    const result = await deleteDomainAction(serviceId, reason.trim());
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    toast('success', 'Dominio borrado del registrador y servicio cancelado.');
    handleClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Eliminar dominio (período de gracia)"
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
            variant="danger"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            loading={submitting}
          >
            {submitting ? 'Eliminando…' : 'Eliminar dominio'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AlertBanner variant="danger">
          <strong>Esta acción es irreversible.</strong> El dominio se eliminará
          del registrador (con reembolso del registro si aún está dentro del
          período de gracia del TLD) y el servicio se cancelará. Fuera de la
          ventana de gracia, el registrador rechazará el borrado.
        </AlertBanner>

        <Textarea
          label="Motivo *"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Contexto para el equipo — p. ej. registro accidental, fraude, número de ticket."
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
