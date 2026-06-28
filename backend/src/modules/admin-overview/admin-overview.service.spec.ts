import { AdminOverviewService } from './admin-overview.service';
import type { PrismaService } from '../../core/database/prisma.service';

/**
 * Unit del AdminOverviewService (E7). Mockea PrismaService: `$transaction`
 * devuelve el array de resultados en orden, `Promise.all` resuelve los mocks
 * individuales. Se asierta la LÓGICA derivada (MoM %, antigüedad, breach de
 * SLA, filtrado del feed, orden/saturación del equipo), no las queries.
 */
function makePrisma() {
  return {
    $transaction: jest.fn(),
    invoice: { aggregate: jest.fn(), findFirst: jest.fn() },
    user: { count: jest.fn(), findMany: jest.fn() },
    conversation: { findMany: jest.fn(), groupBy: jest.fn() },
    errorLog: { count: jest.fn() },
    failedJob: { count: jest.fn(), findFirst: jest.fn() },
    supportInsideSlot: { count: jest.fn() },
    session: { findMany: jest.fn() },
  };
}

const DAY = 86_400_000;

describe('AdminOverviewService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminOverviewService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminOverviewService(prisma as unknown as PrismaService);
  });

  describe('getKpis', () => {
    it('calcula MoM %, antigüedad de la más vencida y SLA', async () => {
      const now = Date.now();
      prisma.$transaction.mockResolvedValue([
        { _sum: { total: 8420 } }, // ingresos este mes
        { _sum: { total: 7518 } }, // ingresos mes anterior
        142, // clientes activos
        6, // nuevos este mes
        { _sum: { total: 1240 }, _count: { _all: 5 } }, // vencidas
        { due_date: new Date(now - 12 * DAY) }, // la más antigua
      ]);
      // SLA: 2 tickets, uno cumple (1h) y otro incumple (30h > 24h default).
      prisma.conversation.findMany.mockResolvedValue([
        {
          created_at: new Date(now - 2 * DAY),
          first_response_at: new Date(now - 2 * DAY + 3_600_000),
          user: null,
        },
        {
          created_at: new Date(now - 3 * DAY),
          first_response_at: new Date(now - 3 * DAY + 30 * 3_600_000),
          user: null,
        },
      ]);

      const kpis = await service.getKpis();

      expect(kpis.revenue_this_month).toBe(8420);
      expect(kpis.revenue_mom_pct).toBe(12); // round((8420-7518)/7518*100)
      expect(kpis.active_clients).toBe(142);
      expect(kpis.new_clients_this_month).toBe(6);
      expect(kpis.overdue_amount).toBe(1240);
      expect(kpis.overdue_count).toBe(5);
      expect(kpis.oldest_overdue_days).toBe(12);
      expect(kpis.sla_sample).toBe(2);
      expect(kpis.sla_breaches).toBe(1);
      expect(kpis.sla_compliance_pct).toBe(50);
    });

    it('MoM % es null cuando el mes anterior fue 0', async () => {
      prisma.$transaction.mockResolvedValue([
        { _sum: { total: 500 } },
        { _sum: { total: null } }, // sin ingresos el mes anterior
        10,
        2,
        { _sum: { total: null }, _count: { _all: 0 } },
        null, // sin vencidas
      ]);
      prisma.conversation.findMany.mockResolvedValue([]); // sin tickets → compliance null

      const kpis = await service.getKpis();

      expect(kpis.revenue_mom_pct).toBeNull();
      expect(kpis.oldest_overdue_days).toBeNull();
      expect(kpis.sla_compliance_pct).toBeNull();
      expect(kpis.sla_sample).toBe(0);
    });
  });

  describe('getDecisions', () => {
    it('emite solo las señales con count > 0, con su contexto', async () => {
      const now = Date.now();
      prisma.$transaction.mockResolvedValue([
        { _sum: { total: 1240 }, _count: { _all: 5 } }, // overdue
        { due_date: new Date(now - 12 * DAY) }, // oldest overdue
        3, // errores 5xx
        0, // DLQ (no genera señal)
        null, // recentDlq
        2, // SI sin mantenimiento
      ]);

      const signals = await service.getDecisions();

      const kinds = signals.map((s) => s.kind);
      expect(kinds).toEqual([
        'overdue_invoices',
        'errors_5xx',
        'si_maintenance',
      ]);
      expect(kinds).not.toContain('dlq_jobs'); // count 0 ⇒ omitida

      const overdue = signals.find((s) => s.kind === 'overdue_invoices');
      expect(overdue).toMatchObject({
        count: 5,
        amount: 1240,
        oldest_days: 12,
      });
    });

    it('incluye la etiqueta del job más reciente en la señal DLQ', async () => {
      prisma.$transaction.mockResolvedValue([
        { _sum: { total: null }, _count: { _all: 0 } },
        null,
        0,
        1, // DLQ
        { queue: 'provisioning-dispatch', name: 'provision:create' },
        0,
      ]);

      const signals = await service.getDecisions();
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        kind: 'dlq_jobs',
        count: 1,
        sample: 'provision:create',
      });
    });
  });

  describe('getTeamLoad', () => {
    it('reparte por agente, ordena por carga, marca presencia y expone el máximo', async () => {
      prisma.conversation.groupBy.mockResolvedValue([
        { assigned_agent_id: 'a1', _count: 9 },
        { assigned_agent_id: 'a2', _count: 6 },
        { assigned_agent_id: null, _count: 4 }, // sin asignar → ignorado
      ]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'a2',
          first_name: 'Luis',
          last_name: 'Ferrer',
          role: { slug: 'agent_full' },
        },
        {
          id: 'a1',
          first_name: 'Marta',
          last_name: 'Gil',
          role: { slug: 'agent_support' },
        },
        {
          id: 'a3',
          first_name: 'Pau',
          last_name: 'Vidal',
          role: { slug: 'agent_billing' },
        },
      ]);
      prisma.session.findMany.mockResolvedValue([
        { user_id: 'a1' },
        { user_id: 'a2' },
      ]);

      const load = await service.getTeamLoad();

      expect(load.max_open).toBe(9);
      expect(load.members.map((m) => m.name)).toEqual([
        'Marta Gil',
        'Luis Ferrer',
        'Pau Vidal',
      ]);
      expect(load.members[0]).toMatchObject({ open_count: 9, online: true });
      expect(load.members.find((m) => m.user_id === 'a3')).toMatchObject({
        open_count: 0,
        online: false,
      });
    });
  });
});
