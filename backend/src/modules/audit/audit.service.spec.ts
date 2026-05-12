import { BadRequestException } from '@nestjs/common';
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
    user: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
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
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
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

  // ──────────────────────────────────────────────────────────────────────
  // getServiceTimeline — Sprint 15C.II Fase F.3 (GAP-15CII-M)
  // ──────────────────────────────────────────────────────────────────────
  describe('getServiceTimeline', () => {
    const changeRow = {
      id: '11111111-1111-1111-1111-111111111111',
      source: 'change' as const,
      action: 'service.suspended',
      created_at: new Date('2026-05-12T10:00:00.000Z'),
      actor_id: 'admin-1',
      ip_address: null,
      changes_before: { status: 'active' },
      changes_after: { status: 'suspended', suspension_reason: 'abuse: spam' },
      correlation_id: 'cor-1',
      metadata: null,
    };
    const accessRow = {
      id: '22222222-2222-2222-2222-222222222222',
      source: 'access' as const,
      action: 'admin_sso_impersonation',
      created_at: new Date('2026-05-12T09:00:00.000Z'),
      actor_id: 'agent-1',
      ip_address: '203.0.113.1',
      changes_before: null,
      changes_after: null,
      correlation_id: null,
      metadata: {
        resource_id: 'svc-1',
        target_user_id: 'client-1',
        panel_label: 'Enhance Control Panel',
        gdpr_visible_to_data_subject: true,
      },
    };
    const reconciledVisible = {
      id: '33333333-3333-3333-3333-333333333333',
      source: 'change' as const,
      action: 'reconciled_external_change',
      created_at: new Date('2026-05-12T08:00:00.000Z'),
      actor_id: null,
      ip_address: null,
      changes_before: { value: 'active' },
      changes_after: {
        value: 'suspended',
        _meta: { change_type: 'status_divergence', gdpr_visible_to_data_subject: true },
      },
      correlation_id: null,
      metadata: null,
    };
    const reconciledHidden = {
      id: '44444444-4444-4444-4444-444444444444',
      source: 'change' as const,
      action: 'reconciled_external_change',
      created_at: new Date('2026-05-12T07:30:00.000Z'),
      actor_id: null,
      ip_address: null,
      changes_before: { value: 1 },
      changes_after: {
        value: 2,
        _meta: { change_type: 'plan_divergence', gdpr_visible_to_data_subject: false },
      },
      correlation_id: null,
      metadata: null,
    };
    const internalRow = {
      id: '55555555-5555-5555-5555-555555555555',
      source: 'change' as const,
      action: 'service.reprovision_requested',
      created_at: new Date('2026-05-12T07:00:00.000Z'),
      actor_id: 'admin-1',
      ip_address: null,
      changes_before: null,
      changes_after: { note: 'nota interna' },
      correlation_id: 'cor-2',
      metadata: null,
    };

    function mockUsers() {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'admin-1',
          first_name: 'Admin',
          last_name: 'Uno',
          email: 'admin@aelium.test',
          role: { slug: 'superadmin' },
        },
        {
          id: 'agent-1',
          first_name: 'Ana',
          last_name: 'Soporte',
          email: 'ana@aelium.test',
          role: { slug: 'agent_support' },
        },
      ]);
    }

    it('vista admin: devuelve filas íntegras (changes_*, correlation_id, ip, metadata) + actores enriquecidos', async () => {
      mockUsers();
      prisma.$queryRaw.mockResolvedValue([changeRow, accessRow]);

      const page = await service.getServiceTimeline('svc-1', { isAdmin: true });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(page.items).toHaveLength(2);
      const chg = page.items.find((e) => e.source === 'change')!;
      expect(chg.action).toBe('service.suspended');
      expect(chg.actor).toEqual({
        user_id: 'admin-1',
        name: 'Admin Uno',
        role: 'superadmin',
      });
      expect(chg.changes_before).toEqual({ status: 'active' });
      expect(chg.changes_after).toEqual({
        status: 'suspended',
        suspension_reason: 'abuse: spam',
      });
      expect(chg.correlation_id).toBe('cor-1');
      const acc = page.items.find((e) => e.source === 'access')!;
      expect(acc.ip_address).toBe('203.0.113.1');
      expect(acc.metadata).toMatchObject({ panel_label: 'Enhance Control Panel' });
      expect(acc.actor).toEqual({
        user_id: 'agent-1',
        name: 'Ana Soporte',
        role: 'agent_support',
      });
    });

    it('vista cliente: whitelist GDPR — incluye suspended/impersonation/reconciled-visible; omite reprovision_requested y reconciled-hidden', async () => {
      mockUsers();
      prisma.$queryRaw.mockResolvedValue([
        changeRow, // service.suspended → visible
        accessRow, // admin_sso_impersonation → visible
        reconciledVisible, // gdpr true → visible
        reconciledHidden, // gdpr false → omitido
        internalRow, // service.reprovision_requested → omitido
      ]);

      const page = await service.getServiceTimeline('svc-1', { isAdmin: false });

      const actions = page.items.map((e) => e.action).sort();
      expect(actions).toEqual([
        'admin_sso_impersonation',
        'reconciled_external_change',
        'service.suspended',
      ]);
      // Cliente nunca recibe changes_*/correlation_id/ip
      for (const entry of page.items) {
        expect(entry).not.toHaveProperty('changes_before');
        expect(entry).not.toHaveProperty('changes_after');
        expect(entry).not.toHaveProperty('correlation_id');
        expect(entry).not.toHaveProperty('ip_address');
      }
      const imp = page.items.find((e) => e.action === 'admin_sso_impersonation')!;
      expect(imp.metadata).toEqual({ panel_label: 'Enhance Control Panel' });
      const rec = page.items.find((e) => e.action === 'reconciled_external_change')!;
      expect(rec.metadata).toEqual({ change_type: 'status_divergence' });
      const susp = page.items.find((e) => e.action === 'service.suspended')!;
      expect(susp.metadata).toBeNull();
      // El actor del reconciled (sistema) es null
      expect(rec.actor).toBeNull();
    });

    it('cursor pagination: next_cursor cuando hay limit+1 filas; null cuando no', async () => {
      mockUsers();
      // 3 filas con limit=2 → page = 2, hay más
      prisma.$queryRaw.mockResolvedValueOnce([changeRow, accessRow, reconciledVisible]);
      const p1 = await service.getServiceTimeline('svc-1', {
        isAdmin: true,
        limit: 2,
      });
      expect(p1.items).toHaveLength(2);
      expect(p1.next_cursor).toBe(
        `${accessRow.created_at.toISOString()}|${accessRow.id}`,
      );

      // 2 filas con limit=2 → no hay más
      prisma.$queryRaw.mockResolvedValueOnce([changeRow, accessRow]);
      const p2 = await service.getServiceTimeline('svc-1', {
        isAdmin: true,
        limit: 2,
      });
      expect(p2.items).toHaveLength(2);
      expect(p2.next_cursor).toBeNull();
    });

    it('cursor malformado → BadRequestException (no llega a consultar)', async () => {
      await expect(
        service.getServiceTimeline('svc-1', { isAdmin: true, cursor: 'garbage' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('actor desconocido (no en el map) → { user_id, name:null, role:null }; sin actor_id → null', async () => {
      prisma.user.findMany.mockResolvedValue([]); // ningún actor resuelto
      prisma.$queryRaw.mockResolvedValue([changeRow, reconciledVisible]);

      const page = await service.getServiceTimeline('svc-1', { isAdmin: true });
      const chg = page.items.find((e) => e.source === 'change' && e.action === 'service.suspended')!;
      expect(chg.actor).toEqual({ user_id: 'admin-1', name: null, role: null });
      const rec = page.items.find((e) => e.action === 'reconciled_external_change')!;
      expect(rec.actor).toBeNull();
    });
  });
});
