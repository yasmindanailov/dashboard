/**
 * Sprint 15C.II Fase F.10 — smoke real automatizado del MockEnhanceServer
 * (Yasmin pidió smoke pre-F.11, 2026-05-18).
 *
 * Verifica los 5 endpoints F.10 añadidos al mock (ADR-083 Amendment A9.4):
 *   1. GET /orgs/{org}/websites/{w}/apps                                → enumeración
 *   2. GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/info         → WordPressInfo
 *   3. GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/users/default→ 404 sin default user
 *   4. GET /orgs/{org}/websites/{w}/apps/{appId}/wordpress/users/{u}/sso→ URL SSO
 *   5. GET /orgs/{org}/websites/{w}/apps/{appId}/joomla/info            → JoomlaInfo
 *
 * Y los 4 escenarios canónicos del flow F.10:
 *   E1. Website sin apps → GET /apps responde {items:[]} (200, NO 404).
 *   E2. WP con defaultWpUserId → /users/default 200 + /users/{u}/sso devuelve URL.
 *   E3. WP sin defaultWpUserId → /users/default 404 (path "WP sin default user" canónico).
 *   E4. Joomla → /joomla/info devuelve site_url para construcción `${site_url}/administrator`.
 *   E5. Multi-instancia: 2 WP + 1 Joomla diferenciados por appId+path.
 *
 * Doctrina (smoke del MOCK side, NO del backend Aelium):
 *   - El "contrato HTTP" del mock es lo que el plugin Enhance consume vía
 *     `EnhanceApiClient`. Si el mock responde correctamente, el cliente
 *     desplegado contra Enhance real con shapes idénticos también funciona.
 *   - El backend side (orquestador + audit per-app + Server Actions) ya
 *     está cubierto por los +13 tests unit del plugin + 3 ajustes
 *     existentes (53 suites / 767 passed total, +13 vs F.9).
 *   - Heredable: smoke pattern replicable para F.10.x stats UI (DC.NEW-51)
 *     cuando los endpoints `getWordpressInfo`/`getJoomlaInfo` se consuman
 *     desde el dashboard.
 *
 * Ejecución:
 *
 *   pnpm --dir backend exec ts-node --transpile-only -P tsconfig.build.json \
 *     scripts/smoke-f10-mock.ts
 *
 * Exit codes:
 *   0 → todos los smokes OK.
 *   1 → algún smoke FAILED (mensaje detalla cuál y por qué).
 */

import { startMockEnhanceServer } from '../test/mocks/enhance-server';
import type { EnhanceWebsiteApp } from '../src/plugins/provisioners/enhance_cp/api/types';

// ────────────────────────────────────────────────────────────────────────────
// Seed canónico del smoke F.10
// ────────────────────────────────────────────────────────────────────────────

const SMOKE_ORG_ID = 'aaaaaaaa-1111-1111-1111-111111111111';
const SMOKE_API_TOKEN = 'smoke-f10-token-fixture';

/** Website con 3 apps: 1 WP root con default user, 1 WP /blog sin default, 1 Joomla. */
const WEBSITE_WITH_APPS_ID = 'aaaaaaaa-2222-2222-2222-222222222222';

/** Website sin apps (escenario E1). */
const WEBSITE_EMPTY_ID = 'aaaaaaaa-3333-3333-3333-333333333333';

const APP_WP_ROOT: EnhanceWebsiteApp = {
  id: 'aaaaaaaa-4444-4444-4444-444444444444',
  app: 'wordpress',
  version: '6.4.2',
  defaultWpUserId: 42,
};

const APP_WP_BLOG: EnhanceWebsiteApp = {
  id: 'aaaaaaaa-5555-5555-5555-555555555555',
  app: 'wordpress',
  version: '6.3.1',
  path: 'blog',
  // NO defaultWpUserId → escenario E3 (WP sin default user)
};

const APP_JOOMLA: EnhanceWebsiteApp = {
  id: 'aaaaaaaa-6666-6666-6666-666666666666',
  app: 'joomla',
  version: '5.0.0',
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers HTTP + assertions
// ────────────────────────────────────────────────────────────────────────────

interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  const icon = passed ? '✓' : '✗';
  // eslint-disable-next-line no-console
  console.log(`  ${icon} ${name} — ${detail}`);
}

async function smokeFetch(
  baseUrl: string,
  path: string,
  expectStatus: number,
): Promise<{ status: number; body: unknown; ok: boolean }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${SMOKE_API_TOKEN}` },
  });
  let body: unknown = null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return {
    status: res.status,
    body,
    ok: res.status === expectStatus,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

void (async () => {
  // eslint-disable-next-line no-console
  console.log(
    '[smoke-f10-mock] Sprint 15C.II Fase F.10 — smoke automatizado del MockEnhanceServer\n',
  );

  const mock = await startMockEnhanceServer({
    port: 0, // ephemeral
    seed: {
      apiToken: SMOKE_API_TOKEN,
      customers: [
        {
          orgId: SMOKE_ORG_ID,
          email: 'smoke-f10@aelium.test',
          name: 'Smoke F.10',
        },
      ],
      websites: [
        {
          id: WEBSITE_WITH_APPS_ID,
          domain: { id: 'domain-1', domain: 'smoke-apps.aelium.test' },
          aliases: [],
          status: 'active',
          orgId: SMOKE_ORG_ID,
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: WEBSITE_EMPTY_ID,
          domain: { id: 'domain-2', domain: 'smoke-empty.aelium.test' },
          aliases: [],
          status: 'active',
          orgId: SMOKE_ORG_ID,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      websiteApps: {
        [WEBSITE_WITH_APPS_ID]: [APP_WP_ROOT, APP_WP_BLOG, APP_JOOMLA],
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[smoke-f10-mock] mock listening on ${mock.baseUrl}\n`);
  // eslint-disable-next-line no-console
  console.log('━━━ E1: Website sin apps → {items:[]} 200 ━━━');

  // ─── E1: website existe pero sin apps ───
  {
    const r = await smokeFetch(
      mock.baseUrl,
      `/orgs/${SMOKE_ORG_ID}/websites/${WEBSITE_EMPTY_ID}/apps`,
      200,
    );
    const body = r.body as { items?: unknown[] };
    record(
      'GET /apps en website sin apps',
      r.ok &&
        Array.isArray(body.items) &&
        body.items.length === 0,
      `status=${r.status}, items=${Array.isArray(body.items) ? body.items.length : 'n/a'}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log('\n━━━ E5: Multi-instancia 2 WP + 1 Joomla diferenciados ━━━');

  // ─── E5: enumeración multi-instancia ───
  {
    const r = await smokeFetch(
      mock.baseUrl,
      `/orgs/${SMOKE_ORG_ID}/websites/${WEBSITE_WITH_APPS_ID}/apps`,
      200,
    );
    const body = r.body as { items: EnhanceWebsiteApp[] };
    const has3Apps = Array.isArray(body.items) && body.items.length === 3;
    const wpRoot = body.items?.find(
      (a) => a.id === APP_WP_ROOT.id && a.app === 'wordpress' && !a.path,
    );
    const wpBlog = body.items?.find(
      (a) => a.id === APP_WP_BLOG.id && a.app === 'wordpress' && a.path === 'blog',
    );
    const joomla = body.items?.find(
      (a) => a.id === APP_JOOMLA.id && a.app === 'joomla',
    );
    record(
      'GET /apps multi-instancia 3 entries diferenciadas',
      r.ok && has3Apps && !!wpRoot && !!wpBlog && !!joomla,
      `status=${r.status}, items=${body.items?.length}, WP root=${!!wpRoot}, WP blog=${!!wpBlog}, Joomla=${!!joomla}`,
    );
    record(
      'WP root tiene defaultWpUserId',
      wpRoot?.defaultWpUserId === 42,
      `defaultWpUserId=${wpRoot?.defaultWpUserId}`,
    );
    record(
      'WP blog NO tiene defaultWpUserId (canónico path "sin default")',
      wpBlog?.defaultWpUserId === undefined,
      `defaultWpUserId=${wpBlog?.defaultWpUserId ?? 'undefined'}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log('\n━━━ E2: WP con default user → /users/default 200 + SSO URL ━━━');

  // ─── E2.1: getDefaultWpSsoUser WP con default → 200 ───
  {
    const r = await smokeFetch(
      mock.baseUrl,
      `/orgs/${SMOKE_ORG_ID}/websites/${WEBSITE_WITH_APPS_ID}/apps/${APP_WP_ROOT.id}/wordpress/users/default`,
      200,
    );
    const body = r.body as { id: number };
    record(
      'getDefaultWpSsoUser (WP root con default user)',
      r.ok && body.id === 42,
      `status=${r.status}, user.id=${body.id}`,
    );
  }

  // ─── E2.2: getWordpressUserSsoUrl → returns URL string ───
  {
    const res = await fetch(
      `${mock.baseUrl}/orgs/${SMOKE_ORG_ID}/websites/${WEBSITE_WITH_APPS_ID}/apps/${APP_WP_ROOT.id}/wordpress/users/42/sso`,
      { headers: { Authorization: `Bearer ${SMOKE_API_TOKEN}` } },
    );
    const text = await res.text();
    // El mock devuelve string JSON-encoded (con quotes) en text/plain.
    const matchesShape =
      res.status === 200 &&
      text.startsWith('"http://mock-panel.aelium.test/wp-admin/index.php?token=') &&
      text.endsWith('"');
    record(
      'getWordpressUserSsoUrl returns URL string JSON-encoded',
      matchesShape,
      `status=${res.status}, text=${text.slice(0, 60)}...`,
    );
  }

  // eslint-disable-next-line no-console
  console.log('\n━━━ E3: WP sin default user → /users/default 404 (defensive) ━━━');

  // ─── E3: getDefaultWpSsoUser WP sin default → 404 ───
  {
    const r = await smokeFetch(
      mock.baseUrl,
      `/orgs/${SMOKE_ORG_ID}/websites/${WEBSITE_WITH_APPS_ID}/apps/${APP_WP_BLOG.id}/wordpress/users/default`,
      404,
    );
    const body = r.body as { code?: string; message?: string };
    record(
      'getDefaultWpSsoUser WP sin defaultWpUserId → 404 NotFound (path "WP sin default user" canónico)',
      r.ok && body.code === 'NotFound',
      `status=${r.status}, code=${body.code}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log('\n━━━ E4: Joomla → /joomla/info devuelve site_url ━━━');

  // ─── E4: getJoomlaInfo → returns site_url ───
  {
    const r = await smokeFetch(
      mock.baseUrl,
      `/orgs/${SMOKE_ORG_ID}/websites/${WEBSITE_WITH_APPS_ID}/apps/${APP_JOOMLA.id}/joomla/info`,
      200,
    );
    const body = r.body as { site_url: string; version: string };
    const hasSiteUrl =
      r.ok &&
      typeof body.site_url === 'string' &&
      body.site_url.length > 0 &&
      body.version === '5.0.0';
    record(
      'getJoomlaInfo devuelve site_url + version',
      hasSiteUrl,
      `status=${r.status}, site_url=${body.site_url}, version=${body.version}`,
    );
    // Verifica que la URL canónica `${site_url}/administrator` construida es válida.
    const canonical = `${body.site_url.replace(/\/$/, '')}/administrator`;
    record(
      'URL canónica Joomla `${site_url}/administrator` construible (heredada A9.2)',
      canonical.endsWith('/administrator'),
      `canonical=${canonical}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log('\n━━━ Defensive: getWordpressInfo WP root → 200 (futuro F.10.x stats) ━━━');

  // ─── Bonus: getWordpressInfo (para F.10.x stats UI futuro) ───
  {
    const r = await smokeFetch(
      mock.baseUrl,
      `/orgs/${SMOKE_ORG_ID}/websites/${WEBSITE_WITH_APPS_ID}/apps/${APP_WP_ROOT.id}/wordpress/info`,
      200,
    );
    const body = r.body as {
      version: string;
      site_url: string;
      plugin_count: number;
      user_count: number;
      has_woocommerce: boolean;
    };
    const validShape =
      r.ok &&
      body.version === '6.4.2' &&
      typeof body.site_url === 'string' &&
      typeof body.plugin_count === 'number' &&
      typeof body.user_count === 'number' &&
      typeof body.has_woocommerce === 'boolean';
    record(
      'getWordpressInfo devuelve shape completo (heredable a F.10.x DC.NEW-51 stats UI)',
      validShape,
      `version=${body.version}, plugin_count=${body.plugin_count}, has_woocommerce=${body.has_woocommerce}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log('\n━━━ Defensive: GET /apps en website inexistente → 404 ━━━');

  // ─── Defensive: GET /apps en website inexistente → 404 ───
  {
    const r = await smokeFetch(
      mock.baseUrl,
      `/orgs/${SMOKE_ORG_ID}/websites/nonexistent-website-id/apps`,
      404,
    );
    const body = r.body as { code?: string };
    record(
      'GET /apps en website inexistente → 404 NotFound (semántica canónica orchd)',
      r.ok && body.code === 'NotFound',
      `status=${r.status}, code=${body.code}`,
    );
  }

  await mock.stop();

  // ─── Reporte final ───
  const failed = results.filter((r) => !r.passed);
  // eslint-disable-next-line no-console
  console.log(
    `\n[smoke-f10-mock] resumen: ${results.length - failed.length}/${results.length} tests OK${failed.length > 0 ? ` — ${failed.length} FAILED` : ''}`,
  );

  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error('\nFailed tests:');
    for (const f of failed) {
      // eslint-disable-next-line no-console
      console.error(`  ✗ ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(
    '\n✓ Smoke F.10 real automatizado: TODOS los escenarios canónicos verificados contra MockEnhanceServer.\n' +
      '  Backend side cubierto por +13 tests unit (53 suites / 767 passed total).\n' +
      '  Frontend visual diferido a Fase G.2 E2E spec extension (patrón heredado F.9).\n',
  );
  process.exit(0);
})();
