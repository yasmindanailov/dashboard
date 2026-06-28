import { Injectable } from '@nestjs/common';
import type { RoleSlug } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/* ═══════════════════════════════════════════════════════════════
   AdminOverviewService — Dashboard ejecutivo del portal /admin (E7).

   Alimenta la landing `/admin` del mockup `admin/Inicio.dc.html` con tres
   bloques de salud de plataforma, agregados read-only sobre datos que YA
   existen (cero modelos nuevos):

     1. KPIs       — ingresos del mes (+MoM), clientes activos (+nuevos),
                     por cobrar vencido, SLA de soporte.
     2. Decisiones — feed "Requiere tu decisión": señales que un agente no
                     resuelve solo (facturas vencidas, 5xx, DLQ, SI sin
                     mantenimiento). Drift de configuración: diferido — no hay
                     estado de drift persistente (solo efímero por reconcile).
     3. Carga      — reparto de conversaciones abiertas por agente + presencia
                     (derivada de sesiones activas, no hay infra de presencia).

   Self-contained: solo depende de PrismaService (global vía CoreModule),
   espejo de DashboardService. El gate de rol (admin) vive en el controller.
   ═══════════════════════════════════════════════════════════════ */

const SLA_DEFAULT_HOURS = 24; // sin plan Support Inside
const SLA_WINDOW_DAYS = 30; // ventana de cómputo del cumplimiento
const SI_MAINTENANCE_STALE_DAYS = 60; // umbral "sin mantenimiento" del mockup
const PRESENCE_WINDOW_MINUTES = 10; // sesión usada hace <N min ⇒ "online"

const AGENT_ROLES: RoleSlug[] = [
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
];

const OPEN_CONVERSATION_STATUSES = [
  'open',
  'waiting_client',
  'waiting_agent',
] as const;

// ── Response shapes (contrato consumido por el frontend) ──

export interface AdminOverviewKpis {
  /** Ingresos cobrados este mes (suma de facturas `paid` con `paid_at` en mes). */
  revenue_this_month: number;
  revenue_prev_month: number;
  /** Variación mes contra mes en %; `null` si el mes anterior fue 0. */
  revenue_mom_pct: number | null;
  active_clients: number;
  new_clients_this_month: number;
  overdue_amount: number;
  overdue_count: number;
  /** Antigüedad (días) de la factura vencida más antigua; `null` si no hay. */
  oldest_overdue_days: number | null;
  /** % de tickets que cumplieron el SLA de 1ª respuesta (ventana 30d). */
  sla_compliance_pct: number | null;
  sla_breaches: number;
  /** Nº de tickets evaluados en la ventana (denominador del %). */
  sla_sample: number;
}

export type DecisionKind =
  | 'overdue_invoices'
  | 'errors_5xx'
  | 'dlq_jobs'
  | 'si_maintenance';

export interface DecisionSignal {
  kind: DecisionKind;
  count: number;
  /** Importe en € (solo `overdue_invoices`). */
  amount?: number;
  /** Antigüedad de la más antigua en días (solo `overdue_invoices`). */
  oldest_days?: number;
  /** Etiqueta del job más reciente en DLQ (solo `dlq_jobs`), p.ej. `provisioning-dispatch`. */
  sample?: string;
}

export interface TeamMemberLoad {
  user_id: string;
  name: string;
  role_slug: string;
  open_count: number;
  online: boolean;
}

export interface TeamLoad {
  members: TeamMemberLoad[];
  /** Máximo de conversaciones abiertas (para escalar las barras de saturación). */
  max_open: number;
}

@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 1. KPIs ──
  async getKpis(): Promise<AdminOverviewKpis> {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      revenueThisMonth,
      revenuePrevMonth,
      activeClients,
      newClients,
      overdueAgg,
      oldestOverdue,
    ] = await this.prisma.$transaction([
      this.prisma.invoice.aggregate({
        where: { status: 'paid', paid_at: { gte: startOfThisMonth } },
        _sum: { total: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: 'paid',
          paid_at: { gte: startOfPrevMonth, lt: startOfThisMonth },
        },
        _sum: { total: true },
      }),
      this.prisma.user.count({
        where: { status: 'active', role: { slug: 'client' } },
      }),
      this.prisma.user.count({
        where: {
          role: { slug: 'client' },
          created_at: { gte: startOfThisMonth },
        },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'overdue' },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.invoice.findFirst({
        where: { status: 'overdue' },
        orderBy: { due_date: 'asc' },
        select: { due_date: true },
      }),
    ]);

    const thisMonth = Number(revenueThisMonth._sum.total ?? 0);
    const prevMonth = Number(revenuePrevMonth._sum.total ?? 0);
    const momPct =
      prevMonth > 0
        ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100)
        : null;

    const oldestOverdueDays = oldestOverdue
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - oldestOverdue.due_date.getTime()) / 86_400_000,
          ),
        )
      : null;

    const sla = await this.computeSlaCompliance(now);

    return {
      revenue_this_month: thisMonth,
      revenue_prev_month: prevMonth,
      revenue_mom_pct: momPct,
      active_clients: activeClients,
      new_clients_this_month: newClients,
      overdue_amount: Number(overdueAgg._sum.total ?? 0),
      overdue_count: overdueAgg._count._all,
      oldest_overdue_days: oldestOverdueDays,
      sla_compliance_pct: sla.compliance,
      sla_breaches: sla.breaches,
      sla_sample: sla.sample,
    };
  }

  /**
   * Cumplimiento del SLA de 1ª respuesta sobre los tickets creados en la
   * ventana que YA fueron respondidos. El SLA por ticket es el del plan Support
   * Inside del cliente (`response_sla_hours`), o 24h por defecto.
   */
  private async computeSlaCompliance(
    now: Date,
  ): Promise<{ compliance: number | null; breaches: number; sample: number }> {
    const windowStart = new Date(now.getTime() - SLA_WINDOW_DAYS * 86_400_000);
    const tickets = await this.prisma.conversation.findMany({
      where: {
        type: 'ticket',
        created_at: { gte: windowStart },
        first_response_at: { not: null },
      },
      select: {
        created_at: true,
        first_response_at: true,
        user: {
          select: {
            support_inside_subscription: {
              select: {
                status: true,
                product: {
                  select: {
                    support_inside_config: {
                      select: { response_sla_hours: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    let breaches = 0;
    for (const t of tickets) {
      if (!t.first_response_at) continue;
      const sub = t.user?.support_inside_subscription;
      const slaHours =
        sub?.status === 'active' && sub.product.support_inside_config
          ? sub.product.support_inside_config.response_sla_hours
          : SLA_DEFAULT_HOURS;
      const responseMs = t.first_response_at.getTime() - t.created_at.getTime();
      if (responseMs > slaHours * 3_600_000) breaches++;
    }

    const sample = tickets.length;
    const compliance =
      sample > 0 ? Math.round(((sample - breaches) / sample) * 100) : null;
    return { compliance, breaches, sample };
  }

  // ── 2. Feed "Requiere tu decisión" ──
  async getDecisions(): Promise<DecisionSignal[]> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    const staleBefore = new Date(
      now.getTime() - SI_MAINTENANCE_STALE_DAYS * 86_400_000,
    );

    const [
      overdueAgg,
      oldestOverdue,
      errors5xx,
      dlqCount,
      recentDlq,
      siUnmaintained,
    ] = await this.prisma.$transaction([
      this.prisma.invoice.aggregate({
        where: { status: 'overdue' },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.invoice.findFirst({
        where: { status: 'overdue' },
        orderBy: { due_date: 'asc' },
        select: { due_date: true },
      }),
      this.prisma.errorLog.count({
        where: {
          created_at: { gte: oneHourAgo },
          metadata: { path: ['status'], gte: 500 },
        },
      }),
      this.prisma.failedJob.count({ where: { status: 'failed' } }),
      this.prisma.failedJob.findFirst({
        where: { status: 'failed' },
        orderBy: { created_at: 'desc' },
        select: { queue: true, name: true },
      }),
      // SI slots activos cuyo servicio no tiene mantenimiento en >60 días.
      this.prisma.supportInsideSlot.count({
        where: {
          released_at: null,
          service: {
            maintenance_logs: {
              none: { performed_at: { gte: staleBefore } },
            },
          },
        },
      }),
    ]);

    const signals: DecisionSignal[] = [];

    if (overdueAgg._count._all > 0) {
      signals.push({
        kind: 'overdue_invoices',
        count: overdueAgg._count._all,
        amount: Number(overdueAgg._sum.total ?? 0),
        oldest_days: oldestOverdue
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - oldestOverdue.due_date.getTime()) / 86_400_000,
              ),
            )
          : undefined,
      });
    }

    if (errors5xx > 0) {
      signals.push({ kind: 'errors_5xx', count: errors5xx });
    }

    if (dlqCount > 0) {
      signals.push({
        kind: 'dlq_jobs',
        count: dlqCount,
        sample: recentDlq?.name ?? recentDlq?.queue,
      });
    }

    if (siUnmaintained > 0) {
      signals.push({ kind: 'si_maintenance', count: siUnmaintained });
    }

    return signals;
  }

  // ── 3. Carga del equipo ──
  async getTeamLoad(): Promise<TeamLoad> {
    const onlineSince = new Date(Date.now() - PRESENCE_WINDOW_MINUTES * 60_000);

    // `Promise.all` (no `$transaction`): preserva el tipo preciso de `groupBy`
    // (dentro del array de transacción Prisma degrada `_count` a una unión).
    const [grouped, staff, onlineSessions] = await Promise.all([
      this.prisma.conversation.groupBy({
        by: ['assigned_agent_id'],
        where: {
          status: { in: [...OPEN_CONVERSATION_STATUSES] },
          assigned_agent_id: { not: null },
        },
        orderBy: { assigned_agent_id: 'asc' },
        _count: true,
      }),
      this.prisma.user.findMany({
        where: { status: 'active', role: { slug: { in: AGENT_ROLES } } },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          role: { select: { slug: true } },
        },
      }),
      this.prisma.session.findMany({
        where: {
          is_active: true,
          last_used_at: { gte: onlineSince },
          user: { role: { slug: { in: AGENT_ROLES } } },
        },
        select: { user_id: true },
        distinct: ['user_id'],
      }),
    ]);

    const loadByAgent = new Map<string, number>();
    for (const row of grouped) {
      if (row.assigned_agent_id) {
        loadByAgent.set(row.assigned_agent_id, row._count);
      }
    }
    const onlineIds = new Set(onlineSessions.map((s) => s.user_id));

    const members: TeamMemberLoad[] = staff
      .map((u) => ({
        user_id: u.id,
        name: `${u.first_name} ${u.last_name}`.trim(),
        role_slug: u.role.slug,
        open_count: loadByAgent.get(u.id) ?? 0,
        online: onlineIds.has(u.id),
      }))
      .sort((a, b) => b.open_count - a.open_count);

    const max_open = members.reduce((m, x) => Math.max(m, x.open_count), 0);

    return { members, max_open };
  }
}
