import {
  PLUGIN_MANIFEST_VERSION,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPlugin,
  ProvisionerPluginError,
  ServiceWithRelations,
} from '../../core/provisioning/types';

import { EnhanceProvisionerPlugin } from './enhance_cp/enhance.plugin';
import { InternalProvisionerPlugin } from './internal/internal.plugin';
import { ManualProvisionerPlugin } from './manual/manual.plugin';

/**
 * Test contract genérico canónico — Sprint 11 Fase 11.C (ADR-077 §7).
 * Sprint 15C Fase 15C.C — extendido con modo 'static-only' para plugins
 * con dependencias externas complejas.
 *
 * Verifica que CUALQUIER plugin registrado al `PROVISIONER_PLUGINS` token
 * cumple los invariantes canónicos del contrato v2. Cada plugin nuevo
 * (Sprint 15A/C/D/E/G) debe pasar este test antes de merge — el array
 * `REGISTERED_PROVISIONER_PLUGINS` se extiende con cada plugin nuevo.
 *
 * Doctrina (extendida en Sprint 15C):
 *   - El test recibe instancias de los plugins (no clases) — verifica
 *     comportamiento, no solo firma TypeScript.
 *   - **Modo 'full'**: ejecuta `provision`/`deprovision`/`getServiceInfo`/
 *     `getSsoUrl`/`executeAction` con `ServiceWithRelations` sintético
 *     mínimo. Aplica a plugins triviales sin dependencias externas
 *     (`internal`, `manual`).
 *   - **Modo 'static-only'**: solo valida declaraciones estáticas
 *     (slug, contractVersion, capabilities, inlineActions, manifest) +
 *     invariantes ADR-077 Amendment A1 (`has_dns_management` ↔ DNS
 *     inline actions). Aplica a plugins con dependencias service-level
 *     (PrismaService, SecretVaultService, etc.) cuyo comportamiento se
 *     valida exhaustivamente en su propio `<plugin>.plugin.spec.ts`.
 *
 *     Ejemplo: `EnhanceProvisionerPlugin` requiere `PluginInstall` con
 *     config + secrets cifrados — montar ese fixture aquí duplicaría
 *     la lógica de `enhance.plugin.spec.ts` (41 tests) sin ganancia.
 */

interface ContractTestPlugin {
  readonly plugin: ProvisionerPlugin;
  /**
   * Modo del test. Ver doctrina arriba.
   */
  readonly mode: 'full' | 'static-only';
}

/**
 * Construye una instancia de `EnhanceProvisionerPlugin` para validar
 * invariantes estáticas SIN inyectar dependencies reales. Los métodos
 * runtime (provision/etc.) NO se ejecutan en este modo — ver
 * `enhance.plugin.spec.ts` para cobertura comportamental.
 */
function buildEnhancePluginForStaticContract(): EnhanceProvisionerPlugin {
  return new EnhanceProvisionerPlugin(
    null as never, // prisma — NO se invoca en mode='static-only'
    null as never, // vault   — idem
    null as never, // customers — idem
  );
}

const REGISTERED_PROVISIONER_PLUGINS: readonly ContractTestPlugin[] = [
  { plugin: new InternalProvisionerPlugin(), mode: 'full' },
  { plugin: new ManualProvisionerPlugin(), mode: 'full' },
  // Sprint 15C — primer plugin SaaS real. Modo static-only por dependencias.
  { plugin: buildEnhancePluginForStaticContract(), mode: 'static-only' },
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

// Slug naming canónico — snake_case o kebab-case (alineado con plugin-registry.ts).
// Doctrina ADR-018/021/070/077/080/082/083 + glossary: slugs multi-palabra son
// snake_case (`enhance_cp`, `docker_engine`, `resellerclub`). El regex original
// kebab-only era un bug que habría rechazado `enhance_cp` en boot.
const SLUG_NAMING = /^[a-z][a-z0-9_-]*$/;
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

describe.each(
  REGISTERED_PROVISIONER_PLUGINS.map((ctp): [string, ContractTestPlugin] => [
    ctp.plugin.slug,
    ctp,
  ]),
)(
  'ProvisionerPlugin contract v2 — %s',
  (_slug: string, ctp: ContractTestPlugin) => {
    const plugin = ctp.plugin;
    const isFullMode = ctp.mode === 'full';

    it('declara slug que cumple naming canónico (snake_case o kebab-case)', () => {
      expect(plugin.slug).toMatch(SLUG_NAMING);
    });

    it(`declara mode='${ctp.mode}' en contract test — comportamiento ${isFullMode ? 'verificado aquí' : 'verificado en spec específico'}`, () => {
      // Test "marcador" para visibilidad: indica claramente el modo en el output.
      expect(['full', 'static-only']).toContain(ctp.mode);
    });

    it('declara contractVersion === v2', () => {
      expect(plugin.contractVersion).toBe(PROVISIONER_PLUGIN_CONTRACT_VERSION);
    });

    // ─── Manifest declarativo (Sprint 15A — ADR-080 §1) ──────────────────

    it('expone manifest declarativo con shape canónico (ADR-080 §1)', () => {
      const m = plugin.manifest;

      // slug coincide con plugin.slug — invariante crítica para loader desde DB.
      expect(m.slug).toBe(plugin.slug);
      expect(m.manifestVersion).toBe(PLUGIN_MANIFEST_VERSION);

      // semver del propio plugin (independiente del contractVersion).
      expect(m.version).toMatch(/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/);

      // i18n keys (no texto literal) — la UI las resuelve por locale.
      expect(typeof m.label).toBe('string');
      expect(m.label.length).toBeGreaterThan(0);
      expect(typeof m.description).toBe('string');
      expect(m.description.length).toBeGreaterThan(0);

      expect(typeof m.docsUrl).toBe('string');
      expect(m.docsUrl.length).toBeGreaterThan(0);

      // Categoría canónica acotada (ADR-080 §7).
      expect(['provisioner', 'payment', 'notification', 'ai']).toContain(
        m.settingsCategory,
      );

      // Test-connection: lista cerrada.
      expect([null, 'getStatus', 'custom']).toContain(m.testConnectionMethod);
      // Sprint 15C.II Fase F.3 (GAP-15CII-G8): `'custom'` ⇒ el plugin DEBE
      // implementar el método `testConnection()` del contrato.
      if (m.testConnectionMethod === 'custom') {
        expect(typeof plugin.testConnection).toBe('function');
      }
      // Sprint 15C.II Fase F.3 (GAP-15CII-G4): si declara TTL de cache, debe
      // ser un entero positivo (el sanity floor de 5s lo aplica el runtime).
      if (m.serviceInfoCacheTtlSeconds !== undefined) {
        expect(Number.isInteger(m.serviceInfoCacheTtlSeconds)).toBe(true);
        expect(m.serviceInfoCacheTtlSeconds).toBeGreaterThan(0);
      }
      // Sprint 15C.II Fase F.9 (ADR-077 Amendment A8 — dossier §A.11.10.6.2 R1
      // frozen): `reconcileOne?(service)` opcional capability-driven por
      // presencia. Plugins que lo declaran lo exponen como función; los que
      // NO lo declaran omiten el método entero (el frontend gatea el CTA
      // leyendo la capability del manifest enriquecido vía admin overview F.2).
      // Mismo patrón canónico que A6 `testConnection?()` y A7 `ServiceInfo.ssl?`.
      expect(['undefined', 'function']).toContain(typeof plugin.reconcileOne);
    });

    it('manifest.configSchema y manifest.secretsSchema son JsonSchema7 separados', () => {
      const m = plugin.manifest;

      for (const schema of [m.configSchema, m.secretsSchema]) {
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
        expect(typeof schema.properties).toBe('object');

        // ADR-080 §1 invariante: NO se admite additionalProperties=true en v1.
        expect(schema.additionalProperties).not.toBe(true);

        // required ⊆ properties — invariante de coherencia.
        if (schema.required) {
          for (const requiredKey of schema.required) {
            expect(schema.properties[requiredKey]).toBeDefined();
          }
        }
      }
    });

    // Sprint 15C Fase 15C.E.2 — ADR-080 Amendment B.
    it('manifest.productConfigSchema (si declarado) es JsonSchema7 válido', () => {
      const schema = plugin.manifest.productConfigSchema;
      if (schema === undefined) {
        // OK: plugins sin config per-producto (internal, manual) lo omiten.
        return;
      }

      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(typeof schema.properties).toBe('object');

      // ADR-080 Amendment B invariante: NO se admite additionalProperties=true.
      expect(schema.additionalProperties).not.toBe(true);

      // required ⊆ properties.
      if (schema.required) {
        for (const requiredKey of schema.required) {
          expect(schema.properties[requiredKey]).toBeDefined();
        }
      }
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
      // ADR-077 Amendment A1 — has_dns_management required.
      expect(typeof c.has_dns_management).toBe('boolean');
      // ADR-077 Amendment A4 — supports_suspend required.
      expect(typeof c.supports_suspend).toBe('boolean');
      // ADR-077 Amendment A10 — is_domain_registrar required.
      expect(typeof c.is_domain_registrar).toBe('boolean');
    });

    // ─── ADR-077 Amendment A1 — DNS management invariants ────────────────

    it('si has_dns_management=true → declara las 4 inline actions canónicas DNS (ADR-077 Amendment A1.3)', () => {
      if (plugin.capabilities.has_dns_management) {
        const slugs = plugin.inlineActions.map((a) => a.slug);
        for (const required of [
          'list_dns_records',
          'add_dns_record',
          'update_dns_record',
          'delete_dns_record',
        ]) {
          expect(slugs).toContain(required);
        }
      }
    });

    it('si has_dns_management=false → NO declara inline actions DNS canónicas (ADR-077 Amendment A1.3)', () => {
      if (!plugin.capabilities.has_dns_management) {
        const slugs = plugin.inlineActions.map((a) => a.slug);
        for (const dnsSlug of [
          'list_dns_records',
          'add_dns_record',
          'update_dns_record',
          'delete_dns_record',
        ]) {
          expect(slugs).not.toContain(dnsSlug);
        }
      }
    });

    // ─── ADR-077 Amendment A4 — suspend/unsuspend invariants ────────────

    it('si supports_suspend=true → declara las 2 inline actions canónicas, ambas adminOnly (ADR-077 Amendment A4)', () => {
      if (plugin.capabilities.supports_suspend) {
        const bySlug = new Map(
          plugin.inlineActions.map((a) => [a.slug, a] as const),
        );
        for (const slug of ['suspend_service', 'unsuspend_service']) {
          const action = bySlug.get(slug);
          expect(action).toBeDefined();
          // La suspensión es operación administrativa — NUNCA cliente self-service.
          expect(action?.adminOnly).toBe(true);
        }
        // Coherencia semántica: suspender es destructivo (corta el acceso),
        // reactivar no lo es (lo restaura) — espejo de `deprovision` vs los DNS.
        expect(bySlug.get('suspend_service')?.destructive).toBe(true);
        expect(bySlug.get('unsuspend_service')?.destructive).toBe(false);
      }
    });

    it('si supports_suspend=false → NO declara esas inline actions (ADR-077 Amendment A4)', () => {
      if (!plugin.capabilities.supports_suspend) {
        const slugs = plugin.inlineActions.map((a) => a.slug);
        expect(slugs).not.toContain('suspend_service');
        expect(slugs).not.toContain('unsuspend_service');
      }
    });

    // ─── ADR-077 Amendment A10 — registrar sub-contract invariants ───────

    it('si is_domain_registrar=true → declara las 5 inline actions canónicas de gestión (ADR-077 A10.4)', () => {
      if (plugin.capabilities.is_domain_registrar) {
        const slugs = plugin.inlineActions.map((a) => a.slug);
        for (const required of [
          'modify_nameservers',
          'modify_contacts',
          'toggle_privacy',
          'toggle_registrar_lock',
          'get_auth_code',
        ]) {
          expect(slugs).toContain(required);
        }
      }
    });

    it('si is_domain_registrar=true → implementa los métodos de pre-venta plano A (ADR-077 A10.4)', () => {
      if (plugin.capabilities.is_domain_registrar) {
        expect(typeof plugin.checkDomainAvailability).toBe('function');
        expect(typeof plugin.getTldPricing).toBe('function');
      }
    });

    it('modify_nameservers (si presente) es confirmRequired=true — peligrosa (ADR-077 A10.4)', () => {
      const ns = plugin.inlineActions.find(
        (a) => a.slug === 'modify_nameservers',
      );
      if (ns) expect(ns.confirmRequired).toBe(true);
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

    it('inlineActions tienen slugs únicos (snake_case o kebab-case)', () => {
      const slugs = plugin.inlineActions.map((a) => a.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const action of plugin.inlineActions) {
        expect(action.slug).toMatch(SLUG_NAMING);
        expect(typeof action.label).toBe('string');
        expect(typeof action.confirmRequired).toBe('boolean');
        expect(typeof action.destructive).toBe('boolean');
      }
    });

    // ─── Tests comportamentales ─ solo en mode='full' ────────────────────
    // Plugins con dependencias service-level (mode='static-only', ej. enhance_cp)
    // ven estos como `skipped` — su comportamiento se valida en su propio
    // `<plugin>.plugin.spec.ts` con mocks específicos.

    const itFull = isFullMode ? it : it.skip;

    itFull(
      'provision() devuelve ProvisionResult con shape canónico',
      async () => {
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
      },
    );

    itFull(
      'deprovision() resuelve sin error (idempotente, no-op si no existe ya)',
      async () => {
        const service = buildSyntheticService(plugin.slug);
        await expect(
          plugin.deprovision({
            service,
            reason: 'cancelled',
            correlationId: 'cor-deprov-contract',
          }),
        ).resolves.not.toThrow();
      },
    );

    itFull(
      'getServiceInfo() devuelve ServiceInfo con shape canónico',
      async () => {
        const service = buildSyntheticService(plugin.slug);
        const info = await plugin.getServiceInfo(service);

        expect(SERVICE_INFO_STATUS_VALUES).toContain(info.status);
        expect(info.fetchedAt).toMatch(ISO8601);
        expect(typeof info.display.primary).toBe('string');
        expect(info.display.primary.length).toBeGreaterThan(0);
        expect(typeof info.capabilities.hasSsoPanel).toBe('boolean');
        expect(Array.isArray(info.capabilities.inlineActions)).toBe(true);
        expect(Array.isArray(info.availableActions)).toBe(true);

        // ADR-077 Amendment A5 — `recoveryHint` opcional. Si presente: ∈ enum
        // canónico Y coherente con un status de drift (no tiene sentido sobre
        // `active`). El plugin es la única autoridad — el frontend ramifica
        // por este campo, NUNCA por matching de `statusReason`.
        if (info.recoveryHint !== undefined) {
          expect(['reprovision', 'reconcile', 'contact_support']).toContain(
            info.recoveryHint,
          );
          expect(['unknown', 'failed', 'suspended', 'expired']).toContain(
            info.status,
          );
        }

        // ADR-077 Amendment A7 — `ssl` opcional. Si presente: status ∈ enum
        // canónico, expiresAt parseable, e invariante de consistencia:
        // status='none' implica no hay cert → no hay fecha de expiración.
        if (info.ssl !== undefined) {
          expect(['valid', 'expiring_soon', 'expired', 'none']).toContain(
            info.ssl.status,
          );
          if (info.ssl.expiresAt !== undefined) {
            const parsed = new Date(info.ssl.expiresAt);
            expect(Number.isFinite(parsed.getTime())).toBe(true);
          }
          if (info.ssl.status === 'none') {
            expect(info.ssl.expiresAt).toBeUndefined();
          }
        }
      },
    );

    itFull(
      'getSsoUrl() devuelve null o SsoUrl con shape canónico',
      async () => {
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
      },
    );

    // ─── ADR-077 Amendment A8 (Sprint 15C.II Fase F.9): reconcileOne?() ──
    // Invariante comportamental: si el plugin declara la capability (método
    // presente), invocarlo con un service sintético debe devolver un
    // `ServiceReconcileResult` con shape canónico, O lanzar
    // `ProvisionerPluginError` con código semántico (los plugins triviales
    // typeically NO declaran `reconcileOne` — no tienen proveedor externo
    // que reconciliar; este test se activa solo si algún plugin nuevo lo
    // declara y queda en mode='full'). Para plugins en mode='static-only'
    // (Enhance) el shape se valida exhaustivamente en su `*.plugin.spec.ts`.

    itFull(
      'reconcileOne?() — si declarado, devuelve ServiceReconcileResult con shape canónico',
      async () => {
        if (typeof plugin.reconcileOne !== 'function') {
          // Plugin no declara la capability — invariante trivialmente OK.
          return;
        }
        const service = buildSyntheticService(plugin.slug);
        let result;
        try {
          result = await plugin.reconcileOne(service);
        } catch (err) {
          // Plugin con dependencias que el contract test no monta (ej. API
          // client externo) puede lanzar — debe ser ProvisionerPluginError
          // canónico, no error plano.
          expect(err).toBeInstanceOf(ProvisionerPluginError);
          return;
        }

        expect(result).toBeDefined();
        expect(Array.isArray(result.driftsDetected)).toBe(true);
        expect(Array.isArray(result.driftsApplied)).toBe(true);
        // R4 frozen: driftsApplied ⊆ driftsDetected.
        expect(result.driftsApplied.length).toBeLessThanOrEqual(
          result.driftsDetected.length,
        );
        expect(result.reconciledAt).toBeInstanceOf(Date);
        expect(Number.isFinite(result.reconciledAt.getTime())).toBe(true);

        const DRIFT_TYPES: ReadonlyArray<string> = [
          'subscription_missing',
          'status_divergence',
          'plan_divergence',
        ];
        for (const drift of result.driftsDetected) {
          expect(DRIFT_TYPES).toContain(drift.type);
          expect(typeof drift.applied).toBe('boolean');
        }
        // Coherencia R4: cada drift en driftsApplied debe tener applied=true.
        for (const applied of result.driftsApplied) {
          expect(applied.applied).toBe(true);
        }
      },
    );

    itFull(
      'executeAction() con slug inválido lanza ProvisionerPluginError(INVALID_PAYLOAD)',
      async () => {
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
      },
    );
  },
);
