# ADR-068 — Multi-path con Deprecation headers para migración retroactiva de rutas REST

> **Status:** Active
> **Date:** 2026-04-28
> **Domain:** API REST, cross-cutting
> **Sprint:** 9.6 — split admin/cliente retroactivo (P1.1.6, DC.7)

---

## Contexto

Sprint 9 Fase F (2026-04-27) introdujo el árbol staff `/api/v1/admin/*` con `AdminOnlyGuard` para los endpoints nacidos en ese sprint (`/admin/error-log`, `/admin/jobs/failed`, `/admin/notifications/templates`). Las rutas pre-existentes admin-puro siguieron en su path original sin prefijo `/admin`:

- `/api/v1/clients/*` — endpoints staff-puro (CRUD de clientes, ningún rol no-staff tiene `Read.Client` en CASL).
- `/api/v1/products/*` — mixto: `GET`/`LIST` es lectura del catálogo (cliente tiene `[Read, List] Product` en CASL aspiracional para Sprint 18 Landing); el resto (`POST`/`PATCH`/`DELETE` + endpoints de pricing) es admin-puro.

DC.7 (registrado en `backlog.md` 2026-04-27) exige migrarlos retroactivamente bajo `/api/v1/admin/*` para coherencia con los nuevos, habilitar **reglas WAF declarativas en Sprint 14 Deploy** (`/api/v1/admin/*` con rate limit más restrictivo + IP allowlist opcional + headers de seguridad estrictos), y simplificar la auditoría: cualquier request a `/api/v1/admin/*` se sabe inequívocamente que es operación staff.

El reto de la migración: **la API tiene consumidor activo** (el frontend Next.js) y **30+ specs E2E ya verdes**. Si la migración rompe la ruta vieja de golpe:

- El frontend desplegado antes que el backend → 404 masivo.
- Specs E2E con paths cableados al `/api/v1/clients/*` antiguo → CI rojo.
- Cualquier integración futura externa (no existe hoy en pre-producción, pero el patrón debe ser robusto pensando en producción) sin migración progresiva → corte abrupto.

Necesitamos un mecanismo de **alias retro-compatible con ventana de deprecación documentada** que permita:
1. La ruta nueva (`/api/v1/admin/clients/*`) responde como path canónico.
2. La ruta vieja (`/api/v1/clients/*`) sigue respondiendo idénticamente, pero anuncia deprecación al cliente HTTP.
3. Cierre formal de la ruta vieja en el commit pre-deploy de Sprint 14.

> **¿Qué pasaría si NO tomáramos esta decisión?** Dos opciones malas: (a) migrar paths "in-place" rompiendo la API y obligando a un PR atómico que toque backend + frontend + 4 specs E2E + cualquier integración futura, con cero margen de rollback; o (b) duplicar controllers (legacy + nuevo) con la misma lógica copiada, generando deuda de mantenimiento que se va a olvidar y dejar abierta. La primera es frágil; la segunda es desorden. Esta ADR formaliza el camino limpio.

---

## Opciones consideradas

### A. Mecanismo de alias

#### A.1 Redirect HTTP 308 (Permanent Redirect)

- **Pros**: estándar HTTP, semánticamente correcto. Preserva method+body (vs 301 que el cliente puede degradar a GET).
- **Contras**:
  - Cualquier `POST/PATCH` con body grande (creación de cliente, update de plantilla) hace **dos hops** — latencia x2.
  - Algunos middlewares (CSRF, rate limit, auth headers) pueden no reproducir correctamente en el redirect, generando flakiness en tests.
  - Playwright sigue redirects automáticamente — los specs no pueden distinguir "estoy llamando al path canónico" vs "el alias me redirige". Pierde valor de validación.
  - CORS preflight `OPTIONS` con redirect tiene fricción en navegadores estrictos.
- **Descartado**.

#### A.2 Multi-path en `@Controller([...])` ✅ elegido

- **Pros**:
  - NestJS soporta arrays de paths nativamente desde v9: `@Controller(['admin/clients', 'clients'])`. Un único decorador, un único controller, dos paths que invocan los mismos handlers.
  - Cero hops de red. Cero latencia adicional.
  - `req.url` sigue siendo el path real que el cliente llamó — un middleware puede inspeccionar y añadir headers `Deprecation` solo en el path legacy.
  - Source-of-truth única — no hay riesgo de que el legacy y el nuevo divergen porque la lógica vive una sola vez.
  - Tests E2E pueden validar **ambos paths** separadamente: el canónico responde sin headers; el legacy responde con `Deprecation: true`.
- **Contras**:
  - Swagger/OpenAPI puede generar dos entradas duplicadas en la docs UI. Mitigación: anotar paths legacy con `@ApiExcludeEndpoint()` o filtrar en la generación.
- **Elegido**.

#### A.3 Middleware Express custom que reescribe la URL

- **Pros**: total flexibilidad.
- **Contras**: complejidad arquitectónica innecesaria para lo que NestJS resuelve nativamente con A.2.
- **Descartado**.

### B. Comunicación al cliente HTTP del estado de deprecación

#### B.1 Header `Deprecation: true` (RFC 9745) ✅ elegido

- Estándar oficial publicado 2024 que reemplaza el draft `deprecation`. Indica que el endpoint sigue funcional pero no debe usarse para integraciones nuevas.
- Frontend puede inspeccionarlo con `response.headers.get('Deprecation')` y emitir un warning en consola (DX).
- Tests E2E lo verifican explícitamente.

#### B.2 Header `Sunset: <fecha>` (RFC 8594) ✅ elegido

- Indica cuándo el endpoint dejará de existir. Permite a consumidores planificar la migración con margen.
- Para Sprint 9.6, `Sunset: Wed, 31 Dec 2026 23:59:59 GMT`. Sprint 14 (Deploy real) cierra los aliases antes de esa fecha; el header marca el "techo" temporal.

#### B.3 Header `Link: <successor>; rel="successor-version"` ✅ elegido

- Indica cuál es el endpoint canónico que reemplaza al legacy. Estándar `Link header` de RFC 8288 + relación `successor-version` ya usada por GitHub, Stripe, AWS.
- Ejemplo: `Link: </api/v1/admin/clients>; rel="successor-version"`.

#### B.4 Solo log warning server-side (sin headers)

- **Descartado**: el cliente HTTP no se entera. Útil solo para auditoría interna; no sustituye los headers.

---

## Decisión

### 1. Multi-path en controllers que migran

```typescript
// backend/src/modules/clients/clients.controller.ts

@Controller(['admin/clients', 'clients']) // Sprint 9.6 — path canónico primero
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class ClientsController { /* ... handlers sin cambios ... */ }
```

```typescript
// backend/src/modules/products/admin-products.controller.ts (NUEVO)

@Controller(['admin/products', 'products']) // mutaciones — multi-path
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class AdminProductsController {
  @Post() create(...) {} // ← era ProductsController
  @Patch(':id') update(...) {}
  @Delete(':id') delete(...) {}
  @Post(':id/pricing') addPricing(...) {}
  // etc.
}
```

```typescript
// backend/src/modules/products/products.controller.ts (REDUCIDO)

@Controller('products') // sólo lectura pública, sin alias
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ProductsController {
  @Get() findAll(...) {} // CASL: Read.Product
  @Get(':id') findOne(...) {} // CASL: Read.Product
}
```

**Convención**: el primer elemento del array `@Controller([...])` es el path **canónico**. Los siguientes son **legacy alias**. El middleware se basa en esa convención para detectar legacy.

### 2. Middleware `LegacyRouteDeprecationMiddleware`

Aplicado globalmente en `app.module.ts` (clase con `configure(consumer: MiddlewareConsumer)`). Lista en código las rutas legacy (mantenible, explícito, auditable):

```typescript
const LEGACY_ROUTES: Record<string, { successor: string; sunset: string }> = {
  '/api/v1/clients': {
    successor: '/api/v1/admin/clients',
    sunset: 'Wed, 31 Dec 2026 23:59:59 GMT',
  },
  // GET/LIST /products NO está aquí — es lectura pública canónica.
  // Las mutaciones POST/PATCH/DELETE/pricing sí, vía path matching.
};
```

Lógica:
1. Si el path normalizado del request coincide con un prefijo legacy listado:
   - Añadir `Deprecation: true` al response.
   - Añadir `Sunset: <fecha>` al response.
   - Añadir `Link: <${successor}>; rel="successor-version"` al response.
   - Log `WARN` con correlation ID (R9), método, path original, path successor.
2. Si no coincide: `next()` sin hacer nada.

**Implementación**: middleware de NestJS clásico (no interceptor) — añadir headers ANTES del response.send es trivial con `res.setHeader(...)` antes de `next()`.

### 3. Política Sunset

- **Fecha**: `Wed, 31 Dec 2026 23:59:59 GMT` (formato HTTP-date RFC 7231).
- **Cierre real**: en el commit pre-deploy de Sprint 14, eliminar el path legacy del array `@Controller([...])` y eliminar la entrada en `LEGACY_ROUTES`. La fecha Sunset es un techo, el cierre real será antes (cuando Sprint 14 esté listo para deploy).

### 4. Frontend

- El frontend **migra todas sus llamadas** al path canónico en el mismo PR de Sprint 9.6. Los headers `Deprecation` no deberían aparecer en runtime cliente tras Sprint 9.6.
- Si por error queda algún `fetch('/api/v1/clients')` en el frontend, el desarrollador lo verá en consola del navegador (frontend puede inspeccionar `Deprecation` header en `lib/api.ts` y `console.warn(...)` durante DEV — opcional, no en scope de 9.6).

### 5. Tests E2E

Spec dedicada `tests/e2e/admin-tree-migration.spec.ts` valida:
- `GET /api/v1/admin/clients` → 200, sin header `Deprecation`.
- `GET /api/v1/clients` → 200 (mismo body), con `Deprecation: true` + `Sunset: Wed, 31 Dec 2026 23:59:59 GMT` + `Link: </api/v1/admin/clients>; rel="successor-version"`.
- Idem para `POST /api/v1/admin/products` vs `POST /api/v1/products`.
- `GET /api/v1/products` (catálogo público) → 200, sin header `Deprecation` (no es legacy, es endpoint canónico distinto).

---

## Implicaciones

### Swagger / OpenAPI

`@Controller([path1, path2])` genera dos entradas en la spec OpenAPI por handler. La docs UI de Swagger los muestra duplicados. Si esto incomoda a futuro, se anota cada handler con `@ApiExcludeEndpoint()` para una variante o se filtra al generar la spec. **No es prioridad de Sprint 9.6** — el efecto es cosmético en Swagger UI, no funcional.

### Rate limiting

El proyecto usa `ThrottlerModule` global con defaults (R10). Los paths legacy heredan el mismo límite que los canónicos. En Sprint 14 (Deploy + WAF) se aplicará rate limit diferenciado por prefix `/admin/*` — los aliases legacy quedarán fuera de esa regla porque ya estarán cerrados.

### Audit logging

`AuditInterceptor` ya está aplicado globalmente desde Sprint 9 Fase E. No cambia. Las rutas legacy y canónicas comparten controller → comparten decorador `@AuditAccess('Resource')` → logueo idéntico.

### Tests unitarios

No se requieren tests unit para el middleware — la lógica es trivial (lookup en map + setHeader). Cobertura E2E en `admin-tree-migration.spec.ts` es suficiente.

### Catálogo público de productos (Sprint 18 futuro)

Cuando Sprint 18 (Landing Integration) implemente el catálogo público sin auth, **NO se reutiliza** `/api/v1/products` directamente — se introduce `/api/v1/public/catalog` específico para no exponer estructura interna ni requerir JWT. El `ProductsController` actual con `Read.Product` bajo CASL queda como API interna autenticada (cliente logueado puede consultar catálogo sin pasar al admin tree).

---

## Tests requeridos

Cubierto en Sprint 9.6 Fase F.3 (`tests/e2e/admin-tree-migration.spec.ts`):
- 3 tests por endpoint migrado (canónico sin header, legacy con headers, body idéntico).
- Verificación explícita de cada header (`Deprecation`, `Sunset`, `Link`).

---

## Referencias

- [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — tres portales raíz (frontend Sprint 9.6 Fase C).
- [ADR-067](./adr-067-granularidad-casl-rol-staff.md) — granularidad CASL por rol staff (Fase A).
- RFC 9745 — `Deprecation` HTTP header (2024).
- RFC 8594 — `Sunset` HTTP header (2019).
- RFC 8288 — Link header.
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) §Patrones canónicos — actualizado con `LegacyRouteDeprecationMiddleware`.
- [`docs/60-roadmap/current.md`](../60-roadmap/current.md) Sprint 9.6 §F.B — pasos de aplicación.
- [`docs/60-roadmap/backlog.md`](../60-roadmap/backlog.md) DC.7 — deuda cerrada.
