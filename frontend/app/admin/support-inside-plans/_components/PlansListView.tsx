'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Table } from '../../../components/ui';
import type { BadgeVariant, TableColumn } from '../../../components/ui';
import type { SupportInsideAdminPlanRow } from '../../../lib/api';
import { fmtCurrency } from '../../../_shared/billing/invoice-status-map';
import s from '../page.module.css';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activo', variant: 'success' },
  inactive: { label: 'Inactivo', variant: 'neutral' },
  deprecated: { label: 'Obsoleto', variant: 'danger' },
};

function fmtRelative(date: string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 30) return `hace ${diffDays} días`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `hace ${months} mes${months > 1 ? 'es' : ''}`;
  }
  const years = Math.floor(diffDays / 365);
  return `hace ${years} año${years > 1 ? 's' : ''}`;
}

function yearlySavingsPct(monthly: string | null, yearly: string | null): number | null {
  if (!monthly || !yearly) return null;
  const fullYear = Number(monthly) * 12;
  const yearlyPrice = Number(yearly);
  if (fullYear === 0) return null;
  return Math.round(((fullYear - yearlyPrice) / fullYear) * 100);
}

interface Props {
  plans: SupportInsideAdminPlanRow[];
}

export default function PlansListView({ plans }: Props) {
  const router = useRouter();

  const columns: TableColumn<SupportInsideAdminPlanRow>[] = [
    {
      key: 'name',
      header: 'Plan',
      render: (p) => (
        <div>
          <Link
            href={`/admin/support-inside-plans/${p.slug}`}
            style={{
              color: 'var(--text-primary)',
              fontWeight: 'var(--font-weight-medium)',
              fontSize: 'var(--font-size-sm)',
              textDecoration: 'none',
            }}
          >
            {p.name}
          </Link>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            {p.slug}
          </p>
        </div>
      ),
    },
    {
      key: 'pricing_monthly',
      header: 'Mensual',
      render: (p) =>
        p.pricing_monthly ? (
          <span className={s.priceCell}>
            {fmtCurrency(p.pricing_monthly, p.currency)}
          </span>
        ) : (
          <span className={`${s.priceCell} ${s.priceMissing}`}>—</span>
        ),
    },
    {
      key: 'pricing_yearly',
      header: 'Anual',
      render: (p) => {
        if (!p.pricing_yearly) {
          return <span className={`${s.priceCell} ${s.priceMissing}`}>—</span>;
        }
        const savings = yearlySavingsPct(p.pricing_monthly, p.pricing_yearly);
        return (
          <span className={s.priceCell}>
            {fmtCurrency(p.pricing_yearly, p.currency)}
            {savings !== null && savings > 0 && (
              <span className={s.savingsBadge}>−{savings}%</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'slots',
      header: 'Slots incluidos',
      render: (p) => (
        <span className={s.muted}>
          {p.slots_included === 0
            ? 'Ninguno'
            : `${p.slots_included} slot${p.slots_included > 1 ? 's' : ''}`}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      width: '110px',
      render: (p) => {
        const m = STATUS_MAP[p.status] || STATUS_MAP.inactive;
        return <Badge variant={m.variant}>{m.label}</Badge>;
      },
    },
    {
      key: 'updated_at',
      header: 'Última edición',
      render: (p) => <span className={s.muted}>{fmtRelative(p.updated_at)}</span>,
    },
  ];

  return (
    <Table<SupportInsideAdminPlanRow>
      columns={columns}
      data={plans}
      rowKey={(p) => p.id}
      onRowClick={(p) => router.push(`/admin/support-inside-plans/${p.slug}`)}
      emptyTitle="Sin planes Support Inside"
      emptyDescription="No hay planes seedeados. Ejecuta `pnpm seed` desde el backend."
    />
  );
}
