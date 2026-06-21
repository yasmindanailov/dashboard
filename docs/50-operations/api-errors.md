# API Errors Reference — Aelium Dashboard

> **Catálogo canónico de errores que el backend devuelve.**
> Si vas a lanzar excepción nueva → consulta este archivo para usar el `code` correcto. Si vas a manejar errores en frontend → este es el contrato.

> **Última auditoría:** 2026-04-26 — F5.
> **Shape unificado:** sí, vía `GlobalExceptionFilter` (incluye `correlationId`, [ADR-007](../10-decisions/adr-007-observabilidad.md)).
> **Frontend handler centralizado:** ❌ no existe — cada componente maneja por status code (deuda R14).
> **Validation errors:** parcialmente normalizados (NestJS `ValidationPipe` devuelve `message: string[]` — no envuelto al shape canónico).

---

## Shape unificado de error response

`GlobalExceptionFilter` normaliza **todas** las excepciones HTTP al siguiente JSON:

```json
{
  "statusCode": 404,
  "code": "INVOICE_NOT_FOUND",
  "message": "Factura abc-123 no encontrada.",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-04-26T10:15:30.123Z",
  "path": "/api/v1/billing/invoices/abc-123"
}
```

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `statusCode` | sí | HTTP status (mismo que la respuesta) |
| `code` | sí | Code interno SCREAMING_SNAKE_CASE — **estable**, no cambia entre versiones (catálogo abajo) |
| `message` | sí | Mensaje legible **al usuario final**. **No** debe contener detalles técnicos ni stack traces |
| `correlationId` | sí | UUID propagado por middleware (R9, [ADR-007](../10-decisions/adr-007-observabilidad.md)) — usar para correlacionar con logs/Sentry |
| `timestamp` | sí | ISO 8601 |
| `path` | sí | Endpoint que lanzó el error |

**Frontend regla:** mostrar `message` al usuario, **incluir `correlationId`** en cualquier reporte/captura de bug.

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Códigos de error catalogados | 33 |
| Familias HTTP usadas | 7 (400, 401, 403, 404, 409, 429, 500) |
| 422 Unprocessable Entity | No usado — validaciones DTO devuelven 400 |
| WebSocket error events | 1 (`MESSAGE_SEND_FAILED` — genérico) |
| Frontend handler centralizado | ❌ — deuda R14 |

**Indicadores:**
- ✅ Code estable, en uso
- 🟡 Code en uso pero mensaje propenso a divergir (revisar)
- ❌ Documentado pero sin code interno todavía

---

## Catálogo por familia HTTP

### 400 BAD REQUEST — peticiones malformadas o inválidas

| Code | Mensaje base | Cuándo se lanza | Excepción class | Módulo |
|------|--------------|-----------------|-----------------|--------|
| `VALIDATION_ERROR` | (array de mensajes desde `ValidationPipe`) | DTO no valida (`@IsEmail`, `@IsNotEmpty`, etc.) | `BadRequestException` (NestJS) | global |
| `INVOICE_EMPTY` | "La factura debe tener al menos un item." | `createInvoice()` sin items | `BadRequestException` | billing |
| `INVALID_PROFILE_CATEGORY` | "La categoría especificada no existe." | `updateProduct()` con categoría foránea inválida | `BadRequestException` | products |
| `TOKEN_INVALID` | "Token de verificación inválido" | `verifyEmail()` con token mal formado | `BadRequestException` | auth |
| `TOKEN_EXPIRED` | "Este enlace ya fue utilizado" | Token de verify/reset ya consumido o caducado | `BadRequestException` | auth |
| `PASSWORD_RESET_EXPIRED` | "Este enlace ya fue utilizado" | Recovery token expirado (>1h, configurable `auth.password_reset_expires_hours`) | `BadRequestException` | auth |
| `INVALID_STATE_TRANSITION` | "Solo facturas pendientes pueden marcarse como vencidas." | Transición de estado no permitida ([ADR-026](../10-decisions/adr-026-estados-factura.md)) | `BadRequestException` | billing |
| `CANNOT_CANCEL_PAID` | "No se puede cancelar una factura pagada. Usa el reembolso." | `cancelInvoice()` con `status='paid'` | `BadRequestException` | billing |
| `CANNOT_PAY_CANCELLED` | "No se puede pagar una factura cancelada." | `markAsPaid()` con `status='cancelled'` | `BadRequestException` | billing |
| `CANNOT_REFUND_UNPAID` | "Solo facturas pagadas pueden reembolsarse." | `refundInvoice()` con `status≠'paid'` | `BadRequestException` | billing |
| `INVALID_2FA_CODE` | "Código inválido" | `verify2fa()` con code incorrecto o expirado | `BadRequestException` | auth |

**Nota sobre validación:** NestJS `ValidationPipe` devuelve por defecto `{ statusCode: 400, message: ['email must be valid', ...] }` — el shape canónico **debería** envolverlo a `{ code: 'VALIDATION_ERROR', message: 'Datos inválidos', errors: [...] }` pero hoy **no lo hace consistentemente**. Pendiente normalizar en `GlobalExceptionFilter`.

### 401 UNAUTHORIZED — sin sesión válida o credenciales inválidas

| Code | Mensaje base | Cuándo se lanza | Excepción class | Módulo |
|------|--------------|-----------------|-----------------|--------|
| `INVALID_CREDENTIALS` | "Credenciales incorrectas" | Email/password mismatch en `login()` | `UnauthorizedException` | auth |
| `REFRESH_TOKEN_INVALID` | "Refresh token inválido o expirado" | JWT refresh expirado o no encontrado en sessions | `UnauthorizedException` | auth |
| `JWT_INVALID` | "Token inválido" | JWT parse error / firma inválida / kid no encontrado | `UnauthorizedException` | auth (JwtStrategy) |
| `SESSION_REVOKED` | "Sesión no encontrada o revocada" | Sesión no existe en tabla `sessions` (se eliminó al cerrar — [ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md)) | `UnauthorizedException` | auth |
| `ACCOUNT_INACTIVE` | "Tu cuenta está inactiva." | `users.status≠'active'` | `UnauthorizedException` | auth |
| `JWT_WRONG_TYPE` | "Invalid token type" | JWT `sub` con type distinto del esperado (access vs refresh) | `UnauthorizedException` | auth |
| `AUTH_REPLAY_DETECTED` | "Sesión comprometida — todas las sesiones se han revocado por seguridad. Vuelve a iniciar sesión." | `POST /auth/refresh` con un refresh token cuya `Session.used_at IS NOT NULL` (reuso post-rotación, [ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) §1.4) | `UnauthorizedException` | auth (`AuthTokenService.refresh`) |

> **`AUTH_REPLAY_DETECTED`** — Sprint 13 §13.AUTH.B. La emisión revoca toda la
> cadena del usuario (`updateMany` con `revoked_reason='replay_detected'`) y
> dispara el evento `auth.refresh_replay_detected`, consumido por
> `NotificationsAuthReplayListener` que alerta al superadmin (canal `internal`
> + `email`). El cliente legítimo NUNCA debería ver este error: si lo ve, su
> refresh token quedó expuesto. Frontend: tratar como sesión expirada
> (`logoutAction()` + redirect `/?expired=true`).

**Frontend convención:** ante 401 → redirigir a `/login?expired=true` ([ADR-059](../10-decisions/adr-059-auth-layout-split-screen.md)) excepto en `INVALID_CREDENTIALS` (mostrar inline en form).

### 403 FORBIDDEN — autenticado pero sin permiso

| Code | Mensaje base | Cuándo se lanza | Excepción class | Módulo |
|------|--------------|-----------------|-----------------|--------|
| `ACCOUNT_BLOCKED` | "Account is blocked" | `users.is_blocked=true` (tras `auth.max_login_attempts` fallidos — [ADR-014](../10-decisions/adr-014-bloqueo-intentos-fallidos.md)) | `ForbiddenException` | auth |
| `NO_PERMISSION` | "No tienes permiso para esta acción." | `@UseGuards(PoliciesGuard)` deniega vía CASL ([ADR-012](../10-decisions/adr-012-pbac-casl.md)) | `ForbiddenException` | global (auth abilities) |
| `CANNOT_EDIT_OTHERS_TASK` | "No tienes permiso para editar esta tarea." | Task ownership check failed ([ADR-041](../10-decisions/adr-041-sistema-tareas.md)) | `ForbiddenException` | tasks |
| `INTERNAL_NOTE_UNAUTHORIZED` | "No puedes enviar notas internas." | Cliente intenta `is_internal=true` en mensaje de soporte | `ForbiddenException` | support |
| `PARTNER_ACCESS_DENIED` | (futuro) "No puedes acceder a clientes de otros partners." | Partner intenta query con `partner_id ≠ user.partner_id` ([ADR-050](../10-decisions/adr-050-partner-permisos.md)) | `ForbiddenException` | partner |

### 404 NOT FOUND — recurso inexistente o invisible al usuario

| Code | Mensaje base | Cuándo se lanza | Excepción class | Módulo |
|------|--------------|-----------------|-----------------|--------|
| `USER_NOT_FOUND` | "Usuario no encontrado." | Lookup por ID falla | `NotFoundException` | clients, billing, auth |
| `INVOICE_NOT_FOUND` | "Factura {id} no encontrada." | `findOneOrFail()` falla o factura de otro usuario | `NotFoundException` | billing |
| `BILLING_PROFILE_NOT_FOUND` | "Perfil de facturación no encontrado o no pertenece al usuario." | Profile lookup + ownership check ([ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md)) | `NotFoundException` | billing, clients |
| `PRODUCT_NOT_FOUND` | "Producto no encontrado." | `getProduct()` / `updateProduct()` con ID inválido | `NotFoundException` | products |
| `CONVERSATION_NOT_FOUND` | "Conversación no encontrada." | `findOne()` falla (REST). En WebSocket: desconexión silenciosa | `NotFoundException` (REST) | support |
| `TASK_NOT_FOUND` | "Tarea no encontrada" | Task lookup por ID o sin permiso | `NotFoundException` | tasks |
| `NOTE_NOT_FOUND` | "Nota no encontrada" | Client note lookup ([ADR-038](../10-decisions/adr-038-notas-estructuradas-cliente.md)) | `NotFoundException` | clients |
| `PRICING_NOT_FOUND` | "Plan de precio no encontrado." | `ProductPricing` lookup ([ADR-018](../10-decisions/adr-018-catalogo-dinamico-productos.md), PROD-INV-5) | `NotFoundException` | products |

**Convención de seguridad:** preferimos **404 sobre 403** cuando devolver 403 expondría existencia de recurso (ej: factura de otro usuario → 404, no "no tienes acceso a esta factura"). Esto evita enumeración.

### 409 CONFLICT — invariantes y deduplicación

| Code | Mensaje base | Cuándo se lanza | Excepción class | Módulo |
|------|--------------|-----------------|-----------------|--------|
| `EMAIL_ALREADY_EXISTS` | "Ya existe una cuenta con este email" | `register()` con email único violado | `ConflictException` | auth |
| `INVOICE_ALREADY_PAID` | "La factura ya está pagada." | `markAsPaid()` con `status='paid'` (idempotencia) | `ConflictException` | billing |
| `INVOICE_ALREADY_CANCELLED` | "La factura ya está cancelada." | `cancelInvoice()` con `status='cancelled'` | `ConflictException` | billing |
| `SKU_DUPLICATE` | "SKU {sku} ya existe en el catálogo." | `Product.sku` unique violado | `ConflictException` | products |
| `CONVERSATION_ALREADY_ESCALATED` | (futuro) "Esta conversación ya fue escalada." | `escalateToTicket()` con `escalated_to≠null` (Sprint 7.H2 — [ADR-037](../10-decisions/adr-037-arquitectura-dual-chat-tickets.md)) | `ConflictException` | support |
| `LAST_PRICING_ACTIVE` | (cuando se valide) "No puedes desactivar el último ProductPricing activo." | Invariante PROD-INV-5 | `ConflictException` | products |

### 422 UNPROCESSABLE ENTITY

**No usado actualmente.** Validaciones DTO se devuelven como 400. Reservado para futuro: validaciones complejas que pasan formato pero fallan reglas de negocio post-DTO (ej: "fecha permitida solo en días laborables").

### 429 TOO MANY REQUESTS — rate limiting ([ADR-016](../10-decisions/adr-016-rate-limiting-redis.md))

| Code | Mensaje base | Cuándo se lanza | Config |
|------|--------------|-----------------|--------|
| `THROTTLED_GENERAL` | "Has hecho demasiadas peticiones. Intenta en X segundos." | `>100 req/min` por IP/usuario | `app.module.ts` (`@nestjs/throttler`) |
| `THROTTLED_LOGIN` | "Has intentado iniciar sesión demasiadas veces." | `>5 attempts/min` por IP | login endpoint |
| `THROTTLED_REGISTER` | "Has intentado registrarte demasiadas veces." | `>10 attempts/hour` por IP | register endpoint |
| `THROTTLED_CHAT_MESSAGES` | "Demasiados mensajes. Espera unos segundos." | `>30 mensajes/min` por conversación | support gateway |
| `RATE_LIMIT_GUEST_CHATS` | "Demasiadas conversaciones nuevas desde tu IP." | (futuro) `>3 chats/hora` por IP guest | support guest endpoint (ROADMAP) |

**Cabeceras estándar:** la respuesta 429 incluye `Retry-After: <seconds>` para que el cliente reintente con cortesía.

### 500 INTERNAL SERVER ERROR — bugs / fallos de infra

| Code | Mensaje base | Cuándo se lanza | Notas |
|------|--------------|-----------------|-------|
| `INTERNAL_ERROR` | "Algo no ha ido bien. Nuestro equipo ya está al tanto y lo resolverá en breve." | Cualquier excepción NO `HttpException` (bug, fallo Prisma, etc.) | Mensaje al usuario sigue [ADR-031 §31 original](../99-archive/DECISIONS.md#§31) — **sin detalles técnicos**. Detalles van a Sentry + logs con `correlationId` |
| `DB_ERROR` | (no expuesto al usuario — se loguea como `INTERNAL_ERROR`) | Prisma query rechaza (constraint, deadlock, conexión perdida) | Loggeado en `error_log` ([ADR-031 §31](../99-archive/DECISIONS.md#§31)) |
| `JWT_SECRET_MISSING` | "JWT_SECRET environment variable is not set" | Startup check — el proceso no arranca | Mata el contenedor → Traefik lo reinicia o reporta unhealthy |

### 503 SERVICE UNAVAILABLE — degradación temporal

| Code | Mensaje base | Cuándo se lanza | Notas |
|------|--------------|-----------------|-------|
| `CIRCUIT_BREAKER_OPEN` | "El servicio temporalmente no está disponible. Intenta en breve." | Circuit breaker abierto en API externa (Stripe, ResellerClub, Docker) — [ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) | Notificación `system.error` al superadmin |
| `HEALTH_CHECK_FAILED` | (no es respuesta a request usuario — Traefik) | `/health` devuelve 503 si DB / Redis / workers no responden | Traefik desvía / reinicia |

---

## WebSocket errors

El gateway de support emite eventos `error` cuando algo falla:

| Event | Code | Payload | Cuándo |
|-------|------|---------|--------|
| `error` | `MESSAGE_SEND_FAILED` | `{ message: "Error al enviar el mensaje." }` | `addMessage()` lanza excepción interna | support |
| `error` | (no específico) | (cierre silencioso del socket) | Auth WS falla — JWT inválido o `guest_session_token` expirado | support |

**Pendiente:** códigos específicos (`WS_AUTH_FAILED`, `WS_RATE_LIMITED`, `WS_CONVERSATION_NOT_FOUND`) en lugar de mensaje genérico — facilitaría manejo en frontend.

---

## Invariantes documentadas (no son códigos — son guards)

Las invariantes definen **operaciones prohibidas**. Si se intentan, lanzan los códigos de arriba. Catálogo:

| Invariante | Lo que prohíbe | Code que lanza |
|------------|----------------|----------------|
| **BILL-INV-1** | Calcular precio en frontend (R5) | N/A — guard de arquitectura, no runtime |
| **BILL-INV-2** | Borrar una factura | No hay endpoint DELETE; tabla audit-only |
| **BILL-INV-3** | Editar items tras `pending` (precios congelados) | `INVALID_STATE_TRANSITION` |
| **BILL-INV-4** | `user_id` ≠ `billing_profile.user_id` | `BILLING_PROFILE_NOT_FOUND` |
| **BILL-INV-5** | Numeración con saltos | Imposible por SEQUENCE PostgreSQL ([ADR-025](../10-decisions/adr-025-numeracion-secuencial-facturas.md)) |
| **PROD-INV-5** | Eliminar último `ProductPricing` activo | `LAST_PRICING_ACTIVE` (cuando se valide explícitamente) |
| **SUP-INV-7.H2** | Escalar la misma conversación dos veces | `CONVERSATION_ALREADY_ESCALATED` |

Lista completa en [`docs/00-foundations/rules.md`](../00-foundations/rules.md) y en cada `contract.md` del módulo.

---

## Naming convention para `code`

- `<DOMINIO>_<ACCION_O_RECURSO>` en SCREAMING_SNAKE_CASE.
- **Estable** entre versiones (no cambia el `code` aunque cambie el mensaje).
- Sufijos comunes: `_NOT_FOUND`, `_ALREADY_EXISTS`, `_INVALID`, `_EXPIRED`, `_DENIED`, `_CONFLICT`.
- **No** usar `ERROR_` como prefijo (redundante — el shape ya dice que es error).

Ejemplos correctos: `INVOICE_NOT_FOUND`, `EMAIL_ALREADY_EXISTS`, `INVALID_2FA_CODE`.

Ejemplos a evitar: `ErrorInvoiceNotFound` (camelCase), `INVOICE_404` (HTTP en el code), `ERR_INVOICE` (vago).

---

## Cómo añadir un error nuevo

1. **¿Hay un code existente que cubre el caso?** Si sí, reúsalo (no inventes sinónimos).
2. **Decidir HTTP status correcto:**
   - 400 = el cliente mandó algo malformado / mal validado.
   - 401 = no está autenticado o token inválido.
   - 403 = autenticado pero sin permiso (incluyendo bloqueo de cuenta).
   - 404 = recurso no existe / no visible para el usuario.
   - 409 = conflicto con estado actual (idempotencia, unique violado, invariante).
   - 422 = pasó validación de formato pero falla regla de negocio compleja (poco usado).
   - 429 = rate limit.
   - 500 = bug interno (no exponer detalles).
   - 503 = degradación de dependencia externa.
3. **Lanzar la excepción** con `code` explícito:
   ```typescript
   throw new BadRequestException({
     code: 'INVOICE_EMPTY',
     message: 'La factura debe tener al menos un item.',
   });
   ```
4. **Documentar aquí** en la familia HTTP correspondiente.
5. **Si afecta a frontend:** comunicar al equipo frontend para que mapee el `code` a copy/UI específico (si aplica).

---

## Frontend: handler centralizado (deuda)

**Hoy:** cada componente maneja errores ad-hoc. Riesgos:
- Inconsistencia de UX (algunos errores muestran toast, otros banner, otros nada).
- Mensajes técnicos llegan al usuario por descuido.
- `correlationId` no se captura para reporte de bug.

**Pendiente** (sprint UI dedicado):
- Hook `useApiErrorHandler()` que normaliza la respuesta del shape canónico.
- Mapping `code → UI strategy` (toast / banner / inline / modal).
- Captura automática de `correlationId` para enviar a Sentry frontend.
- Fallback genérico si `code` no está mapeado: toast con `message` + log.

---

## Documentos relacionados

- [ADR-007](../10-decisions/adr-007-observabilidad.md) — Observabilidad: `correlationId` propagado de request a logs/eventos/jobs.
- [ADR-012](../10-decisions/adr-012-pbac-casl.md) — PBAC con CASL — fuente de los `NO_PERMISSION` / 403.
- [ADR-014](../10-decisions/adr-014-bloqueo-intentos-fallidos.md) — Bloqueo intentos → `ACCOUNT_BLOCKED`.
- [ADR-016](../10-decisions/adr-016-rate-limiting-redis.md) — Rate limiting → 429.
- [ADR-026](../10-decisions/adr-026-estados-factura.md) — Estados de factura → `INVALID_STATE_TRANSITION`.
- [ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) — Circuit breaker → 503.
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — R7 (defense in depth), R9 (correlation ID), R14 (manejo errores frontend), invariantes.
- [`settings-reference.md`](./settings-reference.md) — Settings que afectan a errores (rate limit defaults, bloqueo intentos, expiraciones de tokens).
