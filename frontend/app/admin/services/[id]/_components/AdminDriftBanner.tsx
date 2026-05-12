'use client';

/**
 * AdminDriftBanner — Sprint 15C.II Fase C (UI_SPEC §4.13 + ADR-083
 * Amendment A4.3 frozen 2026-05-10).
 *
 * Banner admin que materializa la mitad admin del patrón doctrinal
 * "drift UX discriminada por rol":
 *
 *   - **AlertBanner variant="warning"** ARRIBA del MetricsBar mostrando
 *     `info.statusReason` técnico crudo (admin necesita la info literal
 *     para diagnosticar).
 *   - **CTA "Investigar en panel del proveedor"** que invoca el SSO
 *     admin (impersonation — el endpoint
 *     `POST /services/:id/sso` ya audita
 *     `service.admin_sso_impersonation` cuando el admin opera sobre
 *     service ajeno; comportamiento canónico Sprint 15C Fase F).
 *   - **Botón "Re-aprovisionar ahora"** prominente cuando el admin
 *     necesita re-crear el service en el proveedor (típicamente cuando
 *     el plugin reporta `not_yet_provisioned` — metadata externa
 *     perdida o servicio nunca creado en el proveedor real). El
 *     endpoint backend ya enqueue el job y audita.
 *
 * Cumple ADR-082 DH-INV-6: NO modifica `service.status` canónico — el
 * sistema externo gana en conflicto operacional, Aelium solo emite
 * eventos + UI dispara acciones admin discrecionales.
 *
 * Heredable a 15D RC, 15E Docker, 15G Plesk: el componente recibe
 * `serviceId` + `statusReason` + `hasSsoPanel` + `panelLabel` por props
 * (plugin-agnostic — NO importa el slug ni asume metadata específica).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { AlertBanner, Button, Modal, useToast } from '../../../../components/ui';
import { t } from '../../../../_shared/i18n';
import {
  reprovisionServiceAction,
  requestSsoUrlAction,
} from '../../../../_shared/services/_actions';

interface AdminDriftBannerProps {
  serviceId: string;
  /**
   * `info.statusReason` traducido o crudo. El backend lo envía como
   * i18n key (ej. `plugin.enhance_cp.status_reason.subscription_missing`);
   * el SC parent ya hace `t()` antes de pasarlo aquí.
   */
  statusReason: string;
  /**
   * `info.capabilities.hasSsoPanel` — controla si renderizamos el botón
   * "Investigar en panel del proveedor".
   */
  hasSsoPanel: boolean;
  /**
   * `info.capabilities.panel_label` — label i18n del proveedor (ej.
   * `plugin.enhance_cp.panel_label`). Solo relevante si `hasSsoPanel`.
   */
  panelLabel?: string;
  /**
   * `true` si el banner debe ofrecer el botón "Re-aprovisionar ahora"
   * prominente. Se activa cuando el caller detecta caso típico
   * `not_yet_provisioned` (status=unknown sin metadata externa). El SC
   * parent decide la heurística (ver `admin/services/[id]/page.tsx`).
   */
  showReprovision: boolean;
  /**
   * Sprint 15C.II Fase F.3 — `true` si el banner debe ofrecer el CTA
   * "Reconciliar contra el proveedor". Se activa cuando
   * `info.recoveryHint === 'reconcile'` (p.ej. `plan_divergence` detectado
   * por `getServiceInfo` — ADR-077 Amendment A5). El CTA lleva a la página
   * de settings del plugin, donde vive el botón canónico
   * "Reconciliar todos los servicios contra <Plugin> ahora" (= trigger
   * manual del cron L3, ADR-083 A4.2) + el overview operativo (Fase F.2).
   * Una reconciliación per-servicio single-shot queda diferida (backlog).
   */
  showReconcile?: boolean;
  /** Slug del plugin del servicio — destino del CTA de reconciliación. */
  pluginSlug?: string | null;
}

export function AdminDriftBanner({
  serviceId,
  statusReason,
  hasSsoPanel,
  panelLabel,
  showReprovision,
  showReconcile,
  pluginSlug,
}: AdminDriftBannerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [openingSso, setOpeningSso] = useState(false);
  const [reprovisioning, setReprovisioning] = useState(false);
  // Sprint 15C.II Fase C round 5: confirm reforzado con Modal DS
  // (reemplaza window.confirm nativo — viola UI_SPEC §4.2).
  const [confirmReprovisionOpen, setConfirmReprovisionOpen] = useState(false);

  async function handleSso(): Promise<void> {
    setOpeningSso(true);
    const result = await requestSsoUrlAction(serviceId);
    setOpeningSso(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    if (!result.sso) {
      // Sprint 15C.II Fase C round 6: AdminDriftBanner es admin-only
      // por ubicación → usa keys `.admin` directamente con CTA
      // operacional (recovery via reconcile / SSO).
      const key =
        result.errorCode === 'INVALID_STATE'
          ? 'sso.error.invalid_state.admin'
          : result.errorCode === 'CIRCUIT_OPEN'
            ? 'sso.error.circuit_open.admin'
            : 'sso.error.provider_internal.admin';
      toast('error', t(key));
      return;
    }
    window.open(result.sso.url, '_blank', 'noopener,noreferrer');
  }

  async function executeReprovision(): Promise<void> {
    setConfirmReprovisionOpen(false);
    setReprovisioning(true);
    const result = await reprovisionServiceAction(serviceId);
    if (!result.ok) {
      setReprovisioning(false);
      toast('error', t('service.drift.admin_banner.reprovision_error'));
      return;
    }
    toast('success', t('service.drift.admin_banner.reprovision_success'));
    // Sprint 15C.II Fase C round 3 (smoke real Yasmin 2026-05-10): el
    // job provisioning corre async (típicamente 1-5 segundos contra
    // el proveedor real, hasta 30-60s con retries). El primer
    // `router.refresh()` post-toast NO veía aún el resultado porque
    // el worker no había terminado. Auto-refresh secuencial: refresh
    // inmediato (para ver `status=provisioning` del reset round 2) +
    // refresh diferido a 5s (para ver el resultado del job — success
    // o failure). El admin ve progresión natural sin tener que
    // recargar manualmente. El bloqueo del botón se mantiene hasta
    // el segundo refresh para evitar dobles pulsaciones durante la
    // ventana del job.
    router.refresh();
    setTimeout(() => {
      router.refresh();
      setReprovisioning(false);
    }, 5000);
  }

  return (
    <AlertBanner
      variant="warning"
      title={t('service.drift.admin_banner.title')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13 }}>{statusReason}</p>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {hasSsoPanel && (
            <Button
              variant="secondary"
              onClick={() => void handleSso()}
              disabled={openingSso}
            >
              {openingSso
                ? 'Abriendo…'
                : panelLabel
                  ? `${t('service.drift.admin_banner.cta_investigate')} (${t(panelLabel)})`
                  : t('service.drift.admin_banner.cta_investigate')}
            </Button>
          )}
          {showReprovision && (
            <Button
              variant="primary"
              onClick={() => setConfirmReprovisionOpen(true)}
              disabled={reprovisioning}
              title={t('service.drift.admin_banner.reprovision_help')}
            >
              {reprovisioning
                ? 'Enqueueing…'
                : t('service.drift.admin_banner.reprovision_cta')}
            </Button>
          )}
          {showReconcile && pluginSlug && (
            <Button
              variant="primary"
              onClick={() =>
                router.push(`/admin/settings/plugins/${pluginSlug}`)
              }
              title={t('service.drift.admin_banner.reconcile_help')}
            >
              {t('service.drift.admin_banner.reconcile_cta')}
            </Button>
          )}
        </div>
      </div>
      {/* Sprint 15C.II Fase C round 5: Modal DS canónico (UI_SPEC §4.2)
          reemplaza window.confirm nativo. Mismo patrón heredable que
          ActionsBar. */}
      {confirmReprovisionOpen && (
        <Modal
          open={true}
          onClose={() => setConfirmReprovisionOpen(false)}
          title={t('service.drift.admin_banner.reprovision_cta')}
          size="sm"
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => setConfirmReprovisionOpen(false)}
              >
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void executeReprovision()}>
                Confirmar re-aprovisión
              </Button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            ¿Re-aprovisionar este servicio contra el proveedor con la
            metadata actual del producto? La cola provisioning lo procesará
            en segundos. Si el proveedor reporta fallo permanente
            (ej. INVALID_PAYLOAD por configuración del producto incompleta),
            el service quedará marcado como cancelled.
          </p>
        </Modal>
      )}
    </AlertBanner>
  );
}
