/**
 * E2E — Comercio de dominios (plugin ResellerClub) · GL-26 (audit 2026-06-25 §6).
 *
 * Cierra el hueco "comercio de dominios (15D/15D.II) sin E2E". Verifica el flujo
 * de pre-venta end-to-end contra el `MockResellerClubServer` (4º webServer en
 * `playwright.config.ts`), que es la parte de mayor fidelidad del mock (los
 * shapes de `domains/available` + pricing están verificados en OT&E —
 * `docs/_research/sprint-15d/resellerclub-ote-findings.md §4`).
 *
 * Estructura (espejo de `sprint-15c-enhance-flow.spec.ts`):
 *   beforeAll → habilita el plugin `resellerclub` apuntando al mock + garantiza
 *               pricing de `.com`.
 *   1. cliente check-availability de un dominio libre → available + purchasable
 *      + precio EUR (precio resuelto server-side desde `domain_tld_pricing`, R5).
 *   2. cliente check-availability de un dominio ocupado ("taken") → no disponible.
 *   3. cliente check-availability-bulk de varios SLDs → resultado por nombre.
 *
 * Setup del plugin (patrón dev `set-rc-creds` + `set-rc-base-url`):
 *   - `PATCH /admin/plugins/resellerclub` con secrets dummy → el backend los
 *     cifra en el vault (AES-256-GCM). El mock es permisivo (acepta cualquier cred).
 *   - El `__base_url_override` (test-only, DC.NEW-67) lo RECHAZA el PATCH (Ajv
 *     `additionalProperties:false`) → se inyecta por SQL; `updated_at=now()`
 *     invalida el cache del plugin → la siguiente llamada usa el mock.
 *
 * NO se corre en local (su runtime lo valida el CI, job E2E con label
 * `ready-for-e2e`): `resetTestData()` trunca la BD.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';

import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const MOCK_RC_PORT = process.env.E2E_MOCK_RC_PORT || '3098';
const MOCK_RC_URL = `http://127.0.0.1:${MOCK_RC_PORT}`;
const RC_SLUG = 'resellerclub';

let pool: Pool;
let superadminToken = '';
let clientToken = '';

/** Login con 2FA (superadmin) — espejo de `sprint-15c-enhance-flow.spec.ts`. */
async function loginWith2FA(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok(), `Login ${email}: ${loginRes.status()}`).toBeTruthy();
  const body = (await loginRes.json()) as {
    access_token?: string;
    temp_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token)
    throw new Error(`${email}: missing access_token + temp_token`);
  const codeMail = await waitForEmail(email, {
    subjectIncludes: 'código',
    timeoutMs: 15_000,
  });
  const code = extract2FACode(codeMail);
  const verifyRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/verify-2fa`, {
    data: { temp_token: body.temp_token, code },
  });
  expect(verifyRes.ok()).toBeTruthy();
  return ((await verifyRes.json()) as { access_token: string }).access_token;
}

/** Login simple (cliente seed, sin 2FA). */
async function loginSimple(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok(), `Login ${email}: ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { access_token: string }).access_token;
}

interface AvailabilityResult {
  fqdn: string;
  tld: string;
  available: boolean;
  premium: boolean;
  purchasable: boolean;
  price?: { amount: string; currency: string };
  error?: boolean;
}

test.describe.serial(
  'Sprint 15D — Comercio de dominios (ResellerClub) E2E (GL-26)',
  () => {
    test.beforeAll(async ({ request }) => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await resetTestData();

      // plugin_installs NO está en TABLES_TO_TRUNCATE → limpia la fila RC para
      // partir de un install fresco apuntando al mock.
      await pool.query(`DELETE FROM plugin_installs WHERE slug = $1`, [RC_SLUG]);

      superadminToken = await loginWith2FA(
        request,
        TEST_CONFIG.superadmin.email,
        SUPERADMIN_PASSWORD,
      );
      clientToken = await loginSimple(
        request,
        TEST_CONFIG.client.email,
        TEST_CONFIG.client.password,
      );

      // (1) Habilita el plugin RC (el backend cifra los secrets en el vault).
      //     El mock es permisivo → los valores dummy bastan.
      const patchRes = await request.patch(
        `${TEST_CONFIG.apiUrl}/admin/plugins/${RC_SLUG}`,
        {
          headers: { Authorization: `Bearer ${superadminToken}` },
          data: {
            enabled: true,
            config: {
              environment: 'sandbox',
              markup_percent: 25,
              tlds_offered: '.com,.net,.org,.es,.eu',
              default_currency: 'EUR',
            },
            secrets: { authUserId: 'e2e-rc-uid', apiKey: 'e2e-rc-mock-apikey' },
          },
        },
      );
      expect(
        patchRes.ok(),
        `PATCH /admin/plugins/${RC_SLUG}: ${patchRes.status()} ${await patchRes.text()}`,
      ).toBeTruthy();

      // (2) Inyecta el override test-only del baseUrl (el PATCH lo rechaza por
      //     Ajv additionalProperties:false). `updated_at=now()` invalida el cache
      //     del plugin → la siguiente llamada usa el mock (DC.NEW-67).
      await pool.query(
        `UPDATE plugin_installs
           SET config = jsonb_set(config::jsonb, '{__base_url_override}', to_jsonb($1::text)),
               updated_at = now()
         WHERE slug = $2`,
        [MOCK_RC_URL, RC_SLUG],
      );

      // (3) Garantiza pricing de `.com` register EUR. El seed base lo siembra
      //     (`seedSampleDomainCommerce`) y `resetTestData` no lo trunca, pero el
      //     upsert idempotente lo hace independiente del estado del seed (R5: sin
      //     fila de pricing, el TLD no aparece en disponibilidad).
      await pool.query(
        `INSERT INTO domain_tld_pricing
           (id, registrar_slug, tld, operation, years,
            cost_amount, cost_currency, price_amount, price_currency,
            markup_percent, source, active, synced_at, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, 'com', 'register', 1,
            8.00, 'EUR', 10.00, 'EUR', 25.0, 'manual', true, now(), now(), now())
         ON CONFLICT (registrar_slug, tld, operation, years, price_currency)
           DO NOTHING`,
        [RC_SLUG],
      );
    });

    test.afterAll(async () => {
      // Restaura plugin_installs a estado bootstrap (otros specs parten limpios).
      await pool.query(`DELETE FROM plugin_installs WHERE slug = $1`, [RC_SLUG]);
      await disconnectDb();
      await pool.end();
    });

    test('1. cliente check-availability de un dominio libre → available + purchasable + precio EUR', async ({
      request,
    }) => {
      const res = await request.post(
        `${TEST_CONFIG.apiUrl}/domains/check-availability`,
        {
          headers: { Authorization: `Bearer ${clientToken}` },
          data: { sld: 'aelium-e2e-libre', tlds: ['com'] },
        },
      );
      expect(
        res.ok(),
        `check-availability: ${res.status()} ${await res.text()}`,
      ).toBeTruthy();
      const body = (await res.json()) as {
        sld: string;
        results: AvailabilityResult[];
      };
      expect(body.sld).toBe('aelium-e2e-libre');

      const com = body.results.find((r) => r.tld === 'com');
      expect(com, 'debe venir el resultado de .com (tarifado)').toBeDefined();
      expect(com!.available).toBe(true);
      expect(com!.premium).toBe(false);
      expect(com!.purchasable).toBe(true);
      expect(com!.fqdn).toBe('aelium-e2e-libre.com');
      // Precio resuelto server-side desde domain_tld_pricing (R5).
      expect(com!.price?.currency).toBe('EUR');
      expect(Number(com!.price?.amount)).toBeGreaterThan(0);
    });

    test('2. cliente check-availability de un dominio ocupado ("taken") → no disponible', async ({
      request,
    }) => {
      const res = await request.post(
        `${TEST_CONFIG.apiUrl}/domains/check-availability`,
        {
          headers: { Authorization: `Bearer ${clientToken}` },
          data: { sld: 'aelium-taken-e2e', tlds: ['com'] },
        },
      );
      expect(
        res.ok(),
        `check-availability taken: ${res.status()} ${await res.text()}`,
      ).toBeTruthy();
      const body = (await res.json()) as { results: AvailabilityResult[] };
      const com = body.results.find((r) => r.tld === 'com');
      expect(com, 'debe venir el resultado de .com').toBeDefined();
      expect(com!.available).toBe(false);
      expect(com!.purchasable).toBe(false);
    });

    test('3. cliente check-availability-bulk de varios SLDs → resultado por nombre', async ({
      request,
    }) => {
      const res = await request.post(
        `${TEST_CONFIG.apiUrl}/domains/check-availability-bulk`,
        {
          headers: { Authorization: `Bearer ${clientToken}` },
          data: { slds: ['aelium-bulk-uno', 'aelium-bulk-taken'], tlds: ['com'] },
        },
      );
      expect(
        res.ok(),
        `bulk: ${res.status()} ${await res.text()}`,
      ).toBeTruthy();
      const body = (await res.json()) as {
        results: Array<{ sld: string; results: AvailabilityResult[] }>;
      };
      expect(body.results.length).toBe(2);

      const uno = body.results.find((r) => r.sld === 'aelium-bulk-uno');
      const taken = body.results.find((r) => r.sld === 'aelium-bulk-taken');
      expect(uno?.results.find((r) => r.tld === 'com')?.available).toBe(true);
      expect(taken?.results.find((r) => r.tld === 'com')?.available).toBe(false);
    });
  },
);
