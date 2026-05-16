'use client';

/**
 * DriftRowReconcileButton — Sprint 15C.II Fase F.9 (DC.45, ADR-077 Amendment
 * A8 + §A.11.10.6.2 R1..R6 + Amendment III R7..R9).
 *
 * Botón inline en cada fila de `<PluginOperationalOverview>` que invoca el
 * endpoint admin single-shot `POST /admin/services/:id/reconcile` para
 * remediar un drift puntual sin esperar a la próxima pasada del cron L3.
 *
 * Gating canónico (R9 frozen): solo se renderiza si el plugin declara
 * `supports_reconcile_one` en el admin overview F.2. Sin la capability, la
 * fila NO muestra el botón — el admin sigue teniendo el link al detalle del
 * service (donde el `<AdminDriftBanner>` ofrece el fallback F.3 redirect a
 * settings reconcile-all).
 *
 * Toast UX (R5 frozen — 3 ramas) y coalesced badge (R6 frozen) duplicados
 * desde `<AdminDriftBanner>`: la lógica es la misma — el botón aquí es un
 * shortcut desde la vista del plugin a la pasada single-shot per-service,
 * sin requerir navegar al detalle del service.
 *
 * Heredable: cualquier plugin futuro con `supports_reconcile_one=true` lo
 * obtiene automáticamente — el componente es plugin-agnostic (recibe slug y
 * serviceId por props).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, useToast } from '../../components/ui';
import { t } from '../i18n';
import { reconcileServiceAction } from '../services/_actions';
import {
  reconcileInProgressMessage,
  reconcileToastFor,
} from '../services/_reconcile-toast';

interface Props {
  serviceId: string;
  /** Capability detection del overview F.2. Si false → null (no renderizar). */
  supportsReconcileOne: boolean;
}

export function DriftRowReconcileButton({
  serviceId,
  supportsReconcileOne,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [reconciling, setReconciling] = useState(false);

  if (!supportsReconcileOne) {
    return null;
  }

  async function handleClick(): Promise<void> {
    setReconciling(true);
    const response = await reconcileServiceAction(serviceId);
    if (!response.ok) {
      setReconciling(false);
      if (response.inProgress) {
        toast('info', reconcileInProgressMessage(response.retryAfterSeconds ?? 30));
      } else {
        toast('error', response.error);
      }
      return;
    }
    const { result } = response;

    // Polish F.9 (review F1+F3): helper canónico — `withTimelineCta=false`
    // documenta explícitamente la divergencia intencional con
    // `<AdminDriftBanner>` (que pasa `true`). Razón: aquí estamos en la vista
    // del plugin `/admin/settings/plugins/[slug]`, el admin ya ve la tabla
    // de drifts y `router.refresh()` la re-poblará con el nuevo estado.
    // Navegar al timeline rompería el flujo "reconciliar en bloque".
    const { variant, text } = reconcileToastFor({
      coalesced: result.coalesced,
      appliedCount: result.driftsApplied.length,
      detectedCount: result.driftsDetected.length,
      withTimelineCta: false,
    });
    toast(variant, text);
    router.refresh();
    setReconciling(false);
  }

  return (
    <Button
      variant="secondary"
      onClick={() => void handleClick()}
      disabled={reconciling}
      aria-busy={reconciling}
      style={{ fontSize: 11, padding: '4px 8px' }}
    >
      {reconciling
        ? t('service.reconcile.row_button.loading')
        : t('service.reconcile.button.label')}
    </Button>
  );
}
