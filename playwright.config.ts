import { defineConfig, devices } from '@playwright/test';

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

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // Tiempo total por test (ajustar si flujos largos lo necesitan).
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // En CI: tests serializados para evitar contención de DB compartida.
  // En local: paralelismo permitido.
  fullyParallel: !process.env.CI,
  workers: process.env.CI ? 1 : undefined,

  // Falla si quedan focus tests (`.only`) en el código.
  forbidOnly: !!process.env.CI,

  // Reintentos solo en CI (los flakes locales se arreglan, no se ocultan).
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
  // - Backend: `start:prod` (asume `pnpm build` previo)
  // - Frontend: `dev` para que las NEXT_PUBLIC_* se respeten en runtime.
  //   En `next start` esas vars se fijan en build-time y no se podrían
  //   sobrescribir desde aquí sin re-buildear.
  // En CI, los services (postgres, redis, mailpit) los provee el workflow.
  webServer: [
    {
      // Backend NestJS
      command: 'pnpm --dir backend start:prod',
      url: `${BACKEND_URL}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Frontend Next.js (dev para respetar env vars en runtime)
      command: 'pnpm --dir frontend dev',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_API_URL: `${BACKEND_URL}/api/v1`,
      },
    },
  ],
});
