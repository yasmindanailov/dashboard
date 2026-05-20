/**
 * SslStatusCard — Sprint 15C.II Fase F.7 (ADR-077 Amendment A7 + ADR-083 A8).
 *
 * Renderiza el estado del certificado SSL/TLS que el plugin expone vía
 * `ServiceInfo.ssl?`. Read-only — para renovar/cambiar el cert el usuario
 * va al panel del proveedor vía SSO (ADR-082 DH-INV-6 — Aelium no
 * gestiona el cert).
 *
 * Doctrina:
 *   - **Capability-driven (ADR-070):** el caller renderiza este card SOLO
 *     si `info.ssl !== undefined`. Si pasa `info.ssl` undefined el card
 *     devuelve `null` defensivo, pero el wire en la página debe hacerlo
 *     explícito (`{info.ssl && <SslStatusCard ssl={info.ssl} />}`).
 *   - **NO ramifica por strings** (issuer, statusReason, etc.) — solo por
 *     `ssl.status` y `ssl.autoRenew`. El plugin es la autoridad; el
 *     frontend respeta su clasificación canónica (A7.5).
 *   - **L16 (Fase F.3 doctrina F):** un solo componente `_shared/` con
 *     prop `isAdmin?: boolean`. Cliente y admin renderizan el mismo card;
 *     admin gana extras display-only (tooltip con fecha exacta + CTA SSO).
 *   - **R3 (refinamiento pre-código):** `status='none'` muestra el card
 *     visible (badge gris + texto informativo) — NO AlertBanner aparte
 *     (UI_SPEC §4.3 — es estado del recurso, no aviso ortogonal).
 *   - **Server-component compatible:** sin hooks, sin estado, sin Server
 *     Actions. La página puede renderizarlo desde un Server Component sin
 *     `'use client'` (mismo patrón que `<MetricsBar>` pure).
 *   - **i18n:** strings vía `t()` del módulo `_shared/i18n` (Sprint 15C
 *     Fase 15C.I). La función `formatRelativeExpiry` devuelve el sufijo
 *     dinámico (días/horas) y se compone con el prefijo i18n.
 */
import type { ReactNode } from 'react';

import { Badge, SectionCard, type BadgeVariant } from '../../components/ui';
import { t } from '../../_shared/i18n';
import type { ServiceSslStatus, ServiceSslSummary } from '../../lib/api';
import styles from './service-detail.module.css';

interface SslStatusCardProps {
  ssl: ServiceSslSummary;
  /**
   * Si `true`, renderiza extras admin (tooltip con `expiresAt` ISO exacto
   * en el badge + CTA "Gestionar SSL en el panel del proveedor" si
   * `ssoPanelHref` se provee). Default `false` (cliente). L16.
   */
  isAdmin?: boolean;
  /**
   * URL SSO al panel del proveedor para que el admin gestione el cert
   * (renovar, reemplazar, force_https). Si ausente, no se renderiza el
   * CTA (capability-driven: plugin/instancia sin SSO, o `hasSsoPanel=false`).
   * Solo se respeta cuando `isAdmin === true`.
   */
  ssoPanelHref?: string;
}

const STATUS_TO_BADGE_VARIANT: Record<ServiceSslStatus, BadgeVariant> = {
  valid: 'success',
  expiring_soon: 'warning',
  expired: 'danger',
  none: 'neutral',
};

const STATUS_TO_LABEL_KEY: Record<ServiceSslStatus, string> = {
  valid: 'service.ssl.status.valid',
  expiring_soon: 'service.ssl.status.expiring_soon',
  expired: 'service.ssl.status.expired',
  none: 'service.ssl.status.none',
};

/**
 * "expira en N días" / "expira hoy" / "expira en menos de 1 hora" / "caducó
 * hace N días". Formato relativo amigable estilo GitHub / Stripe. El
 * cálculo es display-only — la clasificación de status la hace el plugin.
 * Devuelve un string libre (no i18n key) — se compone con el prefijo i18n
 * en `buildPrimaryMessage`.
 */
function formatRelativeExpiry(iso: string | undefined): string {
  if (!iso) return t('service.ssl.message.fallback_when');
  const expiry = new Date(iso).getTime();
  if (!Number.isFinite(expiry)) return t('service.ssl.message.fallback_when');
  const diffMs = expiry - Date.now();
  const absMs = Math.abs(diffMs);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneHourMs = 60 * 60 * 1000;

  if (diffMs < 0) {
    if (absMs < oneHourMs) return 'hace menos de 1 hora';
    if (absMs < oneDayMs) return `hace ${Math.round(absMs / oneHourMs)} h`;
    return `hace ${Math.round(absMs / oneDayMs)} días`;
  }
  if (diffMs < oneHourMs) return 'en menos de 1 hora';
  if (diffMs < oneDayMs) return `en ${Math.round(diffMs / oneHourMs)} h`;
  return `en ${Math.round(diffMs / oneDayMs)} días`;
}

function buildPrimaryMessage(ssl: ServiceSslSummary): string {
  switch (ssl.status) {
    case 'valid':
      return `${t('service.ssl.message.valid_prefix')}${formatRelativeExpiry(
        ssl.expiresAt,
      )}.`;
    case 'expiring_soon':
      return `${t(
        'service.ssl.message.expiring_soon_prefix',
      )}${formatRelativeExpiry(ssl.expiresAt)}.`;
    case 'expired':
      return t('service.ssl.message.expired');
    case 'none':
      return t('service.ssl.message.none');
  }
}

export function SslStatusCard({
  ssl,
  isAdmin = false,
  ssoPanelHref,
}: SslStatusCardProps): ReactNode {
  const badgeVariant = STATUS_TO_BADGE_VARIANT[ssl.status];
  const statusLabel = t(STATUS_TO_LABEL_KEY[ssl.status]);
  const primary = buildPrimaryMessage(ssl);

  // Tooltip admin con la fecha exacta ISO — formato local es-ES para
  // legibilidad operativa. Cliente NO ve el tooltip (default browser
  // ignora `title` ausente).
  const badgeTitle =
    isAdmin && ssl.expiresAt
      ? `${t('service.ssl.expires_tooltip_prefix')}${new Date(
          ssl.expiresAt,
        ).toLocaleString('es-ES')}`
      : undefined;

  return (
    <SectionCard
      title={t('service.ssl.card_title')}
      actions={
        <span title={badgeTitle}>
          <Badge variant={badgeVariant}>{statusLabel}</Badge>
        </span>
      }
    >
      <p className={styles.cardText}>{primary}</p>

      {ssl.autoRenew === true && (
        <p className={styles.cardTextMuted}>{t('service.ssl.auto_renew_on')}</p>
      )}
      {ssl.autoRenew === false && (
        <p className={styles.cardTextMuted}>{t('service.ssl.auto_renew_off')}</p>
      )}

      {ssl.issuer && (
        <p className={styles.cardTextSubtle}>
          {t('service.ssl.issuer_prefix')}
          {ssl.issuer}
        </p>
      )}

      {isAdmin && ssoPanelHref && (
        <p className={styles.cardText}>
          <a
            href={ssoPanelHref}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ctaText}
          >
            {t('service.ssl.admin_cta_manage_in_provider')}
          </a>
        </p>
      )}
    </SectionCard>
  );
}
