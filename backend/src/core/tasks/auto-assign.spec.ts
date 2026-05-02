import { autoAssignTask } from './auto-assign';
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
