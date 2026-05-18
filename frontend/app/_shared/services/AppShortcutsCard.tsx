/**
 * AppShortcutsCard — Sprint 15C.II Fase F.10 (ADR-077 Amendment A9 +
 * ADR-083 Amendment A9).
 *
 * Renderiza atajos al admin de las apps CMS instaladas dentro del recurso
 * del proveedor (WordPress / Joomla / futuros). Lee del shape genérico
 * `ServiceInfo.apps?: AppPresence[]` — capability-driven por presencia
 * (mismo molde A5/A6/A7/A8 — SslStatusCard F.7 / metrics).
 *
 * Doctrina:
 *   - **Capability-driven (ADR-070):** el caller renderiza este card SOLO
 *     si `info.apps !== undefined && info.apps.length > 0`. Si pasa `apps`
 *     vacío o undefined el card devuelve `null` defensivo, pero el wire
 *     en la página debe hacerlo explícito.
 *   - **L16 (Fase F.3 doctrina F):** un solo componente `_shared/` con
 *     prop `isAdmin?: boolean`. Cliente y admin renderizan los mismos
 *     atajos; admin gana tooltip extra discriminando SSO real vs URL
 *     canónica (passed-through al `<AppShortcutButton>` interno).
 *   - **Server-component:** sin hooks, sin estado, sin Server Actions
 *     directos. Los Client Components (`<AppShortcutButton>`) manejan
 *     onClick + server actions. Mismo patrón que `<SslStatusCard>` SC
 *     con extras del admin via prop drilling.
 *   - **Multi-instancia:** N atajos diferenciados por `appId+path`. La
 *     diferenciación visual la hace cada botón con el sufijo `(path)`
 *     en su label.
 *   - **i18n:** strings vía `t()` del módulo `_shared/i18n`. Los labels
 *     de los kinds son i18n keys plugin-internas
 *     (`'plugin.enhance_cp.apps.wordpress'`, etc.) — el plugin las
 *     declara, el frontend las traduce.
 *   - **R6 audit per-app (ADR-077 A9.7):** el audit no se hace aquí —
 *     vive en el orquestador backend (`ProvisioningService.executeActionForUser`
 *     añade `audit_access_log.metadata.app_id` cuando admin sobre service
 *     ajeno). Frontend NO toca audit.
 */
import type { ReactNode } from 'react';

import { Card } from '../../components/ui';
import { t } from '../../_shared/i18n';
import type { AppPresence } from '../../lib/api';

import { AppShortcutButton } from './AppShortcutButton';

interface AppShortcutsCardProps {
  apps: readonly AppPresence[];
  serviceId: string;
  /**
   * L16: extras admin (tooltip enriquecido en los botones, passed-through).
   * Default `false` (cliente). Display-only — la doctrina de seguridad
   * (admin actuando sobre service ajeno) vive en el backend.
   */
  isAdmin?: boolean;
  /**
   * URL SSO al panel del proveedor (passed-through al `<AppShortcutButton>`
   * disabled fallback). Si el cliente NO tiene default WP user configurado,
   * el botón disabled muestra CTA "Abrir panel" usando este href. Si ausente
   * (plugin sin SSO o `hasSsoPanel=false`), solo se muestra el tooltip.
   */
  ssoPanelFallbackHref?: string;
}

export function AppShortcutsCard({
  apps,
  serviceId,
  isAdmin = false,
  ssoPanelFallbackHref,
}: AppShortcutsCardProps): ReactNode {
  if (!apps || apps.length === 0) {
    // Defensive: el caller debe gatear, pero si se pasa vacío no rompemos.
    return null;
  }

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px 0' }}>
        {t('service.apps.card_title')}
      </h2>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {apps.map((app) => {
          // Determinar si la action 'open_app_admin' está disponible para
          // esta instalación (canónico: WP con default user, Joomla
          // siempre, kinds futuros según declaren).
          const hasOpenAction = app.actions.some(
            (action) => action.slug === 'open_app_admin',
          );

          // Key compuesta appId+path para multi-instancia (N WP en mismo
          // website con diferentes paths).
          const key = `${app.appId}|${app.path ?? '/'}`;

          return (
            <AppShortcutButton
              key={key}
              serviceId={serviceId}
              appId={app.appId}
              labelKey={app.label}
              path={app.path}
              version={app.version}
              hasOpenAction={hasOpenAction}
              ssoPanelFallbackHref={ssoPanelFallbackHref}
              isAdmin={isAdmin}
            />
          );
        })}
      </div>
    </Card>
  );
}
