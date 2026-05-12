'use client';

/**
 * AdminServiceOperationsCard — Sprint 15C Fase 15C.J + Sprint 15C.II Fase E.
 *
 * CC que renderiza la sección "Operaciones admin" en
 * `/admin/services/[id]/page.tsx`. Contenedor canónico de operaciones
 * administrativas del service detail (heredable a 15D RC, 15E Docker, 15G
 * Plesk). El parent solo lo monta cuando el service NO está terminal.
 *
 * Operaciones (todas ramifican por capability/action declarada, NUNCA por
 * `provisioner_slug` — ADR-070):
 *   - **Cambiar plan…** — abre `ChangePackageModal`. Solo si el plugin
 *     declara la action `change_package` (ADR-083 Amendment A3, adminOnly).
 *   - **Recalcular métricas en el proveedor** — Sprint 15C.II Fase E
 *     (Amendment A5.1, renombrada desde `force_resync`): pide al proveedor
 *     que recalcule disco/ancho-de-banda en su lado + invalida cache. Solo
 *     si el plugin declara la action `recalculate_provider_metrics`. Vive
 *     aquí (no en la barra genérica "Acciones rápidas") — operación de
 *     power-user con etiquetado preciso (progressive disclosure). Sin
 *     confirmación (no destructiva).
 *   - **Suspender servicio… / Reanudar servicio** — Sprint 15C.II Fase F
 *     (ADR-077 Amendment A4): abre `SuspendServiceModal`. Ramifica por las
 *     inline actions canónicas que `getServiceInfo` expone según el estado:
 *     `suspend_service` (si `status='active'`) → "Suspender servicio…"
 *     (modal con motivo canónico + nota interna + toggle notificar — reversible,
 *     sin typing-confirm); `unsuspend_service` (si `status='suspended'`) →
 *     "Reanudar servicio" (confirmación simple). Solo aparece si el plugin
 *     declara `supports_suspend=true` (implícito: sin el flag esas actions no
 *     están en el catálogo → no llegan a `availableActions`).
 *   - **Cancelar servicio…** — abre `CancelServiceModal` (Sprint 15C.II
 *     Fase E, GAP-15CII-J): flujo destructivo de grado profesional
 *     (advertencia + motivo + nota interna + toggle notificar + typing-confirm).
 *     SIEMPRE disponible (cancelar es una operación admin universal — el
 *     endpoint `POST /admin/services/:id/deprovision` existe para todos los
 *     plugins; `plugin.deprovision()` real o no-op según el plugin).
 *
 * Doctrina React 19: data fetching (`list_available_plans` para el dropdown
 * de change_package) vive en el event handler del botón, NO en un useEffect
 * del modal (lint `react-hooks/set-state-in-effect`).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Card, useToast } from '../../../../components/ui';
import { t } from '../../../../_shared/i18n';
import type { ServiceAction } from '../../../../lib/api';
import { executeServiceActionAction } from '../../../../_shared/services/_actions';

import { ChangePackageModal, type EnhancePlanOption } from './ChangePackageModal';
import { CancelServiceModal } from './CancelServiceModal';
import { SuspendServiceModal } from './SuspendServiceModal';

interface AdminServiceOperationsCardProps {
  serviceId: string;
  actions: readonly ServiceAction[];
  /** Plan actual del service (típicamente `t(info.display.secondary)`). */
  currentPlanLabel?: string;
  /** Nombre legible del service (`info.display.primary` — el dominio). Usado en el modal de cancelación (typing-confirm). */
  serviceDisplayName: string;
}

const RECALCULATE_SLUG = 'recalculate_provider_metrics';

export function AdminServiceOperationsCard({
  serviceId,
  actions,
  currentPlanLabel,
  serviceDisplayName,
}: AdminServiceOperationsCardProps) {
  const router = useRouter();
  const { toast } = useToast();

  // ── change_package modal state ───────────────────────────────────────────
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [plans, setPlans] = useState<readonly EnhancePlanOption[] | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── recalculate metrics state ────────────────────────────────────────────
  const [recalculating, setRecalculating] = useState(false);

  // ── cancel modal state ───────────────────────────────────────────────────
  const [cancelOpen, setCancelOpen] = useState(false);

  // ── suspend / unsuspend modal state (Sprint 15C.II Fase F — ADR-077 A4) ──
  const [suspendMode, setSuspendMode] = useState<'suspend' | 'unsuspend' | null>(
    null,
  );

  const recalcAction = actions.find((a) => a.slug === RECALCULATE_SLUG);
  const hasChangePackage = actions.some((a) => a.slug === 'change_package');
  // Las 2 inline actions canónicas de suspensión solo están en `availableActions`
  // si (a) el plugin declara `supports_suspend=true` y (b) el estado actual lo
  // permite (`suspend_service` ⇔ active, `unsuspend_service` ⇔ suspended) —
  // `getServiceInfo` ya hace ese filtrado. Ramificamos por su presencia, NUNCA
  // por slug del provisioner (ADR-070).
  const canSuspend = actions.some((a) => a.slug === 'suspend_service');
  const canUnsuspend = actions.some((a) => a.slug === 'unsuspend_service');

  async function handleOpenChangePlan(): Promise<void> {
    setChangePlanOpen(true);
    setLoadingPlans(true);
    setLoadError(null);
    setPlans(null);
    const result = await executeServiceActionAction(
      serviceId,
      'list_available_plans',
      {},
    );
    setLoadingPlans(false);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    const items =
      (result.result.data?.plans as readonly EnhancePlanOption[] | undefined) ??
      null;
    if (!items || items.length === 0) {
      setLoadError(
        'El proveedor no devolvió planes disponibles. Revisa la configuración del Master Org en el proveedor.',
      );
      return;
    }
    setPlans(items);
  }

  function handleCloseChangePlan(): void {
    setChangePlanOpen(false);
    setPlans(null);
    setLoadingPlans(false);
    setLoadError(null);
  }

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
    // Las métricas frescas llegan tras invalidar cache — refrescar el SC.
    router.refresh();
  }

  return (
    <>
      <Card>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>
          Operaciones admin
        </h2>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {hasChangePackage && (
            <Button onClick={() => void handleOpenChangePlan()}>
              Cambiar plan…
            </Button>
          )}

          {recalcAction && (
            <Button
              variant="secondary"
              onClick={() => void handleRecalculate()}
              disabled={recalculating}
              title={
                recalcAction.description
                  ? t(recalcAction.description)
                  : 'Pide al proveedor que recalcule disco y ancho de banda en su lado, y refresca la lectura. Distinto de ↻ Refrescar (re-lee lo último) y de la reconciliación periódica.'
              }
            >
              {recalculating
                ? 'Recalculando…'
                : t(recalcAction.label) || 'Recalcular métricas en el proveedor'}
            </Button>
          )}

          {canSuspend && (
            <Button
              variant="secondary"
              onClick={() => setSuspendMode('suspend')}
              title="Desactiva el servicio en el proveedor preservando los datos (reversible). Para impago temporal, abuso en investigación, mantenimiento o restricción RGPD."
            >
              Suspender servicio…
            </Button>
          )}
          {canUnsuspend && (
            <Button
              variant="secondary"
              onClick={() => setSuspendMode('unsuspend')}
              title="Reactiva un servicio suspendido — el cliente recupera el acceso."
            >
              Reanudar servicio
            </Button>
          )}

          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            Cancelar servicio…
          </Button>

          {currentPlanLabel && (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Plan actual: <strong>{currentPlanLabel}</strong>
            </span>
          )}
        </div>
      </Card>

      {hasChangePackage && (
        <ChangePackageModal
          open={changePlanOpen}
          onClose={handleCloseChangePlan}
          serviceId={serviceId}
          currentPlanLabel={currentPlanLabel}
          plans={plans}
          loadingPlans={loadingPlans}
          loadError={loadError}
        />
      )}

      <CancelServiceModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        serviceId={serviceId}
        serviceDisplayName={serviceDisplayName}
      />

      <SuspendServiceModal
        open={suspendMode !== null}
        onClose={() => setSuspendMode(null)}
        serviceId={serviceId}
        serviceDisplayName={serviceDisplayName}
        mode={suspendMode ?? 'suspend'}
      />
    </>
  );
}
