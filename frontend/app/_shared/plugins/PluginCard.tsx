import Link from 'next/link';

import { Card } from '../../components/ui';
import { t } from '../i18n';
import type { AdminPluginListItem } from '../../lib/api';

import { PluginStatusBadge } from './PluginStatusBadge';

/**
 * PluginCard — Sprint 15A Fase H.1 (ADR-080 §7).
 *
 * Card del listado `/admin/settings/plugins`. Muestra:
 *   - label (i18n key del manifest, fallback al slug si manifest=null).
 *   - description corta.
 *   - settingsCategory + version del manifest.
 *   - PluginStatusBadge con enabled + circuit_state.
 *   - Link al detalle `/admin/settings/plugins/[slug]`.
 *
 * Si `manifest` es null (caso edge: plugin enabled en DB pero rechazado
 * por validación contract al boot), muestra estado de error inline para
 * que el superadmin sepa qué slug investigar en logs.
 */

interface Props {
  item: AdminPluginListItem;
}

export function PluginCard({ item }: Props) {
  const { slug, manifest, enabled, circuit_state } = item;

  if (!manifest) {
    return (
      <Card padding="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{slug}</h3>
            <PluginStatusBadge enabled={enabled} circuitState={circuit_state} />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Plugin sin manifest válido. Revisa los logs del boot para ver por
            qué fue rechazado por contract validation.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Link
      href={`/admin/settings/plugins/${slug}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <Card padding="md" variant="interactive">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {t(manifest.label)}
            </h3>
            <PluginStatusBadge enabled={enabled} circuitState={circuit_state} />
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--text-secondary)',
              minHeight: '2.6em',
            }}
          >
            {t(manifest.description)}
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
              {slug}
            </span>
            <span aria-hidden="true">·</span>
            <span>{manifest.settingsCategory}</span>
            <span aria-hidden="true">·</span>
            <span>v{manifest.version}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
