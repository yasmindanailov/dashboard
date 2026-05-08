/* eslint-disable @typescript-eslint/unbound-method */
// `unbound-method` produce falsos positivos en specs Jest cuando se hace
// `expect(mock.method).toHaveBeenCalled()`. Doctrina oficial TS-ESLint para
// specs: deshabilitar a nivel de archivo. Solo aplica a este `.spec.ts`.

import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  executeActionWithCacheInvalidation,
  getServiceInfoWithCache,
  getSsoUrlWithAudit,
} from './plugin-utils';
import type { ProvisioningCacheService } from './provisioning-cache.service';
import {
  EMPTY_PLUGIN_SCHEMA,
  PluginManifest,
  ProvisionerPlugin,
  ProvisionerPluginError,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ServiceInfo,
  ServiceWithRelations,
} from './types';

const TEST_MANIFEST: PluginManifest = {
  slug: 'internal',
  version: '0.0.0-test',
  manifestVersion: 'v1',
  label: 'plugin.internal.label',
  description: 'plugin.internal.description',
  docsUrl: 'docs/test/internal.md',
  settingsCategory: 'provisioner',
  configSchema: EMPTY_PLUGIN_SCHEMA,
  secretsSchema: EMPTY_PLUGIN_SCHEMA,
  testConnectionMethod: null,
};

/**
 * Tests unit de wrappers cross-cutting â€” Sprint 11 Fase 11.B (ADR-077 Â§5).
 *
 * Cobertura mÃ­nima:
 *   - getServiceInfoWithCache:
 *     Â· cache hit â†’ no llama plugin.
 *     Â· cache miss â†’ llama plugin, escribe cache, emite metrics_fetched.
 *     Â· plugin lanza ProvisionerPluginError(retriable=false) â†’ fallback unknown
 *       cacheado 30s.
 *     Â· forceRevalidate=true salta cache aunque haya hit.
 *   - executeActionWithCacheInvalidation:
 *     Â· slug no declarado â†’ success=false sin llamar plugin.
 *     Â· slug vÃ¡lido â†’ invalida cache + emite action_executed + audit logChange.
 *   - getSsoUrlWithAudit:
 *     Â· plugin con has_sso_panel=false â†’ null sin llamar plugin.
 *     Â· plugin con SSO â†’ emite sso_opened + audit logAccess.
 *     Â· plugin lanza error â†’ null + log (no relanza).
 */

const mockService = {
  id: 'svc-1',
  user_id: 'user-1',
  label: 'Web demo',
  domain: 'demo.aelium.net',
  product: { name: 'Hosting Pro' },
} as unknown as ServiceWithRelations;

function buildPlugin(over: Partial<ProvisionerPlugin> = {}): ProvisionerPlugin {
  return {
    slug: 'internal',
    contractVersion: PROVISIONER_PLUGIN_CONTRACT_VERSION,
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
    manifest: TEST_MANIFEST,
    provision: jest.fn(),
    deprovision: jest.fn(),
    getStatus: jest.fn(),
    getServiceInfo: jest.fn(),
    getSsoUrl: jest.fn(),
    executeAction: jest.fn(),
    ...over,
  };
}

const sampleInfo = (): ServiceInfo => ({
  status: 'active',
  display: { primary: 'demo.aelium.net' },
  capabilities: {
    has_sso_panel: false,
    has_metrics: false,
    has_metrics_history: false,
    requires_server: false,
    provision_mode: 'sync',
    completes_via_task: false,
    supports_reconciliation: false,
    has_dns_management: false, // ADR-077 Amendment A1
    hasSsoPanel: false,
    inlineActions: [],
  },
  availableActions: [],
  fetchedAt: new Date().toISOString(),
});

function buildCache(): jest.Mocked<ProvisioningCacheService> {
  return {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
    invalidateAll: jest.fn(),
  } as unknown as jest.Mocked<ProvisioningCacheService>;
}

function buildEvents(): EventEmitter2 {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

function buildAudit(): { logAccess: jest.Mock; logChange: jest.Mock } {
  return { logAccess: jest.fn(), logChange: jest.fn() };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// getServiceInfoWithCache
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('getServiceInfoWithCache â€” Sprint 11 Fase 11.B', () => {
  it('cache hit devuelve sin llamar plugin', async () => {
    const cached = sampleInfo();
    const cache = buildCache();
    cache.get.mockResolvedValueOnce(cached);
    const events = buildEvents();
    const plugin = buildPlugin();

    const out = await getServiceInfoWithCache(
      plugin,
      mockService,
      cache,
      events,
      {
        ttlSeconds: 60,
      },
    );

    expect(out).toBe(cached);
    expect(plugin.getServiceInfo).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('cache miss llama plugin, escribe cache y emite metrics_fetched', async () => {
    const cache = buildCache();
    cache.get.mockResolvedValueOnce(null);
    const events = buildEvents();
    const fresh = sampleInfo();
    const plugin = buildPlugin({
      getServiceInfo: jest.fn().mockResolvedValue(fresh),
    });

    const out = await getServiceInfoWithCache(
      plugin,
      mockService,
      cache,
      events,
      {
        ttlSeconds: 90,
      },
    );

    expect(out).toBe(fresh);
    expect(plugin.getServiceInfo).toHaveBeenCalledWith(mockService);
    expect(cache.set).toHaveBeenCalledWith('svc-1', fresh, 90);
    expect(events.emit).toHaveBeenCalledWith(
      'service.metrics_fetched',
      expect.objectContaining({
        service_id: 'svc-1',
        provisioner_slug: 'internal',
      }),
    );
  });

  it('plugin lanza ProvisionerPluginError(retriable=false) â†’ fallback unknown TTL 30s', async () => {
    const cache = buildCache();
    cache.get.mockResolvedValueOnce(null);
    const events = buildEvents();
    const plugin = buildPlugin({
      getServiceInfo: jest
        .fn()
        .mockRejectedValue(
          new ProvisionerPluginError(
            'auth failed',
            'PROVIDER_AUTH_FAILED',
            false,
          ),
        ),
    });

    const out = await getServiceInfoWithCache(
      plugin,
      mockService,
      cache,
      events,
      {
        ttlSeconds: 60,
      },
    );

    expect(out.status).toBe('unknown');
    expect(out.statusReason).toBe('Provider unavailable');
    expect(cache.set).toHaveBeenCalledWith(
      'svc-1',
      expect.objectContaining({ status: 'unknown' }),
      30,
    );
  });

  it('forceRevalidate salta cache aunque haya hit', async () => {
    const cache = buildCache();
    cache.get.mockResolvedValueOnce(sampleInfo());
    const events = buildEvents();
    const fresh = sampleInfo();
    const plugin = buildPlugin({
      getServiceInfo: jest.fn().mockResolvedValue(fresh),
    });

    const out = await getServiceInfoWithCache(
      plugin,
      mockService,
      cache,
      events,
      {
        ttlSeconds: 60,
        forceRevalidate: true,
      },
    );

    expect(plugin.getServiceInfo).toHaveBeenCalled();
    expect(out).toBe(fresh);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// executeActionWithCacheInvalidation
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('executeActionWithCacheInvalidation â€” Sprint 11 Fase 11.B', () => {
  const ctx = {
    actorUserId: 'user-1',
    ipAddress: '10.0.0.1',
    userAgent: 'jest',
  };

  it('slug no declarado â†’ success=false, no llama plugin', async () => {
    const cache = buildCache();
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildPlugin({ inlineActions: [] });

    const result = await executeActionWithCacheInvalidation(
      plugin,
      mockService,
      'unknown-action',
      {},
      ctx,
      cache,
      events,
      audit as never,
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe('action.unknown');
    expect(plugin.executeAction).not.toHaveBeenCalled();
  });

  it('slug vÃ¡lido â†’ invalida cache + emite action_executed + audit logChange', async () => {
    const cache = buildCache();
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildPlugin({
      inlineActions: [
        {
          slug: 'restart',
          label: 'Restart',
          confirmRequired: true,
          destructive: false,
        },
      ],
      executeAction: jest.fn().mockResolvedValue({
        success: true,
        sideEffects: ['service.restarted'],
      }),
    });

    const result = await executeActionWithCacheInvalidation(
      plugin,
      mockService,
      'restart',
      {},
      ctx,
      cache,
      events,
      audit as never,
    );

    expect(result.success).toBe(true);
    expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
    expect(audit.logChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'Service',
        entity_id: 'svc-1',
        action: 'service.action_executed:restart',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'service.action_executed',
      expect.objectContaining({
        service_id: 'svc-1',
        action_slug: 'restart',
        success: true,
      }),
    );
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// getSsoUrlWithAudit
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('getSsoUrlWithAudit â€” Sprint 11 Fase 11.B', () => {
  const ctx = {
    actorUserId: 'user-1',
    ipAddress: '10.0.0.1',
    userAgent: 'jest',
  };

  it('has_sso_panel=false â†’ null sin llamar plugin', async () => {
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildPlugin();

    const out = await getSsoUrlWithAudit(
      plugin,
      mockService,
      ctx,
      events,
      audit as never,
    );

    expect(out).toBeNull();
    expect(plugin.getSsoUrl).not.toHaveBeenCalled();
  });

  it('plugin con SSO â†’ emite sso_opened + audit logAccess', async () => {
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildPlugin({
      capabilities: {
        has_sso_panel: true,
        panel_label: 'cPanel',
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: false,
        supports_reconciliation: true,
        has_dns_management: false, // ADR-077 Amendment A1
      },
      getSsoUrl: jest.fn().mockResolvedValue({
        url: 'https://cpanel.example.com/?sk=abc',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        panelLabel: 'cPanel',
        opensIn: 'new_tab',
      }),
    });

    const out = await getSsoUrlWithAudit(
      plugin,
      mockService,
      ctx,
      events,
      audit as never,
    );

    expect(out?.url).toContain('cpanel.example.com');
    expect(audit.logAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sso_panel_open',
        resource: 'Service',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'service.sso_opened',
      expect.objectContaining({ service_id: 'svc-1', panel_label: 'cPanel' }),
    );
  });

  it('plugin lanza error â†’ null sin relanzar', async () => {
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildPlugin({
      capabilities: {
        has_sso_panel: true,
        panel_label: 'cPanel',
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: false,
        supports_reconciliation: true,
        has_dns_management: false, // ADR-077 Amendment A1
      },
      getSsoUrl: jest.fn().mockRejectedValue(new Error('connection refused')),
    });

    const out = await getSsoUrlWithAudit(
      plugin,
      mockService,
      ctx,
      events,
      audit as never,
    );

    expect(out).toBeNull();
    expect(audit.logAccess).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
