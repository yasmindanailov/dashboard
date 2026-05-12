/**
 * /admin/settings/plugins/[slug] — Sprint 15A Fase I.1 (ADR-080 §7).
 *
 * Server Component que carga el detalle del plugin (manifest + config +
 * secrets enmascarados + circuit state) y delega al CC `PluginConfigForm`
 * para el form dinámico construido con `@rjsf/core` + tema DS.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { AdminPluginDetail } from '../../../../lib/api';
import {
  serverFetch,
  ServerFetchError,
} from '../../../../lib/server-auth';
import { t } from '../../../../_shared/i18n';
import { PluginStatusBadge } from '../../../../_shared/plugins/PluginStatusBadge';

import { PluginOperationalOverview } from '../../../../_shared/plugins/PluginOperationalOverview';

import { PluginConfigForm } from './_components/PluginConfigForm';
import { ReconcileAllButton } from './_components/ReconcileAllButton';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AdminPluginDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let detail: AdminPluginDetail;
  try {
    detail = await serverFetch<AdminPluginDetail>(`/admin/plugins/${slug}`);
  } catch (err) {
    if (err instanceof ServerFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }

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
                  Actualizado{' '}
                  {new Date(detail.updated_at).toLocaleString('es-ES')}
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

      {/*
        Sprint 15C.II Fase F.2 (ADR-083 Amendment A4.4) — resumen operativo
        del plugin (`<PluginOperationalOverview>`, reusable/heredable):
        badge de salud + stats grid + última/próxima reconciliación + tabla
        de drifts 24 h. Server Component autocontenido — si su fetch falla
        degrada con aviso inline sin romper el resto de la página.
      */}
      <PluginOperationalOverview slug={detail.slug} />

      {/*
        Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1) — botón
        "↻ Reconciliar todos los servicios contra <Plugin> ahora" para
        plugins con capabilities.supports_reconciliation = true. Solo se
        renderiza si está habilitado el plugin (sino reconcile no aplica)
        + el plugin declara la capability. Heredable a 15D RC + 15E + 15G.
      */}
      {detail.enabled && detail.manifest && (
        <PluginReconcileSection slug={detail.slug} />
      )}

      <PluginConfigForm detail={detail} />
    </div>
  );
}

/**
 * Sub-sección operativa del plugin con el botón de reconcile-all. Server
 * Component que delega al CC `<ReconcileAllButton>`. Inserto la card aquí
 * para mantener `page.tsx` con foco SC + delegación a CC para la
 * interactividad (patrón canónico Sprint 13 §13.AUTH Modelo A).
 */
function PluginReconcileSection({ slug }: { slug: string }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {t('admin.plugins.reconcile_all.section_title')}
        </h2>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            margin: '4px 0 0',
            maxWidth: 540,
          }}
        >
          {t('admin.plugins.reconcile_all.section_description')}
        </p>
      </div>
      <ReconcileAllButton slug={slug} />
    </section>
  );
}
