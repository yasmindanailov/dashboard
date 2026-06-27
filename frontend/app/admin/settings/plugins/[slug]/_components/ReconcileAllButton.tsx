'use client';

import { useTransition } from 'react';
import { RefreshCw, Hourglass } from 'lucide-react';

import { Button, useToast } from '../../../../../components/ui';
import { t } from '../../../../../_shared/i18n';

import { reconcileAllPluginAction } from '../../_actions';

/**
 * ReconcileAllButton — Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1).
 *
 * Subcomponente Client embebido en `/admin/settings/plugins/[slug]/page.tsx`.
 * Renderiza un botón "↻ Reconciliar todos los servicios contra <Plugin>
 * ahora" si el plugin declara `capabilities.supports_reconciliation = true`.
 *
 * Click → server action `reconcileAllPluginAction` → POST
 * `/admin/plugins/:slug/reconcile-all` → invoca el executor registrado por
 * el plugin (típicamente cron.runOnce()) + audit canónico
 * `plugin.reconcile_triggered_manually` + revalidatePath.
 *
 * Cumple doble propósito:
 *   1. UX A2: trigger general sin esperar el cron L3 (6h en plugin Enhance).
 *   2. Gap G1: desbloquea smoke testing manual operativo.
 *
 * Heredable: cualquier plugin con supports_reconciliation puede usar este
 * mismo componente sin cambios — no es plugin-specific.
 */
interface ReconcileAllButtonProps {
  /** Slug del plugin (ej. `enhance_cp`). */
  slug: string;
}

export function ReconcileAllButton({ slug }: ReconcileAllButtonProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleReconcile(): void {
    startTransition(async () => {
      const result = await reconcileAllPluginAction(slug);
      if (result.ok) {
        const { services_processed, drifts_detected, duration_ms } = result.data;
        // Sprint 15C.II Fase B fix-up (2026-05-10): pluralización ES inline
        // (translator local no soporta ICU/plurales). Patrón canónico: si N=1
        // singular, sino plural. Smoke real Yasmin reportó "1 servicios".
        const sLabel =
          services_processed === 1
            ? t('admin.plugins.reconcile_all.unit.service.singular')
            : t('admin.plugins.reconcile_all.unit.service.plural');
        const dLabel =
          drifts_detected === 1
            ? t('admin.plugins.reconcile_all.unit.drift.singular')
            : t('admin.plugins.reconcile_all.unit.drift.plural');
        // Templates separados singular/plural compuestos via inline.
        const message = t('admin.plugins.reconcile_all.success')
          .replace('{processed}', String(services_processed))
          .replace('{services_label}', sLabel)
          .replace('{drifts}', String(drifts_detected))
          .replace('{drifts_label}', dLabel)
          .replace('{duration}', String(duration_ms));
        toast(drifts_detected > 0 ? 'info' : 'success', message);
      } else {
        toast('error', result.error || t('admin.plugins.reconcile_all.error'));
      }
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleReconcile}
      disabled={isPending}
      title={t('admin.plugins.reconcile_all.tooltip')}
    >
      {isPending ? (
        <>
          <Hourglass size={14} aria-hidden="true" />
          {t('admin.plugins.reconcile_all.loading')}
        </>
      ) : (
        <>
          <RefreshCw size={14} aria-hidden="true" />
          {t('admin.plugins.reconcile_all.button')}
        </>
      )}
    </Button>
  );
}
