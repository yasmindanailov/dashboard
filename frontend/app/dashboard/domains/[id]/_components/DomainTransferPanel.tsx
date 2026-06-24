'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { AlertBanner, Button, Card, Input } from '../../../../components/ui';
import {
  submitTransferAuthAction,
  type SubmitTransferAuthResult,
} from '../../../../_shared/domains/_actions';

/* ═══════════════════════════════════════
   DomainTransferPanel — FSM de transfer-in en el detalle del dominio (15D.II.T2c.3).
   El cliente aporta el código EPP (R12: secreto, no se persiste) → arranca la
   transferencia (`POST /domains/:id/transfer/submit-auth` → initiateTransferIn).
   `submitted` → en curso; `failed`/`cancelled` → aviso. Capability por presencia:
   la página solo lo renderiza si `service.transfer_state` está y ≠ `completed`.
   ═══════════════════════════════════════ */

interface Props {
  serviceId: string;
  fqdn: string;
  transferState: string;
}

export default function DomainTransferPanel({
  serviceId,
  fqdn,
  transferState,
}: Props) {
  const router = useRouter();
  const [authCode, setAuthCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (authCode.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    const res: SubmitTransferAuthResult = await submitTransferAuthAction({
      serviceId,
      authCode: authCode.trim(),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAuthCode('');
    router.refresh();
  }

  /* submitted → en curso (el reconcile lo completará) */
  if (transferState === 'submitted') {
    return (
      <Card>
        <div
          style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
            Transferencia en curso
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
            Hemos iniciado la transferencia de <strong>{fqdn}</strong>. El proceso
            suele tardar 5–7 días; te avisaremos cuando se complete. No se te cobrará
            hasta entonces.
          </p>
        </div>
      </Card>
    );
  }

  /* pending / awaiting_auth / failed / cancelled → formulario del código EPP.
     failed/cancelled = reintento (A2.5): el mismo service se reabre a `pending`. */
  const isRetry = transferState === 'failed' || transferState === 'cancelled';

  return (
    <Card>
      <div
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
            {isRetry ? 'Reintentar la transferencia' : 'Inicia la transferencia'}
          </h2>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}
          >
            {isRetry ? (
              <>
                La transferencia anterior de <strong>{fqdn}</strong> no se completó.
                Suele deberse al bloqueo de transferencia o a un código incorrecto.
                Revísalo en tu registrador actual y vuelve a intentarlo — no se te
                cobra nada hasta que se complete.
              </>
            ) : (
              <>
                Para transferir <strong>{fqdn}</strong>, aporta el{' '}
                <strong>código de autorización (EPP)</strong> que te facilita tu
                registrador actual. Antes, desactiva en él el bloqueo de
                transferencia.
              </>
            )}
          </p>
        </div>

        {transferState === 'awaiting_auth' && !error && (
          <AlertBanner variant="warning">
            El código anterior no era válido. Revísalo e inténtalo de nuevo.
          </AlertBanner>
        )}
        {error && <AlertBanner variant="danger">{error}</AlertBanner>}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}
        >
          <div style={{ flex: 1 }}>
            <Input
              label="Código de autorización (EPP)"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Ej.: aB3-xY9-..."
              autoComplete="off"
              helperText="No se almacena: lo usamos solo para iniciar la transferencia."
            />
          </div>
          <Button
            type="submit"
            loading={submitting}
            disabled={authCode.trim().length === 0}
          >
            {isRetry ? 'Reintentar' : 'Iniciar transferencia'}
          </Button>
        </form>
      </div>
    </Card>
  );
}
