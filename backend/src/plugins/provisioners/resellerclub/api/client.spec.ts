/**
 * Sprint 15D Fase 15D.C — tests unit del cliente high-level RC.
 *
 * Foco: la lógica del cliente (normalización de ids escalares, extracción del
 * order-id de register, search→null, routing de comando/método/params). El
 * transporte y el mapeo de errores se cubren en http-client.spec.ts; el flujo
 * end-to-end contra el mock en client.integration.spec.ts.
 */

import { ProvisionerPluginError } from '../../../../core/provisioning/types';

import { ResellerClubApiClient } from './client';
import { RESELLERCLUB_SANDBOX_URL } from './http-client';

type FetchMock = jest.Mock<Promise<Response>, [string | URL, RequestInit?]>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ResellerClubApiClient — Sprint 15D Fase 15D.C', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: FetchMock;
  let client: ResellerClubApiClient;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn() as unknown as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    client = new ResellerClubApiClient({
      baseUrl: RESELLERCLUB_SANDBOX_URL,
      authUserId: 'uid',
      apiKey: 'key',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  function lastUrl(): URL {
    return new URL(String(fetchMock.mock.calls[0][0]));
  }
  function lastBody(): URLSearchParams {
    return new URLSearchParams(
      (fetchMock.mock.calls[0][1]?.body as string) ?? '',
    );
  }

  // ─── Pre-venta ──────────────────────────────────────────────────────────────

  it('checkAvailability envía domain-name + tlds y devuelve el objeto por FQDN', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        'aelium.com': { classkey: 'domcno', status: 'available' },
      }),
    );
    const res = await client.checkAvailability('aelium', ['com']);
    expect(lastUrl().pathname).toBe('/api/domains/available.json');
    expect(lastUrl().searchParams.get('domain-name')).toBe('aelium');
    expect(lastUrl().searchParams.getAll('tlds')).toEqual(['com']);
    expect(res['aelium.com'].status).toBe('available');
  });

  // ─── Ids escalares ──────────────────────────────────────────────────────────

  it('signupCustomer normaliza el id escalar (número) a string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, 33566240));
    const id = await client.signupCustomer({
      username: 'a@b.test',
      passwd: 'x',
      name: 'A',
      company: 'C',
      'address-line-1': 'l1',
      city: 'M',
      state: 'M',
      country: 'ES',
      zipcode: '28001',
      'phone-cc': '34',
      phone: '600000000',
    });
    expect(id).toBe('33566240');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  });

  it('addContact normaliza el id escalar a string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, 134143114));
    const id = await client.addContact({
      name: 'A',
      company: 'C',
      email: 'a@b.test',
      'address-line-1': 'l1',
      city: 'M',
      state: 'M',
      country: 'ES',
      zipcode: '28001',
      'phone-cc': '34',
      phone: '600000000',
      'customer-id': '33566240',
      type: 'Contact',
    });
    expect(id).toBe('134143114');
  });

  // ─── register: extracción del order-id ──────────────────────────────────────

  it('registerDomain extrae el order-id de entityid', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { entityid: 12345, actionstatus: 'Success' }),
    );
    const orderId = await client.registerDomain(baseRegisterInput());
    expect(orderId).toBe('12345');
  });

  it('registerDomain cae a eaqid si no hay entityid', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { eaqid: '67890' }));
    const orderId = await client.registerDomain(baseRegisterInput());
    expect(orderId).toBe('67890');
  });

  it('registerDomain lanza INVALID_PAYLOAD si no hay id en la respuesta', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { description: 'weird' }),
    );
    await expect(
      client.registerDomain(baseRegisterInput()),
    ).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    } as Partial<ProvisionerPluginError>);
  });

  // ─── searchCustomerByEmail: null vs found ───────────────────────────────────

  it('searchCustomerByEmail devuelve null si recsindb es 0', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { recsonpage: '0', recsindb: '0' }),
    );
    expect(await client.searchCustomerByEmail('nope@aelium.test')).toBeNull();
  });

  it('searchCustomerByEmail extrae el customerid del primer registro', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        recsonpage: '1',
        recsindb: '1',
        '1': { customerid: 33566240, username: 'a@b.test' },
      }),
    );
    expect(await client.searchCustomerByEmail('a@b.test')).toBe('33566240');
  });

  // ─── routing de comando (gestión / admin) ───────────────────────────────────

  it('renewDomain postea a domains/renew con exp-date', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { actionstatus: 'Success' }),
    );
    await client.renewDomain({
      'order-id': '12345',
      years: 1,
      'exp-date': 1893456000,
      'invoice-option': 'NoInvoice',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('domains/renew.json');
    expect(lastBody().get('exp-date')).toBe('1893456000');
  });

  it('modifyNameservers envía los ns como claves duplicadas', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { actionstatus: 'Success' }),
    );
    await client.modifyNameservers('12345', [
      'ns1.aelium.net',
      'ns2.aelium.net',
    ]);
    expect(lastBody().getAll('ns')).toEqual([
      'ns1.aelium.net',
      'ns2.aelium.net',
    ]);
  });

  it('suspendOrder postea a orders/suspend con la razón', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { actionstatus: 'Success' }),
    );
    await client.suspendOrder('12345', 'impago');
    expect(String(fetchMock.mock.calls[0][0])).toContain('orders/suspend.json');
    expect(lastBody().get('reason')).toBe('impago');
  });

  // ─── Transfer-in (15D.II.T1) ────────────────────────────────────────────────

  it('validateTransfer pega a domains/validate-transfer con domain-name', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { domainname: 'x.com', transferable: true }),
    );
    const res = await client.validateTransfer('x.com');
    expect(lastUrl().pathname).toBe('/api/domains/validate-transfer.json');
    expect(lastUrl().searchParams.get('domain-name')).toBe('x.com');
    expect(res.transferable).toBe(true);
  });

  it('transferDomain postea a domains/transfer y extrae el order-id (InProgress)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { entityid: 55501, actionstatus: 'InProgress' }),
    );
    const orderId = await client.transferDomain(baseTransferInput());
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'domains/transfer.json',
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(lastBody().get('auth-code')).toBe('EPP-CODE');
    expect(orderId).toBe('55501');
  });

  it('cancelTransfer postea a domains/cancel-transfer con el order-id', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { actionstatus: 'Success' }),
    );
    await client.cancelTransfer('55501');
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'domains/cancel-transfer.json',
    );
    expect(lastBody().get('order-id')).toBe('55501');
  });

  function baseTransferInput() {
    return {
      'domain-name': 'movethis.com',
      'auth-code': 'EPP-CODE',
      ns: ['ns1.aelium.net', 'ns2.aelium.net'],
      'customer-id': '33566240',
      'reg-contact-id': '134143114',
      'admin-contact-id': '134143114',
      'tech-contact-id': '134143114',
      'billing-contact-id': '134143114',
      'invoice-option': 'NoInvoice' as const,
      'protect-privacy': true,
    };
  }

  function baseRegisterInput() {
    return {
      'domain-name': 'aelium.com',
      years: 1,
      ns: ['ns1.aelium.net', 'ns2.aelium.net'],
      'customer-id': '33566240',
      'reg-contact-id': '134143114',
      'admin-contact-id': '134143114',
      'tech-contact-id': '134143114',
      'billing-contact-id': '134143114',
      'invoice-option': 'NoInvoice' as const,
      'protect-privacy': true,
    };
  }
});
