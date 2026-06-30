'use client';

import { useRouter } from 'next/navigation';
import { Globe, Layers, type LucideIcon, Package, Server, Shield } from 'lucide-react';
import { Badge, IconWell, Table } from '../../../components/ui';
import type { BadgeVariant, TableColumn } from '../../../components/ui';
import type { ClientDetail, ClientServiceItem } from './types';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   ClientServicesTab (F4·U22) — tabla de servicios del cliente + hero del plan
   Support Inside (tier + barra de slots). Datos eager desde el SC.
   ═══════════════════════════════════════ */

const TYPE_ICON: Record<string, LucideIcon> = {
  domain: Globe,
  hosting_web: Server,
  docker_service: Server,
  support_inside: Shield,
  custom_service: Layers,
};

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activo', variant: 'success' },
  suspended: { label: 'Suspendido', variant: 'warning' },
  pending: { label: 'En provisioning', variant: 'info' },
  provisioning: { label: 'En provisioning', variant: 'info' },
  cancelled: { label: 'Cancelado', variant: 'neutral' },
  terminated: { label: 'Terminado', variant: 'neutral' },
};

const TYPE_LABELS: Record<string, string> = {
  domain: 'Dominio',
  hosting_web: 'Hosting Web',
  docker_service: 'Docker Service',
  support_inside: 'Support Inside',
  we_do_it: 'We Do It',
  custom_service: 'Proyecto Custom',
};

function renewalLabel(expiresAt: string | null): string {
  if (!expiresAt) return '—';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return '—';
  const fmt = d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return d.getTime() < Date.now() ? `Venció ${fmt}` : `Renueva ${fmt}`;
}

interface Props {
  client: ClientDetail;
  services: ClientServiceItem[];
}

export default function ClientServicesTab({ client, services }: Props) {
  const router = useRouter();
  const si = client.support_inside_subscription;
  const siActive = si?.status === 'active';
  const cfg = si?.product.support_inside_config;
  const slotsUsed = si?.slots.length ?? 0;
  const slotsTotal = cfg?.slots_included ?? 0;
  const slotsPct =
    slotsTotal > 0 ? Math.min(100, Math.round((slotsUsed / slotsTotal) * 100)) : 0;

  const columns: TableColumn<ClientServiceItem>[] = [
    {
      key: 'service',
      header: 'Servicio',
      render: (s) => {
        const Icon = TYPE_ICON[s.product?.type ?? ''] ?? Package;
        return (
          <div className={styles.svcCell}>
            <IconWell icon={Icon} tone="neutral" size="md" />
            <div className={styles.svcText}>
              <div className={styles.svcName}>
                {s.label || s.domain || s.product?.name || 'Servicio'}
              </div>
              <div className={styles.svcProduct}>
                {s.product?.name ?? ''}
                {s.product?.type ? ` · ${TYPE_LABELS[s.product.type] ?? s.product.type}` : ''}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Estado',
      render: (s) => {
        const st = STATUS_MAP[s.status] ?? STATUS_MAP.cancelled;
        return <Badge variant={st.variant}>{st.label}</Badge>;
      },
    },
    {
      key: 'renewal',
      header: 'Renovación',
      align: 'right',
      render: (s) => (
        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {renewalLabel(s.expires_at)}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.stack}>
      <Table<ClientServiceItem>
        card
        columns={columns}
        data={services}
        rowKey={(s) => s.id}
        onRowClick={(s) => router.push(`/admin/services/${s.id}`)}
        emptyTitle="Sin servicios"
        emptyDescription="Este cliente todavía no tiene servicios contratados."
      />

      {siActive && cfg && (
        <div className={styles.siHero}>
          <div className={styles.siHeroMain}>
            <span className={styles.siHeroIcon}>
              <Shield size={22} strokeWidth={1.6} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.siHeroTitleRow}>
                <span className={styles.siHeroKicker}>{si.product.name}</span>
                <Badge variant="success">Activo</Badge>
              </div>
              <p className={styles.siHeroMeta}>
                Tier de cuenta · SLA {cfg.response_sla_hours} h · Prioridad{' '}
                {cfg.priority_tier}
              </p>
              <div className={styles.siHeroSlots}>
                <div className={styles.siHeroSlotsHead}>
                  <span>Slots de mantenimiento</span>
                  <span className={styles.siHeroSlotsCount}>
                    {slotsUsed} / {slotsTotal} usados
                  </span>
                </div>
                <div className={styles.siHeroBar}>
                  <div
                    className={styles.siHeroBarFill}
                    style={{ width: `${slotsPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
          <a
            href={`/admin/support-inside-plans/${si.product.slug}`}
            className={styles.siHeroBtn}
          >
            Gestionar slots →
          </a>
        </div>
      )}
    </div>
  );
}
