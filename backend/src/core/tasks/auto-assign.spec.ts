import {
  autoAssignTask,
  eligibleAssigneeRoles,
  isAssigneeEligible,
} from './auto-assign';
import { PrismaService } from '../database/prisma.service';

/**
 * Tests unit autoAssignTask — Sprint 16 Fase 16.B (ADR-079 §3.4).
 *
 * Cobertura:
 *   - project → null (cola pública pura, sin auto-asignación).
 *   - resto de sistemas → consulta $queryRaw con roles elegibles +
 *     desempate por carga + random.
 *   - $queryRaw devuelve [] (ningún agente activo) → null.
 *   - $queryRaw devuelve [{id}] → ese ID.
 */
describe('autoAssignTask — Sprint 16 Fase 16.B (ADR-079 §3.4)', () => {
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
  });

  it('project → null sin tocar BD', async () => {
    const result = await autoAssignTask(
      prisma as unknown as PrismaService,
      'project',
    );
    expect(result).toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('support_ticket con candidato → devuelve user_id', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'agent-1' }]);
    const result = await autoAssignTask(
      prisma as unknown as PrismaService,
      'support_ticket',
    );
    expect(result).toBe('agent-1');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('support_inside_slot sin candidatos → null', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const result = await autoAssignTask(
      prisma as unknown as PrismaService,
      'support_inside_slot',
    );
    expect(result).toBeNull();
  });

  it('client_lifecycle → consulta BD (roles incluyen agent_billing)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'billing-1' }]);
    const result = await autoAssignTask(
      prisma as unknown as PrismaService,
      'client_lifecycle',
    );
    expect(result).toBe('billing-1');
  });

  it('provisioning_manual → consulta BD', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'agent-2' }]);
    const result = await autoAssignTask(
      prisma as unknown as PrismaService,
      'provisioning_manual',
    );
    expect(result).toBe('agent-2');
  });
});

/**
 * isAssigneeEligible — Rediseño UI F3·E8. Puerta que usa el cron de
 * mantenimiento para decidir si hereda la tarea al "técnico asignado" del
 * cliente o cae a la auto-asignación.
 */
describe('isAssigneeEligible — F3·E8', () => {
  it('true si la query encuentra staff activo con rol elegible', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
    } as unknown as PrismaService;
    await expect(
      isAssigneeEligible(prisma, 'u1', 'support_inside_slot'),
    ).resolves.toBe(true);
  });

  it('false si no hay match (inactivo / rol no elegible)', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(
      isAssigneeEligible(prisma, 'u1', 'support_inside_slot'),
    ).resolves.toBe(false);
  });

  it('filtra por id + status active + roles elegibles', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'u1' });
    const prisma = { user: { findFirst } } as unknown as PrismaService;
    await isAssigneeEligible(prisma, 'u1', 'support_inside_slot');
    const calls = findFirst.mock.calls as Array<
      [
        {
          where: {
            id: string;
            status: string;
            role: { slug: { in: string[] } };
          };
        },
      ]
    >;
    const arg = calls[0][0];
    expect(arg.where.id).toBe('u1');
    expect(arg.where.status).toBe('active');
    expect(arg.where.role.slug.in).toEqual(
      expect.arrayContaining(['agent_support', 'agent_full']),
    );
  });

  it('project (sin roles elegibles) → false sin tocar BD', async () => {
    const findFirst = jest.fn();
    const prisma = { user: { findFirst } } as unknown as PrismaService;
    await expect(isAssigneeEligible(prisma, 'u1', 'project')).resolves.toBe(
      false,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('incluye superadmin en la elegibilidad manual (no en project)', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'sa' });
    const prisma = { user: { findFirst } } as unknown as PrismaService;
    await isAssigneeEligible(prisma, 'sa', 'support_inside_slot');
    const arg = (
      findFirst.mock.calls as Array<
        [{ where: { role: { slug: { in: string[] } } } }]
      >
    )[0][0];
    expect(arg.where.role.slug.in).toContain('superadmin');
  });
});

/**
 * eligibleAssigneeRoles — F3·E8 admin (decisión Yasmin 2026-06-29). El
 * superadmin es asignable a mano (picker + isAssigneeEligible) pero NO entra
 * en la auto-rotación (`autoAssignTask` usa el pool sin superadmin).
 */
describe('eligibleAssigneeRoles — F3·E8', () => {
  it('support_inside_slot = pool + superadmin (asignable a mano)', () => {
    const roles = eligibleAssigneeRoles('support_inside_slot');
    expect(roles).toEqual(
      expect.arrayContaining(['agent_support', 'agent_full', 'superadmin']),
    );
  });

  it('project (pool vacío) = vacío (no se inventa superadmin)', () => {
    expect(eligibleAssigneeRoles('project')).toEqual([]);
  });
});
