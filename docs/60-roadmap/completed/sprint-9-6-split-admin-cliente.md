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
