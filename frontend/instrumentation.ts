/**
 * Punto de entrada de instrumentación de Next.js (App Router 14+).
 *
 * Next.js ejecuta `register()` antes de arrancar el servidor. Aquí cargamos
 * la configuración Sentry correspondiente al runtime actual:
 *   - 'nodejs' → sentry.server.config.ts
 *   - 'edge'   → sentry.edge.config.ts
 *
 * Para client-side, sentry.client.config.ts se carga automáticamente vía
 * el plugin de Webpack que añade withSentryConfig en next.config.ts.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Hook para reportar errores de Server Components y Route Handlers.
 * Necesario para que Next.js los pase a Sentry automáticamente.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: 'Pages Router' | 'App Router'; routePath: string; routeType: string },
) {
  const { captureRequestError } = await import('@sentry/nextjs');
  return captureRequestError(err, request, context);
}
