'use client';

/**
 * ServiceActionsMenu — Sprint 15C.II Fase F.12.5 (Amendment VII).
 *
 * Menú "Más acciones" (⋯) único del header del detalle de servicio. Consolida
 * en un solo `<Dropdown>` profesional (ítems con descripción de contexto):
 *   - **quick-actions** del plugin (`info.availableActions` ya filtradas) que se
 *     ejecutan inline vía `executeServiceActionAction` (+ modal de confirmación
 *     reforzada §4.2 cuando la action lo pide).
 *   - **acciones admin inyectadas** (`extraItems` + `extraModals`) — cambiar
 *     plan / reenviar notificación / suspender / cancelar. El wrapper admin
 *     (`<AdminServiceActionsMenu>`) las provee + posee el estado de sus modales;
 *     este componente solo renderiza el menú y los modales como slot (evita
 *     acoplar `_shared/` a `app/admin/` — mismo patrón que `extraSections`).
 *
 * Sustituye al antiguo `<ServiceActionCluster>` ⋯ + la tab "Gestión" (card
 * Operaciones + DangerZone): todas las operaciones admin viven aquí (Regla D5
 * "destructivas en menú contextual" + cada una abre su modal de confirmación).
 *
 * Devuelve `null` si no hay ningún ítem (ej. cliente terminal sin acciones).
 */
import { useState, type ReactNode } from 'react';

import {
  Button,
  Dropdown,
  Modal,
  useToast,
  type DropdownItem,
} from '../../components/ui';
import { t } from '../i18n';
import type { ServiceAction } from '../../lib/api';
import { executeServiceActionAction } from './_actions';

interface ServiceActionsMenuProps {
  serviceId: string;
  isAdmin: boolean;
  /** Quick-actions del plugin ya filtradas por el caller (adminOnly + blacklist). */
  quickActions: readonly ServiceAction[];
  /** Ítems admin adicionales (cambiar plan / reenviar / suspender / cancelar). */
  extraItems?: DropdownItem[];
  /** Modales admin (controlados por el wrapper que provee `extraItems`). */
  extraModals?: ReactNode;
}

interface PendingConfirm {
  action: ServiceAction;
  confirmText: string;
}

const ROLE_DISCRIMINATED_KEYS = new Set<string>(['action.invalid_state']);

function selectMessageKey(rawKey: string, isAdmin: boolean): string {
  return ROLE_DISCRIMINATED_KEYS.has(rawKey)
    ? `${rawKey}.${isAdmin ? 'admin' : 'client'}`
    : rawKey;
}

function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ServiceActionsMenu({
  serviceId,
  isAdmin,
  quickActions,
  extraItems = [],
  extraModals,
}: ServiceActionsMenuProps) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

  const executeNow = async (action: ServiceAction): Promise<void> => {
    setPendingConfirm(null);
    const localizedLabel = t(action.label);
    setRunning(true);
    const result = await executeServiceActionAction(serviceId, action.slug, {});
    setRunning(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    if (result.result.success) {
      toast(
        'success',
        result.result.message
          ? t(selectMessageKey(result.result.message, isAdmin))
          : `${localizedLabel}: completada.`,
      );
    } else {
      toast(
        'error',
        result.result.message
          ? t(selectMessageKey(result.result.message, isAdmin))
          : `${localizedLabel}: no se completó.`,
      );
    }
  };

  const onAction = (action: ServiceAction) => {
    if (action.confirmRequired) {
      setPendingConfirm({
        action,
        confirmText: action.confirmationText
          ? t(action.confirmationText)
          : `¿Confirmar acción "${t(action.label)}"?`,
      });
      return;
    }
    void executeNow(action);
  };

  const quickItems: DropdownItem[] = quickActions.map((action) => ({
    label: t(action.label),
    description: action.description ? t(action.description) : undefined,
    danger: action.destructive,
    onClick: () => onAction(action),
  }));

  const items: DropdownItem[] = [...quickItems, ...extraItems];
  if (items.length === 0) return null;

  return (
    <>
      <Dropdown
        align="right"
        triggerAsChild
        trigger={
          <Button variant="secondary" disabled={running}>
            {t('service.detail.actions.more')} <ChevronDown />
          </Button>
        }
        items={items}
      />

      {pendingConfirm && (
        <Modal
          open
          onClose={() => setPendingConfirm(null)}
          title={t(pendingConfirm.action.label)}
          size="sm"
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setPendingConfirm(null)}>
                No, volver
              </Button>
              <Button
                variant={pendingConfirm.action.destructive ? 'danger' : 'primary'}
                onClick={() => void executeNow(pendingConfirm.action)}
              >
                Sí, continuar
              </Button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {pendingConfirm.confirmText}
          </p>
        </Modal>
      )}

      {extraModals}
    </>
  );
}
