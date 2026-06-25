'use client';

import { useTransition } from 'react';

import { Button, useToast } from '../../../components/ui';
import { exportMyDataAction } from '../_actions';

/* ═══════════════════════════════════════
   Client island: pide el export al Server Action y lo descarga como JSON
   (Blob + <a> hidden). El token nunca llega al navegador (Modelo A, R17).
   audit 2026-06-25 GL-5 / H3b.1.
   ═══════════════════════════════════════ */

export default function ExportDataButton() {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleClick() {
    startTransition(async () => {
      const result = await exportMyDataAction();
      if (!result.ok) {
        toast('error', result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aelium-mis-datos.json';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('success', 'Exportación descargada.');
    });
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={pending}>
      {pending ? 'Generando…' : 'Descargar mis datos (JSON)'}
    </Button>
  );
}
