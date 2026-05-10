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
import { Button, Card, useToast } from '../../components/ui';
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
 * Si llega un futuro plugin con un slug que también deba ocultarse,
 * añadir aquí + documentar el motivo inline.
 */
const INTERNAL_HELPER_SLUGS = new Set<string>([
  'change_package',
  'list_available_plans',
  'list_dns_records',
  'add_dns_record',
  'update_dns_record',
  'delete_dns_record',
]);

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

export function ActionsBar({
  serviceId,
  actions,
  isAdmin,
  onActionExecuted,
}: ActionsBarProps) {
  // Sprint 15C Fase 15C.I: feedback de acciones via toast canónico
  // (UI_SPEC §4.3 — esquina superior derecha, efímero 5s). Antes Sprint 11
  // Fase 11.D usaba feedback inline en la card; ese patrón violaba la
  // doctrina canónica. Ahora consistente con DnsRecordsManager + el resto
  // del frontend (productos, billing, support).
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);

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

  const onAction = async (action: ServiceAction) => {
    const localizedLabel = t(action.label);
    if (action.confirmRequired) {
      const text = action.confirmationText
        ? t(action.confirmationText)
        : `¿Confirmar acción "${localizedLabel}"?`;
      if (!window.confirm(text)) return;
    }

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
        ? t(result.result.message)
        : `${localizedLabel}: completada.`;
      toast('success', successMsg);
    } else {
      const warnMsg = result.result.message
        ? t(result.result.message)
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
    </Card>
  );
}
