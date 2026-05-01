# Sprint 9.5 — UX admin de notifications + cabos sueltos (P1.1.5) ✅

> **Estado:** ✅ Cerrado
> **Inicio:** 2026-04-27
> **Cierre:** 2026-04-27 (1 sesión densa)
> **Identificadores:** P1.1.5

> Movido desde `current.md` 2026-05-01 como parte del saneamiento documental post-Sprint 8 cierre.

---

## ✅ Sprint 9.5 — UX admin de notifications + cabos sueltos (P1.1.5)

**Estado:** ✅ completado
**Inicio:** 2026-04-27
**Cierre real:** 2026-04-27 (1 sesión densa)

### 1. Objetivo en una frase

Cerrar los 7 ítems diferidos del Sprint 9 Fase D (UX admin de notifications) y Fase F.10 (listener `system.error`), más la cobertura DC.10 del audit-portal, para que `ErrorLogService.log()` deje de tener un evento huérfano y la campana del Topbar sea operativa para clientes y staff.

### 2. Alcance ejecutado

Items previstos en [`backlog.md` P1.1.5](../backlog.md#L44) — los 7 + DC.10 quedan ✅ cerrados:

| # | Paso | Estado |
|---|------|--------|
| 9.D.11 | Endpoints cliente `/notifications` (GET `/unread`, GET `/`, PATCH `/:id/read`, PATCH `/read-all`) + DTOs (`NotificationListQueryDto`) + CASL `Read.Notification` / `Update.Notification`. Ownership server-side: 404 (no 403) sobre id ajeno para no filtrar existencia | ✅ |
| 9.D.12 | Endpoints admin `/admin/notifications/templates` (GET, GET `/:id`, PATCH `/:id`, POST `/:id/preview`) bajo `JwtAuthGuard` + `AdminOnlyGuard`. `NotificationTemplateService` extendido: `findAll/findOne/update/preview` con validación Handlebars (compile error → 400). Muestras canónicas por `event_type` para preview rápido. DTOs: `NotificationTemplateListQueryDto`, `NotificationTemplateUpdateDto`, `NotificationTemplatePreviewDto` | ✅ |
| 9.D.13 | Frontend `NotificationBell` (`frontend/app/dashboard/NotificationBell.tsx` + CSS module). Polling 30s a `/notifications/unread`. Click marca leída + navega a `action_url` si existe. "Marcar todas" purga el contador. Reemplaza el botón placeholder del Topbar | ✅ |
| 9.D.14 | Frontend admin `/admin/notifications/templates/page.tsx`. Listado a la izquierda (filtros por `event_type` y canal), editor a la derecha (subject + body + active + variables disponibles). Preview en línea con render real del backend (HTML para `email`, texto plano para `internal`/otros). `AdminSidebar` ahora expone "Plantillas notificaciones" (rol superadmin) | ✅ |
| 9.D.15 | `NotificationsRetentionCron` (@nestjs/schedule, `EVERY_DAY_AT_2AM` UTC) — borra `notifications` canal `internal` con `read_at < now() - notifications.retention_days`. Las no leídas se conservan indefinidamente. Sólo toca canal `internal` (los externos quedan como prueba de envío hasta Sprint 12.5 Portal RGPD). Migración a BullMQ scheduled diferida a Sprint 13 Hardening | ✅ |
| 9.D.16 | Seed 4 settings nuevos en `backend/prisma/seed.ts`: `notifications.retention_days=90`, `notifications.unread_max_in_dropdown=50`, `notifications.email_enabled_globally=true`, `notifications.maintenance_critical_threshold_days=7`. Todos con fallback en código → ausencia en DB no rompe boot | ✅ |
| 9.F.10 | `NotificationsSystemErrorListener` consume `system.error` → `dispatchToSuperadmins`. Guard anti-loop hard (EC-S9-07): si `module` proviene del dominio notifications (NotificationsService, NotificationsDispatchProcessor, NotificationTemplateService o cualquier `Notifications*`), el listener log + drop. Plantillas `system.error` nuevas en seed: canal `internal` + canal `email` con HTML completo | ✅ |
| 9.D.17 | Test E2E `tests/e2e/notifications.spec.ts` — 6 specs serializados: `unread` vacío, dispatch via `task.assigned` + mark read + idempotencia, ownership filter (cliente NO ve agente), histórico paginado, `read-all`, 404 sobre id ajeno (no filtra existencia) | ✅ |
| DC.10 | Test E2E adicional en `audit-portal.spec.ts` — admin `GET /clients/:id` (decorado `@AuditAccess('Client')`) → fila persistida con `target_user_id = client.id` (path Client/User cubierto, fix `bff4fec`) + verificación de que el cliente lo ve en el portal de transparencia | ✅ |

### 3. Decisiones registradas (sin ADR nuevo — sólo ampliación de canónicos)

- **`Notification.read` semantics**: `read_at NULL` = unread, `read_at NOT NULL` = read. Mantenemos el shape existente del Sprint 9 — no se introduce enum `status` (decisión Sprint 9 §3.4 ratificada).
- **Ownership por 404**: el endpoint `PATCH /notifications/:id/read` devuelve 404 si la notificación no pertenece al caller, NO 403. Razón: 403 vs 404 filtra existencia de ids vía probing — práctica de seguridad estándar (OWASP A04 Insecure Design).
- **Granularidad por rol staff**: TODOS los staff (`superadmin`, `agent_*`) pueden leer/editar plantillas. Granularidad fina por rol se difiere a **Sprint 9.6** (DC.7) cuando se aplique CASL `Manage.NotificationTemplate` con reglas role-specific. Hoy el riesgo es bajo: edición de plantillas es operación rara y trazable vía `audit_change_log` cuando se necesite.
- **Plantillas system.error**: el listener no rompe el flujo del caller si fallan plantillas o dispatch. El emisor (`ErrorLogService.log()`) ya degrada silenciosamente; el listener replica la misma garantía. Si `system.error` proviene del dominio notifications, se dropea SIN intentar enviar (anti-loop hard).

### 4. DoD cumplido

- [x] `pnpm typecheck` (backend) ✅
- [x] `pnpm typecheck` (frontend) ✅
- [x] `pnpm lint:check` (backend) ✅ — autofix prettier de 2 cosméticos
- [x] `pnpm lint` (frontend) ✅ — 0 errors, 38 warnings (DC.6 esperados, no bloquean CI)
- [x] `pnpm build` (backend, frontend) ✅ — `/admin/notifications/templates` listed en build output
- [x] `pnpm test` (backend unit) ✅ — 21/21 verde
- [ ] `pnpm test:e2e` ✅ esperado — requiere reseed (`pnpm seed` para plantillas `system.error` + 4 settings nuevos) + restart backend dev (el watcher tiene caché del código Sprint 9). Yasmin lo verifica en smoke manual + CI tras push.

### 5. Items movidos / pendientes confirmados

- **Sprint 9.6 (DC.7)** — sigue como siguiente natural, en espera de auditoría iterativa con Yasmin para decidir qué páginas se separan, permisos granulares por rol staff, aliases REST 301.
- **Sprint 13 Hardening** — `NotificationsRetentionCron` migrará a BullMQ scheduled junto al resto de crons in-process (ADR-056 §13.30+).
- **Sprint 12.5 Portal RGPD** — política de retención para canales externos (`email`/`whatsapp`) — hoy `NotificationsRetentionCron` SÓLO toca `internal`.

---
