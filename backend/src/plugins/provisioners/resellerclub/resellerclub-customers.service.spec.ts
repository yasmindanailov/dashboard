/**
 * Sprint 15D Fase 15D.D — tests unit `ResellerclubCustomersService`.
 *
 * Cobertura (ADR-081 §3/§4 + Amendment A2):
 *   - Step 1 cache hit: customer + 4 handles existen → refs sin tocar RC.
 *   - Step 2 cross-search recovery: customer existe en RC, se re-vincula local.
 *   - Step 3 lazy create: signup + 1 contacto + 4 role-handles + mapping.
 *   - 1 contacto reutilizado en los 4 roles (Amendment A2).
 *   - Advisory lock se ejecuta (verificado vía $executeRaw spy + namespace).
 *   - REGISTRANT_INELIGIBLE si falta un campo de registrante (DOM-INV-5).
 *   - REGISTRANT_INELIGIBLE si el país no tiene phone-cc derivable.
 *   - userAdvisoryLockKey determinístico + signed int32 válido.
 */

import { ProvisionerPluginError } from '../../../core/provisioning/types';

import {
  ResellerclubCustomersService,
  userAdvisoryLockKey,
} from './resellerclub-customers.service';
import type { ResellerClubApiClient } from './api';

describe('ResellerclubCustomersService — Sprint 15D Fase 15D.D', () => {
  const USER_ID = '11111111-2222-3333-4444-555555555555';
  const CUSTOMER_ID = '700001';
  const CONTACT_ID = '800001';

  const SAMPLE_CLIENT = {
    id: USER_ID,
    email: 'carla@aelium.test',
    first_name: 'Carla',
    last_name: 'Pérez',
    company_name: null,
    phone: '600111222',
    locale: 'es',
    country_code: 'ES',
    address_line1: 'Calle Mayor 1',
    address_line2: null,
    city: 'Madrid',
    state: 'Madrid',
    postal_code: '28013',
    tax_id: '12345678Z',
  };

  function buildPrismaTxMock(opts: {
    existingCustomer?: { resellerclub_customer_id: string } | null;
    existingHandles?: Array<{
      contact_type: string;
      resellerclub_contact_id: string;
    }>;
  }) {
    const executeRawSpy = jest.fn().mockResolvedValue(0);
    const customerFindUnique = jest
      .fn()
      .mockResolvedValue(opts.existingCustomer ?? null);
    const customerCreate = jest
      .fn()
      .mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...args.data }),
      );
    const handleFindMany = jest
      .fn()
      .mockResolvedValue(opts.existingHandles ?? []);
    const handleCreateMany = jest.fn().mockResolvedValue({ count: 4 });

    const tx = {
      $executeRaw: executeRawSpy,
      resellerclubCustomer: {
        findUnique: customerFindUnique,
        create: customerCreate,
      },
      resellerclubContactHandle: {
        findMany: handleFindMany,
        createMany: handleCreateMany,
      },
    };
    return {
      tx,
      executeRawSpy,
      customerFindUnique,
      customerCreate,
      handleFindMany,
      handleCreateMany,
    };
  }

  function buildService(tx: Record<string, unknown>) {
    const prismaMock = {
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    return new ResellerclubCustomersService(prismaMock as never);
  }

  function buildApiMock(): jest.Mocked<
    Pick<
      ResellerClubApiClient,
      'searchCustomerByEmail' | 'signupCustomer' | 'addContact'
    >
  > {
    return {
      searchCustomerByEmail: jest.fn(),
      signupCustomer: jest.fn(),
      addContact: jest.fn(),
    } as never;
  }

  const fourHandles = (contactId: string) =>
    ['registrant', 'admin', 'tech', 'billing'].map((contact_type) => ({
      contact_type,
      resellerclub_contact_id: contactId,
    }));

  // ─── Step 1 — cache hit ────────────────────────────────────────────────

  it('cache hit: customer + 4 handles existen → refs sin llamar a RC', async () => {
    const { tx, handleCreateMany } = buildPrismaTxMock({
      existingCustomer: { resellerclub_customer_id: CUSTOMER_ID },
      existingHandles: fourHandles(CONTACT_ID),
    });
    const service = buildService(tx);
    const api = buildApiMock();

    const refs = await service.ensureRegistrant(SAMPLE_CLIENT, api as never);

    expect(refs.customerId).toBe(CUSTOMER_ID);
    expect(refs.contacts).toEqual({
      registrant: CONTACT_ID,
      admin: CONTACT_ID,
      tech: CONTACT_ID,
      billing: CONTACT_ID,
    });
    expect(api.searchCustomerByEmail).not.toHaveBeenCalled();
    expect(api.signupCustomer).not.toHaveBeenCalled();
    expect(api.addContact).not.toHaveBeenCalled();
    expect(handleCreateMany).not.toHaveBeenCalled();
  });

  // ─── Step 2 — cross-search recovery ────────────────────────────────────

  it('cross-search recovery: customer existe en RC → re-vincula sin signup', async () => {
    const { tx, customerCreate } = buildPrismaTxMock({
      existingCustomer: null,
      existingHandles: [],
    });
    const service = buildService(tx);
    const api = buildApiMock();
    api.searchCustomerByEmail.mockResolvedValueOnce(CUSTOMER_ID);
    api.addContact.mockResolvedValueOnce(CONTACT_ID);

    const refs = await service.ensureRegistrant(SAMPLE_CLIENT, api as never);

    expect(refs.customerId).toBe(CUSTOMER_ID);
    expect(api.signupCustomer).not.toHaveBeenCalled();
    expect(customerCreate).toHaveBeenCalledWith({
      data: {
        user_id: USER_ID,
        resellerclub_customer_id: CUSTOMER_ID,
        email: SAMPLE_CLIENT.email,
      },
    });
  });

  // ─── Step 3 — lazy create completo ─────────────────────────────────────

  it('lazy create: signup + 1 contacto + 4 role-handles + mapping', async () => {
    const { tx, customerCreate, handleCreateMany } = buildPrismaTxMock({
      existingCustomer: null,
      existingHandles: [],
    });
    const service = buildService(tx);
    const api = buildApiMock();
    api.searchCustomerByEmail.mockResolvedValueOnce(null);
    api.signupCustomer.mockResolvedValueOnce(CUSTOMER_ID);
    api.addContact.mockResolvedValueOnce(CONTACT_ID);

    const refs = await service.ensureRegistrant(SAMPLE_CLIENT, api as never);

    expect(api.signupCustomer).toHaveBeenCalledTimes(1);
    expect(api.addContact).toHaveBeenCalledTimes(1);
    expect(customerCreate).toHaveBeenCalledWith({
      data: {
        user_id: USER_ID,
        resellerclub_customer_id: CUSTOMER_ID,
        email: SAMPLE_CLIENT.email,
      },
    });

    // 1 contacto reutilizado en los 4 roles (Amendment A2).
    const createManyArg = handleCreateMany.mock.calls[0][0] as {
      data: Array<{ contact_type: string; resellerclub_contact_id: string }>;
      skipDuplicates?: boolean;
    };
    expect(createManyArg.data).toHaveLength(4);
    expect(createManyArg.data.map((d) => d.contact_type).sort()).toEqual([
      'admin',
      'billing',
      'registrant',
      'tech',
    ]);
    expect(
      createManyArg.data.every((d) => d.resellerclub_contact_id === CONTACT_ID),
    ).toBe(true);
    expect(refs.contacts.registrant).toBe(CONTACT_ID);
    expect(refs.contacts.billing).toBe(CONTACT_ID);
  });

  // ─── signup input mapping ──────────────────────────────────────────────

  it('signup mapea ClientProfile → RC con phone-cc derivado del país (ES→34)', async () => {
    const { tx } = buildPrismaTxMock({ existingCustomer: null });
    const service = buildService(tx);
    const api = buildApiMock();
    api.searchCustomerByEmail.mockResolvedValueOnce(null);
    api.signupCustomer.mockResolvedValueOnce(CUSTOMER_ID);
    api.addContact.mockResolvedValueOnce(CONTACT_ID);

    await service.ensureRegistrant(SAMPLE_CLIENT, api as never);

    const input = api.signupCustomer.mock.calls[0][0];
    expect(input).toEqual(
      expect.objectContaining({
        username: SAMPLE_CLIENT.email,
        name: 'Carla Pérez',
        'address-line-1': 'Calle Mayor 1',
        city: 'Madrid',
        state: 'Madrid',
        country: 'ES',
        zipcode: '28013',
        'phone-cc': '34',
        phone: '600111222',
      }),
    );
    // passwd aleatorio presente, NUNCA persistido.
    expect(typeof input.passwd).toBe('string');
    expect(input.passwd.length).toBeGreaterThanOrEqual(8);
  });

  // ─── Advisory lock ─────────────────────────────────────────────────────

  it('siempre adquiere advisory lock con el namespace canónico (Step 0)', async () => {
    const { tx, executeRawSpy } = buildPrismaTxMock({
      existingCustomer: { resellerclub_customer_id: CUSTOMER_ID },
      existingHandles: fourHandles(CONTACT_ID),
    });
    const service = buildService(tx);
    const api = buildApiMock();

    await service.ensureRegistrant(SAMPLE_CLIENT, api as never);

    expect(executeRawSpy).toHaveBeenCalledTimes(1);
    const sqlParts = executeRawSpy.mock.calls[0][0] as TemplateStringsArray;
    const sql = Array.isArray(sqlParts) ? sqlParts.join('?') : String(sqlParts);
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(executeRawSpy.mock.calls[0]).toContain(1_500_401);
  });

  // ─── Elegibilidad de registrante (DOM-INV-5) ───────────────────────────

  it('REGISTRANT_INELIGIBLE si falta un campo de registrante (address_line1)', async () => {
    const { tx } = buildPrismaTxMock({ existingCustomer: null });
    const service = buildService(tx);
    const api = buildApiMock();
    api.searchCustomerByEmail.mockResolvedValueOnce(null);

    await expect(
      service.ensureRegistrant(
        { ...SAMPLE_CLIENT, address_line1: null },
        api as never,
      ),
    ).rejects.toMatchObject({ code: 'REGISTRANT_INELIGIBLE', retriable: false });
    expect(api.signupCustomer).not.toHaveBeenCalled();
  });

  it('REGISTRANT_INELIGIBLE si el país no tiene phone-cc derivable', async () => {
    const { tx } = buildPrismaTxMock({ existingCustomer: null });
    const service = buildService(tx);
    const api = buildApiMock();
    api.searchCustomerByEmail.mockResolvedValueOnce(null);

    const err = await service
      .ensureRegistrant(
        { ...SAMPLE_CLIENT, country_code: 'ZZ' },
        api as never,
      )
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProvisionerPluginError);
    expect((err as ProvisionerPluginError).code).toBe('REGISTRANT_INELIGIBLE');
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
      '80000000-1111-2222-3333-444444444444',
    ];
    for (const uuid of uuids) {
      const k = userAdvisoryLockKey(uuid);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(k).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });
});
