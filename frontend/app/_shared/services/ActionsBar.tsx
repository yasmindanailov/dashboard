'use client';

/**
 * ActionsBar — Sprint 11 Fase 11.D (ADR-070 §C — acciones curadas inline).
 * Sprint 13 §13.AUTH Fase E (Modelo A): Server Action executeServiceActionAction.
 * Sprint 15C Fase 15C.E.2 (ADR-077 Amendment A3 §A3.5) — filter `adminOnly`
 * con prop `isAdmin` derivada server-side por el caller (SC). El backend
 * wrapper sigue siendo defense-in-depth (HTTP 403 + audit + evento
 * `service.action_admin_only_violation`); este filter es UX para no
 * mostrar al cliente un botón que recibiría 403 si lo pulsara.
 *
 * Sprint 15C Fase 15C.J (2026-05-09): blacklist `INTERNAL_HELPER_SLUGS`
 * para slugs que el backend declara como `inlineActions` por necesidad
 * del contrato canónico (ADR-077) pero que NO deben renderizarse como
 * botones standalone — son helpers operados desde modales/UI custom
 * admin-only en sus respectivas páginas (`/admin/services/[id]`).
 *
 * Sprint 15C.II Fase C round 5 (smoke real Yasmin 2026-05-10):
 * `window.confirm()` nativo del browser → componente DS `<Modal>` con
 * confirmación reforzada (UI_SPEC §4.2). El nativo browser no respeta
 * el design system (z-index, focus trap, theming, a11y) y reportaba
 * "modal del navegador, no de nuestra UI" como bug visual.
 *
 * Renderiza los `info.availableActions` del plugin como botones. Cada
 * acción dispara executeAction con confirmación cuando aplique. El
 * resultado del plugin se muestra en línea (success.message o
 * data.logs_tail). Cache se invalida por el wrapper canónico backend
 * (ADR-077 §5).
 *
 * Plugins triviales `internal` y `manual` declaran `availableActions=[]`
 * → este componente NO se renderiza por ellos. Si tras filtrar por
 * `adminOnly` + helpers internos la lista queda vacía, también se oculta.
 */
import { useState } from 'react';
import { Button, Card, Modal, useToast } from '../../components/ui';
import { t } from '../i18n';
import type { ServiceAction } from '../../lib/api';
import { executeServiceActionAction } from './_actions';

/**
 * Slugs operados desde UI custom (modales o páginas dedicadas), NO botones
 * standalone. Acoplamiento bajo (string array hardcoded — vale la pena
 * v1 vs introducir un nuevo flag `hidden_in_actions_bar` en el contrato
 * canónico ProvisionerPlugin solo por esto).
 *
 * Sprint 15C Fase 15C.J — ADR-083 §6 decisión 30 + Amendment A3:
 *   - `change_package`        — operado vía `ChangePackageModal` en
 *                               `/admin/services/[id]/_components/`.
 *   - `list_available_plans`  — helper interno del modal change_package
 *                               (alimenta el dropdown). NO acción
 *                               standalone que el admin pulse.
 *
 * Sprint 15C Fase 15C.I (cierre — bug detectado en smoke 2026-05-10):
 *   - `list_dns_records`      — la zona DNS se gestiona desde la UI canónica
 *                               `/dashboard/services/[id]/dns` (Sprint 15C
 *                               Fase G). El slug existe en el manifest
 *                               por contrato (ADR-077 Amendment A1.3
 *                               required si `has_dns_management=true`)
 *                               pero como botón standalone es redundante
 *                               con la página dedicada y la ejecución sin
 *                               payload form rompe (`INVALID_PAYLOAD`).
 *   - `add_dns_record` / `update_dns_record` / `delete_dns_record` —
 *                               idem. La UI canónica `DnsRecordsManager`
 *                               provee form completo + validación por
 *                               kind. Inline button sin form solo puede
 *                               fallar.
 *
 * Sprint 15C.II Fase E — ADR-083 Amendment A5.1:
 *   - `recalculate_provider_metrics` (renombrada desde `force_resync`) —
 *                               operación admin de power-user ("pide al
 *                               proveedor que recalcule disco/ancho-de-banda
 *                               en su lado"). Vive en
 *                               `AdminServiceOperationsCard` con etiquetado
 *                               preciso (progressive disclosure), NO como
 *                               botón standalone en la barra genérica de
 *                               "Acciones rápidas" — su semántica se confunde
 *                               con el ↻ Refrescar del MetricsBar y con la
 *                               reconciliación periódica si no tiene contexto.
 *
 * Si llega un futuro plugin con un slug que también deba ocultarse,
 * añadir aquí + documentar el motivo inline.
 */
const INTERNAL_HELPER_SLUGS = new Set<string>([
  'change_package',
  'list_available_plans',
  'recalculate_provider_metrics',
  'list_dns_records',
  'add_dns_record',
  'update_dns_record',
  'delete_dns_record',
]);

/**
 * Sprint 15C.II Fase C round 6 (smoke real Yasmin 2026-05-10) — keys
 * i18n discriminadas por rol (UI_SPEC §1.2 P5 voz Aelium + P6 contenido
 * adaptativo). Backend wrapper retorna keys "base" tipo
 * `action.invalid_state` (sin sufijo); el frontend les añade el sufijo
 * `.client` o `.admin` según el viewer. Solo aplica a códigos donde
 * el cliente NO debe ver la jerga técnica del admin (drift, recovery
 * actions, etc). Para `action.invalid_payload` / `action.provider_error`
 * / `action.circuit_open` los mensajes ya son neutros y safe-for-client
 * (declarados sin variantes desde Fase I).
 */
const ROLE_DISCRIMINATED_KEYS = new Set<string>(['action.invalid_state']);

function selectMessageKey(rawKey: string, isAdmin: boolean): string {
  if (ROLE_DISCRIMINATED_KEYS.has(rawKey)) {
    return `${rawKey}.${isAdmin ? 'admin' : 'client'}`;
  }
  return rawKey;
}

interface ActionsBarProps {
  serviceId: string;
  actions: readonly ServiceAction[];
  /**
   * `true` si el usuario actual es staff (superadmin / agent_full /
   * agent_billing / agent_support). El SC parent lo deriva con
   * `isStaffRole(session.user.role.slug)` desde `getServerSession()`.
   * Coincide con el set canónico que enforce el backend wrapper
   * (`provisioning.controller.ts` `ADMIN_ROLES`).
   */
  isAdmin: boolean;
  /** Callback opcional invocado cuando una action acaba (success o fail). */
  onActionExecuted?: () => void;
}

interface PendingConfirm {
  action: ServiceAction;
  confirmText: string;
}

export function ActionsBar({
  serviceId,
  actions,
  isAdmin,
  onActionExecuted,
}: ActionsBarProps) {
  // Sprint 15C Fase 15C.I: feedback de acciones via toast canónico
  // (UI_SPEC §4.3 — esquina superior derecha, efímero 5s).
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  // Sprint 15C.II Fase C round 5: state local para Modal DS
  // confirmación reforzada (reemplaza window.confirm nativo). El modal
  // se renderiza al final del Card, controlado por `pendingConfirm`.
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingConfirm | null>(null);

  // ADR-077 Amendment A3.5 patrón canónico — filter declarativo por flag,
  // NUNCA por slug (eso rompería ADR-070 "cero `if (provisioner === 'X')`").
  // El segundo filter (INTERNAL_HELPER_SLUGS, Sprint 15C Fase J) es la
  // ÚNICA excepción canónica documentada: slugs operados desde UI admin
  // custom específica (modal) que el contrato declara por necesidad pero
  // no deben aparecer como botones standalone. Ver doc inline arriba.
  const visibleActions = actions
    .filter((a) => !a.adminOnly || isAdmin)
    .filter((a) => !INTERNAL_HELPER_SLUGS.has(a.slug));

  if (visibleActions.length === 0) return null;

  const onAction = (action: ServiceAction) => {
    if (action.confirmRequired) {
      const text = action.confirmationText
        ? t(action.confirmationText)
        : `¿Confirmar acción "${t(action.label)}"?`;
      setPendingConfirm({ action, confirmText: text });
      return;
    }
    void executeNow(action);
  };

  const executeNow = async (action: ServiceAction): Promise<void> => {
    setPendingConfirm(null);
    const localizedLabel = t(action.label);
    setRunning(action.slug);
    /*
     * Acciones triviales sin payload — futuros plugins con
     * payloadSchema definirán formularios inline propios (Sprint 15+).
     */
    const result = await executeServiceActionAction(serviceId, action.slug, {});
    setRunning(null);

    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    if (result.result.success) {
      const successMsg = result.result.message
        ? t(selectMessageKey(result.result.message, isAdmin))
        : `${localizedLabel}: completada.`;
      toast('success', successMsg);
    } else {
      const warnMsg = result.result.message
        ? t(selectMessageKey(result.result.message, isAdmin))
        : `${localizedLabel}: no se completó.`;
      toast('error', warnMsg);
    }
    onActionExecuted?.();
  };

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>
        Acciones rápidas
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {visibleActions.map((action) => (
          <Button
            key={action.slug}
            onClick={() => onAction(action)}
            disabled={running === action.slug}
            variant={action.destructive ? 'danger' : 'secondary'}
            title={action.description ? t(action.description) : undefined}
          >
            {running === action.slug ? 'Ejecutando…' : t(action.label)}
          </Button>
        ))}
      </div>

      {/* Sprint 15C.II Fase C round 5: Modal DS canónico de confirmación
          reforzada (UI_SPEC §4.2). Reemplaza window.confirm() nativo del
          browser que no respetaba design system (z-index, focus trap,
          theming, a11y heredada de Modal componente). Patrón heredable a
          15D RC, 15E Docker, 15G Plesk. */}
      {pendingConfirm && (
        <Modal
          open={true}
          onClose={() => setPendingConfirm(null)}
          title={t(pendingConfirm.action.label)}
          size="sm"
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => setPendingConfirm(null)}
              >
                Cancelar
              </Button>
              <Button
                variant={
                  pendingConfirm.action.destructive ? 'danger' : 'primary'
                }
                onClick={() => void executeNow(pendingConfirm.action)}
              >
                Confirmar
              </Button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {pendingConfirm.confirmText}
          </p>
        </Modal>
      )}
    </Card>
  );
}
