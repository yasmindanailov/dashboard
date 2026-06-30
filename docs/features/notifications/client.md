# Notificaciones (cliente) — guía operativa

> **Audiencia:** cliente. **Ruta:** `/dashboard/notifications`.
> **Doctrina:** [ADR-042](../../10-decisions/adr-042-sistema-notificaciones.md) + [ADR-065](../../10-decisions/adr-065-notification-channel-plugin-pattern.md). **Contrato:** [`20-modules/notifications/contract.md`](../../20-modules/notifications/contract.md).
> **Acceso:** campana del Topbar → **Ver todas**.

La bandeja muestra el **histórico in-app** de tu cuenta (canal `internal`) — lo mismo que
te llega por email. Es una página de lista (D10) construida 1:1 con el mockup.

## Qué ves

- **Cabecera:** título + contador de **no leídas** + botón **Marcar todas como leídas**
  (deshabilitado si no tienes pendientes).
- **Filtros:**
  - **Estado** (segmented): *Todas* / *No leídas*.
  - **Categoría** (chips): *Facturación · Servicios · Dominios · Soporte · Seguridad*.
- **Lista** agrupada por **Hoy / Esta semana / Anteriores**. Cada fila lleva un icono
  tintado por categoría/evento, título, etiqueta de categoría, resumen, tiempo relativo y
  un punto si está sin leer.
- **Pie:** "Conservamos tus notificaciones durante 90 días".
- **Vacío:** *Estás al día* (sin notificaciones) o *Nada por aquí* (ningún resultado para
  el filtro, con botón para limpiarlo).

## Cómo funciona

- Al **abrir** una notificación se marca como leída y, si tiene destino, te lleva al
  recurso (factura, servicio, dominio, ticket…). *(`PATCH /notifications/:id/read`.)*
- **Marcar todas** vacía el contador en una llamada. *(`PATCH /notifications/read-all`.)*
- Los **filtros viajan en la URL** (`?unread_only`, `?category`, `?page`); el backend
  filtra y pagina (correcto entre páginas, a diferencia de un filtro solo visual).
  *(`GET /notifications?…`.)*
- La **categoría** la asigna el backend al crear la notificación (derivada de su evento);
  la página solo decide cómo pintarla.

## Notas

- Las facturas **nuevas/fallidas/vencidas** hoy llegan **solo por email** (no in-app); el
  *Pago confirmado* sí aparece aquí.
- El contador de la campana del Topbar y esta bandeja comparten el mismo origen.
