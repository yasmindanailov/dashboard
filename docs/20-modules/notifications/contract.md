# notifications — Contract

> **Contract conciso por convención (DC.9 cerrada 2026-04-28):** el detalle profundo vive en los ADRs canónicos, no se duplica aquí. Esta página actúa como **mapa** del módulo: qué hay, dónde está documentado a fondo, cómo se usa.

## 1. Propósito

Centro de notificaciones cliente / staff / superadmin. Despacha eventos cross-módulo (`invoice.*`, `task.assigned`, alertas operativas `outbox.event_failed` / `dlq.job_failed` / `system.error`) por múltiples canales (email + campana in-app + futuros WhatsApp/SMS) con plantillas Handlebars editables desde el panel admin.

**Regla canónica D12** ([rules.md §D12](../../00-foundations/rules.md)): toda notificación cliente/agente/superadmin pasa por `NotificationsService.dispatchToUser(...)` o `dispatchToSuperadmins(...)`. `EmailService.send(...)` directo desde dominios de negocio queda prohibido.

## 2. Estado de implementación

✅ **Sprint 9 Fase D MVP (2026-04-27 — `8df3d2c`) + Sprint 9.5 (2026-04-28).**

- Backend completo: `NotificationsService` + `NotificationTemplateService` + `NotificationsDispatchProcessor` (cola BullMQ `notifications-dispatch`) + `EmailChannel` + `InAppChannel` + 4 listeners (`billing-email`, `tasks-email`, `notifications-outbox`, `notifications-dlq`, `notifications-system-error`).
- Endpoints cliente `/notifications/*` (4) + admin `/admin/notifications/templates` (4 con `AdminOnlyGuard`).
- Frontend `NotificationBell` en Topbar (polling 30s) + página admin `/admin/notifications/templates` con preview en línea.
- `NotificationsRetentionCron` (`EVERY_DAY_AT_2AM`, sólo canal `internal`).
- 4 settings `notifications.*` seedeados.

## 3. Arquitectura — referencias canónicas

| Aspecto | Documento |
|---------|-----------|
| Diseño general (multicanal, plantillas editables, retención) | [ADR-042](../../10-decisions/adr-042-sistema-notificaciones.md) |
| `NotificationChannelInterface` + plugin pattern + dispatcher BullMQ | [ADR-065](../../10-decisions/adr-065-notification-channel-plugin-pattern.md) |
| Cola BullMQ `notifications-dispatch` + DLQ | [`jobs-reference.md`](../../50-operations/jobs-reference.md) §"Cola `notifications-dispatch`" |
| Cron `cleanupReadNotifications` | [`jobs-reference.md`](../../50-operations/jobs-reference.md) §"Notifications retention" |
| Settings `notifications.*` (4) | [`settings-reference.md`](../../50-operations/settings-reference.md) §notifications.* |
| Plantillas iniciales seedeadas (13) | `backend/prisma/seeds/notification-templates.ts` |
| Patrón canónico de uso + Regla D12 | [`rules.md` §Patrones canónicos + D12](../../00-foundations/rules.md) |
| Eventos consumidos / emitidos | [`_events.md`](../_events.md) §Eventos operativos |

## 4. Modelos Prisma

- **`Notification`** (campana — shape preservado, `read_at NULL` = unread).
- **`NotificationTemplate`** (Sprint 9 Fase D — `event_type` × `channel` × `locale` único, Handlebars con helpers `lt`/`gt`/`eq`).

## 5. API REST expuesta

### Cliente (autenticado, ownership server-side)

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/api/v1/notifications/unread` | Campana del Topbar — devuelve hasta `notifications.unread_max_in_dropdown` filas no leídas + `unread_count` | `Read.Notification` |
| `GET` | `/api/v1/notifications` | Histórico paginado del usuario (query: `page`, `limit`, `unread_only`) | `List.Notification` |
| `PATCH` | `/api/v1/notifications/:id/read` | Marca como leída. Idempotente. **404 sobre id ajeno** (no 403 — no filtra existencia, OWASP A04) | `Update.Notification` |
| `PATCH` | `/api/v1/notifications/read-all` | Marca todas las no leídas del usuario como leídas. Devuelve `{ updated: N }` | `Update.Notification` |

### Admin staff (`JwtAuthGuard` + `AdminOnlyGuard`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/admin/notifications/templates` | Lista plantillas (filtros: `event_type`, `channel`) |
| `GET` | `/api/v1/admin/notifications/templates/:id` | Detalle de plantilla |
| `PATCH` | `/api/v1/admin/notifications/templates/:id` | Actualiza `subject` / `body` / `active`. **400 si Handlebars no compila** (R14 + EC-S9-03) |
| `POST` | `/api/v1/admin/notifications/templates/:id/preview` | Render preview (con `payload` opcional o muestra canónica por `event_type`). NO persiste |

> **Granularidad por rol staff** (qué subset de plantillas ve cada agente) diferida a Sprint 9.6 (DC.7) con CASL `Manage.NotificationTemplate` específico. Hoy todos los staff con `AdminOnlyGuard` pueden leer/editar; auditoría manual vía `audit_change_log`.

## 6. Eventos consumidos

| Evento | Listener | Acción |
|--------|----------|--------|
| `invoice.created` / `paid` / `failed` / `overdue` | `billing-email.listener` | `dispatchToUser` con plantillas seedeadas |
| `task.assigned` | `tasks-email.listener` | `dispatchToUser` (email + campana con `action_url` a la tarea) |
| `outbox.event_failed` | `notifications-outbox.listener` | `dispatchToSuperadmins` (alerta R7 — cierra ADR-033 §7) |
| `dlq.job_failed` | `notifications-dlq.listener` | `dispatchToSuperadmins` (alerta R7+R13) |
| `system.error` | `notifications-system-error.listener` | `dispatchToSuperadmins` con **guard anti-loop hard** (drop si `module` proviene del dominio notifications — EC-S9-07) |

## 7. Edge cases relevantes

Documentados en [`current.md` Sprint 9 §6](../../60-roadmap/current.md): EC-S9-01..12 (Redis caído, plantilla mal formada, idempotencia, recipient sin email, etc.).

Específicos Sprint 9.5:
- **Ownership por 404**: `PATCH /:id/read` no filtra existencia. La existencia del id no se revela vía probing.
- **Anti-loop `system.error`**: si el dispatcher de notifications fallara emitiendo un nuevo `system.error`, el listener lo detecta por `module` y dropea sin enviar. Sin esto se generaría bucle infinito.

## 8. Pendientes registrados

- **`notification.dispatched`** — evento aspiracional declarado en ADR-065 §3.2, no emitido. Su consumidor (`audit-notification.listener` para `audit_change_log`) llega cuando se aborde audit de integraciones (Sprint 12.5 / Stripe / Docker).
- **Granularidad CASL por rol staff** — Sprint 9.6 (DC.7).
- **Política de retención canales externos** (`email`/`whatsapp`/`push`) — Sprint 12.5 Portal RGPD. Hoy `cleanupReadNotifications` SÓLO toca `internal`.
