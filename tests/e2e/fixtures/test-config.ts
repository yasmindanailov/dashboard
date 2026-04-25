/**
 * Configuración compartida por todos los tests E2E.
 * Lee de env con defaults razonables.
 */

export const TEST_CONFIG = {
  frontendUrl: process.env.E2E_FRONTEND_URL || 'http://localhost:3002',
  backendUrl: process.env.E2E_BACKEND_URL || 'http://localhost:3001',
  apiUrl: process.env.E2E_API_URL || 'http://localhost:3001/api/v1',
  mailpitUrl: process.env.E2E_MAILPIT_URL || 'http://localhost:8025',

  // Superadmin pre-seedeado por backend/prisma/seed.ts
  superadmin: {
    email: process.env.SUPERADMIN_EMAIL || 'admin@aelium.net',
    password: process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026',
  },
};
