'use client';

/**
 * AppShortcutButton — Sprint 15C.II Fase F.10 (ADR-077 Amendment A9 +
 * ADR-083 Amendment A9).
 *
 * Client Component que renderiza UN atajo a una app CMS instalada
 * (WordPress / Joomla / futuros). Invoca la server action canónica
 * `openAppAdminAction(serviceId, appId)` → recibe `{ url, appKind, urlKind }`
 * → abre `url` en pestaña nueva via `window.open(url, '_blank')`.
 *
 * Doctrina:
 *   - **Capability-driven (ADR-070):** padre `<AppShortcutsCard>` (SC) le
 *     pasa `hasOpenAction: boolean` derivado de `app.actions.length > 0`.
 *     Si `false` → botón renderiza disabled con tooltip + CTA al panel
 *     (caso canónico WP sin default user — getDefaultWpSsoUser 404).
 *   - **Estado UX:** loading mientras la action está in-flight; bloquea
 *     re-click (idempotencia client-side). Error → toast/aria-live message.
 *   - **L16:** componente compartido cliente + admin. La discriminación
 *     `isAdmin` solo aporta el tooltip extra para `urlKind: 'canonical'`
 *     informando "te pedirá login" (Joomla URL canónica) vs `'sso'` (WP
 *     auto-login).
 */
import { useState, useTransition } from 'react';

import { Button } from '../../components/ui';
import { t } from '../../_shared/i18n';
import {
  openAppAdminAction,
  type OpenAppAdminResult,
} from './_actions';

interface AppShortcutButtonProps {
  serviceId: string;
  appId: string;
  /** i18n key del label de la app (ej. `'plugin.enhance_cp.apps.wordpress'`). */
  labelKey: string;
  /**
   * Subdirectorio opcional para el sufijo del label (ej. `'blog'` → `"WordPress (/blog)"`).
   * Si ausente o `'/'`, no se añade sufijo.
   */
  path?: string;
  /** Versión instalada (informativo, display-only). */
  version?: string;
  /**
   * Si la action `'open_app_admin'` está disponible para esta instalación.
   * `false` → botón disabled con tooltip + CTA "Abrir panel". Caso canónico:
   * WordPress sin default SSO user configurado.
   */
  hasOpenAction: boolean;
  /**
   * URL SSO al panel del proveedor (passed-through del padre que ya tiene
   * `<SsoButton>` o equivalente). Si `hasOpenAction === false` y este URL
   * existe, se muestra como CTA fallback. Si ambos faltan, solo el tooltip.
   */
  ssoPanelFallbackHref?: string;
  /** L16: extras admin (tooltip enriquecido). Display-only. */
  isAdmin?: boolean;
}

export function AppShortcutButton({
  serviceId,
  appId,
  labelKey,
  path,
  version,
  hasOpenAction,
  ssoPanelFallbackHref,
  isAdmin = false,
}: AppShortcutButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const baseLabel = t(labelKey);
  const pathSuffix = path && path !== '/' ? ` (/${path.replace(/^\//, '')})` : '';
  const buttonLabel = `${t('service.apps.open_app_admin.label_prefix')}${baseLabel}${pathSuffix}`;

  function handleClick() {
    if (!hasOpenAction || isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      const result: OpenAppAdminResult = await openAppAdminAction(
        serviceId,
        appId,
      );
      if (result.ok && result.success === true) {
        // window.open con noopener+noreferrer (security best-practice —
        // la nueva ventana no recibe window.opener referenciando este dashboard).
        const opened = window.open(
          result.data.url,
          '_blank',
          'noopener,noreferrer',
        );
        if (!opened) {
          // Browser bloqueó popup; fallback: navegar en la misma pestaña
          // como link puro (poco probable porque el click es síncrono al
          // gesto del usuario, pero defensive).
          setErrorMessage(t('service.apps.error_opening'));
        }
        return;
      }
      if (result.ok && result.success === false) {
        setErrorMessage(result.message ?? t('service.apps.error_opening'));
        return;
      }
      setErrorMessage(result.error);
    });
  }

  // Estado disabled (WP sin default user — hasOpenAction false).
  if (!hasOpenAction) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 0',
        }}
      >
        <Button
          variant="secondary"
          disabled
          title={t('service.apps.disabled_no_default_user')}
          aria-disabled="true"
        >
          {buttonLabel}
        </Button>
        {version && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('service.apps.version_prefix')}
            {version}
          </span>
        )}
        {ssoPanelFallbackHref && (
          <a
            href={ssoPanelFallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: 'var(--brand)',
              textDecoration: 'none',
            }}
          >
            {t('service.apps.disabled_no_default_user.cta_label')} →
          </a>
        )}
      </div>
    );
  }

  // Estado enabled — botón activo.
  // Tooltip enriquecido para admin: distingue SSO real (WP) vs URL canónica
  // (Joomla — el cliente entra con sus credenciales). El frontend NO sabe
  // el urlKind hasta DESPUÉS del click (el plugin lo decide on-demand),
  // así que el tooltip pre-click es genérico; el toast post-click sí lo
  // refleja (futuro). Defaulting a SSO description (el caso típico).
  const ssoTitle = t('service.apps.open_app_admin.title.sso');
  const adminTitle = isAdmin ? ssoTitle : undefined;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
      }}
    >
      <Button
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        title={adminTitle}
      >
        {isPending ? t('service.apps.opening_tooltip') : buttonLabel}
      </Button>
      {version && (
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {t('service.apps.version_prefix')}
          {version}
        </span>
      )}
      {errorMessage && (
        <span
          role="alert"
          aria-live="polite"
          style={{ fontSize: 13, color: 'var(--danger)' }}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}
