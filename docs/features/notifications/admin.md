# Notificaciones (staff / superadmin) — guía operativa

> **Audiencia:** staff/superadmin. **Ruta:** `/admin/notifications`.
> **Doctrina:** [ADR-042](../../10-decisions/adr-042-sistema-notificaciones.md) + [ADR-065](../../10-decisions/adr-065-notification-channel-plugin-pattern.md). **Contrato:** [`20-modules/notifications/contract.md`](../../20-modules/notifications/contract.md).
> **Acceso:** campana del Topbar → **Ver todas**. Convive con `/admin/notifications/templates` (editor de plantillas), que es otra cosa.

Bandeja full-page de las notificaciones **dirigidas a ti** como staff: lo que ocurre en la
plataforma y requiere atención (lo mismo que te llega por email y en la campana). Misma
mecánica que la bandeja del cliente; cambian las **categorías** y el copy.

## Qué ves

- **Cabecera:** título + contador de **no leídas** + **Marcar todas como leídas**.
- **Filtros:** estado (*Todas* / *No leídas*) + categorías de plataforma:
  *Tareas · Soporte · Sistema · Plugins · Seguridad · Negocio*.
- **Lista** agrupada por Hoy / Esta semana / Anteriores, con icono+tono por evento
  (p. ej. *DLQ* / *error operativo* en rojo, *circuito de plugin* en ámbar, *sesión
  comprometida* en violeta de seguridad).
- **Pie** de retención (90 días) y **estados vacíos** equivalentes (*Todo en orden*).

## Cómo funciona

- Usa **los mismos endpoints** que el cliente (`/notifications/*`): el backend resuelve el
  destinatario por `user_id`. A superadmin se le despachan las alertas operativas
  (`dlq.job_failed`, `outbox.event_failed`, `system.error`, `maintenance.critical`,
  `plugin.circuit_*`, `auth.refresh_replay_detected`); a los agentes, sus asignaciones
  (`task.assigned`, `conversation.assigned`, etc.).
- **Categoría** = columna persistida derivada del `event_type` (taxonomía única en
  backend, `notification-taxonomy.ts`). El filtro por categoría es **server-side**.
- Abrir marca como leída y navega al recurso (DLQ, error-log, ticket, tarea…).

## Notas

- La categoría **Negocio** (nuevo cliente / pago recibido) aún no tiene evento `internal`
  que mapee → el chip existe pero no devuelve resultados todavía.
- Esta página es solo **lectura/triaje**; la **edición de plantillas** de notificación
  vive en `/admin/notifications/templates`.
