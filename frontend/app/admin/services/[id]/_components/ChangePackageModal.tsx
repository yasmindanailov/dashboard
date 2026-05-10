'use client';

/**
 * ChangePackageModal — Sprint 15C Fase 15C.J (ADR-083 §6 decisión 30 +
 * Amendment A3).
 *
 * CC admin-only para invocar `change_package` sobre un service del plugin
 * Enhance CP, con UX rica:
 *   1. El parent (`AdminServiceOperationsCard`) invoca
 *      `list_available_plans` (10ª inline action `adminOnly=true`,
 *      ADR-083 Amendment A3) en el event handler del botón "Cambiar
 *      plan…" — NO en un effect aquí (canónico React 19: data fetching
 *      no vive en useEffect, lint `react-hooks/set-state-in-effect`).
 *   2. El modal recibe el shape `plans | loadingPlans | loadError` por
 *      props y solo renderiza estado. Internamente solo gestiona
 *      `selectedPlanId` + flujo de submit.
 *   3. Submit invoca `change_package` con `{planId: <selected>}`. Backend
 *      hace PATCH a Enhance + actualiza `service.metadata.enhance_plan_id`
 *      tras éxito (Sprint 15C Fase H bug fix — evita plan_divergence
 *      false-positive en el cron L3).
 *   4. Success → onClose + `executeServiceActionAction` ya revalida la
 *      página admin (`/admin/services/${id}`) automáticamente.
 *
 * Doctrina (ambigüedad A1+A2 resuelta 2026-05-09):
 *   - Vive en `frontend/app/admin/services/[id]/_components/` colocated
 *     (admin-specific, NO shared) — patrón consistente con Fase G DNS
 *     `frontend/app/dashboard/services/[id]/dns/_components/`.
 *   - El admin entra vía botón "Cambiar plan…" en la sección "Operaciones
 *     admin" de `/admin/services/[id]/page.tsx`. Los slugs `change_package`
 *     y `list_available_plans` están ocultos del `ActionsBar` por la
 *     blacklist `INTERNAL_HELPER_SLUGS` (Sprint 15C Fase J).
 *
 * Auth: invocar este componente requiere staff (filtrado server-side por
 * el SC parent). El backend wrapper enforce `adminOnly=true` adicionalmente
 * con HTTP 403 + audit + evento `service.action_admin_only_violation`
 * (defense-in-depth Fase E).
 */

import { useState } from 'react';

import { Button, Modal, useToast } from '../../../../components/ui';
import { executeServiceActionAction } from '../../../../_shared/services/_actions';

/**
 * Shape canónico del plan Enhance (espejo de `EnhancePlan` en
 * `backend/src/plugins/provisioners/enhance_cp/api/types.ts`).
 * Frontend duplica el shape porque no se puede importar desde backend
 * (R4 — frontend vive en otro paquete).
 */
export interface EnhancePlanOption {
  readonly id: number;
  readonly name: string;
  readonly subscriptionsCount: number;
  readonly planType?: string;
  readonly createdAt: string;
}

interface ChangePackageModalProps {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  /**
   * Plan actual del service (típicamente `info.display.secondary`).
   * Renderizado como contexto visual encima del dropdown.
   */
  currentPlanLabel?: string;
  /** Lista de planes ya cargada por el parent (null si todavía cargando o error). */
  plans: readonly EnhancePlanOption[] | null;
  loadingPlans: boolean;
  loadError: string | null;
}

export function ChangePackageModal({
  open,
  onClose,
  serviceId,
  currentPlanLabel,
  plans,
  loadingPlans,
  loadError,
}: ChangePackageModalProps) {
  // Sprint 15C.II Fase C (gap G6b — UI_SPEC §4.3): feedback de submit
  // (success / error del cambio de plan) migrado de state inline
  // (`submitError` / `successMessage` con render <p> dentro del modal)
  // a `useToast()` canónico. Razón: Toast = efímero (success/error
  // breve), AlertBanner = persistente. El cambio de plan emite un
  // resultado breve que el admin no necesita revisar continuamente —
  // toast es la categoría correcta. Tras success cerramos el modal
  // inmediatamente (antes había `setTimeout(handleClose, 1500)` para
  // que el admin leyera el `successMessage` inline; con toast el
  // mensaje permanece visible 5s en su esquina aunque el modal cierre).
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose(): void {
    setSelectedPlanId(null);
    setSubmitting(false);
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    if (selectedPlanId === null) return;
    setSubmitting(true);
    const result = await executeServiceActionAction(
      serviceId,
      'change_package',
      { planId: selectedPlanId },
    );
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    if (!result.result.success) {
      toast(
        'error',
        result.result.message ?? 'El proveedor rechazó el cambio de plan.',
      );
      return;
    }
    toast(
      'success',
      result.result.message ?? 'Plan actualizado correctamente.',
    );
    handleClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Cambiar plan del servicio"
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={selectedPlanId === null || submitting}
          >
            {submitting ? 'Aplicando…' : 'Confirmar cambio'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {currentPlanLabel && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Plan actual: <strong>{currentPlanLabel}</strong>
          </p>
        )}

        <p
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          ⚠️ Cambiar plan modifica la facturación del servicio en Enhance.
          Aelium <strong>NO genera ajuste automático de invoice</strong> —
          deberás emitir nota de crédito o cargo prorrateado manualmente en
          `/admin/billing` tras confirmar el cambio. (Sub-sprint billing
          prorrateo cross-plan pendiente — DC.NEW-15C-1.)
        </p>

        {loadingPlans && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Cargando planes disponibles del proveedor…
          </p>
        )}

        {loadError && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--danger-600)',
              padding: 8,
              background: 'var(--danger-50)',
              borderRadius: 6,
            }}
          >
            {loadError}
          </p>
        )}

        {plans && plans.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Seleccionar nuevo plan
            </span>
            <select
              value={selectedPlanId ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedPlanId(value === '' ? null : Number(value));
              }}
              disabled={submitting}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 14,
                background: 'var(--surface)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">— elige un plan —</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} (id={plan.id}
                  {plan.planType ? `, ${plan.planType}` : ''})
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {plans.length} plan{plans.length === 1 ? '' : 'es'} disponible
              {plans.length === 1 ? '' : 's'} en el Master Org.
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
