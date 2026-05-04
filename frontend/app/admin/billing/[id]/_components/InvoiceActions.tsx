'use client';

import { useTransition } from 'react';
import { Button, useToast } from '../../../../components/ui';
import {
  cancelInvoiceAction,
  downloadInvoicePdfAction,
  finalizeInvoiceAction,
  payInvoiceAction,
  refundInvoiceAction,
} from '../../_actions';

/* ═══════════════════════════════════════
   Cliente island con los botones de acción del detalle de factura admin.
   Las acciones llaman Server Actions que invocan revalidatePath, así que
   el SC padre se recarga server-side y el estado/badges se actualizan.
   ═══════════════════════════════════════ */

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
}

const ACTION_LABELS = {
  finalize: 'Factura enviada.',
  pay: 'Factura cobrada.',
  cancel: 'Factura cancelada.',
  refund: 'Factura reembolsada.',
} as const;

export default function InvoiceActions({
  invoiceId,
  invoiceNumber,
  status,
}: Props) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function dispatch(action: keyof typeof ACTION_LABELS) {
    startTransition(async () => {
      const fn =
        action === 'finalize'
          ? finalizeInvoiceAction
          : action === 'pay'
            ? payInvoiceAction
            : action === 'cancel'
              ? cancelInvoiceAction
              : refundInvoiceAction;
      const result = await fn(invoiceId);
      if (result.ok) toast('success', ACTION_LABELS[action]);
      else toast('error', result.error);
    });
  }

  function handleDownloadPdf() {
    startTransition(async () => {
      const result = await downloadInvoicePdfAction(invoiceId);
      if (!result.ok) {
        toast('error', result.error);
        return;
      }
      const a = document.createElement('a');
      a.href = result.url;
      a.download = `${invoiceNumber}.pdf`;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }

  return (
    <>
      {status === 'draft' && (
        <Button onClick={() => dispatch('finalize')} disabled={pending}>
          Enviar
        </Button>
      )}
      {['pending', 'overdue'].includes(status) && (
        <Button onClick={() => dispatch('pay')} disabled={pending}>
          Marcar pagada
        </Button>
      )}
      {status === 'paid' && (
        <Button
          variant="secondary"
          onClick={() => dispatch('refund')}
          disabled={pending}
        >
          Reembolsar
        </Button>
      )}
      {['draft', 'pending'].includes(status) && (
        <Button
          variant="danger"
          onClick={() => dispatch('cancel')}
          disabled={pending}
        >
          Cancelar
        </Button>
      )}
      <Button variant="secondary" onClick={handleDownloadPdf} disabled={pending}>
        PDF
      </Button>
    </>
  );
}
