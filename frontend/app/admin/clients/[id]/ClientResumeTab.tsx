'use client';

import {
  CreditCard,
  Globe,
  type LucideIcon,
  MessageCircle,
  Shield,
} from 'lucide-react';
import { IconWell, type IconWellTone } from '../../../components/ui';
import type {
  ClientBillingStats,
  ClientDetail,
  ClientServiceItem,
  Tab,
} from './types';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   Client Resume Tab (F4·U22) — 4 stat-cards accionables (D10 Amendment:
   StatsCards en detalle con KPIs accionables) + banner "Requiere atención"
   + Cuenta + Perfil.
   ═══════════════════════════════════════ */

interface Props {
  client: ClientDetail;
  services: ClientServiceItem[];
  billingStats: ClientBillingStats | null;
  supportOpen: number;
  supportTotal: number;
  onNavigateTab: (tab: Tab) => void;
}

function StatCard({
  label,
  icon: Icon,
  tone,
  value,
  sub,
  subClass,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  tone: IconWellTone;
  value: string;
  sub?: string;
  subClass?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={styles.statCard}>
      <div className={styles.statTop}>
        <span className={styles.statLabel}>{label}</span>
        <IconWell icon={Icon} tone={tone} size="sm" />
      </div>
      <div className={styles.statValue}>{value}</div>
      {sub && (
        <div className={`${styles.statSub} ${subClass ?? ''}`}>{sub}</div>
      )}
    </button>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={mono ? styles.infoValueMono : styles.infoValue}>{value}</span>
    </div>
  );
}

export default function ClientResumeTab({
  client,
  services,
  billingStats,
  supportOpen,
  supportTotal,
  onNavigateTab,
}: Props) {
  const activeServices = services.filter((s) => s.status === 'active').length;
  const suspendedServices = services.filter((s) => s.status === 'suspended').length;
  const pendingAmount = billingStats?.pending_amount ?? 0;
  const pendingCount = billingStats?.pending_count ?? 0;
  const si = client.support_inside_subscription;
  const siActive = si?.status === 'active';
  const cfg = si?.product.support_inside_config;

  const needsAttention = pendingCount > 0 || suspendedServices > 0;
  const attentionParts: string[] = [];
  if (pendingCount > 0)
    attentionParts.push(
      `${pendingCount} factura${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''} de pago`,
    );
  if (suspendedServices > 0)
    attentionParts.push(
      `${suspendedServices} servicio${suspendedServices > 1 ? 's' : ''} suspendido${suspendedServices > 1 ? 's' : ''}`,
    );

  return (
    <>
      <div className={styles.statGrid}>
        <StatCard
          label="Servicios"
          icon={Globe}
          tone="neutral"
          value={`${activeServices} activo${activeServices === 1 ? '' : 's'}`}
          sub={
            suspendedServices > 0
              ? `${suspendedServices} suspendido${suspendedServices > 1 ? 's' : ''}`
              : `${services.length} en total`
          }
          subClass={suspendedServices > 0 ? styles.subWarn : undefined}
          onClick={() => onNavigateTab('servicios')}
        />
        <StatCard
          label="Por cobrar"
          icon={CreditCard}
          tone="warning"
          value={`${pendingAmount.toFixed(2)} €`}
          sub={
            pendingCount > 0
              ? `${pendingCount} factura${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''}`
              : 'Al día'
          }
          subClass={pendingCount > 0 ? styles.subWarn : styles.subOk}
          onClick={() => onNavigateTab('facturacion')}
        />
        <StatCard
          label="Soporte"
          icon={MessageCircle}
          tone="danger"
          value={`${supportOpen} abierta${supportOpen === 1 ? '' : 's'}`}
          sub={`${supportTotal} conversaci${supportTotal === 1 ? 'ón' : 'ones'}`}
          onClick={() => onNavigateTab('soporte')}
        />
        <StatCard
          label="Support Inside"
          icon={Shield}
          tone="brand"
          value={siActive ? si.product.name.replace(/^Support Inside\s*·?\s*/i, '') || si.product.name : 'Sin plan'}
          sub={
            siActive && cfg
              ? `SLA ${cfg.response_sla_hours} h · ${si.slots.length}/${cfg.slots_included} slots`
              : 'No contratado'
          }
          subClass={siActive ? styles.subBrand : undefined}
          onClick={() => onNavigateTab('servicios')}
        />
      </div>

      {needsAttention && (
        <div className={styles.attentionBanner}>
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.attentionIcon}
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className={styles.attentionText}>
            <strong>Requiere atención:</strong> {attentionParts.join(' · ')}
          </span>
        </div>
      )}

      <div className={styles.resumeGrid}>
        <div className={styles.infoCard}>
          <h2 className={styles.infoCardTitle}>Cuenta</h2>
          <div className={styles.infoStack}>
            <InfoRow label="Email" value={client.email} />
            <InfoRow
              label="Verificado"
              value={client.email_verified_at ? new Date(client.email_verified_at).toLocaleDateString('es-ES') : 'No'}
            />
            <InfoRow label="2FA" value={client.two_factor_enabled ? 'Activado' : 'Desactivado'} />
            <InfoRow
              label="Último acceso"
              value={client.last_login_at ? new Date(client.last_login_at).toLocaleString('es-ES') : 'Nunca'}
            />
            <InfoRow label="IP último login" value={client.last_login_ip || '—'} mono />
            <InfoRow label="Registrado" value={new Date(client.created_at).toLocaleDateString('es-ES')} />
          </div>
        </div>
        <div className={styles.infoCard}>
          <h2 className={styles.infoCardTitle}>Perfil</h2>
          <div className={styles.infoStack}>
            <InfoRow label="Tipo" value={client.client_profile?.client_type === 'company' ? 'Empresa' : 'Particular'} />
            <InfoRow label="Teléfono" value={client.client_profile?.phone || '—'} />
            <InfoRow label="NIF/CIF" value={client.client_profile?.tax_id || '—'} mono />
            <InfoRow label="Dirección" value={client.client_profile?.address_line1 || '—'} />
            <InfoRow
              label="Ciudad"
              value={
                client.client_profile?.city
                  ? `${client.client_profile.city}${client.client_profile.postal_code ? ` · ${client.client_profile.postal_code}` : ''}`
                  : '—'
              }
            />
            <InfoRow label="Saldo" value={`${client.client_profile?.credit_balance || '0.00'} €`} />
          </div>
        </div>
      </div>
    </>
  );
}
