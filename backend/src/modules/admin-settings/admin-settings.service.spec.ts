import { BadRequestException } from '@nestjs/common';

import { AdminSettingsService } from './admin-settings.service';

/**
 * Tests unit de `AdminSettingsService` — Sprint 12 (ADR-044).
 *
 * Foco: el catálogo es la barrera de validación + sólo expone lo editable, el
 * valor se persiste CRUDO (sin envoltorio `{value}`), todo cambio se audita
 * (R3) e invalida la caché. Un valor inválido o una clave no catalogada NO
 * tocan la BD.
 */
type UpsertArg = {
  where: { category_key: { category: string; key: string } };
  update: { value: unknown; updated_by: string };
  create: { value: unknown };
};

type AuditArg = {
  entity_type: string;
  action: string;
  changes_before: Record<string, unknown>;
  changes_after: Record<string, unknown>;
};

describe('AdminSettingsService', () => {
  const ACTOR = 'superadmin-1';
  let prisma: {
    setting: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let settings: { invalidateCache: jest.Mock };
  let audit: { logChange: jest.Mock };
  let service: AdminSettingsService;

  const firstUpsertArg = (): UpsertArg =>
    (prisma.setting.upsert.mock.calls as Array<[UpsertArg]>)[0][0];
  const firstAuditArg = (): AuditArg =>
    (audit.logChange.mock.calls as Array<[AuditArg]>)[0][0];

  beforeEach(() => {
    prisma = {
      setting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation((args: UpsertArg) =>
          Promise.resolve({
            id: 'setting-1',
            value: args.update?.value ?? args.create?.value,
          }),
        ),
      },
    };
    settings = { invalidateCache: jest.fn() };
    audit = { logChange: jest.fn().mockResolvedValue(undefined) };
    service = new AdminSettingsService(
      prisma as never,
      settings as never,
      audit as never,
    );
  });

  describe('update', () => {
    it('persiste crudo un número válido + audita (R3) + invalida la caché', async () => {
      prisma.setting.findUnique.mockResolvedValue({ value: '7' });

      const view = await service.update(
        'billing',
        'payment_due_days',
        14,
        ACTOR,
      );

      const upsertArgs = firstUpsertArg();
      expect(upsertArgs.where.category_key).toEqual({
        category: 'billing',
        key: 'payment_due_days',
      });
      // crudo: número nativo, NO envuelto en { value }
      expect(upsertArgs.update.value).toBe(14);
      expect(upsertArgs.update.updated_by).toBe(ACTOR);

      const auditArgs = firstAuditArg();
      expect(auditArgs.entity_type).toBe('Setting');
      expect(auditArgs.action).toBe('update');
      expect(auditArgs.changes_before).toEqual({
        'billing.payment_due_days': '7',
      });
      expect(auditArgs.changes_after).toEqual({
        'billing.payment_due_days': 14,
      });

      expect(settings.invalidateCache).toHaveBeenCalledWith(
        'billing',
        'payment_due_days',
      );
      expect(view.value).toBe(14);
    });

    it('coerciona un número enviado como string ("10" → 10)', async () => {
      await service.update('notifications', 'retention_days', '10', ACTOR);
      expect(firstUpsertArg().update.value).toBe(10);
    });

    it('rechaza un número fuera de rango sin tocar la BD', async () => {
      await expect(
        service.update('billing', 'payment_due_days', -1, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
      expect(audit.logChange).not.toHaveBeenCalled();
    });

    it('rechaza un número no numérico sin tocar la BD', async () => {
      await expect(
        service.update('billing', 'payment_due_days', 'abc', ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
    });

    it('rechaza una clave fuera del catálogo (no es configurable)', async () => {
      await expect(
        service.update('auth', 'max_login_attempts', 99, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
    });

    it('persiste un string[] válido (nameservers) como array crudo', async () => {
      await service.update(
        'provisioning',
        'default_nameservers',
        ['ns1.aelium.net', '  ns2.aelium.net  '],
        ACTOR,
      );
      // trim aplicado, sin envoltorio
      expect(firstUpsertArg().update.value).toEqual([
        'ns1.aelium.net',
        'ns2.aelium.net',
      ]);
    });

    it('rechaza un valor de enum no permitido', async () => {
      await expect(
        service.update('general', 'default_currency', 'XYZ', ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
    });

    it('acepta un booleano (kill switch de emails)', async () => {
      await service.update(
        'notifications',
        'email_enabled_globally',
        false,
        ACTOR,
      );
      expect(firstUpsertArg().update.value).toBe(false);
    });
  });

  describe('list', () => {
    it('agrupa el catálogo por sección y mergea el valor actual (o null)', async () => {
      prisma.setting.findMany.mockResolvedValue([
        { category: 'billing', key: 'invoice_prefix', value: 'AEL' },
      ]);

      const groups = await service.list();

      const billing = groups.find((g) => g.group === 'Facturación');
      expect(billing).toBeDefined();
      const prefix = billing?.settings.find((s) => s.key === 'invoice_prefix');
      expect(prefix?.value).toBe('AEL');
      // un setting sin fila en BD → value null
      const dueDays = billing?.settings.find(
        (s) => s.key === 'payment_due_days',
      );
      expect(dueDays?.value).toBeNull();
    });
  });
});
