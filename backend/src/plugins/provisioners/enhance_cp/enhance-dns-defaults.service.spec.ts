/**
 * Sprint 15C Fase 15C.D — tests unit `EnhanceDnsDefaultsService`.
 *
 * Cubre:
 *   - applyClusterNameservers: idempotencia + detección de stale.
 *   - reconcileZoneDefaults: idempotencia (defensivo, NO borra extras).
 *   - normalización de hostname (lowercase + trailing dot).
 *
 * El plugin se mockea con un `getApiClient()` fake que devuelve un cliente
 * HTTP fake. Los métodos del cliente usan jest.fn() para verificar calls.
 */

import { EnhanceDnsDefaultsService } from './enhance-dns-defaults.service';
import { EnhanceProvisionerPlugin } from './enhance.plugin';

describe('EnhanceDnsDefaultsService — Sprint 15C Fase 15C.D (ADR-082 §4 + §5)', () => {
  function buildApiMock(
    initial: {
      defaults?: ReadonlyArray<{
        id: string;
        kind: string;
        name: string;
        value: string;
      }>;
      zone?: ReadonlyArray<{
        id: string;
        kind: string;
        name: string;
        value: string;
      }>;
    } = {},
  ) {
    return {
      listDefaultDnsRecords: jest
        .fn()
        .mockResolvedValue(initial.defaults ?? []),
      addDefaultDnsRecord: jest
        .fn()
        .mockResolvedValue({ id: 'new-default-id' }),
      getDnsZone: jest.fn().mockResolvedValue({
        origin: 'foo.example.com',
        soa: {
          adminEmail: 'hostmaster@foo.example.com',
          nameServer: 'ns1.aelium.net',
          expire: 0,
          refresh: 0,
          retry: 0,
          ttl: 3600,
          serial: 1,
        },
        records: initial.zone ?? [],
      }),
      addDnsRecord: jest.fn().mockResolvedValue({ id: 'new-zone-rec-id' }),
    };
  }

  function buildPlugin(
    api: ReturnType<typeof buildApiMock>,
  ): EnhanceProvisionerPlugin {
    return {
      getApiClient: jest.fn().mockResolvedValue({
        client: api,
        config: {
          baseUrl: 'http://e',
          masterOrgId: 'm',
          reconciliationIntervalHours: 6,
        },
      }),
    } as unknown as EnhanceProvisionerPlugin;
  }

  // ──────────────────────────────────────────────────────────────────────
  // applyClusterNameservers
  // ──────────────────────────────────────────────────────────────────────

  describe('applyClusterNameservers', () => {
    it('cluster vacío → añade ambos NS canónicos', async () => {
      const api = buildApiMock();
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.applyClusterNameservers([
        'ns1.aelium.net',
        'ns2.aelium.net',
      ]);

      expect(api.addDefaultDnsRecord).toHaveBeenCalledTimes(2);
      expect(result.added).toHaveLength(2);
      expect(result.preserved).toHaveLength(0);
      expect(result.stale).toHaveLength(0);
    });

    it('todos los NS ya presentes → no-op (idempotente)', async () => {
      const api = buildApiMock({
        defaults: [
          { id: 'd1', kind: 'NS', name: '@', value: 'ns1.aelium.net' },
          { id: 'd2', kind: 'NS', name: '@', value: 'ns2.aelium.net' },
        ],
      });
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.applyClusterNameservers([
        'ns1.aelium.net',
        'ns2.aelium.net',
      ]);

      expect(api.addDefaultDnsRecord).not.toHaveBeenCalled();
      expect(result.added).toHaveLength(0);
      expect(result.preserved).toHaveLength(2);
      expect(result.stale).toHaveLength(0);
    });

    it('un NS faltante → sólo añade el faltante', async () => {
      const api = buildApiMock({
        defaults: [
          { id: 'd1', kind: 'NS', name: '@', value: 'ns1.aelium.net' },
        ],
      });
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.applyClusterNameservers([
        'ns1.aelium.net',
        'ns2.aelium.net',
      ]);

      expect(api.addDefaultDnsRecord).toHaveBeenCalledTimes(1);
      expect(api.addDefaultDnsRecord).toHaveBeenCalledWith({
        kind: 'NS',
        name: '@',
        value: 'ns2.aelium.net',
      });
      expect(result.added).toHaveLength(1);
      expect(result.preserved).toHaveLength(1);
    });

    it('reporta stale NS legacy sin borrarlos', async () => {
      const api = buildApiMock({
        defaults: [
          { id: 'd1', kind: 'NS', name: '@', value: 'ns1.aelium.net' },
          { id: 'd2', kind: 'NS', name: '@', value: 'ns2.aelium.net' },
          { id: 'd3', kind: 'NS', name: '@', value: 'ns0.legacy.aelium.net' },
        ],
      });
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.applyClusterNameservers([
        'ns1.aelium.net',
        'ns2.aelium.net',
      ]);

      expect(api.addDefaultDnsRecord).not.toHaveBeenCalled();
      expect(result.stale).toHaveLength(1);
      expect(result.stale[0].value).toBe('ns0.legacy.aelium.net');
    });

    it('NS con trailing dot + uppercase se matchea correctamente', async () => {
      const api = buildApiMock({
        defaults: [
          { id: 'd1', kind: 'NS', name: '@', value: 'NS1.aelium.net.' },
        ],
      });
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.applyClusterNameservers(['ns1.aelium.net']);

      expect(api.addDefaultDnsRecord).not.toHaveBeenCalled();
      expect(result.preserved).toHaveLength(1);
    });

    it('lanza si se invoca con array vacío (R7)', async () => {
      const api = buildApiMock();
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      await expect(svc.applyClusterNameservers([])).rejects.toThrow(
        /must be non-empty/,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // reconcileZoneDefaults
  // ──────────────────────────────────────────────────────────────────────

  describe('reconcileZoneDefaults', () => {
    it('zona ya tiene los defaults canónicos → no-op', async () => {
      const api = buildApiMock({
        zone: [
          { id: 'r1', kind: 'NS', name: '@', value: 'ns1.aelium.net' },
          { id: 'r2', kind: 'NS', name: '@', value: 'ns2.aelium.net' },
        ],
      });
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.reconcileZoneDefaults(
        'org-1',
        'ws-1',
        'foo.example.com',
        ['ns1.aelium.net', 'ns2.aelium.net'],
      );

      expect(api.addDnsRecord).not.toHaveBeenCalled();
      expect(result.added).toHaveLength(0);
      expect(result.preserved).toHaveLength(2);
    });

    it('zona con un NS faltante → lo añade', async () => {
      const api = buildApiMock({
        zone: [{ id: 'r1', kind: 'NS', name: '@', value: 'ns1.aelium.net' }],
      });
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.reconcileZoneDefaults(
        'org-1',
        'ws-1',
        'foo.example.com',
        ['ns1.aelium.net', 'ns2.aelium.net'],
      );

      expect(api.addDnsRecord).toHaveBeenCalledTimes(1);
      expect(api.addDnsRecord).toHaveBeenCalledWith(
        'org-1',
        'ws-1',
        'foo.example.com',
        { kind: 'NS', name: '@', value: 'ns2.aelium.net' },
      );
      expect(result.added).toHaveLength(1);
    });

    it('zona con records inesperados extra → NO los borra (defensivo)', async () => {
      const api = buildApiMock({
        zone: [
          { id: 'r1', kind: 'NS', name: '@', value: 'ns1.aelium.net' },
          { id: 'r2', kind: 'NS', name: '@', value: 'ns2.aelium.net' },
          // Records custom del cliente — NO deben tocarse
          {
            id: 'r3',
            kind: 'CNAME',
            name: 'mail',
            value: 'mail.proveedor.com',
          },
          { id: 'r4', kind: 'TXT', name: '@', value: 'v=spf1 include:_spf...' },
        ],
      });
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.reconcileZoneDefaults(
        'org-1',
        'ws-1',
        'foo.example.com',
        ['ns1.aelium.net', 'ns2.aelium.net'],
      );

      expect(api.addDnsRecord).not.toHaveBeenCalled();
      // El servicio sólo expone los preserved canónicos (NS de defaults).
      expect(result.preserved).toHaveLength(2);
    });

    it('expectedNameservers vacío → no-op silencioso (degrada)', async () => {
      const api = buildApiMock({
        zone: [{ id: 'r1', kind: 'NS', name: '@', value: 'ns1.aelium.net' }],
      });
      const svc = new EnhanceDnsDefaultsService(buildPlugin(api));

      const result = await svc.reconcileZoneDefaults(
        'org-1',
        'ws-1',
        'foo.example.com',
        [],
      );

      expect(api.addDnsRecord).not.toHaveBeenCalled();
      expect(api.getDnsZone).not.toHaveBeenCalled();
      expect(result.added).toHaveLength(0);
    });
  });
});
