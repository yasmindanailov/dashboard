/**
 * ═══════════════════════════════════════════════════════════════
 * AELIUM — Jest config (harness de unit tests del frontend)
 * ═══════════════════════════════════════════════════════════════
 *
 * GL-26 (audit 2026-06-25 §6 TIER 4): el frontend tenía CERO red de
 * tests propia (E2E Playwright solo post-merge). Este harness añade la
 * red unit en-PR.
 *
 * Usa `next/jest` — la integración oficial de Next 16: transform vía SWC,
 * auto-mock de CSS / CSS-modules / imágenes / `next/font`, carga de `.env`
 * e ignora `node_modules` y `.next`.
 *   Doc: node_modules/next/dist/docs/01-app/02-guides/testing/jest.md
 *
 * Alcance v1 (lo que Jest SÍ soporta bien):
 *   - Funciones puras (`app/lib/*`): routing por rol, permisos, errores.
 *   - Componentes SINCRÓNICOS (Client + Server no-async) del Design System.
 * Fuera de alcance (van a Playwright E2E, `tests/e2e/`):
 *   - async Server Components (Jest no los soporta — doc oficial).
 *   - Flujos completos que requieren backend + cookies + navegación.
 */
import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// `dir` apunta a la raíz de la app Next para cargar next.config + .env.
const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Espejo del alias `@/*` → raíz del proyecto (tsconfig.json "paths").
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Solo código de la app, nunca artefactos de build.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
};

// Exportado así para que `next/jest` pueda cargar la config (async) de Next.
export default createJestConfig(config);
