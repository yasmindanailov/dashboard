import {
  AccountTransparencyService,
  DEFAULT_SUBPROCESSORS,
} from './account-transparency.service';

/**
 * Tests unit `AccountTransparencyService` — audit 2026-06-25 GL-5 / H3b.1.
 *
 * Foco:
 *  - `getSubprocessors` lee `settings.legal.subprocessors` con la lista canónica
 *    como fallback.
 *  - `exportForUser` ensambla el objeto self-scoped con todas las secciones, y
 *    — CRÍTICO — el `select` NO filtra campos sensibles: el User excluye
 *    `password_hash`/`two_factor_secret`; los mensajes de soporte excluyen los
 *    internos del staff (`is_internal: false`).
 */
describe('AccountTransparencyService — GL-5 / H3b.1', () => {
  const USER_ID = '11111111-1111-1111-1111-111111111111';
  const NOW = new Date('2026-06-25T10:00:00.000Z');

  let prisma: {
    user: { findUnique: jest.Mock };
    clientProfile: { findUnique: jest.Mock };
    billingProfile: { findMany: jest.Mock };
    service: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    conversation: { findMany: jest.Mock };
    notification: { findMany: jest.Mock };
    auditAccessLog: { findMany: jest.Mock };
  };
  let settings: { getJson: jest.Mock };
  let service: AccountTransparencyService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: USER_ID }) },
      clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      billingProfile: { findMany: jest.fn().mockResolvedValue([]) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      conversation: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { findMany: jest.fn().mockResolvedValue([]) },
      auditAccessLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    settings = { getJson: jest.fn() };
    service = new AccountTransparencyService(
      prisma as never,
      settings as never,
    );
  });

  describe('getSubprocessors', () => {
    it('lee settings.legal.subprocessors con la lista canónica como fallback', async () => {
      const stored = [
        {
          name: 'X',
          purpose: 'y',
          location: 'UE',
          dpa_url: 'https://x',
        },
      ];
      settings.getJson.mockResolvedValueOnce(stored);

      const result = await service.getSubprocessors();

      expect(settings.getJson).toHaveBeenCalledWith('legal', 'subprocessors', [
        ...DEFAULT_SUBPROCESSORS,
      ]);
      expect(result).toBe(stored);
    });
  });

  describe('exportForUser', () => {
    it('ensambla el objeto self-scoped con todas las secciones + timestamp + user_id', async () => {
      const result = await service.exportForUser(USER_ID, NOW);

      expect(result).toEqual({
        export_generated_at: NOW.toISOString(),
        user_id: USER_ID,
        account: { id: USER_ID },
        client_profile: null,
        billing_profiles: [],
        services: [],
        invoices: [],
        support_conversations: [],
        notifications: [],
        access_log: [],
      });
    });

    it('consulta cada modelo filtrando por el userId del JWT (sin IDOR)', async () => {
      await service.exportForUser(USER_ID, NOW);

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID } }),
      );
      expect(prisma.billingProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: USER_ID } }),
      );
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: USER_ID } }),
      );
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: USER_ID } }),
      );
    });

    it('NO filtra credenciales: el select de User excluye password_hash y two_factor_secret', async () => {
      await service.exportForUser(USER_ID, NOW);

      const arg = (
        prisma.user.findUnique.mock.calls as Array<
          [{ select: Record<string, unknown> }]
        >
      )[0][0];
      expect(arg.select.password_hash).toBeUndefined();
      expect(arg.select.two_factor_secret).toBeUndefined();
      // Sí incluye los campos legítimos del titular.
      expect(arg.select.email).toBe(true);
      expect(arg.select.two_factor_enabled).toBe(true);
    });

    it('excluye las notas internas del staff: los mensajes de soporte filtran is_internal:false', async () => {
      await service.exportForUser(USER_ID, NOW);

      const arg = (
        prisma.conversation.findMany.mock.calls as Array<
          [{ select: { messages: { where: { is_internal: boolean } } } }]
        >
      )[0][0];
      expect(arg.select.messages.where.is_internal).toBe(false);
    });

    it('el client_profile NO selecciona notes_internal', async () => {
      await service.exportForUser(USER_ID, NOW);

      const arg = (
        prisma.clientProfile.findUnique.mock.calls as Array<
          [{ select: Record<string, unknown> }]
        >
      )[0][0];
      expect(arg.select.notes_internal).toBeUndefined();
      expect(arg.select.tax_id).toBe(true);
    });
  });
});
