# error-log — Contract

> **Contract conciso por convención (DC.9 cerrada 2026-04-28):** el detalle profundo vive en los ADRs canónicos, no se duplica aquí.

## 1. Propósito

Registro centralizado de errores operativos del sistema (R7 + ADR-055 §Monitoring). Tres puertas de entrada:

1. **`GlobalExceptionFilter`** — HTTP 5xx (escribe directo a tabla, no emite — el admin lo ve en `/admin/error-log`).
2. **`ErrorLogService.log(entry)`** — uso explícito desde jobs/listeners no-HTTP. Persiste fila + emite `system.error` para alerta superadmin.
3. **Endpoints admin** `GET/PATCH /api/v1/admin/error-log` — consulta + marcar como resuelto.

## 2. Estado de implementación

✅ **Sprint 9 Fase F (2026-04-27 — `977d308`) + Sprint 9.5 (2026-04-28 — listener `system.error` activo).**

- `ErrorLogService` completo + emit `system.error`.
- Endpoints admin con doble guard (`JwtAuthGuard` + `AdminOnlyGuard`).
- Frontend admin `/admin/error-log` con filtros + botón "Marcar resuelto".
- `notifications-system-error.listener` consume `system.error` → `dispatchToSuperadmins` con plantillas (Sprint 9.5).

## 3. Arquitectura — referencias canónicas

| Aspecto | Documento |
|---------|-----------|
| Diseño general (DLQ + monitoring + alertas) | [ADR-055](../../10-decisions/adr-055-resiliencia-circuit-breaker.md) |
| Infra BullMQ + DLQ + retries | [ADR-063](../../10-decisions/adr-063-bullmq-canonico-dlq-retries.md) |
| Listener `system.error` + plantilla Handlebars | [ADR-065](../../10-decisions/adr-065-notification-channel-plugin-pattern.md) + `notifications-system-error.listener.ts` |
| Patrón canónico de uso | [`rules.md` §Patrones canónicos](../../00-foundations/rules.md) — `ErrorLogService.log` |
| Regla R7 (errores se notifican) | [`rules.md` R7](../../00-foundations/rules.md) |
| Eventos emitidos | [`_events.md`](../_events.md) §Eventos operativos — `system.error` |

## 4. Modelos Prisma

- `ErrorLog` (campos `level`, `module`, `message`, `correlation_id`, `stack_trace`, `request_path`, `request_method`, `user_id`, `metadata` JSON, `created_at`).
- **Resolución sin columnas dedicadas** — vía `metadata.resolved` + `metadata.resolved_at` + `metadata.resolved_by`. Migración a columnas dedicadas se difiere si la UX lo justifica.

## 5. API REST expuesta

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/admin/error-log` | Listar errores (paginado, filtros: `level`, `module`, `resolved`) | `JwtAuthGuard + AdminOnlyGuard` |
| `PATCH` | `/api/v1/admin/error-log/:id/resolve` | Marcar como resuelto (audit: `resolved_at` + `resolved_by` en metadata) | `JwtAuthGuard + AdminOnlyGuard` |

## 6. Anti-loop crítico

`ErrorLogService.log()` degrada silenciosamente si Prisma falla (catch + log a stderr — devuelve `{ id: '' }`). Y el `notifications-system-error.listener` dropea sin enviar si `module` proviene del dominio notifications — sin estos dos guards, un fallo en el dispatcher de notifications generaría bucle infinito (EC-S9-07).
