import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/* ═══════════════════════════════════════
   DashboardService — Role-aware overview stats
   Single endpoint that returns role-specific metrics
   per UI_SPEC.md §2.3 stats-per-role table.

   | Rol     | Stat 1              | Stat 2                | Stat 3             | Stat 4           |
   |---------|---------------------|-----------------------|--------------------|------------------|
   | Cliente | Servicios activos   | Factura pendiente (€) | Próx. renovación   | Tickets abiertos |
   | Agente  | Chats esperando     | Tickets sin responder | Tareas hoy         | —                |
   | Admin   | Clientes activos    | Ingresos totales      | Facturas vencidas  | Tickets abiertos |
   | Partner | Clientes referidos  | Comisiones del mes    | Próx. liquidación  | —                |

   Ref: UI_SPEC.md §2.3, ROADMAP.md D26
   ═══════════════════════════════════════ */

// ── Response types per role ──

export interface AdminOverview {
  role: 'admin';
  active_clients: number;
  total_revenue: number;
  overdue_invoices: number;
  open_tickets: number;
  waiting_agent: number;
  pending_amount: number;
}

export interface ClientOverview {
  role: 'client';
  active_services: number;
  pending_invoice_amount: number;
  next_renewal: string | null; // ISO date or null
  open_tickets: number;
}

export interface AgentOverview {
  role: 'agent';
  waiting_chats: number;
  unanswered_tickets: number;
  tasks_today: number;
}

export interface PartnerOverview {
  role: 'partner';
  referred_clients: number;
  commissions_this_month: number;
  next_settlement: string | null; // ISO date or null
}

export type OverviewStats = AdminOverview | ClientOverview | AgentOverview | PartnerOverview;

const ADMIN_ROLES = ['superadmin', 'agent_full'];
const AGENT_ROLES = ['agent_billing', 'agent_support'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get role-specific overview stats.
   * Each role gets exactly the metrics defined in UI_SPEC §2.3.
   */
  async getOverviewStats(userId: string, roleSlug: string): Promise<OverviewStats> {
    if (ADMIN_ROLES.includes(roleSlug)) {
      return this.getAdminOverview();
    }
    if (AGENT_ROLES.includes(roleSlug)) {
      return this.getAgentOverview(userId);
    }
    if (roleSlug === 'partner' || roleSlug === 'partner_pending') {
      return this.getPartnerOverview(userId);
    }
    // Default: client
    return this.getClientOverview(userId);
  }

  // ── Admin: global platform health ──
  private async getAdminOverview(): Promise<AdminOverview> {
    const [
      activeClients,
      paidRevenue,
      overdueCount,
      pendingAmount,
      openTickets,
      waitingAgent,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: { status: 'active', role: { slug: 'client' } },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'paid' },
        _sum: { total: true },
      }),
      this.prisma.invoice.count({
        where: { status: 'overdue' },
      }),
      this.prisma.invoice.aggregate({
        where: { status: { in: ['pending', 'overdue'] } },
        _sum: { total: true },
      }),
      this.prisma.conversation.count({
        where: { status: { in: ['open', 'waiting_client', 'waiting_agent'] } },
      }),
      this.prisma.conversation.count({
        where: { status: 'waiting_agent' },
      }),
    ]);

    return {
      role: 'admin',
      active_clients: activeClients,
      total_revenue: Number(paidRevenue._sum.total ?? 0),
      overdue_invoices: overdueCount,
      pending_amount: Number(pendingAmount._sum.total ?? 0),
      open_tickets: openTickets,
      waiting_agent: waitingAgent,
    };
  }

  // ── Client: personal service health ──
  private async getClientOverview(userId: string): Promise<ClientOverview> {
    const [
      activeServices,
      pendingInvoices,
      nextRenewal,
      openTickets,
    ] = await this.prisma.$transaction([
      // Servicios activos
      this.prisma.service.count({
        where: { user_id: userId, status: 'active' },
      }),
      // Factura pendiente (€)
      this.prisma.invoice.aggregate({
        where: { user_id: userId, status: { in: ['pending', 'overdue'] } },
        _sum: { total: true },
      }),
      // Próxima renovación (earliest next_due_date from active services)
      this.prisma.service.findFirst({
        where: {
          user_id: userId,
          status: 'active',
          next_due_date: { not: null, gte: new Date() },
        },
        orderBy: { next_due_date: 'asc' },
        select: { next_due_date: true },
      }),
      // Tickets abiertos
      this.prisma.conversation.count({
        where: {
          user_id: userId,
          status: { in: ['open', 'waiting_client', 'waiting_agent'] },
        },
      }),
    ]);

    return {
      role: 'client',
      active_services: activeServices,
      pending_invoice_amount: Number(pendingInvoices._sum.total ?? 0),
      next_renewal: nextRenewal?.next_due_date?.toISOString() ?? null,
      open_tickets: openTickets,
    };
  }

  // ── Agent: workload overview ──
  private async getAgentOverview(agentId: string): Promise<AgentOverview> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      waitingChats,
      unansweredTickets,
      tasksToday,
    ] = await this.prisma.$transaction([
      // Chats esperando agente
      this.prisma.conversation.count({
        where: { type: 'chat', status: 'waiting_agent' },
      }),
      // Tickets sin primera respuesta
      this.prisma.conversation.count({
        where: {
          type: 'ticket',
          status: { in: ['open', 'waiting_agent'] },
          first_response_at: null,
        },
      }),
      // Tareas de hoy (asignadas a este agente, pendientes, vencen hoy)
      this.prisma.task.count({
        where: {
          assigned_to: agentId,
          status: { in: ['pending', 'in_progress'] },
          OR: [
            { due_date: { gte: today, lt: tomorrow } },
            { due_date: null }, // No due date = always pending
          ],
        },
      }),
    ]);

    return {
      role: 'agent',
      waiting_chats: waitingChats,
      unanswered_tickets: unansweredTickets,
      tasks_today: tasksToday,
    };
  }

  // ── Partner: referral & commission overview ──
  private async getPartnerOverview(partnerId: string): Promise<PartnerOverview> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      referredClients,
      commissionInvoices,
    ] = await this.prisma.$transaction([
      // Clientes referidos (users with partner_id = this partner)
      this.prisma.user.count({
        where: { partner_id: partnerId, status: 'active', role: { slug: 'client' } },
      }),
      // Comisiones del mes (paid invoices from referred clients this month)
      this.prisma.invoice.aggregate({
        where: {
          partner_id: partnerId,
          status: 'paid',
          paid_at: { gte: startOfMonth },
        },
        _sum: { total: true },
      }),
    ]);

    // For commissions, apply the partner_commission_pct from product
    // For simplicity, use total * avg commission rate
    // In production this would be a dedicated commissions table
    const rawTotal = Number(commissionInvoices._sum.total ?? 0);
    // Default 10% commission — actual calculation would use per-product pct
    const estimatedCommission = rawTotal * 0.10;

    return {
      role: 'partner',
      referred_clients: referredClients,
      commissions_this_month: Math.round(estimatedCommission * 100) / 100,
      next_settlement: null, // TODO: implement settlement schedule
    };
  }
}
