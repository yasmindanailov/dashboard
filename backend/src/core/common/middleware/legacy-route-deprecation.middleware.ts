import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CORRELATION_ID_HEADER } from './correlation-id.middleware';

/**
 * LegacyRouteDeprecationMiddleware — Sprint 9.6 (ADR-068 + DC.7).
 *
 * Cuando una request golpea un path REST legacy (ruta vieja con alias en
 * `@Controller([canónico, legacy])`), este middleware añade los headers
 * estándar HTTP que comunican la deprecación al cliente:
 *
 *   - `Deprecation: true` (RFC 9745) — el endpoint sigue funcional pero
 *     no debe usarse para integraciones nuevas.
 *   - `Sunset: <fecha HTTP-date>` (RFC 8594) — fecha tope; tras esa fecha
 *     el endpoint dejará de existir.
 *   - `Link: <successor>; rel="successor-version"` (RFC 8288) — endpoint
 *     canónico que reemplaza al legacy.
 *
 * También loguea WARN con correlation ID, método y path original para que
 * el operador pueda detectar consumidores legacy desde la observabilidad
 * de Sprint 14 (Grafana/Loki).
 *
 * El path canónico (path `/admin/...`) NO recibe estos headers: el lookup
 * en `LEGACY_ROUTES` solo coincide con paths viejos.
 *
 * Cierre real: en el commit pre-deploy de Sprint 14, eliminar el path
 * legacy del array `@Controller([...])` correspondiente y eliminar la
 * entrada en `LEGACY_ROUTES` aquí. La fecha `Sunset` es un techo;
 * el cierre será antes.
 */

interface LegacyRouteSpec {
  /** Path canónico que reemplaza al legacy (relativo al global prefix). */
  successor: string;
  /** HTTP-date RFC 7231 (formato `Wed, 31 Dec 2026 23:59:59 GMT`). */
  sunset: string;
  /**
   * Si está presente, sólo se considera legacy cuando el método HTTP del
   * request está en esta lista. Útil para `/api/v1/products` donde GET es
   * canónico (catálogo público) pero POST/PATCH/DELETE son legacy
   * (mutaciones — el path canónico es `/api/v1/admin/products`).
   * Si está ausente, todos los métodos sobre el path se consideran legacy.
   */
  legacyMethods?: ReadonlyArray<string>;
}

/**
 * Mapa de prefixes legacy → spec del successor canónico.
 *
 * El matching es por **prefix**: una request a `/api/v1/clients/abc-123`
 * matchea la entrada `/api/v1/clients`. Las entradas se evalúan en orden,
 * la más larga primero (longest-prefix-match) para que prefixes anidados
 * (si los hubiera en el futuro) funcionen correctamente.
 */
const LEGACY_ROUTES: ReadonlyArray<readonly [string, LegacyRouteSpec]> = [
  // Sprint 9.6 — ClientsController migrado a `/admin/clients`.
  // Todos los métodos sobre `/clients` son legacy (admin-puro).
  [
    '/api/v1/clients',
    {
      successor: '/api/v1/admin/clients',
      sunset: 'Wed, 31 Dec 2026 23:59:59 GMT',
    },
  ],

  // Sprint 9.6 — ProductsController split:
  //   GET /api/v1/products[/:id|/categories/all] → canónico (catálogo).
  //   POST/PATCH/DELETE /api/v1/products/* → legacy (mutaciones admin).
  // Sólo etiquetamos los métodos de mutación.
  [
    '/api/v1/products',
    {
      successor: '/api/v1/admin/products',
      sunset: 'Wed, 31 Dec 2026 23:59:59 GMT',
      legacyMethods: ['POST', 'PATCH', 'DELETE'],
    },
  ],
];

@Injectable()
export class LegacyRouteDeprecationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LegacyRouteDeprecationMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const match = this.findMatchingLegacyRoute(req);
    if (!match) {
      next();
      return;
    }

    const [, spec] = match;

    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', spec.sunset);
    res.setHeader('Link', `<${spec.successor}>; rel="successor-version"`);

    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string) || 'unknown';
    this.logger.warn(
      `Legacy route hit: ${req.method} ${req.originalUrl} → successor ${spec.successor} (correlationId=${correlationId})`,
    );

    next();
  }

  /**
   * Devuelve la primera entrada del mapa cuyo prefix coincida con el path
   * actual y, si la spec restringe métodos, cuyo método HTTP esté en la
   * lista. Recorre del prefix más largo al más corto.
   */
  private findMatchingLegacyRoute(
    req: Request,
  ): readonly [string, LegacyRouteSpec] | null {
    // `req.originalUrl` incluye el path completo + querystring; nos quedamos
    // sólo con el path para que el matching sea estable.
    const pathOnly = req.originalUrl.split('?')[0];

    // Longest-prefix-match: ordenamos descendentemente por longitud del prefix.
    const sorted = [...LEGACY_ROUTES].sort(([a], [b]) => b.length - a.length);

    for (const entry of sorted) {
      const [prefix, spec] = entry;
      const isPrefixMatch =
        pathOnly === prefix || pathOnly.startsWith(`${prefix}/`);
      if (!isPrefixMatch) continue;

      if (spec.legacyMethods && !spec.legacyMethods.includes(req.method)) {
        // El path matchea pero el método es canónico (ej: GET /products).
        continue;
      }

      return entry;
    }

    return null;
  }
}
