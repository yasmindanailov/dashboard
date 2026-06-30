/**
 * /admin/settings/plugins/[slug] — Sprint 15A Fase I.1 (ADR-080 §7).
 *
 * Sprint 15C.II Fase F.12 (layout canónico — UI_SPEC §5.19): wrapper fino que
 * fetcha `GET /admin/plugins/:slug` y delega en `<AdminPluginDetailLayout>`,
 * inyectando los CC route-local (`PluginConfigForm`, sección reconcile-all) como
 * slots `ReactNode` (Amendment II — evita acoplar `_shared/` a la ruta).
 */

import { notFound } from 'next/navigation';

import type { AdminPluginDetail } from '../../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import { t } from '../../../../_shared/i18n';
import { AdminPluginDetailLayout } from '../../../../_shared/plugins/AdminPluginDetailLayout';

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
    <AdminPluginDetailLayout
      detail={detail}
      reconcileSlot={
        detail.enabled &&
        detail.manifest &&
        detail.manifest.settingsCategory !== 'ai' ? (
          <PluginReconcileSection slug={detail.slug} />
        ) : null
      }
      configFormSlot={<PluginConfigForm detail={detail} />}
    />
  );
}

/**
 * Sub-sección operativa del plugin con el botón de reconcile-all. Server
 * Component que delega al CC `<ReconcileAllButton>`. Vive en la ruta (no en
 * `_shared/`) porque usa el CC route-local; se inyecta como slot en el layout
 * (patrón canónico SC + delegación a CC — Sprint 13 §13.AUTH Modelo A).
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
