/**
 * Sprint 15C Fase 15C.D — tests unit del helper canónico
 * `core/provisioning/dns-authority-resolver.ts`. Cubre las 3 ramas de
 * decisión de ADR-082 §6:
 *
 *   1. product.type ∈ hosting/docker → authority='aelium' (zona propia
 *      en plugin DNS authority).
 *   2. product.type === 'domain' → comparar nameservers vs default C3.
 *   3. otros → external.
 *
 * Plugin RC NO se importa — sólo los tests del registry mockeado. R4 OK.
 */

import {
  PluginCapabilities,
  ProvisionerPlugin,
  ServiceWithRelations,
} from './types';
import {
  extractServiceNameservers,
  nameserversMatchAelium,
  resolveDnsAuthority,
} from './dns-authority-resolver';
import { PluginRegistryService } from './plugin-registry';

describe('dns-authority-resolver (ADR-082 §6)', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  function buildPlugin(
    overrides: Partial<PluginCapabilities> = {},
  ): ProvisionerPlugin {
    const capabilities: PluginCapabilities = {
      has_sso_panel: false,
      has_metrics: false,
      has_metrics_history: false,
      requires_server: false,
      provision_mode: 'sync',
      completes_via_task: false,
      supports_reconciliation: false,
      has_dns_management: true,
      supports_suspend: false, // ADR-077 Amendment A4 (override per test si aplica)
      ...overrides,
    };
    return {
      slug: 'enhance_cp',
      contractVersion: 'v2',
      capabilities,
      inlineActions: [],
      manifest: {
        slug: 'enhance_cp',
        version: '1.0.0',
        manifestVersion: 'v1',
        label: 'plugin.enhance_cp.label',
        description: 'plugin.enhance_cp.description',
        configSchema: {},
        secretsSchema: {},
        testConnectionMethod: null,
      },
      provision: jest.fn(),
      deprovision: jest.fn(),
      getStatus: jest.fn(),
      getServiceInfo: jest.fn(),
      getSsoUrl: jest.fn(),
      executeAction: jest.fn(),
    } as unknown as ProvisionerPlugin;
  }

  function buildRegistry(
    plugin: ProvisionerPlugin | null,
  ): PluginRegistryService {
    return {
      getByCapability: jest.fn().mockReturnValue(plugin),
    } as unknown as PluginRegistryService;
  }

  function buildService(
    productType: string,
    metadata: Record<string, unknown> | null = null,
  ): ServiceWithRelations {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-1',
      domain: 'foo.example.com',
      provisioner_slug: 'resellerclub',
      provider_reference: null,
      status: 'active',
      metadata,
      product: {
        id: 'prod-1',
        slug: 'domain-tld',
        name: 'Domain registration',
        type: productType,
        provisioner: 'resellerclub',
        provisioner_config: null,
      },
      client: {
        id: 'user-1',
        email: 'a@b.com',
        first_name: null,
        last_name: null,
        company_name: null,
        phone: null,
        locale: null,
        country_code: null,
      },
    } as unknown as ServiceWithRelations;
  }

  const DEFAULT_NS = ['ns1.aelium.net', 'ns2.aelium.net'];

  // ──────────────────────────────────────────────────────────────────────
  // extractServiceNameservers
  // ──────────────────────────────────────────────────────────────────────

  describe('extractServiceNameservers', () => {
    it('returns array de strings desde metadata.nameservers (string[])', () => {
      const svc = buildService('domain', {
        nameservers: ['NS1.aelium.net.', 'ns2.aelium.net'],
      });
      expect(extractServiceNameservers(svc)).toEqual([
        'ns1.aelium.net.',
        'ns2.aelium.net',
      ]);
    });

    it('returns array desde metadata.nameservers (objects con host)', () => {
      const svc = buildService('domain', {
        nameservers: [{ host: 'ns1.aelium.net' }, { host: 'ns2.aelium.net' }],
      });
      expect(extractServiceNameservers(svc)).toEqual([
        'ns1.aelium.net',
        'ns2.aelium.net',
      ]);
    });

    it('returns array desde string coma-separado', () => {
      const svc = buildService('domain', {
        nameservers: 'ns1.aelium.net, ns2.aelium.net',
      });
      expect(extractServiceNameservers(svc)).toEqual([
        'ns1.aelium.net',
        'ns2.aelium.net',
      ]);
    });

    it('returns [] si metadata es null o nameservers ausente', () => {
      expect(extractServiceNameservers(buildService('domain', null))).toEqual(
        [],
      );
      expect(extractServiceNameservers(buildService('domain', {}))).toEqual([]);
    });

    // Sprint 15C.II Fase G.1.c (§A.2 área 3) — shapes inesperados del proveedor.
    // El resolver es defensivo: ante basura, devuelve [] o filtra lo inválido
    // sin lanzar (un dominio con metadata corrupta cae a 'external', nunca
    // rompe la resolución).
    describe('shapes defensivos (§A.2 área 3)', () => {
      it('returns [] si nameservers es un number', () => {
        expect(
          extractServiceNameservers(
            buildService('domain', { nameservers: 12345 }),
          ),
        ).toEqual([]);
      });

      it('returns [] si nameservers es un objeto (no array, no string)', () => {
        expect(
          extractServiceNameservers(
            buildService('domain', { nameservers: { host: 'ns1.aelium.net' } }),
          ),
        ).toEqual([]);
      });

      it('returns [] si los items son objetos sin `host`', () => {
        expect(
          extractServiceNameservers(
            buildService('domain', { nameservers: [{ foo: 'bar' }, {}] }),
          ),
        ).toEqual([]);
      });

      it('returns [] si `host` no es string', () => {
        expect(
          extractServiceNameservers(
            buildService('domain', { nameservers: [{ host: 123 }] }),
          ),
        ).toEqual([]);
      });

      it('filtra basura mezclada y conserva solo los NS válidos', () => {
        expect(
          extractServiceNameservers(
            buildService('domain', {
              nameservers: [
                null,
                123,
                '',
                '   ',
                { host: 'ns1.aelium.net' },
                'NS2.Aelium.net',
                { foo: 'bar' },
              ],
            }),
          ),
        ).toEqual(['ns1.aelium.net', 'ns2.aelium.net']);
      });

      it('returns [] si nameservers es string de solo comas/espacios', () => {
        expect(
          extractServiceNameservers(
            buildService('domain', { nameservers: '  ,  , ' }),
          ),
        ).toEqual([]);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // nameserversMatchAelium
  // ──────────────────────────────────────────────────────────────────────

  describe('nameserversMatchAelium', () => {
    it('match exacto', () => {
      expect(
        nameserversMatchAelium(
          ['ns1.aelium.net', 'ns2.aelium.net'],
          DEFAULT_NS,
        ),
      ).toBe(true);
    });

    it('match con trailing dot + case + reverse order', () => {
      expect(
        nameserversMatchAelium(
          ['NS2.AELIUM.NET.', 'ns1.aelium.net'],
          DEFAULT_NS,
        ),
      ).toBe(true);
    });

    it('match permitiendo NS extras del cliente', () => {
      expect(
        nameserversMatchAelium(
          ['ns1.aelium.net', 'ns2.aelium.net', 'ns3.cliente-extra.com'],
          DEFAULT_NS,
        ),
      ).toBe(true);
    });

    it('NO match si falta uno de los Aelium', () => {
      expect(nameserversMatchAelium(['ns1.aelium.net'], DEFAULT_NS)).toBe(
        false,
      );
    });

    it('NO match si NS son externos completamente', () => {
      expect(
        nameserversMatchAelium(
          ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
          DEFAULT_NS,
        ),
      ).toBe(false);
    });

    it('NO match si defaultNs vacío (caso degenerado)', () => {
      expect(nameserversMatchAelium(['ns1.aelium.net'], [])).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // resolveDnsAuthority
  // ──────────────────────────────────────────────────────────────────────

  describe('resolveDnsAuthority', () => {
    it('hosting_web → aelium con plugin DNS authority', () => {
      const plugin = buildPlugin();
      const registry = buildRegistry(plugin);
      const svc = buildService('hosting_web');

      const res = resolveDnsAuthority(svc, registry, DEFAULT_NS);

      expect(res.authority).toBe('aelium');
      expect(res.plugin).toBe(plugin);
      expect(res.reason).toBe('hosting_with_managed_zone');
    });

    it('docker_service → aelium con plugin DNS authority', () => {
      const plugin = buildPlugin();
      const registry = buildRegistry(plugin);
      const svc = buildService('docker_service');

      expect(resolveDnsAuthority(svc, registry, DEFAULT_NS).authority).toBe(
        'aelium',
      );
    });

    it('hosting sin plugin DNS authority instalado → external + reason canónico', () => {
      const registry = buildRegistry(null);
      const svc = buildService('hosting_web');

      const res = resolveDnsAuthority(svc, registry, DEFAULT_NS);

      expect(res.authority).toBe('external');
      expect(res.plugin).toBeNull();
      expect(res.reason).toBe('no_dns_authority_plugin_active');
    });

    it('domain con NS Aelium → aelium', () => {
      const plugin = buildPlugin();
      const registry = buildRegistry(plugin);
      const svc = buildService('domain', {
        nameservers: ['ns1.aelium.net', 'ns2.aelium.net'],
      });

      const res = resolveDnsAuthority(svc, registry, DEFAULT_NS);

      expect(res.authority).toBe('aelium');
      expect(res.plugin).toBe(plugin);
      expect(res.reason).toBe('domain_nameservers_match_default');
    });

    it('domain con NS externos → external', () => {
      const plugin = buildPlugin();
      const registry = buildRegistry(plugin);
      const svc = buildService('domain', {
        nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
      });

      const res = resolveDnsAuthority(svc, registry, DEFAULT_NS);

      expect(res.authority).toBe('external');
      expect(res.plugin).toBeNull();
      expect(res.reason).toBe('domain_nameservers_external');
      expect(res.nameservers).toEqual([
        'ns1.cloudflare.com',
        'ns2.cloudflare.com',
      ]);
    });

    it('domain SIN nameservers en metadata → external + reason unknown', () => {
      const plugin = buildPlugin();
      const registry = buildRegistry(plugin);
      const svc = buildService('domain', null);

      const res = resolveDnsAuthority(svc, registry, DEFAULT_NS);

      expect(res.authority).toBe('external');
      expect(res.plugin).toBeNull();
      expect(res.reason).toBe('domain_nameservers_unknown');
    });

    it('domain con NS Aelium pero sin plugin → external + reason no_authority', () => {
      const registry = buildRegistry(null);
      const svc = buildService('domain', {
        nameservers: ['ns1.aelium.net', 'ns2.aelium.net'],
      });

      const res = resolveDnsAuthority(svc, registry, DEFAULT_NS);

      expect(res.authority).toBe('external');
      expect(res.reason).toBe('no_dns_authority_plugin_active');
    });

    it('product type sin zona DNS (we_do_it / support_inside) → external silencioso', () => {
      const plugin = buildPlugin();
      const registry = buildRegistry(plugin);

      const res = resolveDnsAuthority(
        buildService('we_do_it'),
        registry,
        DEFAULT_NS,
      );

      expect(res.authority).toBe('external');
      expect(res.plugin).toBeNull();
      expect(res.reason).toBe('product_type_without_dns_zone');
    });
  });
});
