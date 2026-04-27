# error-log — Contract

> **Stub mínimo (Sprint 9 Fase F).** Detalle canónico vive en [ADR-055 §Monitoring](../../10-decisions/adr-055-resiliencia-circuit-breaker.md) + [ADR-063](../../10-decisions/adr-063-bullmq-canonico-dlq-retries.md). Redacción completa de las 12 secciones diferida a **DC.9** (Sprint 9.5 recomendado).

## 1. Propósito

Registro centralizado de errores operativos del sistema (R7). Tres puertas de entrada:
1. `GlobalExceptionFilter` — HTTP 5xx (escribe directo a tabla, no emite).
2. `ErrorLogService.log(entry)` — uso explícito desde jobs/listeners no-HTTP. Emite `system.error` para alerta superadmin.
3. Endpoints admin `GET/PATCH /api/v1/admin/error-log` — consulta + marcar como resuelto.

## 2. Estado de implementación

✅ **Sprint 9 Fase F cerrado (2026-04-27 — commit `977d308`).**
- `ErrorLogService` completo + emit `system.error`.
- Endpoints admin con doble guard (`JwtAuthGuard` + `AdminOnlyGuard`).
- Frontend admin `/admin/error-log` con filtros + botón "Marcar resuelto".

**Pendiente Sprint 9.5:**
- Listener `notifications-system-error.listener` consumidor del evento `system.error` + plantilla `notification_templates`.

## 3. Arquitectura — referencias canónicas

| Aspecto | Documento |
|---------|-----------|
| Diseño general (DLQ + monitoring + alertas) | [ADR-055](../../10-decisions/adr-055-resiliencia-circuit-breaker.md) |
| Infra BullMQ + DLQ + retries | [ADR-063](../../10-decisions/adr-063-bullmq-canonico-dlq-retries.md) |
| Patrón canónico de uso | [`rules.md` §Patrones canónicos](../../00-foundations/rules.md) — `ErrorLogService.log` |
| Regla R7 (errores se notifican) | [`rules.md` R7](../../00-foundations/rules.md) |
| Eventos emitidos | [`_events.md`](../_events.md) §Eventos operativos — `system.error` (consumidor diferido Sprint 9.5) |

## 4. Modelos Prisma

- `ErrorLog` (ya existía — campos `level`, `module`, `message`, `correlation_id`, `stack_trace`, `metadata`, etc.).

## 5. API REST expuesta

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/admin/error-log` | Listar errores (paginado, filtros: `level`, `module`, `resolved`) | `JwtAuthGuard + AdminOnlyGuard` |
| `PATCH` | `/api/v1/admin/error-log/:id/resolve` | Marcar como resuelto (audit: `resolved_at`, `resolved_by`) | `JwtAuthGuard + AdminOnlyGuard` |

## 6–12. Detalle completo

Pendiente DC.9. Los enlaces de §3 cubren todo el comportamiento.
