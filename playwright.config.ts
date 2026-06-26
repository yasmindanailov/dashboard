import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Sprint 15C Fase 15C.I — carga manual del `.env` raíz para que los
 * specs E2E (que no son procesos NestJS/Next.js) tengan acceso a
 * `DATABASE_URL` + otras vars necesarias en `fixtures/db.ts` y similares.
 * NestJS y Next.js ya cargan su propio `.env` al boot via dotenv interno;
 * este parsing solo afecta al proceso Playwright en sí + sus webServers
 * heredan via spawn.
 *
 * Sin deps externas (dotenv no está en root package.json) — parser
 * minimal compatible con líneas `KEY=value`. Ignora comentarios y
 * variables ya seteadas en el shell (precedence shell > .env).
 */
function loadDotEnv(filePath: string): void {
  try {
    const content = readFileSync(resolve(filePath), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        // Strip optional surrounding quotes (single or double).
        const value = match[2].replace(/^["'](.*)["']$/, '$1');
        process.env[match[1]] = value;
      }
    }
  } catch {
    /* .env no existe — ignorar (CI lo provee via secrets/inputs). */
  }
}
loadDotEnv('.env');

/**
 * Playwright config para Aelium Dashboard.
 *
 * Tests E2E que verifican el sistema completo (backend + frontend).
 *
 * Local:  pnpm test:e2e
 *         Asume que tienes Postgres + Redis + MailPit corriendo en Docker.
 *         Backend (3001) y frontend (3002) los arranca Playwright.
 *
 * CI:     ejecutado por .github/workflows/ci.yml con services efímeros.
 */

const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://localhost:3002';
const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:3001';
const MOCK_ENHANCE_PORT = process.env.E2E_MOCK_ENHANCE_PORT || '3099';
const MOCK_ENHANCE_URL = `http://127.0.0.1:${MOCK_ENHANCE_PORT}`;
const MOCK_RC_PORT = process.env.E2E_MOCK_RC_PORT || '3098';
const MOCK_RC_URL = `http://127.0.0.1:${MOCK_RC_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // Tiempo total por test (ajustar si flujos largos lo necesitan).
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Sprint 9.6 Fase F.4 (DC.7): la suite E2E NO soporta paralelismo real
  // todavía — los specs comparten:
  //   - DB Postgres (resetTestData() global)
  //   - MailPit (un buzón compartido para extracción de códigos 2FA)
  //   - Cuentas demo del seed (1 por rol, login concurrente colisiona)
  //   - Redis (sesiones BullMQ + JWT refresh)
  //
  // Si ejecutas `pnpm test:e2e` con N workers, los specs se truncan
  // mutuamente las tablas mid-test, leen códigos 2FA de OTRO spec, y
  // pierden carreras de UPDATE en `users.login_attempts`. Resultado:
  // cascada de 19+ fallos en local con 0 errores reales.
  //
  // La paralelización con fixtures aisladas por spec (cada spec con su
  // propia DB de test, su MailPit dedicado, sus usuarios `e2e-${uid}`)
  // queda como deuda DC.X para Sprint 13 Hardening — fuera de scope
  // del split admin/cliente.
  //
  // Hasta entonces: workers=1 + fullyParallel=false en local y CI.
  fullyParallel: false,
  workers: 1,

  // Falla si quedan focus tests (`.only`) en el código.
  forbidOnly: !!process.env.CI,

  // Reintentos solo en CI (los flakes locales se arreglan, no se ocultan).
  // Tests E2E estables en CI desde 2026-04-25 con commit 0bd46ca.
  retries: process.env.CI ? 2 : 0,

  // Reporters: HTML para humanos, JSON para CI artifact.
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github'], ['json', { outputFile: 'playwright-report/results.json' }]]
    : [['html', { open: 'on-failure' }], ['list']],

  use: {
    baseURL: FRONTEND_URL,

    // Captura de evidencias para debugging post-mortem.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Headers comunes (correlation ID para rastrear en logs).
    extraHTTPHeaders: {
      'X-Test-Run': 'playwright',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox y WebKit deshabilitados para arrancar. Activar cuando
    // los tests sean estables en Chromium.
  ],

  // Arranca backend y frontend automáticamente antes de los tests.
  // Ambos en modo producción (`start:prod` / `next start`) — requiere
  // build previo (`pnpm --dir backend build && pnpm --dir frontend build`).
  //
  // ¿Por qué no `next dev`? El root tiene un `package.json` con tooling
  // (Husky, etc.) y `next dev` confunde el resolver de módulos buscando
  // dependencias del frontend (Tailwind) desde el root → out-of-memory.
  // `next start` usa el bundle ya compilado y es estable.
  //
  // En CI, los services (postgres, redis, mailpit) los provee el workflow.
  webServer: [
    {
      // Backend NestJS (requiere `pnpm --dir backend build` previo)
      command: 'pnpm --dir backend start:prod',
      url: `${BACKEND_URL}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      // ADR-016: el rate limiting (login 5/min/IP) colisiona con los specs de auth
      // que iteran logins desde una sola IP (p.ej. el test de lockout hace 6).
      // Se desactiva en E2E (el 429 se prueba en `rate-limiting.e2e-spec.ts`).
      env: { THROTTLER_DISABLED: 'true' },
    },
    {
      // Frontend Next.js (requiere `pnpm --dir frontend build` previo)
      command: 'pnpm --dir frontend start',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Sprint 15C Fase 15C.I — MockEnhanceServer standalone para el spec
      // `sprint-15c-enhance-flow.spec.ts`. El backend está configurado vía
      // PATCH /admin/plugins/enhance_cp en el `beforeAll` del describe para
      // apuntar a este mock (ver header del spec). Otros specs E2E que NO
      // tocan enhance_cp ignoran este servidor — su lifecycle no afecta.
      //
      // Patrón replicable: 15D RC añadirá `mock-resellerclub-runner.ts` en
      // un cuarto webServer cuando llegue su Fase de cierre.
      command:
        'pnpm --dir backend exec ts-node --transpile-only --project ../tests/e2e/fixtures/tsconfig.mock-runner.json ../tests/e2e/fixtures/mock-enhance-runner.ts',
      url: `${MOCK_ENHANCE_URL}/version`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Sprint 15D / GL-26 — MockResellerClubServer standalone para el spec
      // `sprint-15d-resellerclub-flow.spec.ts` (E2E del comercio de dominios).
      // Mismo patrón que el mock-enhance (proceso separado gestionado por
      // Playwright). El spec apunta el plugin `resellerclub` a este mock vía
      // `plugin_installs.config.__base_url_override`. Health: el endpoint de
      // pricing del mock responde 200 (no hay /version dedicado).
      command:
        'pnpm --dir backend exec ts-node --transpile-only --project ../tests/e2e/fixtures/tsconfig.mock-runner.json ../tests/e2e/fixtures/mock-resellerclub-runner.ts',
      url: `${MOCK_RC_URL}/products/reseller-price.json`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
