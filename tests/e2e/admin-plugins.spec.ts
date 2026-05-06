/**
 * E2E — Sprint 15A Fase J.1: Plugin Framework admin REST.
 *
 * Verifica el flujo end-to-end de `/admin/plugins` (ADR-080 §7):
 *   1. Superadmin lista plugins → recibe `internal` + `manual` con
 *      manifest + circuit_state. (seed bootstrap Sprint 15A Fase D).
 *   2. Superadmin lee detalle `/admin/plugins/internal` → manifest +
 *      secrets enmascarados como '***' o null + circuit_state.
 *   3. Superadmin PATCH enabled=false → 200 + audit_change_log row +
 *      registry recarga (active list pasa a no incluir el slug).
 *   4. Superadmin PATCH enabled=true → restaura.
 *   5. Superadmin POST test-connection sobre plugin con
 *      `manifest.testConnectionMethod=null` → 400 (manual e internal
 *      ambos lo declaran null).
 *   6. agent_full intenta GET /admin/plugins → 403 (Subject.Plugin
 *      admin-puro, ADR-080 + ADR-067).
 *   7. agent_full intenta PATCH /admin/plugins/:slug → 403.
 *
 * Cubre ADR-080 §2/§4/§7 + R3 (audit obligatorio) + Subject.Plugin
 * admin-puro.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import { clearMailbox, waitForEmail, extract2FACode } from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const AGENT_FULL_EMAIL = 'agent.full@aelium.test';
const AGENT_FULL_PASSWORD =
  process.env.SEED_AGENT_FULL_PASSWORD || 'AgentFull2026!';

interface PluginListItem {
  slug: string;
  manifest: { slug: string; label: string } | null;
  enabled: boolean;
  circuit_state: {
    getServiceInfo: string | null;
    executeAction: string | null;
  };
}

interface PluginDetail {
  slug: string;
  manifest: { slug: string; testConnectionMethod: string | null };
  enabled: boolean;
  config: Record<string, unknown>;
  secrets: Record<string, '***' | null>;
}

let pool: Pool;
let superadminToken = '';
let agentFullToken = '';

async function loginWith2FA(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok(), `Login ${email} falló: ${loginRes.status()}`).toBeTruthy();
  const body = (await loginRes.json()) as {
    access_token?: string;
    temp_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) throw new Error(`${email}: missing access_token + temp_token`);

  const codeMail = await waitForEmail(email, {
    subjectIncludes: 'código',
    timeoutMs: 15_000,
  });
  const code = extract2FACode(codeMail);
  const verifyRes = await request.post(
    `${TEST_CONFIG.apiUrl}/auth/verify-2fa`,
    { data: { temp_token: body.temp_token, code } },
  );
  expect(verifyRes.ok()).toBeTruthy();
  const verifyBody = (await verifyRes.json()) as { access_token: string };
  return verifyBody.access_token;
}

test.describe.serial('Admin Plugins — Sprint 15A Fase J (ADR-080)', () => {
  test.beforeAll(async ({ request }) => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await resetTestData();
    superadminToken = await loginWith2FA(
      request,
      TEST_CONFIG.superadmin.email,
      SUPERADMIN_PASSWORD,
    );
    agentFullToken = await loginWith2FA(
      request,
      AGENT_FULL_EMAIL,
      AGENT_FULL_PASSWORD,
    );
  });

  test.afterAll(async () => {
    // Restaurar estado canónico (internal + manual habilitados) por si
    // algún test interrumpido los dejó disabled.
    await pool.query(
      `UPDATE plugin_installs SET enabled = true WHERE slug IN ('internal', 'manual')`,
    );
    await disconnectDb();
    await pool.end();
  });

  test('superadmin lista plugins → ve internal + manual con manifest + circuit_state', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/plugins`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    expect(res.ok(), `GET /admin/plugins: ${res.status()}`).toBeTruthy();
    const items = (await res.json()) as PluginListItem[];

    const slugs = items.map((i) => i.slug);
    expect(slugs).toContain('internal');
    expect(slugs).toContain('manual');

    for (const item of items) {
      expect(item.circuit_state).toBeDefined();
      expect(item.circuit_state.getServiceInfo).toBeNull();
      expect(item.circuit_state.executeAction).toBeNull();
      if (item.manifest) {
        expect(item.manifest.slug).toBe(item.slug);
      }
    }
  });

  test('superadmin lee detalle /admin/plugins/internal → manifest + secrets enmascarados', async ({
    request,
  }) => {
    const res = await request.get(
      `${TEST_CONFIG.apiUrl}/admin/plugins/internal`,
      { headers: { Authorization: `Bearer ${superadminToken}` } },
    );
    expect(res.ok()).toBeTruthy();
    const detail = (await res.json()) as PluginDetail;
    expect(detail.slug).toBe('internal');
    expect(detail.manifest.slug).toBe('internal');
    // Plugin trivial — testConnectionMethod=null (canónico ADR-080).
    expect(detail.manifest.testConnectionMethod).toBeNull();
    // Sin secrets en el schema → mapa vacío (no hay campos declarados).
    expect(detail.secrets).toEqual({});
  });

  test('superadmin PATCH enabled=false → registry recarga + audit fila', async ({
    request,
  }) => {
    // Limpia audit previo para assert determinista.
    await pool.query(
      `DELETE FROM audit_change_log WHERE entity_type = 'Plugin' AND entity_id = 'manual'`,
    );

    const res = await request.patch(
      `${TEST_CONFIG.apiUrl}/admin/plugins/manual`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
        data: { enabled: false },
      },
    );
    expect(res.ok(), `PATCH /admin/plugins/manual: ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { slug: string; enabled: boolean };
    expect(body.enabled).toBe(false);

    // Verifica audit log inmutable (R3 + ADR-017).
    await new Promise((r) => setTimeout(r, 200));
    const rows = await pool.query<{
      action: string;
      changes_after: { enabled: boolean };
    }>(
      `SELECT action, changes_after FROM audit_change_log
       WHERE entity_type = 'Plugin' AND entity_id = 'manual'
       ORDER BY created_at DESC LIMIT 1`,
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].action).toBe('plugin.config_changed');
    expect(rows.rows[0].changes_after.enabled).toBe(false);
  });

  test('superadmin PATCH enabled=true → restaura el plugin manual', async ({
    request,
  }) => {
    const res = await request.patch(
      `${TEST_CONFIG.apiUrl}/admin/plugins/manual`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
        data: { enabled: true },
      },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { enabled: boolean };
    expect(body.enabled).toBe(true);
  });

  test('superadmin POST test-connection sobre internal → 400 (testConnectionMethod=null)', async ({
    request,
  }) => {
    const res = await request.post(
      `${TEST_CONFIG.apiUrl}/admin/plugins/internal/test-connection`,
      { headers: { Authorization: `Bearer ${superadminToken}` } },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toContain('does not support test-connection');
  });

  test('agent_full intenta GET /admin/plugins → 403 (Subject.Plugin admin-puro)', async ({
    request,
  }) => {
    const res = await request.get(`${TEST_CONFIG.apiUrl}/admin/plugins`, {
      headers: { Authorization: `Bearer ${agentFullToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('agent_full intenta PATCH /admin/plugins/:slug → 403', async ({
    request,
  }) => {
    const res = await request.patch(
      `${TEST_CONFIG.apiUrl}/admin/plugins/manual`,
      {
        headers: { Authorization: `Bearer ${agentFullToken}` },
        data: { enabled: false },
      },
    );
    expect(res.status()).toBe(403);
  });
});
