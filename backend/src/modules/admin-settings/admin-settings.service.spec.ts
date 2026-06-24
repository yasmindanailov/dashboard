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
  let settings: { invalidateCache: jest.Mock; getNumber: jest.Mock };
  let storage: {
    upload: jest.Mock;
    delete: jest.Mock;
    presignedDownloadUrl: jest.Mock;
  };
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
    settings = {
      invalidateCache: jest.fn(),
      getNumber: jest.fn().mockResolvedValue(10),
    };
    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      presignedDownloadUrl: jest.fn().mockResolvedValue('https://signed/url'),
    };
    audit = { logChange: jest.fn().mockResolvedValue(undefined) };
    service = new AdminSettingsService(
      prisma as never,
      settings as never,
      storage as never,
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

    it('valida y normaliza un color de marca (#ABCDEF → #abcdef)', async () => {
      await service.update('branding', 'primary_color', '#ABCDEF', ACTOR);
      expect(firstUpsertArg().update.value).toBe('#abcdef');
    });

    it('rechaza un color inválido', async () => {
      await expect(
        service.update('branding', 'primary_color', 'rojo', ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
    });

    it('rechaza editar un setting gestionado (logo_key) por el PATCH genérico', async () => {
      await expect(
        service.update('branding', 'logo_key', 'branding/hack.png', ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
    });
  });

  describe('uploadBrandingLogo', () => {
    const pngFile = {
      buffer: Buffer.from('fake-png'),
      mimetype: 'image/png',
      size: 8,
      originalname: 'logo.png',
    };

    it('sube el logo a MinIO + persiste branding.logo_key + devuelve URL firmada', async () => {
      const result = await service.uploadBrandingLogo(pngFile, ACTOR);

      const uploadArg = (
        storage.upload.mock.calls as Array<
          [{ key: string; contentType: string }]
        >
      )[0][0];
      expect(uploadArg.key).toMatch(/^branding\/logo-.*\.png$/);
      expect(uploadArg.contentType).toBe('image/png');
      expect(firstUpsertArg().where.category_key).toEqual({
        category: 'branding',
        key: 'logo_key',
      });
      expect(firstUpsertArg().update.value).toBe(uploadArg.key);
      expect(result.url).toBe('https://signed/url');
    });

    it('borra el logo anterior best-effort', async () => {
      prisma.setting.findUnique.mockResolvedValue({
        value: 'branding/old.png',
      });
      await service.uploadBrandingLogo(pngFile, ACTOR);
      expect(storage.delete).toHaveBeenCalledWith('branding/old.png');
    });

    it('rechaza un archivo que no es imagen', async () => {
      await expect(
        service.uploadBrandingLogo(
          {
            buffer: Buffer.from('x'),
            mimetype: 'application/pdf',
            size: 1,
            originalname: 'x.pdf',
          },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('rechaza un logo que supera el tamaño máximo', async () => {
      settings.getNumber.mockResolvedValue(1); // 1 MB
      await expect(
        service.uploadBrandingLogo(
          {
            buffer: Buffer.alloc(2 * 1024 * 1024),
            mimetype: 'image/png',
            size: 2 * 1024 * 1024,
            originalname: 'big.png',
          },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
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
