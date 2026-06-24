/**
 * Sprint 15D Fase 15D.G (cierre core) — smoke VERTICAL de gestión curada:
 * `executeAction` ↔ `getServiceInfo` del plugin RC contra el
 * `MockResellerClubServer` real (HTTP sobre puerto efímero).
 *
 * Gap que cierra (red de seguridad L20, ADR-081 §10/§11):
 *   - El spec unit (`resellerclub.plugin.spec.ts`) ejercita los handlers de
 *     `executeAction` con el CLIENTE MOCKEADO (`jest.spyOn` devuelve un objeto
 *     con `modifyNameservers`/`getDomainDetailsByOrderId`…). El round-trip HTTP
 *     contra los SHAPES REALES de RC (verify-after-write leyendo `ns1..ns4`,
 *     `currentstatus:'transferlock'`, `isprivacyprotected`, `entitystatus:'Suspended'`,
 *     `domsecret`) NO se ejercita a nivel plugin.
 *   - El `api/client.integration.spec.ts` cubre cada MÉTODO del cliente aislado
 *     contra el mock, pero NO el LOOP cliente-facing que el dashboard expone:
 *     `executeAction` (write) → `getServiceInfo` (read → `DomainInfo`), ni las
 *     interacciones cross-action (registrar lock ⇒ auth-code bloqueado;
 *     suspend ⇒ `availableActions` reordenadas).
 *
 * Aquí se cubre ese vertical end-to-end (ADR-077 A10 gestión + A11 `DomainInfo`):
 * cada mutación se confirma releyendo el estado del proveedor por el camino real
 * del plugin (DH-INV-6: el registrar manda). Mock-only — `executeAction`/
 * `getServiceInfo` solo usan `getApiClient` (espiado → mock) + `provider_reference`,
 * así que NO necesita Postgres y corre en la suite unit (cada PR). CI usa SIEMPRE
 * el mock, nunca OT&E live (ADR-081 §11).
 */

import { ServiceWithRelations } from '../../../core/provisioning/types';

import { ResellerClubApiClient, RcRegisterInput } from './api';
import { ResellerclubProvisionerPlugin } from './resellerclub.plugin';
import { startMockResellerClubServer } from '../../../../test/mocks/resellerclub-server';

const AUTH = { authUserId: 'uid-mgmt', apiKey: 'key-mgmt' };
const AELIUM_NS = ['ns1.aelium.net', 'ns2.aelium.net'];

describe('Integración 15D.G — gestión curada vertical (executeAction ↔ getServiceInfo @ mock real)', () => {
  let mock: Awaited<ReturnType<typeof startMockResellerClubServer>>;
  let apiClient: ResellerClubApiClient;
  let plugin: ResellerclubProvisionerPlugin;

  beforeAll(async () => {
    mock = await startMockResellerClubServer({ seed: { ...AUTH } });
    apiClient = new ResellerClubApiClient({ baseUrl: mock.baseUrl, ...AUTH });
  });

  afterAll(async () => {
    await mock.stop();
  });

  beforeEach(() => {
    // El plugin no usa prisma/vault/customers/settings en executeAction/getServiceInfo
    // (solo getApiClient, que espiamos al cliente@mock) → null seguro.
    plugin = new ResellerclubProvisionerPlugin(
      null as never,
      null as never,
      null as never,
      null as never,
    );
    jest
      .spyOn(plugin, 'getApiClient')
      .mockResolvedValue({ client: apiClient, config: {} as never });
  });

  /** Registra un dominio fresco en el mock (vía cliente directo — sin Postgres) y devuelve su order-id. */
  async function registerFreshDomain(fqdn: string): Promise<string> {
    const input: RcRegisterInput = {
      'domain-name': fqdn,
      years: 1,
      ns: AELIUM_NS,
      'customer-id': '1',
      'reg-contact-id': '1',
      'admin-contact-id': '1',
      'tech-contact-id': '1',
      'billing-contact-id': '1',
      'invoice-option': 'NoInvoice',
      'protect-privacy': true,
    };
    return apiClient.registerDomain(input);
  }

  /** `ServiceWithRelations` mínimo: las acciones de gestión solo leen provider_reference + domain. */
  function svc(orderId: string, fqdn: string): ServiceWithRelations {
    return {
      id: `svc-${fqdn}`,
      user_id: 'user-mgmt',
      domain: fqdn,
      label: fqdn,
      provider_reference: orderId,
      metadata: {},
    } as never;
  }

  it('modify_nameservers → verify-after-write + getServiceInfo refleja los NS nuevos', async () => {
    const orderId = await registerFreshDomain('mgmtns.com');
    const service = svc(orderId, 'mgmtns.com');

    const res = await plugin.executeAction(service, 'modify_nameservers', {
      nameservers: ['ns5.aelium.net', 'ns6.aelium.net'],
    });
    expect(res.success).toBe(true);
    // verify-after-write: el plugin relee details y devuelve los NS APLICADOS.
    expect(res.data).toEqual({
      nameservers: ['ns5.aelium.net', 'ns6.aelium.net'],
    });

    // Loop cliente-facing: getServiceInfo deriva DomainInfo.nameservers de details real.
    const info = await plugin.getServiceInfo(service);
    expect(info.domain?.nameservers).toEqual([
      'ns5.aelium.net',
      'ns6.aelium.net',
    ]);
  });

  it('toggle_privacy off→on → getServiceInfo.whoisPrivacy round-trip', async () => {
    const orderId = await registerFreshDomain('privacytest.com');
    const service = svc(orderId, 'privacytest.com');

    const off = await plugin.executeAction(service, 'toggle_privacy', {
      enabled: false,
      reason: 'el cliente lo pidió',
    });
    expect(off.data).toEqual({ whoisPrivacy: false });
    expect((await plugin.getServiceInfo(service)).domain?.whoisPrivacy).toBe(
      false,
    );

    await plugin.executeAction(service, 'toggle_privacy', { enabled: true });
    expect((await plugin.getServiceInfo(service)).domain?.whoisPrivacy).toBe(
      true,
    );
  });

  it('toggle_registrar_lock gobierna el auth-code: lock ⇒ REGISTRAR_LOCKED; unlock ⇒ domsecret real', async () => {
    const orderId = await registerFreshDomain('locktest.com');
    const service = svc(orderId, 'locktest.com');

    // Sin lock: DomainInfo lo refleja + el auth-code (domsecret) es obtenible.
    let info = await plugin.getServiceInfo(service);
    expect(info.domain?.registrarLock).toBe(false);
    expect(info.domain?.authCodeAvailable).toBe(true);
    const code = await plugin.executeAction(service, 'get_auth_code', {});
    expect(code.data).toEqual({ authCode: `Auth-${orderId}` });

    // Lock ON → currentstatus 'transferlock' en details real → auth-code bloqueado.
    await plugin.executeAction(service, 'toggle_registrar_lock', {
      locked: true,
    });
    info = await plugin.getServiceInfo(service);
    expect(info.domain?.registrarLock).toBe(true);
    expect(info.domain?.authCodeAvailable).toBe(false);
    await expect(
      plugin.executeAction(service, 'get_auth_code', {}),
    ).rejects.toMatchObject({ code: 'REGISTRAR_LOCKED', retriable: false });

    // Unlock → auth-code obtenible de nuevo.
    await plugin.executeAction(service, 'toggle_registrar_lock', {
      locked: false,
    });
    const reopened = await plugin.executeAction(service, 'get_auth_code', {});
    expect(reopened.data).toEqual({ authCode: `Auth-${orderId}` });
  });

  it('suspend/unsuspend → getServiceInfo.status + availableActions (filterActionsByStatus) coherentes', async () => {
    const orderId = await registerFreshDomain('suspendtest.com');
    const service = svc(orderId, 'suspendtest.com');

    // Activo: se ofrece suspend, no unsuspend.
    let info = await plugin.getServiceInfo(service);
    expect(info.status).toBe('active');
    let slugs = info.availableActions.map((a) => a.slug);
    expect(slugs).toContain('suspend_service');
    expect(slugs).not.toContain('unsuspend_service');

    // Suspendido: entitystatus 'Suspended' en details real → status suspended +
    // la UI ofrece unsuspend, no suspend.
    await plugin.executeAction(service, 'suspend_service', {
      reason: 'impago',
    });
    info = await plugin.getServiceInfo(service);
    expect(info.status).toBe('suspended');
    slugs = info.availableActions.map((a) => a.slug);
    expect(slugs).toContain('unsuspend_service');
    expect(slugs).not.toContain('suspend_service');

    // Reactivado → vuelve a active.
    await plugin.executeAction(service, 'unsuspend_service', {});
    expect((await plugin.getServiceInfo(service)).status).toBe('active');
  });
});
