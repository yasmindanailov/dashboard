import {
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPlugin,
  ProvisionerPluginError,
  ServiceWithRelations,
} from '../../core/provisioning/types';

import { InternalProvisionerPlugin } from './internal/internal.plugin';
import { ManualProvisionerPlugin } from './manual/manual.plugin';

/**
 * Test contract genérico canónico — Sprint 11 Fase 11.C (ADR-077 §7).
 *
 * Verifica que CUALQUIER plugin registrado al `PROVISIONER_PLUGINS` token
 * cumple los 12 invariantes del contrato v2. Cada plugin nuevo (Sprint
 * 15A/C/D/E/G) debe pasar este test antes de merge — el array
 * `REGISTERED_PROVISIONER_PLUGINS` se extiende con cada plugin nuevo.
 *
 * Cuando se introduzca el manifest declarativo (Sprint 15A), este test
 * se acoplará al loader del manifest en lugar de la lista hardcoded.
 *
 * Doctrina:
 *   - El test recibe instancias de los plugins (no clases) — verifica
 *     comportamiento, no solo firma TypeScript.
 *   - Los métodos `provision` / `getServiceInfo` se ejecutan con un
 *     ServiceWithRelations sintético mínimo. Plugins reales (Sprint
 *     15+) que requieran datos específicos del proveedor montarán mocks
 *     en sus `*.plugin.spec.ts` propios.
 */

const REGISTERED_PROVISIONER_PLUGINS: readonly ProvisionerPlugin[] = [
  new InternalProvisionerPlugin(),
  new ManualProvisionerPlugin(),
];

function buildSyntheticService(pluginSlug: string): ServiceWithRelations {
  // Cast `as unknown as ServiceWithRelations` deliberado: el contract test
  // no requiere los campos secundarios de `Service` (timestamps, billing,
  // etc.); los plugins triviales solo leen subset (status, label, domain,
  // product, client). Plugins reales que lean más campos los validan en
  // sus propios `*.plugin.spec.ts` con shape completo.
  return {
    id: 'svc-contract-test',
    user_id: 'user-contract-test',
    product_id: 'prod-contract-test',
    status: 'pending',
    label: 'Contract Test Service',
    domain: null,
    server_id: null,
    provisioner_slug: pluginSlug,
    provider_reference: null,
    client: {
      id: 'user-contract-test',
      email: 'contract@aelium.test',
      first_name: 'Contract',
      last_name: 'Test',
      company_name: null,
      phone: null,
      locale: 'es',
      country_code: null,
    },
    product: {
      id: 'prod-contract-test',
      slug: 'contract-test-product',
      name: 'Contract Test Product',
      type: 'hosting_web',
      provisioner: pluginSlug,
      provisioner_config: null,
    },
  } as unknown as ServiceWithRelations;
}

const KEBAB_CASE = /^[a-z][a-z0-9-]*$/;
const ISO8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const SERVICE_INFO_STATUS_VALUES: ReadonlyArray<string> = [
  'active',
  'suspended',
  'expired',
  'pending',
  'failed',
  'cancelled',
  'unknown',
];

const ALLOWED_FOLLOWUP: ReadonlyArray<string> = [
  'mark_active',
  'wait_for_task_completion',
  'create_setup_task',
];

describe.each(REGISTERED_PROVISIONER_PLUGINS.map((p) => [p.slug, p] as const))(
  'ProvisionerPlugin contract v2 — %s',
  (_slug, plugin) => {
    it('declara slug en kebab-case', () => {
      expect(plugin.slug).toMatch(KEBAB_CASE);
    });

    it('declara contractVersion === v2', () => {
      expect(plugin.contractVersion).toBe(PROVISIONER_PLUGIN_CONTRACT_VERSION);
    });

    it('declara capabilities completas (todos los flags presentes)', () => {
      const c = plugin.capabilities;
      expect(typeof c.has_sso_panel).toBe('boolean');
      expect(typeof c.has_metrics).toBe('boolean');
      expect(typeof c.has_metrics_history).toBe('boolean');
      expect(typeof c.requires_server).toBe('boolean');
      expect(['sync', 'async']).toContain(c.provision_mode);
      expect(typeof c.completes_via_task).toBe('boolean');
      expect(typeof c.supports_reconciliation).toBe('boolean');
    });

    it('si has_sso_panel=true → declara panel_label (ADR-077 §3 coherence)', () => {
      if (plugin.capabilities.has_sso_panel) {
        expect(plugin.capabilities.panel_label).toBeTruthy();
        expect(typeof plugin.capabilities.panel_label).toBe('string');
      }
    });

    it('si requires_server=true → solo aplica a docker_engine (ADR-077 §3)', () => {
      if (plugin.capabilities.requires_server) {
        expect(plugin.slug).toBe('docker_engine');
      }
    });

    it('inlineActions tienen slugs únicos en kebab-case', () => {
      const slugs = plugin.inlineActions.map((a) => a.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const action of plugin.inlineActions) {
        expect(action.slug).toMatch(KEBAB_CASE);
        expect(typeof action.label).toBe('string');
        expect(typeof action.confirmRequired).toBe('boolean');
        expect(typeof action.destructive).toBe('boolean');
      }
    });

    it('provision() devuelve ProvisionResult con shape canónico', async () => {
      const service = buildSyntheticService(plugin.slug);
      const result = await plugin.provision({
        service,
        client: service.client,
        productConfig: {},
        serverId: null,
        correlationId: 'cor-contract',
      });

      expect(result).toEqual(
        expect.objectContaining({
          providerReference: expect.any(Object) as unknown,
          metadata: expect.any(Object) as unknown,
          followUp: expect.any(Array) as unknown,
        }),
      );
      // providerReference ∈ string | null
      expect(
        typeof result.providerReference === 'string' ||
          result.providerReference === null,
      ).toBe(true);
      // followUp ⊆ valores canónicos
      for (const fu of result.followUp) {
        expect(ALLOWED_FOLLOWUP).toContain(fu);
      }
    });

    it('deprovision() resuelve sin error (idempotente, no-op si no existe ya)', async () => {
      const service = buildSyntheticService(plugin.slug);
      await expect(
        plugin.deprovision({
          service,
          reason: 'cancelled',
          correlationId: 'cor-deprov-contract',
        }),
      ).resolves.not.toThrow();
    });

    it('getServiceInfo() devuelve ServiceInfo con shape canónico', async () => {
      const service = buildSyntheticService(plugin.slug);
      const info = await plugin.getServiceInfo(service);

      expect(SERVICE_INFO_STATUS_VALUES).toContain(info.status);
      expect(info.fetchedAt).toMatch(ISO8601);
      expect(typeof info.display.primary).toBe('string');
      expect(info.display.primary.length).toBeGreaterThan(0);
      expect(typeof info.capabilities.hasSsoPanel).toBe('boolean');
      expect(Array.isArray(info.capabilities.inlineActions)).toBe(true);
      expect(Array.isArray(info.availableActions)).toBe(true);
    });

    it('getSsoUrl() devuelve null o SsoUrl con shape canónico', async () => {
      const service = buildSyntheticService(plugin.slug);
      const sso = await plugin.getSsoUrl(service);

      if (sso === null) {
        // Si capability flag declara has_sso_panel=true, NO debería ser null
        // por defecto — pero plugins con condicional por instancia (Docker)
        // pueden devolverlo. No lo enforzamos aquí.
        return;
      }

      expect(typeof sso.url).toBe('string');
      expect(sso.url.length).toBeGreaterThan(0);
      expect(sso.expiresAt).toMatch(ISO8601);
      expect(typeof sso.panelLabel).toBe('string');
      expect(sso.opensIn).toBe('new_tab');
    });

    it('executeAction() con slug inválido lanza ProvisionerPluginError(INVALID_PAYLOAD)', async () => {
      const service = buildSyntheticService(plugin.slug);
      // Si el plugin no tiene inline actions, cualquier slug es inválido.
      // Si las tiene, usamos un slug nunca declarado.
      const invalidSlug = '__definitely_unknown_slug__';

      let thrown: unknown;
      try {
        await plugin.executeAction(service, invalidSlug, {});
      } catch (err) {
        thrown = err;
      }

      // El plugin puede:
      //   - Lanzar ProvisionerPluginError(INVALID_PAYLOAD) — preferido.
      //   - Devolver ActionResult{success:false} — válido para plugins
      //     que prefieren no lanzar (no es el caso de los triviales hoy
      //     pero futuros plugins podrían).
      // Cualquier otra forma de error no es canónica.
      if (thrown instanceof ProvisionerPluginError) {
        expect(thrown.code).toBe('INVALID_PAYLOAD');
        expect(thrown.retriable).toBe(false);
      } else if (thrown === undefined) {
        // OK: plugin devolvió ActionResult{success:false} sin lanzar.
        // No enforzamos su shape — cubierto en spec del plugin.
      } else {
        const detail =
          thrown instanceof Error ? thrown.message : JSON.stringify(thrown);
        throw new Error(
          `Plugin ${plugin.slug} executeAction lanzó error no canónico: ${detail}`,
        );
      }
    });
  },
);
