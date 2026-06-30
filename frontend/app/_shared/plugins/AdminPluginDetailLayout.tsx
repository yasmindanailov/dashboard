/**
 * AdminPluginDetailLayout — Sprint 15C.II Fase F.12 (layout canónico, UI_SPEC §5.19).
 *
 * Shell presentacional del detalle de plugin (`/admin/settings/plugins/[slug]`):
 * breadcrumb + detail header (label + descripción + metadata inline +
 * `<PluginStatusBadge>`) + `<PluginOperationalOverview>` + slot de reconcile +
 * slot del config form. El page es un wrapper fino que fetcha
 * `GET /admin/plugins/:slug` y delega aquí.
 *
 * **Cero cambio funcional** (F.12.2): JSX portado literal del `page.tsx` previo.
 * Los componentes route-local interactivos (`PluginConfigForm`,
 * `ReconcileAllButton`) se inyectan como slots `ReactNode` (Amendment II) —
 * evita que `_shared/` dependa de `app/admin/settings/plugins/[slug]/_components/`,
 * mismo principio que `extraSections` en el detalle de servicio.
 * Server-component compatible.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { AdminPluginDetail } from '../../lib/api';
import { t } from '../i18n';
import { PluginOperationalOverview } from './PluginOperationalOverview';
import { PluginStatusBadge } from './PluginStatusBadge';

interface AdminPluginDetailLayoutProps {
  detail: AdminPluginDetail;
  /** Sección reconcile-all (route-local CC). `null` si el plugin no aplica. */
  reconcileSlot: ReactNode;
  /** Config form dinámico rjsf (route-local CC). */
  configFormSlot: ReactNode;
}

export function AdminPluginDetailLayout({
  detail,
  reconcileSlot,
  configFormSlot,
}: AdminPluginDetailLayoutProps) {
  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <Link
          href="/admin/settings/plugins"
          style={{ color: 'var(--text-secondary)' }}
        >
          ← Volver a Plugins
        </Link>
      </div>

      <header
        style={{
          marginBottom: 24,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            {t(detail.manifest.label)}
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 14,
              marginTop: 4,
              maxWidth: 720,
            }}
          >
            {t(detail.manifest.description)}
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginTop: 8,
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
              {detail.slug}
            </span>
            <span aria-hidden="true">·</span>
            <span>{detail.manifest.settingsCategory}</span>
            <span aria-hidden="true">·</span>
            <span>v{detail.manifest.version}</span>
            {detail.updated_at && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Actualizado {new Date(detail.updated_at).toLocaleString('es-ES')}
                </span>
              </>
            )}
          </div>
        </div>
        <PluginStatusBadge
          enabled={detail.enabled}
          circuitState={detail.circuit_state}
        />
      </header>

      {/* El resumen operativo (servicios/reconciliación/drifts/circuit) es
          provisioner-céntrico. Los proveedores IA (ADR-080 Amendment D) no
          aprovisionan servicios → se omite; su detalle es config + credenciales. */}
      {detail.manifest.settingsCategory !== 'ai' && (
        <PluginOperationalOverview slug={detail.slug} />
      )}

      {reconcileSlot}

      {configFormSlot}
    </div>
  );
}
