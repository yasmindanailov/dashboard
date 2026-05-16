/**
 * Sprint 15C.II Fase F.9 polish (review F1 + F3) — helper canónico para
 * componer el Toast UX del reconcile single-shot.
 *
 * Centraliza la lógica de R5 frozen (Toast UX 3 ramas: success/warning/info)
 * + R6 (coalesced prefix) + plural EN ↔ ES + la única divergencia
 * INTENCIONAL entre `<AdminDriftBanner>` y `<DriftRowReconcileButton>`:
 *
 *   - **Banner** (vista detalle del servicio): tras success/warning ofrece
 *     CTA secundario "Ver detalle en timeline" + el caller redirige a
 *     `/admin/services/[id]/audit` (F.3 GAP-M) tras 1.5s delay.
 *   - **Row button** (vista plugin `/admin/settings/plugins/[slug]`): NO
 *     ofrece el CTA timeline (admin ya está viendo las filas drift +
 *     `router.refresh()` re-poblará la tabla con el nuevo estado).
 *
 * El parámetro `withTimelineCta` modeliza la divergencia: cada caller la
 * declara en su call-site (no hay default), evitando que un futuro consumer
 * dude del comportamiento.
 *
 * Nota i18n: la interpolación se hace via `replace('{count}', ...)` y
 * `replace('{seconds}', ...)` — el `t()` actual del proyecto no soporta ICU
 * plural (decisión consciente v1 — ver `translator.ts` docstring). Cuando
 * llegue el sub-sprint EN se reemplaza por `next-intl`; los call-sites de
 * `reconcileToastFor()` NO cambian gracias a esta firma estable.
 */

import { t } from '../i18n';

export type ToastVariant = 'success' | 'warning' | 'info';

export interface ReconcileToastInput {
  /** R6: el backend devolvió el último resultado cacheado (cooldown activo). */
  readonly coalesced?: boolean;
  /** Drifts aplicados sobre `services.status`/`services.metadata`. */
  readonly appliedCount: number;
  /** Drifts detectados (driftsApplied ⊆ driftsDetected). */
  readonly detectedCount: number;
  /**
   * `true` → el toast invita al admin a ver el timeline F.3 GAP-M (caller
   * banner del detalle del servicio). `false` → toast plano (caller row
   * button del overview del plugin, donde el admin ya ve las filas drift).
   * Sin default — cada caller declara la divergencia explícita.
   */
  readonly withTimelineCta: boolean;
}

export interface ReconcileToastOutput {
  readonly variant: ToastVariant;
  readonly text: string;
}

/**
 * Compone el toast canónico del reconcile single-shot.
 *
 * 3 ramas R5 frozen (§A.11.10.6.2):
 *   1. `appliedCount > 0` → variant=`success`, mensaje con conteo aplicado.
 *   2. `appliedCount === 0 && detectedCount > 0` → variant=`warning`,
 *      mensaje con conteo detectado + invita a revisión humana.
 *   3. resto (todo 0) → variant=`info`, "servicio sincronizado".
 *
 * Prefix R6 "Resultado en caché ·" se aplica a las 3 ramas cuando
 * `coalesced=true` (el backend devolvió el cached del cooldown window).
 */
export function reconcileToastFor(
  input: ReconcileToastInput,
): ReconcileToastOutput {
  const { coalesced, appliedCount, detectedCount, withTimelineCta } = input;
  const prefix = coalesced ? t('service.reconcile.coalesced_prefix') : '';

  if (appliedCount > 0) {
    const key = withTimelineCta
      ? appliedCount === 1
        ? 'service.reconcile.toast.success_singular_with_timeline'
        : 'service.reconcile.toast.success_plural_with_timeline'
      : appliedCount === 1
        ? 'service.reconcile.toast.success_singular_no_timeline'
        : 'service.reconcile.toast.success_plural_no_timeline';
    const text = `${prefix}${t(key).replace('{count}', String(appliedCount))}`;
    return { variant: 'success', text };
  }

  if (detectedCount > 0) {
    const key = withTimelineCta
      ? detectedCount === 1
        ? 'service.reconcile.toast.warning_singular_with_timeline'
        : 'service.reconcile.toast.warning_plural_with_timeline'
      : detectedCount === 1
        ? 'service.reconcile.toast.warning_singular_no_timeline'
        : 'service.reconcile.toast.warning_plural_no_timeline';
    const text = `${prefix}${t(key).replace('{count}', String(detectedCount))}`;
    return { variant: 'warning', text };
  }

  return {
    variant: 'info',
    text: `${prefix}${t('service.reconcile.toast.no_changes')}`,
  };
}

/**
 * Mensaje 429 R7 — cooldown activo sin resultado cacheado. El caller
 * normalmente lo emite como `toast('info', ...)` en lugar de `error` porque
 * NO es un fallo: es backpressure del backend.
 */
export function reconcileInProgressMessage(retrySeconds: number): string {
  return t('service.reconcile.toast.in_progress').replace(
    '{seconds}',
    String(retrySeconds),
  );
}
