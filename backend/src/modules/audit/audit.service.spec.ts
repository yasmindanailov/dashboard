import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from './audit.service';

/**
 * Tests unit AuditService — Sprint 9 Fase E (ADR-017).
 *
 * Cobertura:
 *  - logAccess persiste con shape correcto.
 *  - logAccess NO relanza si Prisma falla (R3+R7 — degradación silenciosa).
 *  - logChange persiste correctamente.
 *  - cleanupOldAccessLogs llama deleteMany con cutoff calculado.
 */
describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditAccessLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      deleteMany: jest.Mock;
    };
    auditChangeLog: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      auditAccessLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditChangeLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuditService);
  });

  describe('logAccess', () => {
    it('persiste con todos los campos', async () => {
      await service.logAccess({
        user_id: 'user-1',
        action: 'read',
        ip_address: '127.0.0.1',
        user_agent: 'jest',
        resource: 'Invoice:inv-1',
        metadata: { resource_id: 'inv-1', target_user_id: 'user-2' },
      });

      type CreateArg = {
        data: {
          user_id: string;
          action: string;
          ip_address: string;
          resource: string;
          metadata: Record<string, unknown>;
        };
      };
      const calls = prisma.auditAccessLog.create.mock.calls as CreateArg[][];
      expect(calls[0][0].data.user_id).toBe('user-1');
      expect(calls[0][0].data.action).toBe('read');
      expect(calls[0][0].data.resource).toBe('Invoice:inv-1');
      expect(calls[0][0].data.metadata).toMatchObject({
        resource_id: 'inv-1',
        target_user_id: 'user-2',
      });
    });

    it('NO relanza si Prisma falla (degradación silenciosa)', async () => {
      prisma.auditAccessLog.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.logAccess({
          user_id: 'user-1',
          action: 'read',
          ip_address: '127.0.0.1',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('logChange', () => {
    it('persiste correctamente entity_type + entity_id + diff', async () => {
      await service.logChange({
        user_id: 'admin-1',
        entity_type: 'BillingProfile',
        entity_id: 'bp-1',
        action: 'update',
        changes_before: { city: 'Madrid' },
        changes_after: { city: 'Barcelona' },
        correlation_id: 'corr-1',
      });

      type CreateArg = {
        data: { entity_type: string; entity_id: string; action: string };
      };
      const calls = prisma.auditChangeLog.create.mock.calls as CreateArg[][];
      expect(calls[0][0].data.entity_type).toBe('BillingProfile');
      expect(calls[0][0].data.entity_id).toBe('bp-1');
      expect(calls[0][0].data.action).toBe('update');
    });
  });

  describe('cleanupOldAccessLogs', () => {
    it('calcula cutoff = now - retention_days y llama deleteMany', async () => {
      prisma.auditAccessLog.deleteMany.mockResolvedValue({ count: 42 });

      const before = Date.now();
      const deleted = await service.cleanupOldAccessLogs(730);

      expect(deleted).toBe(42);
      type DeleteArg = { where: { created_at: { lt: Date } } };
      const calls = prisma.auditAccessLog.deleteMany.mock
        .calls as DeleteArg[][];
      const cutoff = calls[0][0].where.created_at.lt;
      const expectedCutoff = before - 730 * 86400_000;
      // Tolerancia 1s para no flakear por slowness del test runner.
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedCutoff - 1000);
      expect(cutoff.getTime()).toBeLessThanOrEqual(
        Date.now() - 729 * 86400_000,
      );
    });
  });
});
