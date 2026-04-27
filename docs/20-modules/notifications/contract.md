# notifications — Contract

> **Stub mínimo (Sprint 9 Fase D MVP).** Detalle canónico vive en [ADR-065](../../10-decisions/adr-065-notification-channel-plugin-pattern.md) + [ADR-042](../../10-decisions/adr-042-sistema-notificaciones.md). Redacción completa de las 12 secciones diferida a **DC.9** (Sprint 9.5 recomendado).

## 1. Propósito

Centro de notificaciones cliente/staff/superadmin. Despacha eventos cross-módulo (`invoice.*`, `task.assigned`, alertas operativas) por múltiples canales (email + campana in-app + futuros WhatsApp/SMS) con plantillas Handlebars editables.

## 2. Estado de implementación

✅ **Sprint 9 Fase D MVP cerrado (2026-04-27 — commit `8df3d2c`).** Backend completo + huérfanos consumidos (`outbox.event_failed`, `dlq.job_failed`).

**Pendiente Sprint 9.5 (UX admin diferida):**
- Endpoints `/notifications/unread`, `/:id/read`, `/read-all`.
- Panel admin `/admin/notifications/templates` (GET, PATCH, preview).
- Frontend `NotificationBell` en Topbar cliente.
- Cron `cleanupReadNotifications` (`EVERY_DAY_AT_2AM`).
- 4 settings `notifications.*` seedeados.
- Listener `notifications-system-error.listener` consumidor de `system.error`.

## 3. Arquitectura — referencias canónicas

| Aspecto | Documento |
|---------|-----------|
| Diseño general (multicanal, plantillas editables) | [ADR-042](../../10-decisions/adr-042-sistema-notificaciones.md) |
| `NotificationChannelInterface` + plugin pattern | [ADR-065](../../10-decisions/adr-065-notification-channel-plugin-pattern.md) |
| Cola BullMQ `notifications-dispatch` | [`jobs-reference.md`](../../50-operations/jobs-reference.md) §"Cola `notifications-dispatch`" |
| Plantillas iniciales seedeadas | `backend/prisma/seeds/notification-templates.ts` |
| Patrón canónico de uso | [`rules.md` §Patrones canónicos](../../00-foundations/rules.md) — `NotificationsService.dispatchToUser` / `dispatchToSuperadmins` |
| Regla D12 | [`rules.md` D12](../../00-foundations/rules.md) — toda notificación pasa por `NotificationsService`, prohibido `EmailService.send` directo |
| Eventos consumidos | [`_events.md`](../_events.md) §Eventos operativos — `outbox.event_failed`, `dlq.job_failed` |

## 4. Modelos Prisma

- `Notification` (campana — ya existí­a, shape preservado).
- `NotificationTemplate` (Sprint 9 Fase D — `event_type` × `channel` × `locale`, Handlebars).

## 5. API REST expuesta

Diferida a Sprint 9.5. Hoy solo internal API (`NotificationsService.dispatchToUser` y `dispatchToSuperadmins`).

## 6–12. Detalle completo

Pendiente DC.9 — redacción de las 12 secciones canónicas. Mientras tanto los enlaces en §3 cubren todo lo necesario para tocar el módulo con seguridad.
