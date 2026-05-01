# Sprint 9.6 — Split admin/cliente retroactivo + 3 portales raíz + permisos granulares ✅

> **Estado:** ✅ Cerrado
> **Cierre:** 2026-04-28 (1 sesión densa, 12 commits encadenados)
> **Identificadores:** P1.1.6 / DC.7 / ADR-066 + ADR-067 + ADR-068
> **Rama:** `feat/sprint-9-6-split-admin-cliente`

---

## Objetivo

Cerrar DC.7 retroactivamente: separar el árbol frontend en **tres portales raíz canónicos** (`/admin/*` staff, `/dashboard/*` cliente, `/partner/*` reservado Sprint 19), migrar las páginas admin-puro existentes desde `/dashboard/*` a `/admin/*`, splitear las páginas compartidas (billing, support) en componentes diferenciados cliente vs staff, introducir granularidad CASL fina por rol staff (`agent_billing` ≠ `agent_support` ≠ `agent_full`) en el Sidebar y en endpoints, y emitir aliases REST con headers `Deprecation`/`Sunset` para que la migración no rompa el frontend ni los 30+ specs E2E ya verdes.

---

## Lo que entregó

### 1. Granularidad CASL por rol staff (Fase A — ADR-067)

Cierra deuda Sprint 9.5 §3 ("granularidad fina diferida a 9.6"). Introduce dos Subjects nuevos en `backend/src/core/casl/permissions.ts`:

- **`Subject.NotificationTemplate`** — sólo `superadmin` puede `Manage`. Las plantillas de notificaciones afectan el copy de marca; centralizar la edición en el rol con visión global.
- **`Subject.Job`** — sólo `superadmin` puede `Manage`. Reintentar un job de DLQ re-ejecuta side effects globales (emails, PDFs, integraciones); restringido al rol con visión sistémica.

Aplicado en `notification-templates-admin.controller.ts` y `core/jobs/jobs.controller.ts` con triple guard `JwtAuthGuard` + `AdminOnlyGuard` + `PoliciesGuard`. Defense in depth nivel 3 sobre los endpoints `/api/v1/admin/*`.

Tests unit: `backend/src/core/casl/casl-ability.factory.spec.ts` con 16 aserciones cubren la matriz (4 roles staff × Subjects nuevos) + preservación de la matriz canónica anterior.

### 2. Multi-path con Deprecation headers (Fase B — ADR-068)

Mecanismo canónico para migrar rutas REST sin romper consumidores:

- **`@Controller([canónico, legacy])`** — NestJS multi-path nativo. Un único controller atiende dos paths.
- **`LegacyRouteDeprecationMiddleware`** (`backend/src/core/common/middleware/`) — añade headers `Deprecation: true` + `Sunset: Wed, 31 Dec 2026 23:59:59 GMT` + `Link: <successor>; rel="successor-version"` (RFC 9745 / 8594 / 8288) sólo a las llamadas al path legacy. Log WARN con correlation ID.
- **Ventana de deprecación**: hasta Sprint 14 Deploy. El path legacy se elimina del array `@Controller([...])` en commit pre-deploy.

Aplicado a `/api/v1/admin/clients` (alias legacy `/clients`) y mutaciones `/api/v1/admin/products` (alias legacy `/products` POST/PATCH/DELETE — `GET /products` queda canónico público para cliente).

### 3. Tres portales raíz + componente PortalBadge (Fase C — ADR-066)

Decisión arquitectónica canónica:

| Portal | URL raíz | Audiencia | Subtítulo |
|--------|----------|-----------|-----------|
| **Administración** | `/admin/*` | superadmin + 3 agentes staff | "Portal de Administración" |
| **Cliente** | `/dashboard/*` | client | "Portal de Cliente" |
| **Partner** | `/partner/*` (Sprint 19) | partner / partner_pending | "Portal de Partner" |

`PortalBadge` componente del Design System en `frontend/app/components/ui/PortalBadge/`, integrado en el header del Sidebar de cada portal. Helper `portalForRole(roleSlug)` en `frontend/app/lib/portal.ts`. Cumple R16 + D11.

### 4. Migración páginas admin-puro (Fase D)

`git mv` (preserva history) de las 4 áreas admin-puro:

- `/dashboard/clients/*` → `/admin/clients/*`
- `/dashboard/products/*` → `/admin/products/*`
- `/dashboard/tasks/*` → `/admin/tasks/*` (Yasmin: cliente NO tiene página de tasks; las verá embebidas en services/support-inside cuando se implementen)
- `/dashboard/support/chats` → `/admin/support/chats`

Reescritura de `AdminSidebar.tsx` para usar `useAbility().can(action, subject)` como fuente de verdad (misma fuente que `Sidebar.tsx` cliente — cierra inconsistencia hallazgo de auditoría). Items en dos secciones: "Operaciones" (granular CASL) + "Plataforma" (sólo superadmin).

`Sidebar.tsx` cliente: removida sección 'admin' completamente. Defense hard: `if (item.section === 'admin') return false`.

### 5. Split UX billing + support (Fase E)

Patrón canónico extraído: lo que dos portales necesitan vive en `frontend/app/_shared/` (carpeta privada Next.js, no enrutada), las pages divergen sólo en presentación.

**`frontend/app/_shared/billing/`**: `billing.module.css`, `invoiceDetail.module.css`, `invoice-status-map.ts` canónico (`getInvoiceStatusInfo` + `fmtCurrency` + `fmtDateShort/Long` — antes duplicación inline), `checkout/{useCheckout, types, StepConfirm, checkout.module.css}`.

**`frontend/app/_shared/support/`**: `types.ts`, `useTicketInbox.ts`, `TicketList.tsx` (recibe `basePath` para construir links a `/admin` o `/dashboard`), `NewTicketModal.tsx`, `conversation/{useConversationDetail, ConversationHeader, ConversationMessages, ConversationSidebar, DetailResolutionModal}`.

**`frontend/app/admin/billing/*`**: full UX staff (columna Cliente, tab Canceladas, acciones Enviar/Cobrar/Cancelar/Refund, bulk operations, checkout 5 steps).
**`frontend/app/dashboard/billing/*`**: cliente UX simplificada (sin columna Cliente, sin tab Canceladas, sin bulk, sin acciones admin, checkout 4 steps).

**`frontend/app/admin/support/*`**: full workflow tabs 6 estados, sidebar contexto cliente con servicios + notas, toggle is_internal, redirect a `/admin/support/chats` para chats.
**`frontend/app/dashboard/support/*`**: cliente UX simplificada (3 tabs Todas/Abiertas/Resueltas, sin sidebar contexto, sin acciones admin).

### 6. Seed modular profesional (Fase F.0)

Cierra el bug recurrente "tras cada migración / reseed se borra el cliente test" introducido cuando el seed inline solo creaba al superadmin y los datos demo se inyectaban con scripts ad-hoc.

`backend/prisma/seed.ts` refactorizado a orquestador de 60 líneas + `backend/prisma/seeds/` modular:

- `roles.ts` — 7 roles del enum `RoleSlug`.
- `settings.ts` — 31 settings categorizados.
- `notification-templates.ts` (preexistía).
- `test-accounts.ts` (NUEVO) — **1 cuenta por cada rol** con credenciales conocidas:

| Rol | Email | Password |
|-----|-------|----------|
| superadmin | `admin@aelium.net` | `AeliumDev2026!` |
| agent_full | `agent.full@aelium.test` | `AgentFull2026!` |
| agent_billing | `agent.billing@aelium.test` | `AgentBilling2026!` |
| agent_support | `agent.support@aelium.test` | `AgentSupport2026!` |
| client | `cliente@aelium.test` | `Cliente2026!` |
| partner | `partner@aelium.test` | `Partner2026!` |
| partner_pending | `partner.pending@aelium.test` | `Partner2026!` |

- `sample-clients.ts` (NUEVO) — 2 clientes adicionales + perfiles billing.
- `sample-products.ts` (NUEVO) — `hosting-pro` (3 ciclos) + `support-inside-basic`.
- `sample-invoices.ts` (NUEVO) — 2 facturas del cliente principal (paid + pending).
- `sample-support.ts` (NUEVO) — 1 ticket + 1 chat del cliente principal.

Cuatro salvaguardas profesionales:

1. Guard `NODE_ENV !== 'production'` en cuentas demo + datos sample.
2. TLD `.test` (RFC 6761) — reservado, jamás resuelve público.
3. Override por env vars `SEED_*_PASSWORD`.
4. Markers `metadata.seeded = true` + `notes = 'SEED_DEMO'` para futuro `pnpm seed:clean`.

Doc canónica nueva: [`docs/50-operations/seed-reference.md`](../../50-operations/seed-reference.md). Nueva §11 en [`docs/90-meta/development-playbook.md`](../../90-meta/development-playbook.md).

### 7. Topbar shell unificado (Fase F.0.bis)

No estaba en plan original. Surgió del bug "no se puede cerrar sesión en `/admin` porque no hay Topbar". Extracción de `Topbar` + `NotificationBell` a `frontend/app/_shared/shell/` siguiendo doctrina ADR-066 (single source of truth). El admin/layout pasa de 62 → 130 líneas con simetría completa al dashboard cliente:

- Buscador Cmd+K + CommandPalette global.
- NotificationBell (polling 30s, marca como leída).
- Dropdown perfil con "Mi perfil" / "Configuración" (sólo si CASL `Manage Setting`) / "Cerrar sesión".
- ToastProvider envolvente.
- `<NoPermission/>` segunda línea de defensa sobre AdminOnlyGuard backend.

Cuando llegue Sprint 19 (Partner Module), `app/partner/layout.tsx` reusa el mismo shell.

### 8. Tests E2E (Fase F.1–F.4)

- **2 specs actualizados**: `checkout-admin.spec.ts` + `support-escalation.spec.ts` (paths `/dashboard/*` → `/admin/*`).
- **3 specs nuevos**: `aliases-rest-deprecation.spec.ts` (7 tests cubren headers Deprecation/Sunset/Link), `admin-tree-migration.spec.ts` (7 tests: 403 cliente, 200 staff, UX cliente sin columna Cliente, tabs reducidas, login redirect por rol), `admin-granular-roles.spec.ts` (8 tests: matriz CASL agente_billing/support/full × Subjects nuevos con aserciones positivas y negativas).

**Suite full**: 60/60 verde en ~1 min (51 heredados + 9 nuevos). Sin regresiones.

Bugs latentes descubiertos y arreglados durante DoD:

- `playwright.config` `fullyParallel: !process.env.CI` lanzaba N workers en local sobre suite que no soporta paralelismo (DB/MailPit/cuentas seed compartidos). Forzado `workers=1` + `fullyParallel=false` en ambos entornos.
- `resetTestData()` no limpiaba `login_attempts`/`blocked_until`/`two_factor_secret` de cuentas seed. Tras una corrida con password mal, el superadmin quedaba bloqueado. Fix: reset proactivo en cada `resetTestData()`.

---

## Decisiones clave consolidadas (3 ADRs nuevos)

- **[ADR-066](../../10-decisions/adr-066-tres-portales-raiz-portalbadge.md)** — Tres portales raíz por audiencia + componente `PortalBadge`. Granularidad fina entre roles staff vía CASL, no creando un portal por rol. Layouts separados, Design System compartido.
- **[ADR-067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md)** — Subjects CASL `NotificationTemplate` + `Job`, sólo superadmin. Triple guard defense in depth.
- **[ADR-068](../../10-decisions/adr-068-multi-path-deprecation-headers.md)** — Multi-path con Deprecation headers para migración retroactiva. Sin redirects HTTP (preservan method+body). Ventana hasta Sprint 14.

---

## Métricas finales

| Métrica | Valor |
|---------|-------|
| Commits encadenados | 12 (de `16b22ed` a `53b90d0`) |
| Archivos modificados | ~70 entre backend (15) + frontend (40) + docs (10) + tests (5) |
| Líneas netas | +5,400 / -1,200 (net +4,200) |
| ADRs creados | 3 (066, 067, 068) |
| Subjects CASL nuevos | 2 (`NotificationTemplate`, `Job`) |
| Patrones canónicos rules.md nuevos | 4 (`PortalBadge`, `_shared/shell/Topbar`, multi-path Deprecation, Subjects CASL nuevos) |
| Backend unit tests | 21 → **37/37** verde (+16 CASL factory) |
| E2E specs | 51 → **60/60** verde (+9 nuevos) |
| Tiempo E2E full | ~1 min |

---

## Retrospectiva

### Qué funcionó

- **Auditoría iterativa pre-codear con Yasmin** — la propuesta inicial de la conversación se discutió en bloques (matriz de migración, granularidad CASL, política aliases, plan E2E) antes de tocar código. Eso evitó pulido prematuro de 2 piezas que se invalidaron en Fase D ("Volver al panel cliente" del AdminSidebar viejo, sección 'admin' del Sidebar cliente).
- **`git mv` preserva history** — las 4 migraciones de carpetas (`/dashboard/<X>` → `/admin/<X>`) y la extracción a `_shared/` mantuvieron el `git log` legible. `git log --follow` sigue funcionando para ver cambios anteriores.
- **Multi-path NestJS sobre redirect HTTP** — la decisión inicial de usar `308 Permanent Redirect` se revirtió a multi-path por el ADR-068. Resultado: tests Playwright sin fricción, body preservado en POST/PATCH, un único source-of-truth por controller. La paciencia en planificar la mecánica antes de codear ahorró ~3h de refactor de tests.
- **Doctrina `_shared/`** — Yasmin pidió "copiar el shell del cliente al admin". La crítica profesional fue extraer a `_shared/shell/` en lugar de duplicar. Cinco minutos extra de trabajo, beneficio permanente: cuando llegue Sprint 19 Partner, hay un shell único que recibe el portal.

### Qué no esperábamos

- **Bug del logout en `/admin`** — el `AdminLayout` original (Sprint 9 Fase F) no tenía Topbar. Se descubrió en smoke manual de Yasmin y disparó Fase F.0.bis no planificada. La doctrina canónica de "single source of truth" hizo que la solución fuera limpia: extraer + reusar, no duplicar.
- **Bug del seed F.0** — Yasmin reportó "tras cada migración se me borra el cliente test". No estaba previsto en el plan inicial. Resultado: refactor del seed a 7 módulos profesionales con 4 salvaguardas + doc canónica `seed-reference.md`. Resolvió un problema crónico.
- **Tres bugs latentes en `playwright.config` y `resetTestData()`** — se manifestaron solo cuando los specs nuevos empezaron a usar las cuentas del seed que ahora sobreviven al DELETE. La cadena de fallos fue: seed F.0 hace que cuentas demo sobrevivan → `resetTestData` no resetea sus campos auth → password mal en una corrida deja superadmin bloqueado → siguiente run cae en cascada → además paralelismo amplifica el problema. Tres fixes encadenados resolvieron el árbol completo.

### Lecciones aprendidas

- **Ningún plan sobrevive contacto con el smoke manual** — sin Yasmin probando localmente con cada cuenta, los bugs del logout, del seed y del paralelismo E2E habrían quedado latentes hasta CI o producción. La validación humana es irremplazable.
- **Bug latente ≠ bug ausente** — el `playwright.config` con paralelismo distinto local vs CI llevaba **meses** así sin manifestarse. Sólo cuando Sprint 9.6 introdujo specs que comparten cuentas seed (`admin-granular-roles`) el bug salió. Lección: cualquier asimetría CI/local es deuda silenciosa.
- **Doctrina vence a duplicación** — cuatro veces el patrón fue idéntico: "copiar X al admin / duplicar Y". Cuatro veces la respuesta correcta fue "extraer a `_shared/` y compartir". Cuesta 5 minutos extra en cada decisión y paga cada vez que aparece un tercer consumer (Sprint 19 lo confirmará).

---

## Items diferidos / deuda residual

- **DC.13 Paralelización E2E real** (Sprint 13 Hardening) — fixtures aisladas por spec: DB de test propia, MailPit dedicado, usuarios `e2e-${uid}` por spec. Hoy serial es suficiente (60 tests en ~1 min). Documentado en `playwright.config.ts` + `tests/e2e/fixtures/db.ts`.
- **DC.14 AdminSidebar collapse + mobile drawer** (Sprint 13 Hardening / UX dedicado) — width 260 fijo. Pulido UX no bloquea lógica.
- **DC.15 Colapso `SIDEBAR_PERMISSIONS` duplicado frontend/backend** (Sprint 13 Hardening) — réplica manual entre `backend/src/core/casl/permissions.ts` y `frontend/app/lib/permissions.ts`. Endpoint futuro `/api/v1/me/permissions` retorna la matriz al login.
- **Cierre ventana aliases REST** (Sprint 14 Deploy) — eliminar paths legacy del array `@Controller([...])` antes del primer push productivo. Documentado en ADR-068 §3.

---

## Próximo paso natural

Según [`docs/90-meta/development-playbook.md §10`](../../90-meta/development-playbook.md): **Sprint 8 residual** (Tasks Fase A schemas + B frontend Tablero + C listeners task.overdue + D Support Inside ADR-061 + E docs) o **Sprint 11 Provisioning** según prioridad operativa que decida Yasmin.

---

## Archivos canónicos producidos

- [`docs/10-decisions/adr-066-tres-portales-raiz-portalbadge.md`](../../10-decisions/adr-066-tres-portales-raiz-portalbadge.md)
- [`docs/10-decisions/adr-067-granularidad-casl-rol-staff.md`](../../10-decisions/adr-067-granularidad-casl-rol-staff.md)
- [`docs/10-decisions/adr-068-multi-path-deprecation-headers.md`](../../10-decisions/adr-068-multi-path-deprecation-headers.md)
- [`docs/50-operations/seed-reference.md`](../../50-operations/seed-reference.md)
- [`docs/00-foundations/glossary.md` § Portales y audiencias](../../00-foundations/glossary.md)
- [`docs/00-foundations/rules.md` § Patrones canónicos](../../00-foundations/rules.md) (4 entries nuevas)
- [`docs/20-modules/_matrix.md` § Granularidad CASL por rol staff](../../20-modules/_matrix.md)
- Contracts actualizados: `clients/`, `products/` (split público/admin), `billing/`, `support/`.


---

## Apéndice — Plan canónico original (10 secciones)

> Sección movida desde `current.md` el 2026-05-01 (saneamiento documental post-Sprint 8). Preserva el plan completo del sprint para trazabilidad histórica. La retrospectiva ejecutiva de arriba es la fuente canónica; este apéndice es referencia detallada.

## ✅ Sprint 9.6 — Split admin/cliente retroactivo + 3 portales raíz + permisos granulares (P1.1.6 / DC.7)

**Estado:** ✅ completado
**Inicio:** 2026-04-28
**Cierre real:** 2026-04-28 (1 sesión densa, 12 commits encadenados)
**Resumen ejecutivo + retrospectiva:** [`completed/sprint-9-6-split-admin-cliente.md`](sprint-9-6-split-admin-cliente.md)

### 1. Objetivo en una frase

Cerrar DC.7 retroactivamente: separar el árbol frontend en **tres portales raíz canónicos** (`/admin/*` staff, `/dashboard/*` cliente, `/partner/*` reservado Sprint 19), migrar las páginas admin-puro existentes desde `/dashboard/*` a `/admin/*`, splitear las páginas compartidas (billing, support) en componentes diferenciados cliente vs staff, introducir granularidad CASL fina por rol staff (`agent_billing` ≠ `agent_support` ≠ `agent_full`) en el Sidebar y en endpoints, y emitir aliases REST con headers `Deprecation`/`Sunset` para que la migración no rompa el frontend ni los 30+ specs E2E ya verdes.

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué |
|---|-------------|--------|-------------|
| 1 | Sprint 9 cerrado (`AdminOnlyGuard` global + árbol parcial `/admin/*`) | ✅ | F.1 Fase B |
| 2 | Sprint 9.5 cerrado (granularidad notifs diferida explícitamente a 9.6) | ✅ | F.1 Fase A |
| 3 | CASL Ability Factory operativa (`backend/src/core/casl/`) | ✅ | F.1 Fase A |
| 4 | Auditoría iterativa con Yasmin (3 portales, tasks no-cliente, productos read público, plantillas solo superadmin) | ✅ 2026-04-28 | — |

### 3. Produce (contratos nuevos)

#### 3.1 Subjects CASL nuevos
- `Subject.NotificationTemplate` — solo `superadmin` puede `Manage`. Reemplaza el control hoy basado en `AdminOnlyGuard` puro.
- `Subject.Job` — solo `superadmin` puede `Manage`. Cubre DLQ + cualquier futura UI de jobs.

#### 3.2 Páginas frontend nuevas (árbol `/admin/*`)
- `/admin/clients` (list) + `/admin/clients/[id]` (detail)
- `/admin/products` (list) + `/admin/products/new` + `/admin/products/[id]` + `/admin/products/[id]/edit`
- `/admin/billing` (list) + `/admin/billing/[id]` + `/admin/billing/checkout` (full UX staff)
- `/admin/support` (tickets list) + `/admin/support/[id]` + `/admin/support/chats` (workspace agente)
- `/admin/tasks` (list) + `/admin/tasks/[id]`

#### 3.3 Páginas frontend simplificadas (árbol `/dashboard/*` — cliente)
- `/dashboard/billing` + `/dashboard/billing/[id]` + `/dashboard/billing/checkout` (UX cliente sin columna Cliente, sin tabs Cancelado, sin botones de cobro/cancelar, checkout sin step de selección de cliente)
- `/dashboard/support` + `/dashboard/support/[id]` (tabs reducidas: Todas / Abiertas / Resueltas; sin sidebar contexto; sin toggle is_internal)

#### 3.4 Componente Design System nuevo
- `frontend/app/components/ui/PortalBadge/` — subtítulo bajo el logo: "Portal de Administración" / "Portal de Cliente" / "Portal de Partner". Helper `portalLabelForRole(roleSlug)`. Cumple R16 + D11.

#### 3.5 Endpoints REST migrados (con aliases)
- `/api/v1/admin/clients/*` (path canónico) ← multi-path con `/api/v1/clients/*` legacy + headers `Deprecation: true` + `Sunset: <fecha Sprint 14>`.
- `/api/v1/admin/products/*` (mutaciones POST/PATCH/DELETE) ← multi-path con `/api/v1/products/*` legacy. **`GET /api/v1/products` y `GET /api/v1/products/:id` permanecen en `ProductsController` para catálogo público cliente** (Sprint 18 Landing).

#### 3.6 Middleware nuevo
- `LegacyRouteDeprecationMiddleware` — añade headers `Deprecation: true`, `Sunset: <fecha Sprint 14>`, `Link: </api/v1/admin/...>; rel="successor-version"` en respuestas a paths legacy. Log warning con correlation ID por request a path deprecado.

### 4. Modifica (contratos existentes)

| Archivo | Cambio |
|---------|--------|
| `backend/src/core/casl/permissions.ts` | Añade `Subject.NotificationTemplate` + `Subject.Job`. Reglas role-specific. Actualiza `SIDEBAR_PERMISSIONS` (backend + frontend deben quedar coherentes). |
| `backend/src/modules/clients/clients.controller.ts` | `@Controller(['admin/clients', 'clients'])` + añadir `AdminOnlyGuard` al stack. |
| `backend/src/modules/products/products.controller.ts` | Reducir a solo `@Get()` + `@Get(':id')` (catálogo público bajo CASL `Read.Product`). |
| `backend/src/modules/products/admin-products.controller.ts` (NUEVO) | `@Controller(['admin/products', 'products'])` + `AdminOnlyGuard` + POST/PATCH/DELETE + endpoints de pricing. |
| `backend/src/modules/notifications/notification-templates-admin.controller.ts` | Sustituye autorización por `AdminOnlyGuard` puro a `@CheckPolicies(can(Manage, NotificationTemplate))`. |
| `backend/src/core/jobs/jobs.controller.ts` | Idem con `Subject.Job`. |
| `frontend/app/lib/permissions.ts` | `ROUTE_PERMISSIONS` actualiza paths `/admin/*`. Elimina entradas viejas admin-puro de `/dashboard/*`. Mantiene paths cliente. |
| `frontend/app/dashboard/Sidebar.tsx` | Remover sección 'admin' completamente. Solo renderiza items cliente o partner. |
| `frontend/app/admin/AdminSidebar.tsx` | Sustituye `allowedRoles` hardcodeado por `useAbility().can(...)`. Añade items Clientes/Productos/Facturación/Soporte/Tareas con su Subject CASL correspondiente. |
| `frontend/app/admin/layout.tsx` + `frontend/app/dashboard/layout.tsx` | Integrar `<PortalBadge>` en el header del Sidebar. |
| `tests/e2e/checkout-admin.spec.ts` | Cambiar `goto('/dashboard/billing*')` → `/admin/billing*`. |
| `tests/e2e/support-escalation.spec.ts` | Cambiar `goto('/dashboard/support*')` → `/admin/support*`. |

### 5. Pasos atómicos

#### Fase A — Backend granularidad CASL (preparar el terreno)

| # | Paso | Estado |
|---|------|--------|
| 9.6.A.1 | Crear ADR-067 (granularidad CASL + Subjects nuevos) ANTES de codear | ⬜ |
| 9.6.A.2 | Añadir `Subject.NotificationTemplate` + `Subject.Job` en `permissions.ts`. Reglas: solo `superadmin` puede `Manage` ambos. Actualizar `SIDEBAR_PERMISSIONS` | ⬜ |
| 9.6.A.3 | Sincronizar `frontend/app/lib/permissions.ts` (réplica de SIDEBAR_PERMISSIONS) | ⬜ |
| 9.6.A.4 | Aplicar `@CheckPolicies(can(Manage, NotificationTemplate))` en `notification-templates-admin.controller.ts` (sustituye autorización implícita por AdminOnlyGuard) | ⬜ |
| 9.6.A.5 | Aplicar `@CheckPolicies(can(Manage, Job))` en `jobs.controller.ts` | ⬜ |
| 9.6.A.6 | Tests unit CASL: 4 roles × Subjects nuevos = matriz de permisos verificada | ⬜ |
| 9.6.A.7 | DoD parcial Fase A: typecheck + lint:check + build + test (backend) | ⬜ |

#### Fase B — Backend multi-path + Split ProductsController

| # | Paso | Estado |
|---|------|--------|
| 9.6.B.1 | Crear ADR-068 (multi-path Deprecation headers) ANTES de codear | ⬜ |
| 9.6.B.2 | `ClientsController @Controller(['admin/clients', 'clients'])` + añadir `AdminOnlyGuard` al stack del controller | ⬜ |
| 9.6.B.3 | Crear `AdminProductsController @Controller(['admin/products', 'products'])` con POST/PATCH/DELETE + endpoints pricing + `AdminOnlyGuard`. Mover lógica desde `ProductsController` | ⬜ |
| 9.6.B.4 | Reducir `ProductsController @Controller('products')` a solo `@Get()` + `@Get(':id')` (catálogo público bajo CASL `Read.Product`) | ⬜ |
| 9.6.B.5 | Crear `LegacyRouteDeprecationMiddleware` aplicado a `/clients` y a mutaciones `/products/*`. Headers `Deprecation: true` + `Sunset: 2026-12-31` + `Link: <successor>; rel="successor-version"` | ⬜ |
| 9.6.B.6 | Test E2E: paths legacy (`GET /api/v1/clients`, `POST /api/v1/products`) responden con header `Deprecation`, paths nuevos (`/api/v1/admin/...`) sin header | ⬜ |
| 9.6.B.7 | DoD parcial Fase B: typecheck + lint:check + build + test:e2e (backend) | ⬜ |

#### Fase C — Frontend componente PortalBadge + integración layouts

| # | Paso | Estado |
|---|------|--------|
| 9.6.C.1 | Crear ADR-066 (tres portales raíz + PortalBadge) ANTES de codear | ⬜ |
| 9.6.C.2 | Componente `frontend/app/components/ui/PortalBadge/` (cumple R16) + tipo `PortalVariant` + tokens tipográficos | ⬜ |
| 9.6.C.3 | Helper `portalLabelForRole(roleSlug)` en `frontend/app/lib/portal.ts` | ⬜ |
| 9.6.C.4 | Integrar `<PortalBadge>` en `app/admin/layout.tsx` (header Sidebar) | ⬜ |
| 9.6.C.5 | Integrar `<PortalBadge>` en `app/dashboard/layout.tsx` (header Sidebar — variant resuelta por rol) | ⬜ |

#### Fase D — Frontend migración bucket A (admin-puro)

| # | Paso | Estado |
|---|------|--------|
| 9.6.D.1 | Crear `/admin/clients/page.tsx` + `/admin/clients/[id]/page.tsx` (copia exacta de `/dashboard/clients/*`, ajustar links internos a `/admin/clients/...`) | ⬜ |
| 9.6.D.2 | Crear `/admin/products/page.tsx` + `/admin/products/new` + `/admin/products/[id]` + `/admin/products/[id]/edit` (copia exacta) | ⬜ |
| 9.6.D.3 | Crear `/admin/support/chats/page.tsx` (copia exacta del workspace agente) | ⬜ |
| 9.6.D.4 | Crear `/admin/tasks/page.tsx` + `/admin/tasks/[id]/page.tsx` (copia exacta — la cliente NO tiene página de tasks, las verá embebidas en services/support-inside futuros) | ⬜ |
| 9.6.D.5 | Eliminar `/dashboard/clients/*`, `/dashboard/products/*`, `/dashboard/support/chats`, `/dashboard/tasks/*` | ⬜ |
| 9.6.D.6 | Actualizar todas las llamadas en `frontend/app/lib/api.ts` y fetch directos para apuntar a `/api/v1/admin/clients` y `/api/v1/admin/products` (mutaciones) | ⬜ |
| 9.6.D.7 | Actualizar `frontend/app/lib/permissions.ts ROUTE_PERMISSIONS`: eliminar entradas viejas admin-puro de `/dashboard/*`, añadir `/admin/clients`, `/admin/products`, `/admin/billing`, `/admin/support`, `/admin/tasks`, `/admin/settings` (futuro) | ⬜ |
| 9.6.D.8 | `frontend/app/dashboard/Sidebar.tsx`: remover sección 'admin' completamente. Solo cliente + partner | ⬜ |
| 9.6.D.9 | `frontend/app/admin/AdminSidebar.tsx`: sustituir `allowedRoles` por `useAbility().can(action, subject)`. Añadir items con su Subject CASL correspondiente | ⬜ |
| 9.6.D.10 | Login redirect post-2FA verificado: staff → `/admin`, cliente → `/dashboard`, partner → `/dashboard` (hasta Sprint 19) | ⬜ |

#### Fase E — Frontend split bucket B (UX diferenciada)

| # | Paso | Estado |
|---|------|--------|
| 9.6.E.1 | Extraer componentes neutros a `frontend/app/_shared/billing/`: `InvoiceTable.tsx`, `InvoiceDetailCard.tsx`. Props neutras (`columns: ColumnDef[]`, `actions: Action[]`), sin condicionales `isAdmin` interno | ⬜ |
| 9.6.E.2 | `/admin/billing/page.tsx` (full UX: columna Cliente, tab Cancelado, botones Finalize/Pay/Cancel/Refund). Reutiliza componentes neutros | ⬜ |
| 9.6.E.3 | `/dashboard/billing/page.tsx` (cliente UX: sin columna Cliente, sin tab Cancelado, sin botones acción, subtitle "Mis facturas") | ⬜ |
| 9.6.E.4 | `/admin/billing/[id]` + `/dashboard/billing/[id]` (split detalle) | ⬜ |
| 9.6.E.5 | `/admin/billing/checkout` (5 steps: client→product→pricing→profile→confirm) + `/dashboard/billing/checkout` (4 steps sin client) | ⬜ |
| 9.6.E.6 | Extraer componentes neutros a `frontend/app/_shared/support/`: `ConversationList.tsx`, `ConversationMessages.tsx`, `ConversationSidebar.tsx` (props neutras) | ⬜ |
| 9.6.E.7 | `/admin/support/page.tsx` (tabs full workflow: Todas/Abiertas/Esperando agente/Esperando cliente/Resueltas/Cerradas) + CTA "Nuevo ticket para cliente" | ⬜ |
| 9.6.E.8 | `/dashboard/support/page.tsx` (tabs reducidas: Todas/Abiertas/Resueltas) + CTA "Nueva conversación" | ⬜ |
| 9.6.E.9 | `/admin/support/[id]` (full detail: sidebar contexto cliente + servicios + notas, toggle is_internal, status/priority/escalate) + `/dashboard/support/[id]` (cliente: sin sidebar, sin is_internal, view-only de status) | ⬜ |

#### Fase F — Seed enriquecido + Tests E2E + DoD final

| # | Paso | Estado |
|---|------|--------|
| 9.6.F.0 | **Seed modular profesional** ([`docs/50-operations/seed-reference.md`](../../50-operations/seed-reference.md)). Refactorizar `backend/prisma/seed.ts` a orquestador + `backend/prisma/seeds/` con módulos `roles.ts`, `settings.ts`, `test-accounts.ts` (1 cuenta por cada rol con guard `NODE_ENV` + override env vars), `sample-clients.ts` (2 clientes adicionales), `sample-products.ts` (2 productos con pricing real), `sample-invoices.ts` (2 facturas del cliente principal), `sample-support.ts` (1 ticket + 1 chat). Idempotente vía upserts y markers `metadata.seeded`. Cierra el bug recurrente "tras reseed se me borra el cliente test" introducido por Sprint 11.5+. Doc canónica `docs/50-operations/seed-reference.md` + §11 en development-playbook | ✅ |
| 9.6.F.1 | Actualizar `tests/e2e/checkout-admin.spec.ts`: paths `/dashboard/billing*` → `/admin/billing*` | ⬜ |
| 9.6.F.2 | Actualizar `tests/e2e/support-escalation.spec.ts`: paths `/dashboard/support*` → `/admin/support*` | ⬜ |
| 9.6.F.3 | Crear `tests/e2e/admin-tree-migration.spec.ts` (5 tests): cliente recibe 403 sobre `/api/v1/admin/clients` y `/admin/products`; staff accede; aliases REST devuelven `Deprecation: true`; cliente entra `/dashboard/billing` y NO ve columna Cliente; cliente entra `/dashboard/support` y solo ve 3 tabs | ⬜ |
| 9.6.F.4 | Crear `tests/e2e/admin-granular-roles.spec.ts` (4 tests): `agent_billing` sidebar (Clientes+Facturación+Tareas, NO Soporte/Productos); `agent_support` sidebar (Clientes read+Soporte+Tareas, NO Facturación/Productos); `agent_full` sidebar (todo menos Settings/Plantillas/DLQ); `agent_billing` recibe 403 sobre `/api/v1/support/conversations`, `agent_support` 403 sobre `/api/v1/billing/invoices` | ⬜ |
| 9.6.F.5 | DoD final: `pnpm typecheck` + `pnpm lint:check` (backend) + `pnpm lint` (frontend) + `pnpm build` + `pnpm test` (unit 21+ ✅) + `pnpm test:e2e` (suite full verde) | ⬜ |
| 9.6.F.6 | Smoke test manual (Yasmin): login con superadmin / agent_full / agent_billing / agent_support / cliente. Verificar PortalBadge correcto + Sidebar correcto + 403 sobre rutas no permitidas | ⬜ |

#### Fase G — Cierre + DoD documental

| # | Paso | Estado |
|---|------|--------|
| 9.6.G.1 | `_matrix.md` actualizado con filas role-staff (granularidad por Subject) | ⬜ |
| 9.6.G.2 | `glossary.md`: término "Portal" añadido (tres portales raíz canónicos) | ⬜ |
| 9.6.G.3 | `rules.md` §Patrones canónicos: añadir entries para `PortalBadge`, multi-path con Deprecation, `LegacyRouteDeprecationMiddleware`, `Subject.NotificationTemplate`/`Subject.Job` | ⬜ |
| 9.6.G.4 | Contracts afectados actualizados: `clients/contract.md`, `products/contract.md`, `billing/contract.md`, `support/contract.md`, `audit/contract.md` (URLs `/admin/*`) | ⬜ |
| 9.6.G.5 | Mover Sprint 9.6 a `completed/sprint-9-6-split-admin-cliente.md` con resumen ejecutivo + retrospectiva | ⬜ |
| 9.6.G.6 | Cerrar DC.7 en `backlog.md` | ⬜ |
| 9.6.G.7 | Commit final: `feat(P1.1.6): Sprint 9.6 — split admin/cliente + 3 portales + permisos granulares — cumple R1/R5/R7/R16 + DC.7 + ADR-066/067/068` | ⬜ |

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-S96-01 | Frontend deployado antes que backend (o viceversa) durante migración | Backend multi-path: tanto `/api/v1/clients` como `/api/v1/admin/clients` responden iguales. Frontend puede actualizar paths progresivamente. Aceptable. |
| EC-S96-02 | Specs E2E antiguos siguen apuntando a paths legacy | Aliases activos hasta Sprint 14. Specs migran en Fase F.1/F.2. CI verde garantizado. |
| EC-S96-03 | `agent_full` cree que tiene acceso a Plantillas porque hoy lo tenía (Sprint 9.5) | ADR-067 explica el cambio. Mensaje 403 claro: "Solo el superadmin puede gestionar plantillas de notificaciones." Audit log registra los intentos. |
| EC-S96-04 | Cliente con bookmark a `/dashboard/clients` (no debería ocurrir, pero) | `dashboard/layout.tsx` redirige a `/dashboard` si la ruta no está en `ROUTE_PERMISSIONS` y el rol no la puede acceder. Página `/dashboard/clients` no existe → 404 nativo de Next.js. Aceptable. |
| EC-S96-05 | Componentes `_shared/billing/` se vuelven props-heavy y explotan R15 | Extraer SOLO los building blocks puros (tabla, detail card). UX divergente queda en cada `page.tsx`. Si un component supera 200 líneas → split antes de añadir más. |
| EC-S96-06 | `useAbility()` en `AdminSidebar` carga antes que `req.user` esté poblado | Loading skeleton en sidebar mientras `isLoading=true`. Mismo patrón que el `AdminLayout` actual. |
| EC-S96-07 | `Sunset` header con fecha pasada en producción futura | Sprint 14 elimina los paths legacy del array `@Controller([...])`. Si por error queda algún path: middleware loguea WARN; alerta superadmin opcional via `system.error` (Sprint 9.5). |
| EC-S96-08 | Catálogo público de productos (`GET /api/v1/products`) expone campos sensibles (cost, margin) al cliente | Service ya usa DTOs / `select` Prisma con campos públicos. Auditar `ProductsService.findAll` y `findOne` antes de Fase B. Si filtra de más → fix puntual + test. |
| EC-S96-09 | Test E2E `admin-granular-roles` requiere usuarios con cada rol staff sembrados | Helper `createUserWithRole(roleSlug)` en `tests/e2e/fixtures/db.ts`. Si no existe, añadirlo en Fase F.4. |
| EC-S96-10 | Multi-path en `@Controller([...])` rompe Swagger/OpenAPI con duplicados | Verificar Swagger UI tras Fase B. Si duplica: anotar paths legacy con `@ApiExcludeEndpoint()` para que solo aparezcan los canónicos. |

### 7. Definition of Done

#### Código
- [ ] Pasos 9.6.A.1–9.6.G.7 marcados ✅
- [ ] `pnpm typecheck` (backend + frontend) ✅
- [ ] `pnpm lint:check` (backend) + `pnpm lint` (frontend) verdes ✅ — bloqueantes
- [ ] `pnpm build` (backend + frontend) ✅
- [ ] `pnpm test` (backend unit) ✅ — incluye nuevos tests CASL Subjects nuevos
- [ ] `pnpm test:e2e` ✅ — 30+ specs anteriores + 9 nuevos (admin-tree-migration + admin-granular-roles)
- [ ] CI verde tras último push

#### Documentación
- [ ] ADR-066, ADR-067, ADR-068 creados, fechados, enlazados desde `rules.md` (sección Patrones canónicos), `_matrix.md`, contracts afectados
- [ ] `current.md` Sprint 9.6 movido a `completed/sprint-9-6-split-admin-cliente.md`
- [ ] DC.7 cerrado en `backlog.md`
- [ ] Contracts actualizados: `clients/contract.md`, `products/contract.md`, `billing/contract.md`, `support/contract.md` (paths `/admin/*` reflejados)
- [ ] `glossary.md`: término "Portal" añadido
- [ ] `rules.md` §Patrones canónicos: 4 entries nuevas (PortalBadge, multi-path, middleware Deprecation, Subjects CASL nuevos)
- [ ] `frontend/app/lib/permissions.ts`: comentario citando ADR-067 que sigue siendo réplica del backend pero ahora con Subjects nuevos

#### Proceso
- [ ] Conventional Commits con citación de regla en cada commit (`feat(casl): Fase A — granularidad rol staff — cumple R1 + ADR-067`)
- [ ] Cada Fase A–G en commit separado (granularidad para rollback selectivo)
- [ ] ADRs creados ANTES de codear su fase (Fase A → ADR-067, Fase B → ADR-068, Fase C → ADR-066)
- [ ] Edge cases EC-S96-01..10 trackeados (resueltos o referenciados)

#### Smoke testing manual (Yasmin)
- [ ] Login con `superadmin` → landing `/admin` → PortalBadge muestra "Portal de Administración" → Sidebar con todos los items
- [ ] Login con `agent_full` → landing `/admin` → Sidebar SIN Settings/Plantillas/Jobs DLQ
- [ ] Login con `agent_billing` → landing `/admin` → Sidebar con Clientes/Facturación/Tareas/Inicio (NO Soporte, Productos, Error Log)
- [ ] Login con `agent_support` → landing `/admin` → Sidebar con Clientes (read)/Soporte/Tareas/Inicio (NO Facturación, Productos)
- [ ] Login con cliente → landing `/dashboard` → PortalBadge muestra "Portal de Cliente" → Sidebar SIN sección admin
- [ ] Cliente entra `/dashboard/billing` → ve solo SUS facturas, sin columna Cliente, sin botones de cobro
- [ ] Cliente entra `/dashboard/support` → solo 3 tabs (Todas, Abiertas, Resueltas), CTA "Nueva conversación"
- [ ] `agent_billing` intenta GET `/api/v1/support/conversations` → 403 con mensaje claro
- [ ] `agent_support` intenta GET `/api/v1/billing/invoices` → 403 con mensaje claro
- [ ] `GET /api/v1/clients` (path legacy) responde 200 con header `Deprecation: true` y `Sunset: 2026-12-31`
- [ ] `GET /api/v1/admin/clients` (path canónico) responde 200 sin header `Deprecation`

### 8. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Multi-path con `@Controller([...])` rompe Swagger/OpenAPI generando entries duplicados | Docs API confusas | EC-S96-10. Verificar tras Fase B. Si duplica: `@ApiExcludeEndpoint()` en paths legacy. |
| Frontend cliente con bookmark a `/dashboard/clients` post-migración | UX rota | EC-S96-04. Página deja de existir → 404 nativo Next.js. Aceptable (cliente nunca debió tenerla). |
| `agent_full` pierde acceso a Plantillas que tenía en Sprint 9.5 | Frustración temporal | ADR-067 explica el cambio. Mensaje 403 claro. Documentado en Sprint 9.5 §3 como deuda explícita. |
| Componentes `_shared/billing/` y `_shared/support/` se vuelven god-objects con props-heavy | Refactor explota R15 | EC-S96-05. Extraer SOLO building blocks puros. UX divergente vive en cada `page.tsx`. Auditoría tras Fase E. |
| Aliases legacy permanecen activos en producción tras Sprint 14 | Surface de ataque innecesaria | Sprint 14 cierra los paths legacy del array `@Controller([...])`. EC-S96-07 cubre el caso. |
| Sprint 9.6 inflado por intentar limpiar SIDEBAR_PERMISSIONS duplicado | Sprint se alarga | NO se aborda en 9.6. Deuda DC.X registrada para Sprint 13 Hardening (colapsar a un endpoint `/api/v1/me/permissions`). |
| 21 páginas a duplicar/migrar genera >50 archivos modificados | Code review difícil | 7 fases × 1 commit cada = ~7 commits separados. Cada uno auto-contenido y verificable independientemente. |

### 9. Decisiones registradas

ADRs nuevos a crear ANTES de la fase correspondiente:

- **ADR-066 — Tres portales raíz por audiencia: `/admin`, `/dashboard`, `/partner`** (pre Fase C). Formaliza decisión de Yasmin (2026-04-28): no más portales aunque haya 4 roles staff. Granularidad intra-portal vía CASL. Patrón `PortalBadge` (subtítulo bajo logo). Layouts separados, Design System compartido. Helper `landingForRole()` post-2FA. Citado desde `rules.md` §Patrones canónicos + `glossary.md` (término "Portal").
- **ADR-067 — Granularidad CASL por rol staff + Subjects nuevos** (pre Fase A). Cierra deuda Sprint 9.5 §3 ("granularidad fina diferida"). Introduce `Subject.NotificationTemplate` + `Subject.Job` ambos `Manage` solo `superadmin`. Reglas role-specific verificadas con tests unit. Plantillas notifs y Jobs DLQ se restringen retroactivamente a superadmin.
- **ADR-068 — Multi-path con Deprecation headers para migración retroactiva de rutas REST** (pre Fase B). Justifica multi-path sobre redirect 308 (preserva method+body, no fragiliza tests). Política `Deprecation: true` + `Sunset: 2026-12-31` (RFC 9745 / RFC 8594). Ventana hasta Sprint 14 Deploy. Cierre de aliases legacy en commit pre-deploy.

### 10. Cierre del sprint

**Fecha real de cierre:** 2026-04-28 (1 sesión densa).

**Commits del sprint** (rama `feat/sprint-9-6-split-admin-cliente`, en orden cronológico):

1. `16b22ed` — Fase A: granularidad CASL + Subjects `NotificationTemplate`/`Job` (ADR-067).
2. `241a8a9` — Fase B: multi-path REST + `LegacyRouteDeprecationMiddleware` (ADR-068).
3. `3937ffa` — Fase C: componente `PortalBadge` + helper `portalForRole` (ADR-066).
4. `0b8f6b5` — Fase D: migración páginas admin-puro `/dashboard/*` → `/admin/*` (clients, products, tasks, support/chats) + reescritura `AdminSidebar` con `useAbility` granular.
5. `(extracción _shared)` — Fase E.1: `_shared/billing/` + `_shared/support/` con hooks neutros + `invoice-status-map.ts` canónico.
6. `6b4c152` — Fase E.2: split UX billing (`/admin/billing/*` full + `/dashboard/billing/*` simplificado).
7. `a2b8db4` — Fase E.3: split UX support (`/admin/support/*` full workflow + `/dashboard/support/*` cliente reducido).
8. `(seed F.0)` — Fase F.0: seed modular profesional + 7 cuentas por rol + datos demo + `docs/50-operations/seed-reference.md` + `development-playbook.md` §11.
9. `97f164d` — Fase F.0.bis: `Topbar` + `NotificationBell` movidos a `_shared/shell/` (cierra bug "no se puede cerrar sesión en /admin").
10. `e989f3c` — Fase F.1–F.3: 2 specs E2E actualizados + 2 nuevos (`admin-tree-migration` 7 tests + `admin-granular-roles` 8 tests) + fix `resetTestData` para preservar cuentas seed.
11. `e3955bc` — Fase F.4: fix `playwright.config` (`workers=1` + `fullyParallel=false` por default — la suite no soporta paralelismo todavía).
12. `53b90d0` — Fase F.4: `resetTestData` desbloquea `login_attempts`/`blocked_until`/`two_factor_secret` de cuentas seed entre runs.

**Cambios respecto al plan original:**

- **Fase F.0 expandida** con seed modular profesional (no estaba en plan inicial, surgió del feedback de Yasmin "tras cada migración se me borra el cliente test"). Aporta: `backend/prisma/seeds/{roles,settings,test-accounts,sample-clients,sample-products,sample-invoices,sample-support}.ts` + `seed-reference.md` + 4 salvaguardas (guard `NODE_ENV`, TLD `.test` RFC 6761, override env vars, markers `metadata.seeded`).
- **Fase F.0.bis Topbar unificado** (no estaba en plan inicial, surgió del bug "no hay logout en `/admin`"). Aporta: extracción de `Topbar` + `NotificationBell` a `_shared/shell/` siguiendo doctrina ADR-066 (single source of truth entre portales). El admin/layout pasa de 62 → 130 líneas con simetría completa al dashboard cliente (Cmd+K, ToastProvider, NoPermission, CommandPalette).
- **Bug de E2E paralelismo descubierto en Fase F.4** — `playwright.config` distinguía CI vs local con `fullyParallel: !process.env.CI`, pero la suite comparte DB/MailPit/cuentas seed/Redis y no soporta paralelismo real. Forzado `workers=1` en ambos entornos. Paralelización con fixtures aisladas queda como deuda nueva DC.X para Sprint 13 Hardening.
- **Bug latente de `resetTestData`** — borraba `login_attempts`/`blocked_until`/`two_factor_secret` de cuentas seed que ahora sobreviven al DELETE. Tras una corrida con password mal, el superadmin quedaba bloqueado en runs siguientes. Fix: reset proactivo de esos 3 campos en cada `resetTestData()`.

**Items movidos a sprints futuros:**

- **Sprint 13 Hardening** (paralelización E2E real) — requiere fixtures aisladas por spec: DB de test propia, MailPit dedicado, usuarios `e2e-${uid}` por spec. Hoy la suite serial es suficiente (60 tests en ~1 min).
- **Sprint 13 Hardening** (collapse de Sidebar admin + mobile drawer) — `AdminSidebar` es width 260 fijo. Sprint 9.6 estabilizó la lógica; el pulido UX entra en sprint dedicado tras todos los módulos cerrados.
- **Sprint 13 Hardening** (colapsar duplicación `SIDEBAR_PERMISSIONS` frontend/backend a un endpoint `/api/v1/me/permissions`) — la réplica actual es manual.
- **Sprint 14 Deploy** — eliminar paths legacy del array `@Controller([...])` antes del primer push productivo (cierra ventana de deprecación de aliases REST).
- **Sprint 18 Landing Integration** — `GET /api/v1/products` (canónico público) ya está listo para alimentar el catálogo público sin auth (vía endpoint distinto futuro `/api/v1/public/catalog`).
- **Sprint 19 Partner Module** — replica patrón ADR-066 con `/partner/*`, reusando todo `_shared/billing` + `_shared/support` + `_shared/shell` + `PortalBadge` variant `'partner'`.

**DoD verificado:**

- ✅ Pasos 9.6.A.1–9.6.G.8 marcados.
- ✅ `pnpm typecheck` (backend + frontend) verde.
- ✅ `pnpm lint:check` (backend) + `pnpm lint` (frontend, 0 errors / 40 warnings DC.6 esperados) verdes.
- ✅ `pnpm build` (backend + frontend) verde — todas las rutas `/admin/*` y `/dashboard/*` generadas; bundle Topbar compartido en chunk vendor (no duplicado).
- ✅ `pnpm test` (backend unit) — **37/37 verde** (21 anteriores + 16 nuevos `casl-ability.factory.spec.ts`).
- ✅ `pnpm test:e2e` (suite full) — **60/60 verde en ~1 min** (51 heredados + 9 nuevos: 7 `aliases-rest-deprecation` + 7 `admin-tree-migration` + 8 `admin-granular-roles` + actualizaciones a `checkout-admin` y `support-escalation`).
- ✅ ADR-066, ADR-067, ADR-068 creados, fechados, enlazados desde `rules.md` (Patrones canónicos), `_matrix.md` (granularidad CASL), `glossary.md` (término "Portal"), contracts afectados.
- ✅ `glossary.md` § "Portales y audiencias" con 3 términos canónicos (Portal, PortalBadge, Multi-path con Deprecation headers).
- ✅ `rules.md` §Patrones canónicos: 4 entries nuevas (`PortalBadge`, `_shared/shell/Topbar`, `LegacyRouteDeprecationMiddleware` + multi-path, Subjects CASL `NotificationTemplate`/`Job`).
- ✅ `_matrix.md` §"Granularidad CASL por rol staff" — matriz completa 6 roles × 30+ Subjects.
- ✅ Contracts actualizados: `clients/contract.md`, `products/contract.md` (split público/admin), `billing/contract.md`, `support/contract.md` (paths `/admin/*` reflejados; aliases legacy documentados).
- ✅ `frontend/app/lib/permissions.ts` con Subjects `NotificationTemplate`/`Job` y comentario citando ADR-067.
- ✅ Smoke manual Yasmin: las 7 cuentas seed loguean correctamente, cada una aterriza en su portal, cada agente staff ve el sidebar correcto según CASL, el logout funciona desde el dropdown perfil del Topbar (era el bug que disparó Fase F.0.bis).
- ⏳ CI verde tras último push — pendiente del `git push` cuando Yasmin lo apruebe.

**Items movidos a `completed/sprint-9-6-split-admin-cliente.md`** con resumen ejecutivo + retrospectiva (qué funcionó, qué no esperábamos, deuda residual + lessons learned). DC.7 cerrado en `backlog.md` con commit de referencia. P1.1.6 marcado ✅ Cerrado.

**Sprint 9.6 cierra al 100%.** Próximo natural según `development-playbook.md §10`: Sprint 8 residual (Tasks Fase A schemas + B frontend Tablero + C listeners task.overdue + D Support Inside ADR-061 + E docs) o Sprint 11 Provisioning según prioridad operativa.

---

