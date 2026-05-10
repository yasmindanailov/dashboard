/**
 * Sprint 15C Fase 15C.C — tests unit EnhanceCustomersService.
 *
 * Cobertura:
 *   - Step 1 hit: cache local devuelve mapping existente sin llamar a Enhance.
 *   - Step 2 cross-restart recovery: customer ya existe en Enhance, se vincula
 *     localmente (defensive).
 *   - Step 2 customer huérfano (sin ownerId): falla a Step 3.
 *   - Step 3: ejecuta flow 6-step (steps 1-4) e inserta mapping.
 *   - Advisory lock se ejecuta (verificado vía $executeRaw spy).
 *   - userAdvisoryLockKey es determinístico para mismo UUID.
 *   - userAdvisoryLockKey produce signed int32 válido para PostgreSQL.
 *   - displayName se pasa correctamente a createCustomer + createLogin + addMember.
 */

import {
  EnhanceCustomersService,
  userAdvisoryLockKey,
} from './enhance-customers.service';
import type { EnhanceApiClient } from './api';

describe('EnhanceCustomersService — Sprint 15C Fase 15C.C', () => {
  const MASTER = '00000000-0000-0000-0000-00000000aaaa';
  const USER_ID = '11111111-2222-3333-4444-555555555555';
  const ORG_ID = '99999999-8888-7777-6666-555555555555';
  const LOGIN_ID = 'aaaa1111-2222-3333-4444-555555555555';
  const MEMBER_ID = 'bbbb1111-2222-3333-4444-555555555555';

  const SAMPLE_USER = {
    id: USER_ID,
    email: 'cliente@aelium.test',
    displayName: 'ACME Test, S.L.',
  };

  function buildPrismaTxMock(opts: {
    existing?: {
      user_id: string;
      enhance_org_id: string;
      enhance_owner_login_id: string;
      enhance_owner_member_id: string;
      created_at: Date;
      updated_at: Date;
    } | null;
    onCreate?: (data: Record<string, unknown>) => Record<string, unknown>;
  }): {
    executeRawSpy: jest.Mock;
    findUniqueSpy: jest.Mock;
    createSpy: jest.Mock;
    tx: Record<string, unknown>;
  } {
    const executeRawSpy = jest.fn().mockResolvedValue([]);
    const findUniqueSpy = jest.fn().mockResolvedValue(opts.existing ?? null);
    const createSpy = jest.fn().mockImplementation((args: unknown) => {
      const data = (args as { data: Record<string, unknown> }).data;
      const merged = opts.onCreate?.({ ...data }) ?? data;
      return Promise.resolve({
        ...merged,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    const tx = {
      $executeRaw: executeRawSpy,
      enhanceCustomer: {
        findUnique: findUniqueSpy,
        create: createSpy,
      },
    };
    return { executeRawSpy, findUniqueSpy, createSpy, tx };
  }

  function buildService(prismaTxMock: Record<string, unknown>) {
    const transactionImpl = (cb: (tx: unknown) => unknown) => cb(prismaTxMock);
    const prismaMock = {
      $transaction: jest.fn().mockImplementation(transactionImpl),
    };
    return new EnhanceCustomersService(prismaMock as never);
  }

  function buildApiClientMock(): jest.Mocked<
    Pick<
      EnhanceApiClient,
      | 'searchCustomersByEmail'
      | 'createCustomer'
      | 'createLogin'
      | 'addMember'
      | 'setOwner'
    >
  > {
    return {
      searchCustomersByEmail: jest.fn(),
      createCustomer: jest.fn(),
      createLogin: jest.fn(),
      addMember: jest.fn(),
      setOwner: jest.fn(),
    } as never;
  }

  // ─── Step 1 — cache local ──────────────────────────────────────────────

  it('Step 1 cache hit: devuelve mapping existente sin llamar a Enhance', async () => {
    const existing = {
      user_id: USER_ID,
      enhance_org_id: ORG_ID,
      enhance_owner_login_id: LOGIN_ID,
      enhance_owner_member_id: MEMBER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const { tx, executeRawSpy, findUniqueSpy } = buildPrismaTxMock({
      existing,
    });
    const service = buildService(tx);
    const api = buildApiClientMock();

    const result = await service.ensureCustomer(
      SAMPLE_USER,
      api as never,
      MASTER,
    );

    expect(result).toEqual(existing);
    expect(executeRawSpy).toHaveBeenCalledTimes(1); // advisory lock
    expect(findUniqueSpy).toHaveBeenCalledWith({
      where: { user_id: USER_ID },
    });
    expect(api.searchCustomersByEmail).not.toHaveBeenCalled();
    expect(api.createCustomer).not.toHaveBeenCalled();
  });

  // ─── Step 2 — cross-restart recovery ───────────────────────────────────

  it('Step 2 cross-restart: customer existe en Enhance con ownerId/ownerLoginId → INSERT mapping local', async () => {
    const { tx, createSpy } = buildPrismaTxMock({
      existing: null,
      onCreate: (data) => data,
    });
    const service = buildService(tx);
    const api = buildApiClientMock();

    api.searchCustomersByEmail.mockResolvedValueOnce({
      total: 1,
      items: [
        {
          id: ORG_ID,
          name: SAMPLE_USER.displayName,
          status: 'active',
          ownerId: MEMBER_ID,
          ownerLoginId: LOGIN_ID,
          ownerEmail: SAMPLE_USER.email,
          subscriptionsCount: 1,
          websitesCount: 0,
          createdAt: '2026-05-01T00:00:00Z',
        },
      ],
    });

    const result = await service.ensureCustomer(
      SAMPLE_USER,
      api as never,
      MASTER,
    );

    expect(result.user_id).toBe(USER_ID);
    expect(result.enhance_org_id).toBe(ORG_ID);
    expect(result.enhance_owner_login_id).toBe(LOGIN_ID);
    expect(result.enhance_owner_member_id).toBe(MEMBER_ID);

    // NO ejecutó steps 1-4 del flow.
    expect(api.createCustomer).not.toHaveBeenCalled();
    expect(api.createLogin).not.toHaveBeenCalled();
    expect(api.addMember).not.toHaveBeenCalled();
    expect(api.setOwner).not.toHaveBeenCalled();

    expect(createSpy).toHaveBeenCalledWith({
      data: {
        user_id: USER_ID,
        enhance_org_id: ORG_ID,
        enhance_owner_login_id: LOGIN_ID,
        enhance_owner_member_id: MEMBER_ID,
      },
    });
  });

  it('Step 2 customer huérfano (sin ownerId): cae a Step 3 (recovery via flow 6-step)', async () => {
    const { tx } = buildPrismaTxMock({ existing: null });
    const service = buildService(tx);
    const api = buildApiClientMock();

    api.searchCustomersByEmail.mockResolvedValueOnce({
      total: 1,
      items: [
        {
          id: ORG_ID,
          name: SAMPLE_USER.displayName,
          status: 'active',
          // sin ownerId / ownerLoginId — caso patológico.
          subscriptionsCount: 0,
          websitesCount: 0,
          createdAt: '2026-05-01T00:00:00Z',
        },
      ],
    });
    api.createCustomer.mockResolvedValueOnce({ id: ORG_ID });
    api.createLogin.mockResolvedValueOnce({
      id: LOGIN_ID,
      email: SAMPLE_USER.email,
      name: SAMPLE_USER.displayName,
    });
    api.addMember.mockResolvedValueOnce({ id: MEMBER_ID });
    api.setOwner.mockResolvedValueOnce(undefined);

    await service.ensureCustomer(SAMPLE_USER, api as never, MASTER);

    expect(api.createCustomer).toHaveBeenCalled();
    expect(api.createLogin).toHaveBeenCalled();
    expect(api.addMember).toHaveBeenCalled();
    expect(api.setOwner).toHaveBeenCalled();
  });

  // ─── Step 3 — flow 6-step (steps 1-4) ──────────────────────────────────

  it('Step 3: ejecuta steps 1-4 + INSERT mapping con valores devueltos por Enhance', async () => {
    const { tx, createSpy } = buildPrismaTxMock({ existing: null });
    const service = buildService(tx);
    const api = buildApiClientMock();

    api.searchCustomersByEmail.mockResolvedValueOnce({
      total: 0,
      items: [],
    });
    api.createCustomer.mockResolvedValueOnce({ id: ORG_ID });
    api.createLogin.mockResolvedValueOnce({
      id: LOGIN_ID,
      email: SAMPLE_USER.email,
      name: SAMPLE_USER.displayName,
    });
    api.addMember.mockResolvedValueOnce({ id: MEMBER_ID });
    api.setOwner.mockResolvedValueOnce(undefined);

    await service.ensureCustomer(SAMPLE_USER, api as never, MASTER);

    expect(api.createCustomer).toHaveBeenCalledWith(MASTER, {
      name: SAMPLE_USER.displayName,
    });

    expect(api.createLogin).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        email: SAMPLE_USER.email,
        name: SAMPLE_USER.displayName,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest stringMatching returns any
        password: expect.stringMatching(/^[0-9a-f]{32}$/), // hex 16 bytes
      }),
    );

    expect(api.addMember).toHaveBeenCalledWith(ORG_ID, {
      loginId: LOGIN_ID,
      roles: ['Owner'],
    });

    expect(api.setOwner).toHaveBeenCalledWith(ORG_ID, {
      memberId: MEMBER_ID,
    });

    expect(createSpy).toHaveBeenCalledWith({
      data: {
        user_id: USER_ID,
        enhance_org_id: ORG_ID,
        enhance_owner_login_id: LOGIN_ID,
        enhance_owner_member_id: MEMBER_ID,
      },
    });
  });

  // ─── Advisory lock ──────────────────────────────────────────────────────

  it('siempre adquiere advisory lock antes de cualquier query (Step 0)', async () => {
    const { tx, executeRawSpy } = buildPrismaTxMock({ existing: null });
    const service = buildService(tx);
    const api = buildApiClientMock();

    api.searchCustomersByEmail.mockResolvedValueOnce({ total: 0, items: [] });
    api.createCustomer.mockResolvedValueOnce({ id: ORG_ID });
    api.createLogin.mockResolvedValueOnce({
      id: LOGIN_ID,
      email: SAMPLE_USER.email,
      name: SAMPLE_USER.displayName,
    });
    api.addMember.mockResolvedValueOnce({ id: MEMBER_ID });
    api.setOwner.mockResolvedValueOnce(undefined);

    await service.ensureCustomer(SAMPLE_USER, api as never, MASTER);

    // queryRaw se llama 1 vez (advisory lock).
    expect(executeRawSpy).toHaveBeenCalledTimes(1);
    // El primer arg de $executeRaw es un TemplateStringsArray con el SQL —
    // verificamos que contiene el namespace canónico.
    const callArgs = executeRawSpy.mock.calls[0] as unknown[];
    const sqlParts = callArgs[0] as TemplateStringsArray;
    const sqlString = Array.isArray(sqlParts)
      ? sqlParts.join('?')
      : String(sqlParts);
    expect(sqlString).toContain('pg_advisory_xact_lock');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// userAdvisoryLockKey helper
// ────────────────────────────────────────────────────────────────────────────

describe('userAdvisoryLockKey', () => {
  it('determinístico: mismo UUID → mismo int32', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    expect(userAdvisoryLockKey(uuid)).toBe(userAdvisoryLockKey(uuid));
  });

  it('produce signed int32 válido (entre -2^31 y 2^31-1)', () => {
    const uuids = [
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '7fffffff-1111-2222-3333-444444444444',
      '80000000-1111-2222-3333-444444444444',
      'aabbccdd-1111-2222-3333-444444444444',
    ];
    for (const uuid of uuids) {
      const k = userAdvisoryLockKey(uuid);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(k).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });

  it('UUIDs distintos producen valores distintos (en general — colisiones posibles tras ~65k)', () => {
    const a = userAdvisoryLockKey('11111111-2222-3333-4444-555555555555');
    const b = userAdvisoryLockKey('22222222-3333-4444-5555-666666666666');
    expect(a).not.toBe(b);
  });
});
