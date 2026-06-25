'use client';

import { useState, useTransition } from 'react';

import { Button, useToast } from '../../../components/ui';
import {
  requestAccountDeletionAction,
  cancelAccountDeletionAction,
  type MyDeletionRequest,
} from '../_actions';

/* ═══════════════════════════════════════
   Client island: solicitar / cancelar el borrado de cuenta (derecho al olvido).
   Lo revisa y ejecuta un admin (no es inmediato). audit GL-5 / H3b.2.
   ═══════════════════════════════════════ */

export default function AccountDeletionSection({
  request,
}: {
  request: MyDeletionRequest | null;
}) {
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const isPending = request?.status === 'pending';

  function submit() {
    if (
      !window.confirm(
        '¿Solicitar el borrado de tu cuenta? Un administrador la revisará. ' +
          'Tus facturas se conservan por obligación legal.',
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await requestAccountDeletionAction(reason);
      if (!r.ok) {
        toast('error', r.error);
        return;
      }
      setReason('');
      toast('success', 'Solicitud registrada. La revisaremos pronto.');
    });
  }

  function cancel() {
    startTransition(async () => {
      const r = await cancelAccountDeletionAction();
      if (!r.ok) {
        toast('error', r.error);
        return;
      }
      toast('success', 'Solicitud cancelada.');
    });
  }

  if (isPending) {
    return (
      <div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 12px' }}>
          Tu solicitud de borrado está <strong>pendiente de revisión</strong> por
          un administrador. Te avisaremos cuando se complete.
        </p>
        <Button variant="secondary" onClick={cancel} disabled={pending}>
          {pending ? 'Cancelando…' : 'Cancelar solicitud'}
        </Button>
      </div>
    );
  }

  return (
    <div>
      {request?.status === 'rejected' && request.review_note && (
        <p
          style={{
            color: '#991B1B',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            margin: '0 0 12px',
          }}
        >
          Tu última solicitud fue rechazada: {request.review_note}
        </p>
      )}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional)"
        rows={2}
        maxLength={1000}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          fontSize: 14,
          marginBottom: 12,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <Button variant="danger" onClick={submit} disabled={pending}>
        {pending ? 'Enviando…' : 'Solicitar borrado de mi cuenta'}
      </Button>
    </div>
  );
}
