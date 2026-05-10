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

import { PluginConfigForm } from './_components/PluginConfigForm';

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

      <PluginConfigForm detail={detail} />
    </div>
  );
}
