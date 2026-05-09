'use client';

/**
 * AdminServiceOperationsCard — Sprint 15C Fase 15C.J.
 *
 * CC que renderiza la sección "Operaciones admin" en
 * `/admin/services/[id]/page.tsx`. Hoy expone únicamente el botón
 * "Cambiar plan…" que abre `ChangePackageModal`.
 *
 * Doctrina React 19 (canónico — `react-hooks/set-state-in-effect`):
 *
 *   La carga de planes via `executeAction('list_available_plans')` vive
 *   en el event handler `handleOpen` (click del botón), NO en un
 *   useEffect dentro del modal. Patrón canónico React 19: data fetching
 *   asociado a una acción del usuario debe estar en el event handler,
 *   no en un effect que reaccione a cambios de prop.
 *
 *   El modal recibe `plans | loadingPlans | loadError` por props y solo
 *   renderiza estado. Internamente solo gestiona `selectedPlanId` y el
 *   flujo de submit (`change_package`).
 *
 * Defensa: si el plugin del service NO declara la action `change_package`
 * en `availableActions`, el botón se oculta — la sección entera devuelve
 * `null` cuando no hay operaciones disponibles. Mantiene el principio
 * canónico ADR-070 "la UI ramifica por capabilities/actions, NO por
 * provisioner_slug".
 *
 * Diseñado para ampliarse en futuros sprints con más operaciones
 * admin-specific (ej. reprovision, deprovision con DTO, force-cancel)
 * sin requerir refactor del SC parent.
 */

import { useState } from 'react';

import { Button, Card } from '../../../../components/ui';
import type { ServiceAction } from '../../../../lib/api';
import { executeServiceActionAction } from '../../../../_shared/services/_actions';

import { ChangePackageModal, type EnhancePlanOption } from './ChangePackageModal';

interface AdminServiceOperationsCardProps {
  serviceId: string;
  actions: readonly ServiceAction[];
  /** Plan actual del service (típicamente `info.display.secondary`). */
  currentPlanLabel?: string;
}

export function AdminServiceOperationsCard({
  serviceId,
  actions,
  currentPlanLabel,
}: AdminServiceOperationsCardProps) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<readonly EnhancePlanOption[] | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasChangePackage = actions.some((a) => a.slug === 'change_package');

  if (!hasChangePackage) return null;

  async function handleOpen(): Promise<void> {
    setOpen(true);
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
        'El proveedor no devolvió planes disponibles. Revisa la configuración del Master Org en Enhance.',
      );
      return;
    }
    setPlans(items);
  }

  function handleClose(): void {
    setOpen(false);
    setPlans(null);
    setLoadingPlans(false);
    setLoadError(null);
  }

  return (
    <>
      <Card>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>
          Operaciones admin
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Button onClick={() => void handleOpen()}>Cambiar plan…</Button>
          {currentPlanLabel && (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Actual: <strong>{currentPlanLabel}</strong>
            </span>
          )}
        </div>
      </Card>

      <ChangePackageModal
        open={open}
        onClose={handleClose}
        serviceId={serviceId}
        currentPlanLabel={currentPlanLabel}
        plans={plans}
        loadingPlans={loadingPlans}
        loadError={loadError}
      />
    </>
  );
}
