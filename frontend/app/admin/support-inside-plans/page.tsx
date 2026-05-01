'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import {
  supportInsideApi,
  type SupportInsideAdminPlanRow,
} from '../../lib/api';
import { fmtCurrency } from '../../_shared/billing/invoice-status-map';
import { getErrorMessage } from '../../lib/error';
import {
  Badge,
  ListPage,
  Table,
  useToast,
  type TableColumn,
  type BadgeVariant,
} from '../../components/ui';
import s from './page.module.css';

/* ═══════════════════════════════════════
   /admin/support-inside-plans — índice (Sprint 8 Fase D · 8.D.6)
   Tabla vertical con 3 filas. Click → editor /admin/support-inside-plans/<slug>.
   NO formato comparador (eso es vista cliente — ADR-075 §B.2).
   ═══════════════════════════════════════ */

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

export default function SupportInsidePlansAdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<SupportInsideAdminPlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('access_token') || ''
      : '';

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await supportInsideApi.adminList(token);
      setPlans(res);
    } catch (err) {
      toast(
        'error',
        getErrorMessage(err) || 'No se pudieron cargar los planes Support Inside.',
      );
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!user) return null;

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
          <p
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-tertiary)',
              marginTop: '2px',
            }}
          >
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

  const Icon = (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={s.introIcon}
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );

  return (
    <ListPage
      title="Support Inside · Planes"
      subtitle="Gestiona los 3 planes de cuenta. Cada plan se edita por separado para evitar afectar suscripciones activas."
    >
      <div className={s.intro}>
        {Icon}
        <p className={s.introBody}>
          Los 3 planes (Básico, Medium, Pro) son fijos: se siembran como
          configuración canónica. Aquí puedes ajustar precios, canales, slots y
          SLAs sin tocar el CRUD genérico de productos. Para añadir un cuarto
          plan se requiere migración + ADR específico (ADR-075 §A.3).
        </p>
      </div>

      <Table<SupportInsideAdminPlanRow>
        columns={columns}
        data={plans}
        rowKey={(p) => p.id}
        loading={loading}
        skeletonRows={3}
        onRowClick={(p) => router.push(`/admin/support-inside-plans/${p.slug}`)}
        emptyTitle="Sin planes Support Inside"
        emptyDescription="No hay planes seedeados. Ejecuta `pnpm seed` desde el backend."
      />
    </ListPage>
  );
}
