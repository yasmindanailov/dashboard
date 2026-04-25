import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * withSentryConfig envuelve la config de Next.js con:
 * - Webpack plugin para subir sourcemaps a Sentry (requiere SENTRY_AUTH_TOKEN
 *   en build de producción, opcional en dev).
 * - Inyección automática del cliente Sentry en el bundle.
 *
 * Sin SENTRY_DSN definido, withSentryConfig sigue funcionando pero no envía
 * datos a Sentry. Solo configura el wrapping.
 */
export default withSentryConfig(nextConfig, {
  // Identificación del proyecto Sentry (organización + slug).
  // Si están vacías, Sentry CLI las leerá de SENTRY_ORG/SENTRY_PROJECT env.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Subir sourcemaps solo cuando hay token (CI/prod), no en dev local.
  silent: !process.env.CI,

  // No fallar el build si la subida de sourcemaps falla (solo warn).
  // Permite builds de desarrollo sin SENTRY_AUTH_TOKEN.
  errorHandler: (err) => {
    console.warn('[sentry] sourcemap upload failed:', err.message);
  },

  // Subida automática de sourcemaps deshabilitada hasta tener
  // SENTRY_AUTH_TOKEN configurado (requiere acción del usuario en Sentry UI).
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Opciones de tunneling y telemetría conservadoras.
  telemetry: false,
});
