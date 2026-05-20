'use client';

/**
 * ServiceActionCluster — Sprint 15C.II Fase F.12.4 (layout canónico, Amendment IV).
 *
 * Clúster de acciones del header del detalle de servicio (Regla D2: 1 primaria
 * + máx 2 secundarias + resto en menú ⋯). Consolida los botones que antes
 * estaban dispersos por las cards:
 *   - **Primaria**: Abrir panel (SSO) — reusa `<SsoButton>`.
 *   - **Secundaria**: Gestionar DNS — `<Link>` + DS `<Button variant="secondary">`.
 *   - **Menú ⋯**: acciones rápidas/reversibles del plugin (`info.availableActions`
 *     ya filtradas por el caller), vía DS `<Dropdown>`. Reusa
 *     `executeServiceActionAction` + el modal de confirmación reforzada (§4.2)
 *     del patrón `<ActionsBar>`.
 *
 * Las operaciones admin consecuentes (cambiar plan / recalcular / suspender /
 * cancelar) NO viven aquí — están en la card "Operaciones" de la tab Gestión
 * (Amendment IV D4). Las acciones por-recurso (abrir app, refrescar métricas,
 * ver factura) viven en sus cards.
 *
 * El caller (`ServiceHeaderCard`, SC) resuelve qué primaria/secundaria/menú
 * mostrar según rol×estado y pasa los primitivos ya resueltos.
 */
import { useState } from 'react';
import Link from 'next/link';

import { Button, Dropdown, Modal, useToast } from '../../../components/ui';
import { t } from '../../i18n';
import type { ServiceAction } from '../../../lib/api';
import { executeServiceActionAction } from '../_actions';
import { SsoButton } from '../SsoButton';
import styles from '../service-detail.module.css';

interface ServiceActionClusterProps {
  serviceId: string;
  /** Etiqueta del panel SSO si hay primaria "Abrir panel"; `null` si no. */
  ssoPanelLabel: string | null;
  /** Href de gestión DNS si hay secundaria; `null` si no. */
  dnsHref: string | null;
  /** Acciones rápidas del plugin para el menú ⋯ (ya filtradas por el caller). */
  quickActions: readonly ServiceAction[];
  isAdmin: boolean;
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

export function ServiceActionCluster({
  serviceId,
  ssoPanelLabel,
  dnsHref,
  quickActions,
  isAdmin,
}: ServiceActionClusterProps) {
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

  const hasCluster =
    ssoPanelLabel !== null || dnsHref !== null || quickActions.length > 0;
  if (!hasCluster) return null;

  return (
    <div className={styles.headerActions}>
      {ssoPanelLabel !== null && (
        <SsoButton
          serviceId={serviceId}
          panelLabel={ssoPanelLabel}
          isAdmin={isAdmin}
        />
      )}

      {dnsHref !== null && (
        <Link href={dnsHref}>
          <Button variant="secondary">{t('service.detail.dns.cta')}</Button>
        </Link>
      )}

      {quickActions.length > 0 && (
        <Dropdown
          align="right"
          trigger={
            <Button variant="secondary" disabled={running}>
              {t('service.detail.actions.more')}
            </Button>
          }
          items={quickActions.map((action) => ({
            label: t(action.label),
            danger: action.destructive,
            onClick: () => onAction(action),
          }))}
        />
      )}

      {pendingConfirm && (
        <Modal
          open
          onClose={() => setPendingConfirm(null)}
          title={t(pendingConfirm.action.label)}
          size="sm"
          footer={
            <div
              style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
            >
              <Button
                variant="secondary"
                onClick={() => setPendingConfirm(null)}
              >
                No, volver
              </Button>
              <Button
                variant={
                  pendingConfirm.action.destructive ? 'danger' : 'primary'
                }
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
    </div>
  );
}
