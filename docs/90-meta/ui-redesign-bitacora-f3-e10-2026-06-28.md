# Bitácora — Rediseño UI · F3·E10: Páginas de notificaciones

> **Rama:** `redesign/f3-notificaciones` · **Fecha:** 2026-06-28 · **Estado:** código-completo, verde (PR pendiente).
> **Mapa:** [`ui-migration-backlog-2026-06-26.md` §8 E10](./ui-migration-backlog-2026-06-26.md) · mockups [`Notificaciones.dc.html`](../../../mockup-uiux/Notificaciones.dc.html) (cliente) + [`admin/NotificacionesAdmin.dc.html`](../../../mockup-uiux/admin/NotificacionesAdmin.dc.html).

## Objetivo

Bandejas full-page de notificaciones 1:1 con el mockup, para cliente
(`/dashboard/notifications`) y staff/superadmin (`/admin/notifications`), sobre el
backend de notificaciones existente (`GET /notifications` paginado + `unread` +
`:id/read` + `read-all`).

## Decisiones (Yasmin, 2026-06-28)

1. **Vertical elegida:** E10 (la más "diseño-forward" y de menor riesgo) en vez de
   Stripe E6, que se **aplaza tras el diseño**.
2. **Filtro por categoría = backend real** (no client-side): correcto con paginación.
3. **Categoría persistida** (columna `category`), no computada: fuente única + indexable.
4. **`ChipGroup` net-new** (fidelidad 1:1 con el chip toggle del mockup).
5. **Marcar leída = implícito al click** (1:1 con el mockup).

## Arquitectura clave

La tabla `notifications` **no tenía** `event_type` ni categoría; el `event` viaja en
`metadata.event` (lo pone el dispatcher). Por eso:

- **Backend = dueño de la clasificación** (R5): `notification-taxonomy.ts`
  (`categoryForEvent`, 34 eventos `internal` → 9 categorías + `general`/`negocio`). El
  `InAppChannel` (único que persiste filas) calcula y escribe `category` al crear.
- **Front = solo presentación**: recibe `category` y la pinta (categoría/evento →
  icono Lucide + tono + label) en `_shared/notifications/notification-presentation.ts`.
  Sin duplicar la clasificación → sin drift.

## Cambios

**Backend**
- `schema.prisma`: enum `NotificationCategory` + columna `category` (default `general`) +
  índice `(user_id, category)`.
- Migración `20260628133123_add_notification_category` (enum + columna + **backfill** por
  `metadata.event`, 1:1 con la taxonomía; verificado sobre datos reales, 0 filas `general`).
- `notification-taxonomy.ts` (fuente única) + `InAppChannel` escribe `category`.
- `NotificationListQueryDto` gana `category` (`@IsEnum`); `findAllForUser` filtra y
  devuelve `category`.
- Tests: `notification-taxonomy.spec.ts` (mapeo + fallback + guard de cobertura del seed),
  `in-app.channel.spec.ts` (persistencia de category), `notifications.service.spec.ts`
  (filtro). `contract.md` actualizado (§4 modelo, §5 query param).

**Frontend**
- DS: primitiva **`ChipGroup`** (+ test + barrel + ds-preview) · tono **`security`** en
  `IconWell` + tokens `--security`/`--security-light`/`--security-border`.
- `_shared/notifications/`: `notification-presentation.ts` (categoría/evento→visual +
  chips cliente/admin) · `notification-groups.ts` (agrupado Hoy/Esta semana/Anteriores +
  `relativeTime`) · `NotificationsView.tsx` (vista compartida, RSC URL-driven) + tests.
- Páginas SC: `/dashboard/notifications` y `/admin/notifications`.
- `NotificationBell`: cierra los 2 TODOs F3/E10 (icon-well por taxonomía + rutas) y
  reutiliza `relativeTime` compartido (DRY).
- `lib/api/notifications.ts`: `category` en `NotificationItem` + filtro en `list`.

## DoD

- Backend: typecheck ✅ · lint:check ✅ · test ✅ **108 suites / 1419** (incl. integración
  Postgres-real). No toca `@Module` → boot smoke N/A.
- Frontend: typecheck ✅ · lint:check ✅ (0 warnings) · test ✅ **10 suites / 68**.
- **Pendiente (Yasmin):** smoke visual 1:1 en navegador (reiniciar `pnpm --dir backend dev`
  para cargar el cliente Prisma regenerado).

## Notas / deuda

- `invoice.created/failed/overdue` solo tienen plantilla `email` → no aparecen in-app
  (solo `invoice.paid`). Si se quiere, seedear plantillas `internal` (fuera de E10).
- Categoría `negocio` (admin): chip presente pero sin evento `internal` que mapee hoy →
  filtra a vacío (esperado).
- CTA por fila genérico ("Ver detalle") cuando hay `action_url`: el backend no guarda un
  label de acción por evento.
- Copy de retención "90 días" = default `notifications.retention_days`.
