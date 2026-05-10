/**
 * ServiceHeader — Sprint 11 Fase 11.D (ADR-070 §"Patrón de página").
 *
 * Header normalizado de la página de detalle del service (cliente +
 * admin). Renderiza `info.display` + Badge de estado + (cuando aplique)
 * `info.statusReason` discriminado por rol.
 *
 * Sprint 15C.II Fase C (UI_SPEC §4.13 + ADR-083 Amendment A4.3 — frozen
 * 2026-05-10): patrón doctrinal heredable para todos los plugins SaaS
 * (15D RC, 15E Docker, 15G Plesk). Cuando `info.status` ∈ {`unknown`,
 * `failed`} con `info.statusReason` no nulo:
 *
 *   - **Cliente**: NO se renderiza el `statusReason` técnico crudo
 *     (violaba UI_SPEC §1.2 P5 "voz Aelium" — el cliente veía mensajes
 *     tipo `subscription not found in Enhance (drift detected)` sin
 *     saber qué hacer). Se reemplaza por una línea genérica empática
 *     con i18n key `service.drift.client_generic`. La página cliente
 *     adicionalmente oculta SSO + DNS cards porque clickearlas con
 *     metadata corrupta produce errores `action.provider_error`.
 *
 *   - **Admin**: tampoco se renderiza aquí — la página admin lo muestra
 *     ARRIBA del MetricsBar a través de `<AdminDriftBanner>` (AlertBanner
 *     warning con `statusReason` técnico crudo + CTA SSO + botón
 *     Re-aprovisionar). El admin necesita la información literal para
 *     diagnosticar.
 *
 *   - **Estado canónico no se modifica** (DH-INV-6 ADR-082: el sistema
 *     externo gana en conflicto operacional, Aelium NO auto-corrige).
 *
 * Componente presentacional puro — sin auth, sin fetch. Server-component
 * compatible: NO añade `'use client'`.
 */
import { Badge } from '../../components/ui';
import { t } from '../i18n';
import type { ServiceInfo } from '../../lib/api';
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE } from './service-status';

interface ServiceHeaderProps {
  info: ServiceInfo;
  productName: string;
  /**
   * `true` si el viewer es staff (set canónico
   * `provisioning.controller.ts ADMIN_ROLES`). El SC parent lo deriva
   * con `isStaffRole(session.user.role.slug)` desde `getServerSession()`.
   * Default `false` por seguridad — el cliente nunca ve `statusReason`
   * técnico crudo aunque el caller olvide pasar el flag.
   */
  isAdmin?: boolean;
}

const DRIFT_STATUSES = new Set<ServiceInfo['status']>(['unknown', 'failed']);

export function ServiceHeader({
  info,
  productName,
  isAdmin = false,
}: ServiceHeaderProps) {
  const isDrift =
    DRIFT_STATUSES.has(info.status) && info.statusReason !== null && info.statusReason !== undefined;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            wordBreak: 'break-word',
          }}
        >
          {info.display.primary}
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 14,
            marginTop: 6,
          }}
        >
          {info.display.secondary ? t(info.display.secondary) : productName}
        </p>

        {/*
          Cliente con drift: mensaje genérico empático (i18n key
          `service.drift.client_generic`). Anti-patrón eliminado:
          renderizar `info.statusReason` técnico al cliente
          (UI_SPEC §4.13). Admin no muestra nada aquí porque el
          AlertBanner upstream tiene la responsabilidad — evita
          duplicar info técnica en dos sitios de la página.
        */}
        {isDrift && !isAdmin && (
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              marginTop: 8,
            }}
          >
            {t('service.drift.client_generic')}
          </p>
        )}

        {/*
          Estados no-drift (active, suspended, etc.) con statusReason:
          se renderiza el statusReason traducido a ambos roles porque
          aporta contexto operativo (ej. `payment_pending`) que no es
          técnico crudo. Patrón heredable: si el plugin emite una key
          `*.status_reason.*` y el status no está en DRIFT_STATUSES,
          se asume safe-for-client.
        */}
        {!isDrift && info.statusReason && (
          <p
            style={{
              color: 'var(--text-tertiary)',
              fontSize: 13,
              marginTop: 8,
              fontStyle: 'italic',
            }}
          >
            {t(info.statusReason)}
          </p>
        )}
      </div>
      <div style={{ flex: 'none', alignSelf: 'center' }}>
        <Badge variant={SERVICE_STATUS_TONE[info.status]}>
          {SERVICE_STATUS_LABEL[info.status]}
        </Badge>
      </div>
    </div>
  );
}
