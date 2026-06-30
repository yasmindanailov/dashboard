'use client';

import { Button, useToast } from '../../../components/ui';

const DownloadIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * Acciones del header de la lista de clientes (slot `action` de ListPage),
 * 1:1 con `admin/Clientes.dc.html`.
 *
 * "Exportar" es hoy un stub no-destructivo (toast), consistente con el botón
 * Exportar de la BulkActionBar. La exportación real (CSV vía endpoint) es un
 * follow-up de backend pendiente de decisión — mismatch reportado en F4·U21
 * (el mockup tampoco define el comportamiento real: el botón es `noop`).
 */
export default function ClientsHeaderActions() {
  const { toast } = useToast();
  return (
    <Button
      variant="secondary"
      size="md"
      leftIcon={DownloadIcon}
      onClick={() => toast('info', 'Preparando la exportación de clientes…')}
    >
      Exportar
    </Button>
  );
}
