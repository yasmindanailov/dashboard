/**
 * Sentry — configuración del runtime Edge de Next.js (middleware, edge routes).
 *
 * Cargado por instrumentation.ts cuando NEXT_RUNTIME === 'edge'.
 * Edge runtime tiene un subset limitado de Node API; Sentry usa una build
 * compatible automáticamente.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,

    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),

    sendDefaultPii: false,
  });
}
