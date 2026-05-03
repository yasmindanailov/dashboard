'use client';

import { useTransition } from 'react';
import { Button, useToast } from '../../../../components/ui';
import { downloadInvoicePdfAction } from '../../_actions';

/* ═══════════════════════════════════════
   Client island: dispara el Server Action que pide la URL pre-signed
   y luego descarga via <a> hidden (ADR-062 §H two-phase).
   ═══════════════════════════════════════ */

interface Props {
  invoiceId: string;
  invoiceNumber: string;
}

export default function DownloadPdfButton({ invoiceId, invoiceNumber }: Props) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleClick() {
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
    <Button variant="secondary" onClick={handleClick} disabled={pending}>
      {pending ? 'Generando…' : 'Descargar PDF'}
    </Button>
  );
}
