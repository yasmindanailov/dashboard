/**
 * Sentry — configuración del runtime Node.js de Next.js (Server Components,
 * route handlers, server actions, getServerSideProps en Pages Router).
 *
 * Cargado por instrumentation.ts cuando NEXT_RUNTIME === 'nodejs'.
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
