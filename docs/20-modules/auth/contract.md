# auth — Contract

## 1. Propósito

Módulo fundacional. Gestiona el ciclo de identidad del usuario: registro, verificación de email, login con 2FA para roles privilegiados, recuperación de contraseña, gestión de sesiones (access + refresh tokens) y bloqueo por intentos fallidos. Es el único módulo que produce JWT — todos los demás dependen de él vía `JwtAuthGuard`.

---

## 2. Estado de implementación

✅ **Producción.** Sprint 1 cerrado, hardening en Sprint 3.5. Refactor R15 aplicado en Sprint 7+ (división en sub-services).

Pendiente menor:
- Registrar IP del intento 2FA en `LoginAttempt` (parámetro `_ip` reservado en `initiate2fa`)
- Listeners de `auth.*` cuando se implemente módulo `audit`

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `users` | Usuarios del sistema (todos los roles) | `email` único; password con bcrypt cost 12; `email_verified_at` controla acceso |
| `roles` | Roles del sistema | 7 roles fijos `is_system: true`, no editables. Seed los crea. |
| `sessions` | Sesiones activas (access + refresh token issued) | Una sesión = un device/login. Revocable individualmente. |
| `email_verifications` | Tokens de verificación de email | TTL 24h (configurable). Al generar uno nuevo, los anteriores se invalidan. |
| `password_resets` | Tokens de reset | TTL 1h (configurable). Mismo patrón: nuevo invalida los anteriores. |

---

## 4. Modelos foráneos accedidos

| Tabla | Módulo dueño | Tipo de acceso | Razón | Estado |
|-------|--------------|----------------|-------|--------|
| `audit_access_log` | audit | escritura | Registrar logins, logouts, intentos fallidos | ⚠️ Acceso directo. Cuando módulo `audit` se implemente, debería pasar por `AuditService`. |

> **Observación:** `auth` NO accede a tablas de otros módulos de negocio (clients, billing, etc.). El acoplamiento ocurre en sentido contrario: clients/billing/dashboard leen `users` por ser el shape fundacional.

---

## 5. API REST expuesta

Prefix: `/api/v1/auth`. Todos los endpoints emiten `correlation-id` (R9).

| Método | Ruta | Descripción | Auth | Throttle |
|--------|------|-------------|------|----------|
| `POST` | `/register` | Crear cuenta cliente nueva | Sin auth | 5/min |
| `POST` | `/login` | Login con email + password | Sin auth | 5/min |
| `POST` | `/verify-2fa` | Submit código 2FA tras login (roles con 2FA) | Token temporal `temp_2fa` | 10/min |
| `POST` | `/refresh` | Renovar access token vía refresh token | Sin auth (refresh token en body) | 30/min |
| `POST` | `/logout` | Revocar sesión actual | JWT | — |
| `POST` | `/verify-email` | Confirmar email vía token recibido por email | Sin auth | 30/min |
| `POST` | `/resend-verification` | Reenviar email de verificación | Sin auth | 3/min |
| `POST` | `/forgot-password` | Solicitar email de reset | Sin auth | 3/min |
| `POST` | `/reset-password` | Confirmar nueva password vía token | Sin auth | 5/min |
| `GET` | `/sessions` | Listar sesiones activas del usuario | JWT | — |
| `DELETE` | `/sessions/:id` | Revocar sesión específica | JWT | — |
| `GET` | `/me` | Datos del usuario actual | JWT | — |
| `POST` | `/ws-token` | Token efímero (claim `type: 'ws'`, expira 60s) para handshake socket.io | JWT | 60/min |

> **`/ws-token`** — Sprint 13 §13.AUTH.A (ADR-078 Amendment A1 §6).
> Body vacío. Response: `{ token: string, expiresIn: 60 }`. Solicitado por
> Server Action `getWsTokenAction()` desde un Client Component que necesita
> WebSocket (la cookie httpOnly Next.js no es accesible al `socket.io-client`,
> y reenviarla al backend por header de handshake violaría el aislamiento del
> dominio Next.js). Consumo: `io('/support', { auth: { token } })`.

**Validaciones DTO** (class-validator):
- Password: longitud mínima, mayúscula, minúscula, número (settings configurables)
- Email: formato válido, lowercase forzado en handler

---

## 6. WebSocket gateway

N/A — auth no tiene gateway. Las conexiones WS de otros módulos (support) usan el JWT emitido por auth para validarse.

---

## 7. Eventos emitidos

> Detalles completos en [`../_events.md`](../_events.md).

| Evento | Cuándo se emite | Outbox | Estado |
|--------|-----------------|--------|--------|
| `auth.registered` | Tras crear user con éxito en `register()` | no | ✅ Consumido por `support-guest-link.listener` (vincula chats guest previos) |
| `auth.email_verified` | Tras `verifyEmail()` exitoso | no | 🟡 Huérfano (futuro audit) |
| `auth.login_success` | Tras `issueTokens()` | no | 🟡 Huérfano (futuro audit) |
| `auth.login_failed` | Tras `handleFailedLogin()` | no | 🟡 Huérfano (futuro audit) |
| `auth.account_blocked` | Tras N intentos fallidos | no | 🟡 Huérfano (debería notificar superadmin → R7) |
| `auth.2fa_required` | Cuando se inicia el flow 2FA | no | 🟡 Huérfano |
| `auth.password_reset` | Tras `resetPassword()` exitoso | no | 🟡 Huérfano (futuro audit) |
| `auth.session_closed` | Tras `logout()` o `revokeSession()` | no | 🟡 Huérfano (futuro audit) |
| `auth.refresh_replay_detected` | Tras detectar reuso de un refresh token ya canjeado en `AuthTokenService.refresh()` | no | ✅ Consumido por `NotificationsAuthReplayListener` (alerta superadmin canal `internal` + `email`) — Sprint 13 §13.AUTH.B |

> **Decisión:** los huérfanos NO se eliminan. Son hooks para el módulo `audit` cuando se implemente. Es deuda controlada.

---

## 8. Eventos consumidos

Ninguno. Auth es módulo fundacional: emite, no escucha.

---

## 9. Servicios consumidos cross-módulo

Ninguno. Solo core: `PrismaService`, `EmailService`, `SettingsService`, `JwtService`, `EventEmitter2`.

Sub-services internos (R15, **no es acoplamiento cross-módulo**):
- `AuthService` (fachada) → `AuthLoginService`, `AuthRegisterService`, `AuthTokenService`, `AuthRecoveryService`

---

## 10. CASL — Permisos

### Subjects gestionados
Auth no expone Subjects propios fuertes — gestiona la identidad. El Subject `Profile` (compartido) permite a cada usuario ver/editar sus propios datos.

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Profile` (datos propios) | manage | manage | manage | manage | manage | manage |

> **Authorización endpoint-level** se hace con `@UseGuards(JwtAuthGuard)`. Algunos endpoints (`/me`, `/sessions`) implícitamente filtran por el usuario del JWT — no necesitan CASL extra.

---

## 11. Settings consumidos

Categoría `auth` (todos configurables desde el dashboard cuando se implemente UI de Settings):

| Key | Default | Para qué |
|-----|---------|----------|
| `max_login_attempts` | 5 | Intentos antes de bloqueo |
| `block_duration_minutes` | 15 | Duración del bloqueo por intentos fallidos |
| `password_min_length` | 8 | Longitud mínima de contraseña |
| `require_uppercase` | true | Validación: requiere mayúscula |
| `require_lowercase` | true | Validación: requiere minúscula |
| `require_number` | true | Validación: requiere dígito |
| `access_token_expires_minutes` | 15 | TTL del access token JWT |
| `refresh_token_expires_days` | 7 | TTL del refresh token |
| `email_verification_expires_hours` | 24 | TTL del token de verificación de email |
| `password_reset_expires_hours` | 1 | TTL del token de reset de contraseña |
| `two_factor_code_expires_minutes` | 5 | TTL del código 2FA |

### Variables de entorno frontend (Sprint 13 §13.AUTH — Modelo A)

| Var | Required | Descripción |
|-----|----------|-------------|
| `BACKEND_URL` | ✅ | URL server-side del backend usado por `serverFetch` y por las Server Actions de auth (distinta de `NEXT_PUBLIC_API_URL`, que el cliente JS no consume). Ejemplo dev: `http://localhost:3001/api/v1`. |
| `NEXT_RUNTIME_SECRET` | ✅ prod | Secret de 32 bytes que Next.js usa para firmar los IDs de Server Actions (CSRF nativo). Generar con `openssl rand -base64 32`. Sin este secret en producción, los Server Actions no validan y el login no completa. |

> **Cookies emitidas por las Server Actions** (`frontend/app/lib/auth-actions.ts`):
> `aelium_access_token` (httpOnly, sameSite=Lax, path=`/`, maxAge `auth.access_token_expires_minutes` × 60)
> y `aelium_refresh_token` (httpOnly, sameSite=Lax, path=`/`, maxAge `auth.refresh_token_expires_days` × 86400).

---

## 12. Emails enviados

Plantillas en `backend/src/core/email/templates/auth.templates.ts`.

| Trigger | Plantilla | Subject | Destinatario |
|---------|-----------|---------|--------------|
| `register()` | `verifyEmailTemplate` | `Verifica tu email — Aelium` | Usuario recién registrado |
| `verifyEmail()` exitoso | `welcomeTemplate` | `Bienvenido a Aelium` | Usuario verificado |
| `initiate2fa()` | `twoFactorCodeTemplate` | `<6 dígitos> — Código de verificación Aelium` | Usuario haciendo login (rol con 2FA) |
| `forgotPassword()` | `passwordResetTemplate` | `Resetear contraseña — Aelium` | Usuario que solicita reset |

> Inputs sanitizados con `escapeHtml(name)` para prevenir inyección (Sprint 3.5.5).

---

## 13. Jobs / cron

Ninguno. Auth no tiene tareas programadas. Los tokens caducan por TTL en BD, no por cron de limpieza (cleanup futuro candidato si la tabla crece).

---

## 14. Invariantes (cosas que NUNCA pueden romperse)

- **AUTH-INV-1:** Email es único y siempre lowercase (normalizado en register/login/forgot/resend). Cualquier nueva ruta que acepte email debe lowercase también.
- **AUTH-INV-2:** Password se guarda solo como hash bcrypt cost ≥10. La password en plano nunca se persiste ni se loguea.
- **AUTH-INV-3:** Roles privilegiados (`superadmin`, `agent_*`) **siempre requieren 2FA** en login. Definidos en `ROLES_REQUIRING_2FA` (auth-login.service.ts).
- **AUTH-INV-4:** Los 7 roles del sistema (`is_system: true`) son inmutables. No pueden borrarse ni renombrarse desde el dashboard. Migrarlos requiere migración Prisma.
- **AUTH-INV-5:** Tokens (verify, reset, refresh) se hash-storean en DB; el token en plano solo existe en el email/cookie del cliente. Verificación es por hash.
- **AUTH-INV-6:** Al generar un token nuevo (verify/reset), los anteriores del mismo usuario se invalidan (`used_at = now()`). Implementado en Sprint 3.5.2 y 3.5.3.
- **AUTH-INV-7:** El superadmin pre-seeded (`admin@aelium.net`) no puede eliminarse desde la UI. La cuenta es la "raíz" del sistema.
- **AUTH-INV-8:** Las cookies `aelium_access_token` + `aelium_refresh_token` (httpOnly, dominio Next.js) son las **únicas portadoras** del JWT en el frontend. El JS del cliente no debe leer ni escribir tokens en `localStorage`/`sessionStorage`/`document.cookie`. Sprint 13 §13.AUTH (ADR-078 Amendment A1 — Modelo A). Verificación mecánica: regla R17 + spec `tests/e2e/auth-no-localStorage.spec.ts`.
- **AUTH-INV-9:** Cualquier reuso de un refresh token ya canjeado (`Session.used_at IS NOT NULL`) revoca toda la cadena de sesiones del usuario (`updateMany` con `revoked_reason='replay_detected'`) y emite `auth.refresh_replay_detected`. El flujo legítimo nunca debe presentar el mismo refresh dos veces — la rotación lo invalida en cuanto se canjea. Sprint 13 §13.AUTH.B (ADR-078 §1.4).

---

## 15. Decisiones relacionadas

> Migrar a ADRs (`docs/10-decisions/`) cuando se ejecute F2.

- `DECISIONS.md` §1 — Stack: NestJS + Passport JWT
- `DECISIONS.md` §5 — Roles del sistema y matriz de permisos
- `DECISIONS.md` §7 — 2FA por email para superadmin + agentes
- `DECISIONS.md` §22 — Bloqueo por intentos fallidos configurable
- [ADR-078](../../10-decisions/adr-078-auth-server-side-cookies-httponly.md) + Amendment A1 — Auth server-side con cookies httpOnly (Modelo A: dominio Next.js). Cierra DC.6 + DC.28 (Sprint 13 §13.AUTH).

---

## 16. Excepciones documentadas

- **R1 (módulos no se llaman):** ✅ cumplido. No inyecta servicios de otros módulos de negocio.
- **R5 (no lógica en frontend):** ✅ validación visual permitida (fortaleza de contraseña), validación de negocio en backend.
- **R7 (errores se notifican al superadmin):** ⚠️ `auth.account_blocked` no tiene listener todavía. Tras N bloqueos sucesivos debería levantar alerta. Pendiente.
- **R8 (Outbox para eventos críticos):** ⚠️ `auth.registered` no usa Outbox. El listener es informativo (vincular guest chats), pero si falla el cliente queda sin sus chats previos vinculados. Considerar Outbox cuando se priorice.
- **R15 (límite 300 líneas):** ✅ post-refactor de Sprint 7+. AuthService = fachada (~80 líneas). Cada sub-service ≤300.

---

## 17. Pendiente / deuda técnica

- [ ] Registrar IP del intento 2FA en `LoginAttempt` (parámetro `_ip` ya reservado en `initiate2fa`)
- [ ] Listener real para `auth.account_blocked` → notificación al superadmin (R7)
- [ ] Cleanup periódico de tokens expirados (`email_verifications`, `password_resets`) si las tablas crecen
- [ ] Considerar Outbox Pattern para `auth.registered` (R8) cuando provisioning automático lo necesite
- [ ] Cuando módulo `audit` se implemente: añadir listeners para `auth.login_success`, `auth.login_failed`, `auth.password_reset`, `auth.session_closed`

---

## 18. Cómo testear este módulo

### Tests E2E existentes
- `tests/e2e/auth.spec.ts`
  - Test 1: registro → email verify → login completo (incluye flujo `auth.registered`)
  - Test 2: login con email no verificado muestra opción de reenvío

### Tests unitarios
Pendiente: `backend/src/modules/auth/*.spec.ts` no existe todavía. Sprint dedicado de testing añadirá:
- `auth-login.service.spec.ts` — login, 2FA, bloqueo
- `auth-register.service.spec.ts` — registro, verify-email
- `auth-recovery.service.spec.ts` — forgot, reset
- `auth-token.service.spec.ts` — issue, refresh, revoke

### Smoke test manual (parte del DoD)
1. Registrar cuenta nueva → recibir email → verificar → login
2. Login del superadmin → recibir código 2FA → introducir → entrar al dashboard
3. `forgot-password` → email → reset → login con nueva contraseña
4. Bloquear cuenta con 5 intentos fallidos → comprobar bloqueo activo → esperar 15 min o desbloquear manualmente
