'use client';

import { useTransition } from 'react';

import { Button, useToast } from '../../components/ui';
import { t } from '../i18n';

import { refreshServiceInfoAction } from './_actions';

/**
 * MetricsRefreshButton — Sprint 15C.II Fase B (ADR-083 Amendment A4.1).
 *
 * Subcomponente Client Component embebido en `MetricsBar.tsx`. Renderiza
 * un botón "↻ Refrescar" pequeño en la esquina superior-derecha de la
 * card "Métricas". Click → server action `refreshServiceInfoAction` que
 * invoca `POST /services/:id/refresh` (o admin) con forceRevalidate=true
 * + revalidatePath para que el SC padre se rerenderice con métricas
 * frescas.
 *
 * Reemplaza las inline actions `view_disk_usage` + `view_bandwidth_usage`
 * eliminadas del manifest del plugin Enhance (decisión doctrinal A1
 * frozen — violaban UI_SPEC §1.2 P4 "acción no contemplación"). Patrón
 * canónico Stripe Dashboard / Vercel Metrics: botón ↻ explícito junto a
 * la card. NO autorrefresh polling (consume bandwidth + complica WS).
 */
interface MetricsRefreshButtonProps {
  /** ID del service que se refresca. */
  serviceId: string;
  /** True si la página es admin (`/admin/services/[id]`). False para cliente. */
  isAdmin: boolean;
}

export function MetricsRefreshButton({
  serviceId,
  isAdmin,
}: MetricsRefreshButtonProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleRefresh(): void {
    startTransition(async () => {
      const result = await refreshServiceInfoAction(serviceId, isAdmin);
      if (result.ok) {
        toast('success', t('metrics.refresh.success'));
      } else {
        toast('error', result.error || t('metrics.refresh.error'));
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleRefresh}
      disabled={isPending}
      title={t('metrics.refresh.tooltip')}
      aria-label={t('metrics.refresh.aria_label')}
    >
      {isPending ? `⏳ ${t('metrics.refreshing')}` : `↻ ${t('metrics.refresh')}`}
    </Button>
  );
}
