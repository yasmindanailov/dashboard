'use client';

/**
 * AdminServiceActionsMenu — Sprint 15C.II Fase F.12.5 (Amendment VII).
 *
 * Provee al menú "Más acciones" (⋯) del header las **operaciones admin** del
 * servicio, consolidando lo que antes era la tab "Gestión" (card Operaciones +
 * DangerZone + card Reenviar). Posee el estado de todos los modales y delega el
 * render del menú en `<ServiceActionsMenu>` (`_shared/`) vía `extraItems` +
 * `extraModals` (evita acoplar `_shared/` a `app/admin/`).
 *
 * Ítems (cada uno con descripción de contexto — Regla D2/D5; ramifican por
 * capability/action declarada, NUNCA por `provisioner_slug` — ADR-070):
 *   - **Cambiar plan…** (si `change_package`, !terminal) → `ChangePackageModal`.
 *   - **Reenviar notificación…** (siempre, incl. terminal — F.11.2) →
 *     `ResendNotificationModal`.
 *   - **Reanudar servicio** (si `unsuspend_service`, !terminal) →
 *     `SuspendServiceModal` modo unsuspend (recuperación; no destructivo).
 *   - **Suspender servicio…** (si `suspend_service`, !terminal) →
 *     `SuspendServiceModal` modo suspend (destructivo).
 *   - **Cancelar servicio…** (!terminal) → `CancelServiceModal` (typing-confirm).
 *
 * Reutiliza los modales de F.12.4 — no reescribe Server Actions ni modales.
 * Recalcular métricas NO está aquí: vive en la card "Recursos" junto a Refrescar
 * (F.12.5 punto 2).
 */

import { useState } from 'react';

import { type DropdownItem } from '../../../../components/ui';
import type { ServiceAction } from '../../../../lib/api';
import { executeServiceActionAction } from '../../../../_shared/services/_actions';
import { filterQuickActions } from '../../../../_shared/services/quick-actions';
import { ServiceActionsMenu } from '../../../../_shared/services/ServiceActionsMenu';

import { ChangePackageModal, type EnhancePlanOption } from './ChangePackageModal';
import { CancelServiceModal } from './CancelServiceModal';
import { DeleteDomainModal } from './DeleteDomainModal';
import { ResendNotificationModal } from './ResendNotificationModal';
import { SuspendServiceModal } from './SuspendServiceModal';

interface AdminServiceActionsMenuProps {
  serviceId: string;
  serviceDisplayName: string;
  actions: readonly ServiceAction[];
  currentPlanLabel?: string;
  /** Estado terminal (cancelled/terminated): solo "Reenviar" queda disponible. */
  isTerminal: boolean;
  /** Servicio de tipo dominio: habilita "Eliminar dominio (gracia)" (15D.G·2). */
  isDomain?: boolean;
}

export function AdminServiceActionsMenu({
  serviceId,
  serviceDisplayName,
  actions,
  currentPlanLabel,
  isTerminal,
  isDomain = false,
}: AdminServiceActionsMenuProps) {
  // ── change_package ────────────────────────────────────────────────────────
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [plans, setPlans] = useState<readonly EnhancePlanOption[] | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── resend / suspend / cancel ─────────────────────────────────────────────
  const [resendOpen, setResendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteDomainOpen, setDeleteDomainOpen] = useState(false);
  const [suspendMode, setSuspendMode] = useState<'suspend' | 'unsuspend' | null>(
    null,
  );

  const hasChangePackage = actions.some((a) => a.slug === 'change_package');
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

  // Quick-actions del plugin (admin): vacías si terminal.
  const quickActions = isTerminal ? [] : filterQuickActions(actions, true);

  // Operaciones seguras.
  const safeItems: DropdownItem[] = [];
  if (hasChangePackage && !isTerminal) {
    safeItems.push({
      label: 'Cambiar plan…',
      description: 'Sube o baja el plan del servicio en el proveedor.',
      onClick: () => void handleOpenChangePlan(),
    });
  }
  // Reenviar: disponible siempre (incl. terminal — reenviar el aviso de baja).
  safeItems.push({
    label: 'Reenviar notificación…',
    description:
      'Reenvía al cliente el último aviso del servicio (suspensión, reactivación o cancelación).',
    onClick: () => setResendOpen(true),
  });

  // Operaciones consecuentes (destructivas / cambio de estado).
  const dangerItems: DropdownItem[] = [];
  if (canUnsuspend && !isTerminal) {
    dangerItems.push({
      label: 'Reanudar servicio',
      description: 'Reactiva el servicio suspendido; el cliente recupera el acceso.',
      onClick: () => setSuspendMode('unsuspend'),
    });
  }
  if (canSuspend && !isTerminal) {
    dangerItems.push({
      label: 'Suspender servicio…',
      description: 'Corta el acceso del cliente conservando los datos (reversible).',
      danger: true,
      onClick: () => setSuspendMode('suspend'),
    });
  }
  if (!isTerminal) {
    dangerItems.push({
      label: 'Cancelar servicio…',
      description: 'Da de baja el servicio en el proveedor. Acción de alto impacto.',
      danger: true,
      onClick: () => setCancelOpen(true),
    });
  }
  // 15D.G·2 — borrado destructivo del dominio en gracia (≠ cancelar: lo elimina
  // del registrador con reembolso). Solo dominios, no terminal.
  if (isDomain && !isTerminal) {
    dangerItems.push({
      label: 'Eliminar dominio (gracia)…',
      description:
        'Borra el dominio del registrador con reembolso (solo en período de gracia) y cancela el servicio.',
      danger: true,
      onClick: () => setDeleteDomainOpen(true),
    });
  }

  const extraItems: DropdownItem[] = [...safeItems];
  if (dangerItems.length > 0) {
    extraItems.push({ divider: true });
    extraItems.push(...dangerItems);
  }

  const extraModals = (
    <>
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
      <ResendNotificationModal
        open={resendOpen}
        onClose={() => setResendOpen(false)}
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
      <CancelServiceModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        serviceId={serviceId}
        serviceDisplayName={serviceDisplayName}
      />
      {isDomain && (
        <DeleteDomainModal
          open={deleteDomainOpen}
          onClose={() => setDeleteDomainOpen(false)}
          serviceId={serviceId}
          serviceDisplayName={serviceDisplayName}
        />
      )}
    </>
  );

  return (
    <ServiceActionsMenu
      serviceId={serviceId}
      isAdmin
      quickActions={quickActions}
      extraItems={extraItems}
      extraModals={extraModals}
    />
  );
}
