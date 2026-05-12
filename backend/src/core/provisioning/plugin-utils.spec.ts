/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// `unbound-method` + `no-unsafe-*` producen falsos positivos en specs Jest
// cuando se hace `expect(mock.method).toHaveBeenCalled()` o se accede
// `mock.calls[0][0]` para introspección. Doctrina oficial TS-ESLint para
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
      supports_suspend: false, // ADR-077 Amendment A4
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
    supports_suspend: false, // ADR-077 Amendment A4
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
    // Sprint 15C.II Fase E — ADR-077 Amendment A5: el fallback del wrapper
    // (proveedor caído / circuit open) NO es re-aprovisionable — el plugin ni
    // respondió. La UI no debe ofrecer CTA de recuperación accionable.
    expect(out.recoveryHint).toBe('contact_support');
    expect(cache.set).toHaveBeenCalledWith(
      'svc-1',
      expect.objectContaining({
        status: 'unknown',
        recoveryHint: 'contact_support',
      }),
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
    actorIsAdmin: false, // Sprint 15C Fase 15C.E — ADR-077 Amendment A3
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

  // Sprint 15C Fase 15C.E (ADR-077 A3 + ADR-083 A3) — enforcement adminOnly.
  it('adminOnly + actorIsAdmin=false → ForbiddenException + audit + evento (no llama plugin)', async () => {
    const cache = buildCache();
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildPlugin({
      inlineActions: [
        {
          slug: 'change_package',
          label: 'plugin.test.actions.change_package',
          confirmRequired: true,
          destructive: false,
          adminOnly: true,
        },
      ],
      executeAction: jest.fn(),
    });

    await expect(
      executeActionWithCacheInvalidation(
        plugin,
        mockService,
        'change_package',
        { planId: 99 },
        { ...ctx, actorIsAdmin: false },
        cache,
        events,
        audit as never,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'ACTION_ADMIN_ONLY',
        action_slug: 'change_package',
      },
      status: 403,
    });

    expect(plugin.executeAction).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
    expect(audit.logAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service.action_admin_only_violation',
        resource: 'Service',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'service.action_admin_only_violation',
      expect.objectContaining({
        service_id: 'svc-1',
        actor_user_id: 'user-1',
        action_slug: 'change_package',
      }),
    );
  });

  it('adminOnly + actorIsAdmin=true → procede normalmente (audit OK + action_executed)', async () => {
    const cache = buildCache();
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildPlugin({
      inlineActions: [
        {
          slug: 'force_resync',
          label: 'plugin.test.actions.force_resync',
          confirmRequired: false,
          destructive: false,
          adminOnly: true,
        },
      ],
      executeAction: jest.fn().mockResolvedValue({
        success: true,
        sideEffects: ['service.metrics_invalidated'],
      }),
    });

    const result = await executeActionWithCacheInvalidation(
      plugin,
      mockService,
      'force_resync',
      {},
      { ...ctx, actorIsAdmin: true },
      cache,
      events,
      audit as never,
    );

    expect(result.success).toBe(true);
    expect(plugin.executeAction).toHaveBeenCalled();
    expect(audit.logAccess).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'service.action_executed',
      expect.any(Object),
    );
  });

  it('action sin adminOnly + actorIsAdmin=false → procede (no enforcement)', async () => {
    const cache = buildCache();
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildPlugin({
      inlineActions: [
        {
          slug: 'test_read_only_action',
          label: 'plugin.test.actions.test_read_only',
          confirmRequired: false,
          destructive: false,
        },
      ],
      executeAction: jest.fn().mockResolvedValue({ success: true }),
    });

    const result = await executeActionWithCacheInvalidation(
      plugin,
      mockService,
      'test_read_only_action',
      {},
      { ...ctx, actorIsAdmin: false },
      cache,
      events,
      audit as never,
    );

    expect(result.success).toBe(true);
    expect(plugin.executeAction).toHaveBeenCalled();
    expect(audit.logAccess).not.toHaveBeenCalled();
  });

  // ─── Sprint 15C.II Fase D — gap G2 audit sanitizer (ADR-083 A4.5) ────────

  describe('audit sanitizer integration (Sprint 15C.II Fase D — gap G2)', () => {
    it('result.data con keys sensibles → audit redactado, evento plaintext', async () => {
      // Caso real: `actionResetAccountPassword` retorna
      // `{ password: '<32 hex>' }`. El wrapper:
      //   1. Persiste audit_change_log con `data.password = '[REDACTED]'`.
      //   2. Emite event con `data.password = '<32 hex>'` plaintext (los
      //      listeners async como `notifications-on-password-reset` lo
      //      consumen para enviar email al cliente).
      const cache = buildCache();
      const events = buildEvents();
      const audit = buildAudit();
      const PLAINTEXT_PWD = 'abc123def456abc123def456abc12345';
      const plugin = buildPlugin({
        inlineActions: [
          {
            slug: 'reset_account_password',
            label: 'plugin.test.actions.reset_password',
            confirmRequired: true,
            destructive: false,
          },
        ],
        executeAction: jest.fn().mockResolvedValue({
          success: true,
          message: 'plugin.test.reset_password.success',
          data: { password: PLAINTEXT_PWD },
          sideEffects: ['service.password_reset'],
        }),
      });

      await executeActionWithCacheInvalidation(
        plugin,
        mockService,
        'reset_account_password',
        {},
        ctx,
        cache,
        events,
        audit as never,
      );

      // Audit recibió data sanitizada (R12 compliance).
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service.action_executed:reset_account_password',
          changes_after: expect.objectContaining({
            data: { password: '[REDACTED]' },
            success: true,
          }),
        }),
      );
      // Verifica explícitamente que la audit fila NO contiene la password
      // plaintext (defensa del compliance R12 — secrets nunca audit).
      const auditCall = audit.logChange.mock.calls[0][0] as {
        changes_after: { data?: { password?: string } };
      };
      expect(auditCall.changes_after.data?.password).toBe('[REDACTED]');
      expect(auditCall.changes_after.data?.password).not.toBe(PLAINTEXT_PWD);

      // Evento conserva plaintext para listeners (consumen in-memory + envían
      // email; nunca persisten).
      expect(events.emit).toHaveBeenCalledWith(
        'service.action_executed',
        expect.objectContaining({
          action_slug: 'reset_account_password',
          success: true,
          data: { password: PLAINTEXT_PWD },
        }),
      );
    });

    it('result.data sin keys sensibles → audit + evento iguales (no-op sanitizer)', async () => {
      const cache = buildCache();
      const events = buildEvents();
      const audit = buildAudit();
      const plugin = buildPlugin({
        inlineActions: [
          {
            slug: 'list_dns_records',
            label: 'plugin.test.actions.list_dns_records',
            confirmRequired: false,
            destructive: false,
          },
        ],
        executeAction: jest.fn().mockResolvedValue({
          success: true,
          data: {
            zone: {
              origin: 'cliente.es',
              records: [{ id: 'r1', kind: 'A', value: '1.2.3.4' }],
            },
          },
        }),
      });

      await executeActionWithCacheInvalidation(
        plugin,
        mockService,
        'list_dns_records',
        {},
        ctx,
        cache,
        events,
        audit as never,
      );

      const auditCall = audit.logChange.mock.calls[0][0] as {
        changes_after: { data?: unknown };
      };
      expect(auditCall.changes_after.data).toEqual({
        zone: {
          origin: 'cliente.es',
          records: [{ id: 'r1', kind: 'A', value: '1.2.3.4' }],
        },
      });
    });

    it('result.data undefined → audit sin campo data (omitido limpiamente)', async () => {
      const cache = buildCache();
      const events = buildEvents();
      const audit = buildAudit();
      const plugin = buildPlugin({
        inlineActions: [
          {
            slug: 'restart',
            label: 'plugin.test.actions.restart',
            confirmRequired: true,
            destructive: false,
          },
        ],
        executeAction: jest.fn().mockResolvedValue({
          success: true,
          sideEffects: ['service.restarted'],
          // no `data` field
        }),
      });

      await executeActionWithCacheInvalidation(
        plugin,
        mockService,
        'restart',
        {},
        ctx,
        cache,
        events,
        audit as never,
      );

      const auditCall = audit.logChange.mock.calls[0][0] as {
        changes_after: Record<string, unknown>;
      };
      // El campo `data` NO debe aparecer en changes_after cuando el plugin
      // retorna ActionResult sin `.data` — evita persistir literalmente
      // `"data": null` que ensucia consultas SQL.
      expect(auditCall.changes_after).not.toHaveProperty('data');
      expect(auditCall.changes_after.success).toBe(true);
    });

    it('allowsSensitiveDataInAudit skip per-key (excepción declarativa ADR-083 A4.5)', async () => {
      // Plugin declara explícitamente que `metadata_token_id` (identificador,
      // no secret) es safe en audit. Otras keys sensibles siguen redactadas.
      // Caso uncommon — requiere ADR específico justificando.
      const cache = buildCache();
      const events = buildEvents();
      const audit = buildAudit();
      const plugin = buildPlugin({
        inlineActions: [
          {
            slug: 'special_diagnostic',
            label: 'plugin.test.special',
            confirmRequired: false,
            destructive: false,
            allowsSensitiveDataInAudit: ['metadata_token_id'],
          },
        ],
        executeAction: jest.fn().mockResolvedValue({
          success: true,
          data: {
            metadata_token_id: 'tok-123',
            password: 'real-pwd',
          },
        }),
      });

      await executeActionWithCacheInvalidation(
        plugin,
        mockService,
        'special_diagnostic',
        {},
        ctx,
        cache,
        events,
        audit as never,
      );

      const auditCall = audit.logChange.mock.calls[0][0] as {
        changes_after: { data?: Record<string, unknown> };
      };
      expect(auditCall.changes_after.data).toEqual({
        metadata_token_id: 'tok-123', // intacto (allowList)
        password: '[REDACTED]', // redactado (no en allowList)
      });
    });
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

    // Sprint 15C.II Fase C round 5: shape `{ sso, errorCode }`. Plugin
    // sin SSO panel → caso legítimo (errorCode=null, no es error).
    expect(out.sso).toBeNull();
    expect(out.errorCode).toBeNull();
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
        supports_suspend: false, // ADR-077 Amendment A4
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

    // Sprint 15C.II Fase C round 5: shape ahora `{ sso, errorCode }`.
    expect(out.sso?.url).toContain('cpanel.example.com');
    expect(out.errorCode).toBeNull();
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

  it('plugin lanza error â†’ sso=null + errorCode propagado', async () => {
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
        supports_suspend: false, // ADR-077 Amendment A4
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

    // Sprint 15C.II Fase C round 5: shape `{ sso, errorCode }`. error
    // genérico (no ProvisionerPluginError) → errorCode='PROVIDER_INTERNAL_ERROR'.
    expect(out.sso).toBeNull();
    expect(out.errorCode).toBe('PROVIDER_INTERNAL_ERROR');
    expect(audit.logAccess).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  // ─── Sprint 15C Fase 15C.F — admin SSO impersonation ─────────────────
  // ADR-083 §4 decisión 14: cuando un agente Aelium abre el panel del
  // proveedor de un servicio AJENO, además de `service.sso_opened` se
  // emite `service.admin_sso_impersonation` con shape canónico GDPR para
  // que el portal de transparencia del cliente afectado lo exponga.

  function buildSsoCapablePlugin(): ProvisionerPlugin {
    return buildPlugin({
      capabilities: {
        has_sso_panel: true,
        panel_label: 'cPanel',
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: false,
        supports_reconciliation: true,
        has_dns_management: false,
        supports_suspend: false, // ADR-077 Amendment A4
      },
      getSsoUrl: jest.fn().mockResolvedValue({
        url: 'https://cpanel.example.com/?sk=abc',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        panelLabel: 'cPanel',
        opensIn: 'new_tab',
      }),
    });
  }

  it('admin abre service AJENO → emite sso_opened + admin_sso_impersonation con shape canónico', async () => {
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildSsoCapablePlugin();
    // mockService.user_id = 'user-1'; agente = 'agent-007' ≠ 'user-1'.
    const adminCtx = {
      actorUserId: 'agent-007',
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0 (admin)',
      actorIsAdmin: true,
    };

    const out = await getSsoUrlWithAudit(
      plugin,
      mockService,
      adminCtx,
      events,
      audit as never,
    );

    expect(out.sso?.url).toContain('cpanel.example.com');
    expect(events.emit).toHaveBeenCalledWith(
      'service.sso_opened',
      expect.objectContaining({
        service_id: 'svc-1',
        actor_user_id: 'agent-007',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'service.admin_sso_impersonation',
      expect.objectContaining({
        service_id: 'svc-1',
        user_id: 'user-1',
        agent_user_id: 'agent-007',
        agent_ip: '203.0.113.42',
        agent_user_agent: 'Mozilla/5.0 (admin)',
        provisioner_slug: 'internal',
        panel_label: 'cPanel',
        gdpr_visible_to_data_subject: true,
      }),
    );
    // `opened_at` debe ser ISO-8601.
    const calls = (events.emit as jest.Mock).mock.calls as ReadonlyArray<
      readonly [string, Record<string, unknown>]
    >;
    const impersonationCall = calls.find(
      ([name]) => name === 'service.admin_sso_impersonation',
    );
    expect(impersonationCall).toBeDefined();
    const payload = impersonationCall![1];
    expect(payload.opened_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('admin abre service PROPIO → solo sso_opened (NO impersonation)', async () => {
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildSsoCapablePlugin();
    // mockService.user_id = 'user-1'; agente que ES dueño del service.
    const adminOwnCtx = {
      actorUserId: 'user-1',
      ipAddress: '10.0.0.1',
      userAgent: 'jest',
      actorIsAdmin: true,
    };

    await getSsoUrlWithAudit(
      plugin,
      mockService,
      adminOwnCtx,
      events,
      audit as never,
    );

    expect(events.emit).toHaveBeenCalledWith(
      'service.sso_opened',
      expect.any(Object),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      'service.admin_sso_impersonation',
      expect.any(Object),
    );
  });

  it('cliente (actorIsAdmin=false) → solo sso_opened nunca admin_sso_impersonation', async () => {
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildSsoCapablePlugin();
    const clientCtx = {
      actorUserId: 'user-1',
      ipAddress: '10.0.0.2',
      userAgent: 'browser',
      actorIsAdmin: false,
    };

    await getSsoUrlWithAudit(
      plugin,
      mockService,
      clientCtx,
      events,
      audit as never,
    );

    expect(events.emit).toHaveBeenCalledWith(
      'service.sso_opened',
      expect.any(Object),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      'service.admin_sso_impersonation',
      expect.any(Object),
    );
  });

  it('actorIsAdmin omitido (compat hacia atrás) → solo sso_opened', async () => {
    const events = buildEvents();
    const audit = buildAudit();
    const plugin = buildSsoCapablePlugin();
    // ctx canónico Sprint 11 sin `actorIsAdmin` — invariante backward compat.
    await getSsoUrlWithAudit(
      plugin,
      mockService,
      { actorUserId: 'agent-007', ipAddress: '10.0.0.3', userAgent: 'jest' },
      events,
      audit as never,
    );

    expect(events.emit).toHaveBeenCalledWith(
      'service.sso_opened',
      expect.any(Object),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      'service.admin_sso_impersonation',
      expect.any(Object),
    );
  });
});
