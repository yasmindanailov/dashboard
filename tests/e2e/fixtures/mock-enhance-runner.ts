/**
 * Sprint 15C Fase 15C.I — runner standalone del MockEnhanceServer para E2E.
 *
 * El `MockEnhanceServer` canónico (`backend/test/mocks/enhance-server/`)
 * fue diseñado para tests integration Jest in-process del backend
 * (Sprint 15C Fase 15C.B + ADR-083 §7 decisión 25 + Amendment A1). Para
 * los tests E2E Playwright que arrancan backend + frontend con
 * `start:prod`, el mock necesita correr como **proceso separado** —
 * Playwright lo gestiona como tercer `webServer` en `playwright.config.ts`
 * (lifecycle paralelo a backend + frontend, kill al teardown).
 *
 * Este runner:
 *   - Arranca el mock en `127.0.0.1:<port>` (default 3099).
 *   - Pre-siembra el seed canónico (apiToken + masterOrgId) — coincide
 *     con los valores que el spec inyecta al PATCH del plugin install.
 *   - Maneja SIGTERM/SIGINT para cierre limpio (Playwright los emite al
 *     terminar la suite; sin esto el puerto queda ocupado y la próxima
 *     run falla con `EADDRINUSE`).
 *
 * Variables de entorno consumidas (con defaults para uso local):
 *   - `E2E_MOCK_ENHANCE_PORT`           default 3099
 *   - `E2E_MOCK_ENHANCE_API_TOKEN`      default 'e2e-mock-token-fixture'
 *   - `E2E_MOCK_ENHANCE_MASTER_ORG_ID`  default '00000000-0000-0000-0000-00000000aaaa'
 *
 * Patrón replicable para futuros plugins SaaS: cuando 15D RC añada su
 * `MockResellerClubServer`, copiar este runner cambiando solo el import +
 * las env vars (ej. `E2E_MOCK_RC_PORT` default 3098).
 *
 * Ejecución (vía pnpm desde backend porque allí vive `ts-node`):
 *
 *     pnpm --dir backend exec ts-node --transpile-only \
 *       ../tests/e2e/fixtures/mock-enhance-runner.ts
 *
 * El comando exacto está cableado en `playwright.config.ts` como tercer
 * webServer junto a backend y frontend.
 */

import { startMockEnhanceServer } from '../../../backend/test/mocks/enhance-server';

const PORT = Number(process.env.E2E_MOCK_ENHANCE_PORT) || 3099;
const API_TOKEN =
  process.env.E2E_MOCK_ENHANCE_API_TOKEN || 'e2e-mock-token-fixture';
const MASTER_ORG_ID =
  process.env.E2E_MOCK_ENHANCE_MASTER_ORG_ID ||
  '00000000-0000-0000-0000-00000000aaaa';

/**
 * Sprint 15C.II Fase F.10 — smoke real (2026-05-18).
 *
 * Env vars opcionales para seedear websites + apps CMS sin pasar por el
 * flujo de provisioning real (que requiere `POST /websites` + Aelium-side
 * orchestration). Parsea JSON parseable; si falta o malformed → no-op
 * (el mock arranca sin seed extra).
 *
 *   - `E2E_MOCK_ENHANCE_SEED_WEBSITES_JSON` — `EnhanceWebsite[]` array.
 *   - `E2E_MOCK_ENHANCE_SEED_WEBSITE_APPS_JSON` — `Record<websiteId, WebsiteApp[]>`.
 *
 * Útil para smoke tests del flow F.10 (`getServiceInfo > apps` +
 * `executeAction('open_app_admin')`) sin tener que provisionar un website
 * real — el script `scripts/smoke-f10.ts` los usa.
 */
function parseJsonEnv<T>(name: string, fallback: T): T {
  const raw = process.env[name];
  if (!raw || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    // eslint-disable-next-line no-console -- runner console output
    console.warn(
      `[mock-enhance-server] failed to parse env ${name} as JSON: ${err instanceof Error ? err.message : 'unknown error'}; using fallback`,
    );
    return fallback;
  }
}

/**
 * Customer org pre-sembrado — UUID determinístico para que el spec
 * pueda referenciarlo en `services.metadata.enhance_customer_org_id`
 * sin depender de la generación runtime del mock. Coincide con
 * `FIXTURE_CUSTOMER_ORG_ID` en `sprint-15c-enhance-flow.spec.ts`.
 */
const FIXTURE_CUSTOMER_ORG_ID = '11111111-1111-1111-1111-111111111111';
const FIXTURE_OWNER_EMAIL = 'cliente@aelium.test';
const FIXTURE_OWNER_NAME = 'Carla Cliente';

void (async () => {
  let mock: Awaited<ReturnType<typeof startMockEnhanceServer>>;
  try {
    mock = await startMockEnhanceServer({
      port: PORT,
      seed: {
        apiToken: API_TOKEN,
        masterOrgId: MASTER_ORG_ID,
        // Customer org pre-sembrado con UUID determinístico — el spec
        // E2E inserta `services.metadata.enhance_customer_org_id` con
        // este mismo UUID para que getServiceInfo / executeAction
        // resuelvan correctamente contra el mock sin requerir flujo
        // provision real (cubierto por integration tests Jest in-process).
        customers: [
          {
            orgId: FIXTURE_CUSTOMER_ORG_ID,
            email: FIXTURE_OWNER_EMAIL,
            name: FIXTURE_OWNER_NAME,
          },
        ],
        // Pre-sembramos un default DNS record cluster-wide (NS apex
        // estándar Aelium) para que el flujo de creación de website
        // tenga la zona auto-poblada con NS canónicos. Espejo del
        // bootstrap real que `BootstrapEnhanceDefaultsOnPluginInstalledListener`
        // ejecuta al primer install (Sprint 15C Fase 15C.D).
        defaultDnsRecords: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            kind: 'NS',
            name: '@',
            value: 'ns1.aelium.net',
            ttl: 3600,
            overrideConflicting: false,
          },
          {
            id: '00000000-0000-0000-0000-000000000002',
            kind: 'NS',
            name: '@',
            value: 'ns2.aelium.net',
            ttl: 3600,
            overrideConflicting: false,
          },
        ],
        // Sprint 15C.II Fase F.10 — seed opt-in via env vars JSON.
        websites: parseJsonEnv('E2E_MOCK_ENHANCE_SEED_WEBSITES_JSON', []),
        websiteApps: parseJsonEnv(
          'E2E_MOCK_ENHANCE_SEED_WEBSITE_APPS_JSON',
          {},
        ),
      },
    });
    // eslint-disable-next-line no-console -- runner console output is the only signal Playwright sees
    console.log(
      `[mock-enhance-server] listening on ${mock.baseUrl} (token=${API_TOKEN.slice(0, 6)}…)`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- runner console output is the only signal Playwright sees
    console.error('[mock-enhance-server] failed to start:', err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[mock-enhance-server] received ${signal}, stopping...`);
    try {
      await mock.stop();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mock-enhance-server] stop error:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
})();
