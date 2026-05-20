'use client';

/**
 * MetricsRecalculateButton — Sprint 15C.II Fase F.12.5 (Amendment VII, punto 2).
 *
 * Botón "Recalcular" de la card "Recursos", junto a "Refrescar" (↻). Invoca la
 * action admin `recalculate_provider_metrics`: pide al **proveedor** que
 * recompute disco/ancho de banda en su lado (operación pesada) e invalida la
 * cache → `router.refresh()`. Distinto de Refrescar (↻), que solo re-lee los
 * últimos valores ya calculados. Ambos llevan un `<HelpTip>` ⓘ en la card que
 * explica la diferencia.
 *
 * Extraído de la antigua card "Operaciones" (tab Gestión, eliminada en F.12.5):
 * recalcular es una operación sobre métricas, su sitio natural es la card de
 * métricas, no un menú de acciones. Doctrina React 19: el fetch vive en el
 * event handler (no useEffect); handler async + wrapper sync `void handle()`.
 *
 * Admin-only (el caller `<MetricsBar>` solo lo monta si `isAdmin`).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, useToast } from '../../components/ui';
import { t } from '../i18n';

import { executeServiceActionAction } from './_actions';

const RECALCULATE_SLUG = 'recalculate_provider_metrics';

interface MetricsRecalculateButtonProps {
  serviceId: string;
}

export function MetricsRecalculateButton({
  serviceId,
}: MetricsRecalculateButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [recalculating, setRecalculating] = useState(false);

  async function handleRecalculate(): Promise<void> {
    setRecalculating(true);
    const result = await executeServiceActionAction(serviceId, RECALCULATE_SLUG, {});
    setRecalculating(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    if (!result.result.success) {
      toast(
        'error',
        result.result.message
          ? t(result.result.message)
          : 'El proveedor no completó el recálculo.',
      );
      return;
    }
    toast(
      'success',
      result.result.message
        ? t(result.result.message)
        : 'Recálculo solicitado al proveedor.',
    );
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void handleRecalculate()}
      disabled={recalculating}
    >
      {recalculating
        ? t('service.resources.recalculating')
        : t('service.resources.recalculate')}
    </Button>
  );
}
