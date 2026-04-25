/**
 * Inicialización de Sentry para NestJS.
 *
 * IMPORTANTE: este archivo se DEBE importar antes que cualquier otro módulo
 * de la aplicación en main.ts (`import './instrument';` en la PRIMERA línea).
 *
 * Se activa solo si la variable de entorno SENTRY_DSN está definida.
 * Sin DSN → no hace nada (no envía datos, no consume recursos).
 *
 * Variables de entorno reconocidas:
 *   SENTRY_DSN                  DSN del proyecto Sentry. Si vacío, Sentry queda desactivado.
 *   SENTRY_ENVIRONMENT          'production' | 'staging' | 'development'. Default: NODE_ENV.
 *   SENTRY_RELEASE              Versión/release. Útil para tracking de regresiones.
 *   SENTRY_TRACES_SAMPLE_RATE   0.0 a 1.0. Porcentaje de transacciones a muestrear. Default: 0.1
 *   SENTRY_PROFILES_SAMPLE_RATE 0.0 a 1.0. Porcentaje de transacciones con profiling. Default: 0.1
 */

import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,

    // Performance monitoring (transacciones).
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),

    // Profiling (CPU per-transaction).
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),

    integrations: [nodeProfilingIntegration()],

    // No enviar PII por defecto (correos, IPs, headers de auth).
    // Activar manualmente solo si hace falta para depurar.
    sendDefaultPii: false,
  });
}
