/**
 * Sentry — configuración del navegador (client-side).
 *
 * Se carga automáticamente por @sentry/nextjs en cada página.
 * Sin NEXT_PUBLIC_SENTRY_DSN → Sentry inactivo (sin errores enviados).
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // Performance monitoring (transacciones de navegación, fetch, etc.).
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0.1'),

    // Replay de sesión (útil para depurar bugs de UX, alto coste en bytes).
    // Activar manualmente solo en producción y muestrear bajo.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // No enviar PII por defecto.
    sendDefaultPii: false,
  });
}
