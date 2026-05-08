/* eslint-disable
   @typescript-eslint/unbound-method,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument
*/
// Doctrina TS-ESLint para specs Jest: deshabilitar a nivel de archivo.
// `unbound-method`: falsos positivos en `expect(mock.method).toHaveBeenCalled()`.
// `no-unsafe-*`: `expect.objectContaining(...)` y mocks tipan como `any`.

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { CircuitBreakerRegistry } from '../../core/provisioning/circuit-breaker';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import { SecretVaultService } from '../../core/security/secret-vault.service';
import {
  EMPTY_PLUGIN_SCHEMA,
  PluginManifest,
  ProvisionerPlugin,
} from '../../core/provisioning/types';

import { AdminPluginsService } from './admin-plugins.service';

const VALID_KEY = 'a'.repeat(64);

function buildVault(): SecretVaultService {
  const config = {
    getOrThrow: jest.fn().mockReturnValue(VALID_KEY),
  } as unknown as ConfigService;
  return new SecretVaultService(config);
}

function buildPlugin(
  slug: string,
  manifestOver: Partial<PluginManifest> = {},
): ProvisionerPlugin {
  const manifest: PluginManifest = {
    slug,
    version: '1.0.0',
    manifestVersion: 'v1',
    label: `plugin.${slug}.label`,
    description: `plugin.${slug}.description`,
    docsUrl: `docs/test/${slug}.md`,
    settingsCategory: 'provisioner',
    configSchema: {
      type: 'object',
      properties: {
        base_url: { type: 'string', format: 'uri' },
        branch_id: { type: 'string', minLength: 1 },
      },
      required: ['base_url'],
      additionalProperties: false,
    },
    secretsSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', minLength: 5, format: 'password' },
      },
      required: ['api_key'],
      additionalProperties: false,
    },
    testConnectionMethod: 'getStatus',
    ...manifestOver,
  };
  return {
    slug,
    contractVersion: 'v2',
    capabilities: {
      has_sso_panel: false,
      has_metrics: false,
      has_metrics_history: false,
      requires_server: false,
      provision_mode: 'sync',
      completes_via_task: false,
      supports_reconciliation: false,
      has_dns_management: false, // ADR-077 Amendment A1
    },
    inlineActions: [],
    manifest,
    provision: jest.fn(),
    deprovision: jest.fn(),
    getStatus: jest.fn().mockResolvedValue({
      status: 'active',
      checkedAt: new Date().toISOString(),
    }),
    getServiceInfo: jest.fn(),
    getSsoUrl: jest.fn(),
    executeAction: jest.fn(),
  };
}

describe('AdminPluginsService â€” Sprint 15A Fase G (ADR-080)', () => {
  let prisma: {
    pluginInstall: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let registry: jest.Mocked<PluginRegistryService>;
  let vault: SecretVaultService;
  let audit: { logChange: jest.Mock };
  let events: { emit: jest.Mock };
  let breakers: jest.Mocked<CircuitBreakerRegistry>;
  let service: AdminPluginsService;

  const enhancePlugin = buildPlugin('enhance-cp');

  beforeEach(() => {
    prisma = {
      pluginInstall: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    registry = {
      getAvailable: jest.fn(),
      get: jest.fn(),
      listAvailableSlugs: jest.fn().mockReturnValue(['enhance-cp']),
      listSlugs: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<PluginRegistryService>;
    registry.getAvailable.mockImplementation((slug: string) =>
      slug === 'enhance-cp' ? enhancePlugin : null,
    );
    vault = buildVault();
    audit = { logChange: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };
    breakers = {
      getOrCreate: jest.fn(),
      get: jest.fn().mockReturnValue(null),
      listNames: jest.fn().mockReturnValue([]),
      resetAll: jest.fn(),
    } as unknown as jest.Mocked<CircuitBreakerRegistry>;

    service = new AdminPluginsService(
      prisma as never,
      registry,
      vault,
      audit as never,
      events as unknown as EventEmitter2,
      breakers,
    );
    service.onModuleInit();
  });

  describe('list()', () => {
    it('devuelve un summary por plugin disponible con manifest + estado', async () => {
      prisma.pluginInstall.findMany.mockResolvedValueOnce([
        {
          slug: 'enhance-cp',
          enabled: true,
          updated_at: new Date('2026-05-05T10:00:00Z'),
        },
      ]);

      const result = await service.list();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          slug: 'enhance-cp',
          enabled: true,
          manifest: expect.objectContaining({ slug: 'enhance-cp' }),
          circuit_state: { getServiceInfo: null, executeAction: null },
        }),
      );
    });

    it('plugin disponible sin install row â†’ enabled=false', async () => {
      prisma.pluginInstall.findMany.mockResolvedValueOnce([]);
      const result = await service.list();
      expect(result[0].enabled).toBe(false);
    });
  });

  describe('findOne(slug)', () => {
    it('lanza NotFound si el plugin no estÃ¡ validado', async () => {
      registry.getAvailable.mockReturnValueOnce(null);
      await expect(service.findOne('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('enmascara secrets seteados como "***" y los no seteados como null', async () => {
      const apiKeyBlob = vault.encrypt('sk_live_secret');
      prisma.pluginInstall.findUnique.mockResolvedValueOnce({
        slug: 'enhance-cp',
        enabled: true,
        config: { base_url: 'https://api.example.com' },
        secrets: { api_key: apiKeyBlob },
        installed_at: new Date('2026-05-05T10:00:00Z'),
        updated_at: new Date('2026-05-05T10:00:00Z'),
      });

      const detail = await service.findOne('enhance-cp');
      expect(detail.secrets).toEqual({ api_key: '***' });
      expect(detail.config).toEqual({ base_url: 'https://api.example.com' });
    });

    it('plugin sin install row â†’ secrets devueltos como null por campo declarado', async () => {
      prisma.pluginInstall.findUnique.mockResolvedValueOnce(null);
      const detail = await service.findOne('enhance-cp');
      expect(detail.enabled).toBe(false);
      expect(detail.secrets).toEqual({ api_key: null });
    });
  });

  describe('update(slug, dto)', () => {
    it('lanza NotFound si plugin no validado', async () => {
      registry.getAvailable.mockReturnValueOnce(null);
      await expect(
        service.update('ghost', 'admin-1', { enabled: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza BadRequest con INVALID_PLUGIN_CONFIG si config rompe el schema', async () => {
      prisma.pluginInstall.findUnique.mockResolvedValueOnce(null);
      try {
        await service.update('enhance-cp', 'admin-1', {
          // base_url es required â†’ falta.
          config: { branch_id: 'uk-1' },
        });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as {
          code: string;
          details: unknown[];
        };
        expect(response.code).toBe('INVALID_PLUGIN_CONFIG');
        expect(response.details.length).toBeGreaterThan(0);
      }
    });

    it('lanza BadRequest con INVALID_PLUGIN_SECRETS si secrets rompe el schema', async () => {
      prisma.pluginInstall.findUnique.mockResolvedValueOnce(null);
      try {
        await service.update('enhance-cp', 'admin-1', {
          // api_key minLength=5 â†’ demasiado corto.
          secrets: { api_key: 'abc' },
        });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as {
          code: string;
        };
        expect(response.code).toBe('INVALID_PLUGIN_SECRETS');
      }
    });

    it('cifra secrets nuevos + persiste + emite plugin.config_changed + audit con secrets enmascarados', async () => {
      prisma.pluginInstall.findUnique.mockResolvedValueOnce(null);
      prisma.pluginInstall.upsert.mockResolvedValueOnce({
        slug: 'enhance-cp',
        enabled: true,
        installed_at: new Date('2026-05-05T10:00:00Z'),
        updated_at: new Date('2026-05-05T10:00:00Z'),
      });

      await service.update('enhance-cp', 'admin-1', {
        enabled: true,
        config: { base_url: 'https://api.example.com', branch_id: 'uk-1' },
        secrets: { api_key: 'sk_live_secret_long_enough' },
      });

      // Persistencia con secrets cifrados (no plaintext).
      const upsertCall = prisma.pluginInstall.upsert.mock.calls[0][0];
      const persistedSecrets = upsertCall.create.secrets as Record<
        string,
        { ciphertext: string; iv: string; tag: string; key_version: number }
      >;
      expect(persistedSecrets.api_key.ciphertext).not.toBe(
        'sk_live_secret_long_enough',
      );
      expect(persistedSecrets.api_key.key_version).toBe(1);
      // Round-trip: descifrar manualmente con el vault produce el plaintext.
      expect(vault.decrypt(persistedSecrets.api_key)).toBe(
        'sk_live_secret_long_enough',
      );

      // Audit con secrets enmascarados (NUNCA plaintext en audit).
      // entity_id es UUID v5 derivado del slug (audit_change_log Â§schema
      // strict UUID); el slug real vive en changes_*.slug.
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'Plugin',
          entity_id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
          action: 'plugin.config_changed',
          changes_after: expect.objectContaining({
            slug: 'enhance-cp',
            enabled: true,
            secrets: { api_key: '<set>' },
          }),
        }),
      );

      // Emit plugin.config_changed.
      expect(events.emit).toHaveBeenCalledWith(
        'plugin.config_changed',
        expect.objectContaining({
          slug: 'enhance-cp',
          changed_by: 'admin-1',
          secrets_modified: true,
        }),
      );

      // Emit plugin.installed (primera vez enabled).
      expect(events.emit).toHaveBeenCalledWith(
        'plugin.installed',
        expect.objectContaining({
          slug: 'enhance-cp',
          installed_by: 'admin-1',
        }),
      );
    });

    it('parcial-update: si secrets se omiten, preserva los existentes cifrados', async () => {
      const existingApiKey = vault.encrypt('sk_existing_long_enough');
      prisma.pluginInstall.findUnique.mockResolvedValueOnce({
        slug: 'enhance-cp',
        enabled: true,
        config: { base_url: 'https://api.example.com' },
        secrets: { api_key: existingApiKey },
        installed_at: new Date('2026-05-05T10:00:00Z'),
        updated_at: new Date('2026-05-05T10:00:00Z'),
      });
      prisma.pluginInstall.upsert.mockResolvedValueOnce({
        slug: 'enhance-cp',
        enabled: true,
        installed_at: new Date('2026-05-05T10:00:00Z'),
        updated_at: new Date('2026-05-05T11:00:00Z'),
      });

      // PATCH solo cambia config â€” secrets se omiten.
      await service.update('enhance-cp', 'admin-1', {
        config: { base_url: 'https://api2.example.com', branch_id: 'uk-2' },
      });

      const upsertCall = prisma.pluginInstall.upsert.mock.calls[0][0];
      const persistedSecrets = upsertCall.update.secrets;
      // El campo api_key debe seguir presente en el output cifrado.
      expect(persistedSecrets.api_key).toBeDefined();
      // Y el plaintext recuperado debe ser el original.
      expect(vault.decrypt(persistedSecrets.api_key)).toBe(
        'sk_existing_long_enough',
      );

      // secrets_modified=false en este caso.
      expect(events.emit).toHaveBeenCalledWith(
        'plugin.config_changed',
        expect.objectContaining({ secrets_modified: false }),
      );
    });

    it('reset() del breaker cuando config o secrets cambian', async () => {
      const fakeBreaker = {
        execute: jest.fn(),
        getState: jest.fn().mockReturnValue('open'),
        reset: jest.fn(),
      };
      breakers.get.mockImplementation((name: string) =>
        name === 'enhance-cp:getServiceInfo' ? fakeBreaker : null,
      );

      prisma.pluginInstall.findUnique.mockResolvedValueOnce({
        slug: 'enhance-cp',
        enabled: true,
        config: { base_url: 'https://api.example.com' },
        secrets: {},
        installed_at: new Date(),
        updated_at: new Date(),
      });
      prisma.pluginInstall.upsert.mockResolvedValueOnce({
        slug: 'enhance-cp',
        enabled: true,
        installed_at: new Date(),
        updated_at: new Date(),
      });

      await service.update('enhance-cp', 'admin-1', {
        config: { base_url: 'https://api2.example.com' },
      });

      expect(fakeBreaker.reset).toHaveBeenCalled();
    });
  });

  describe('testConnection(slug)', () => {
    it('lanza BadRequest si manifest.testConnectionMethod no es getStatus', async () => {
      const noTestPlugin = buildPlugin('manual', {
        testConnectionMethod: null,
        configSchema: EMPTY_PLUGIN_SCHEMA,
        secretsSchema: EMPTY_PLUGIN_SCHEMA,
      });
      registry.getAvailable.mockReturnValueOnce(noTestPlugin);
      await expect(service.testConnection('manual')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('success=true si plugin.getStatus reporta status vÃ¡lido', async () => {
      const result = await service.testConnection('enhance-cp');
      expect(result.success).toBe(true);
      expect(enhancePlugin.getStatus).toHaveBeenCalled();
    });

    it('success=false si plugin.getStatus lanza error', async () => {
      (enhancePlugin.getStatus as jest.Mock).mockRejectedValueOnce(
        new Error('credentials invalid'),
      );
      const result = await service.testConnection('enhance-cp');
      expect(result.success).toBe(false);
      expect(result.message).toBe('credentials invalid');
    });

    it('success=false si plugin reporta status="failed"', async () => {
      (enhancePlugin.getStatus as jest.Mock).mockResolvedValueOnce({
        status: 'failed',
        statusReason: 'auth failed',
        checkedAt: new Date().toISOString(),
      });
      const result = await service.testConnection('enhance-cp');
      expect(result.success).toBe(false);
      expect(result.message).toBe('auth failed');
    });
  });
});
