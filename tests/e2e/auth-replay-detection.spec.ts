/**
 * E2E — Sprint 13 §13.AUTH Fase F (DoD §4.3 / §7.2).
 *
 * Verifica el flow canónico de detección de replay de refresh token
 * (ADR-078 §1.4 + Amendment A1 §1.4):
 *
 *   1. Cliente hace login y obtiene un refresh_token.
 *   2. Primer POST /auth/refresh con ese token → 200 + par nuevo.
 *   3. Segundo POST /auth/refresh con el MISMO token (replay) → 401
 *      "Sesión comprometida — todas las sesiones revocadas".
 *   4. El listener `NotificationsAuthReplayListener` alerta al superadmin
 *      vía canal internal — verificable en GET /notifications/unread con
 *      bearer del superadmin.
 *
 * Cubre el invariante AUTH-INV-9 (cualquier reuso de refresh token revoca
 * la cadena entera + emite `auth.refresh_replay_detected`) y la entrada
 * `AUTH_REPLAY_DETECTED` de `docs/50-operations/api-errors.md`.
 *
 * Diseño:
 *   - El cliente `cliente@aelium.test` no requiere 2FA (login API directo).
 *   - El superadmin `admin@aelium.net` SÍ requiere 2FA — se reutiliza el
 *     helper canónico vía MailPit.
 *   - El dispatch al superadmin es asíncrono (BullMQ
 *     `notifications-dispatch`); el test espera con `expect.poll` hasta que
 *     la notification quede persistida y consultable por la campana.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_CONFIG } from './fixtures/test-config';
import { resetTestData, disconnectDb } from './fixtures/db';
import {
  clearMailbox,
  waitForEmail,
  extract2FACode,
} from './fixtures/mailpit';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
const CLIENT_EMAIL = 'cliente@aelium.test';
const CLIENT_PASSWORD = process.env.SEED_CLIENT_PASSWORD || 'Cliente2026!';

interface UnreadNotification {
  id: string;
  title: string;
  body: string;
}
interface UnreadResponse {
  data: UnreadNotification[];
  unread_count: number;
}

async function loginSuperadminAPI(
  request: APIRequestContext,
): Promise<string> {
  await clearMailbox();
  const loginRes = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: {
      email: TEST_CONFIG.superadmin.email,
      password: SUPERADMIN_PASSWORD,
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = (await loginRes.json()) as {
    access_token?: string;
    temp_token?: string;
  };
  if (body.access_token) return body.access_token;
  if (!body.temp_token) throw new Error('No access_token / temp_token');

  const codeMail = await waitForEmail(TEST_CONFIG.superadmin.email, {
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

async function loginClientAPI(
  request: APIRequestContext,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request.post(`${TEST_CONFIG.apiUrl}/auth/login`, {
    data: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD },
  });
  expect(
    res.ok(),
    `Client login falló: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  const body = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

test.describe.serial(
  'Auth replay detection — Sprint 13 §13.AUTH (ADR-078 §1.4)',
  () => {
    test.beforeAll(async () => {
      await resetTestData();
    });

    test.afterAll(async () => {
      await disconnectDb();
    });

    test('refresh dos veces seguidas: 2º 401 + alerta superadmin', async ({
      request,
    }) => {
      const { refreshToken } = await loginClientAPI(request);

      /* ── 1. Primer refresh — legítimo ──────────────────────────── */
      const first = await request.post(`${TEST_CONFIG.apiUrl}/auth/refresh`, {
        data: { refresh_token: refreshToken },
      });
      expect(
        first.ok(),
        `Primer refresh debe ser OK: ${first.status()} ${await first.text()}`,
      ).toBeTruthy();
      const firstBody = (await first.json()) as {
        access_token: string;
        refresh_token: string;
      };
      expect(firstBody.access_token).toBeTruthy();
      expect(firstBody.refresh_token).toBeTruthy();
      // El nuevo refresh debe ser distinto al original (rotación).
      expect(firstBody.refresh_token).not.toBe(refreshToken);

      /* ── 2. Segundo refresh con el MISMO token original — replay ─ */
      const second = await request.post(`${TEST_CONFIG.apiUrl}/auth/refresh`, {
        data: { refresh_token: refreshToken },
      });
      expect(second.status()).toBe(401);
      const secondBody = (await second.json()) as { message: string };
      expect(secondBody.message).toMatch(/sesión comprometida|replay|revoc/i);

      /* ── 3. Verificar la alerta al superadmin (BullMQ async) ───── */
      const adminToken = await loginSuperadminAPI(request);

      // El dispatch es asíncrono (notifications-dispatch BullMQ + listener).
      // expect.poll re-ejecuta el callback hasta que matchea o timeout.
      await expect
        .poll(
          async () => {
            const res = await request.get(
              `${TEST_CONFIG.apiUrl}/notifications/unread`,
              {
                headers: { Authorization: `Bearer ${adminToken}` },
              },
            );
            if (!res.ok()) return null;
            const body = (await res.json()) as UnreadResponse;
            return body.data.find(
              (n) =>
                /sesión comprometida/i.test(n.title) &&
                n.title.toLowerCase().includes(CLIENT_EMAIL.toLowerCase()),
            );
          },
          {
            message:
              'Notification "Sesión comprometida: cliente@aelium.test" debería aparecer en /notifications/unread del superadmin tras el replay',
            timeout: 20_000,
            intervals: [500, 1_000, 2_000, 3_000],
          },
        )
        .toBeDefined();
    });
  },
);
