# Sprint 1 — Auth ✅

> **Estado:** ✅ Cerrado
> **Commit cierre:** `13c5f15`

---

## Objetivo

Sistema de autenticación completo: registro, login con bloqueo por intentos, 2FA por email para roles privilegiados, JWT access + refresh, sesiones, verificación de email, recuperación de contraseña.

---

## Lo que entregó

### Backend
- **DTOs** con `class-validator` (password policy: longitud, uppercase, lowercase, number — todos configurables vía settings).
- **`SettingsService` global** con cache Redis 1 minuto.
- **`JwtStrategy` + `JwtAuthGuard`** (Passport).
- **`AuthService` (refactorizado en Sprint 13.R15.1 a fachada + 4 sub-servicios):**
  - `register()` con `pending_verification` y email de verificación.
  - `login()` con bloqueo por `auth.max_login_attempts` (defaults: 5 intentos / 15 min).
  - `2FA por email` para `superadmin` y `agent_*` (código SHA-256 single-use, TTL `auth.two_factor_code_expires_minutes`).
  - `refresh token` + `logout` + `sessions`.
  - `verifyEmail()`, `forgotPassword()`, `resetPassword()`.
- **`AuthController`:** 12 endpoints (`/register`, `/login`, `/verify-2fa`, `/refresh`, `/logout`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `GET /sessions`, `DELETE /sessions/:id`, `GET /me`).
- **11 settings configurables** seedados ([settings-reference](../../50-operations/settings-reference.md)).

### Frontend
- Login funcional + 2FA con transiciones (anticipa [ADR-059](../../10-decisions/adr-059-auth-layout-split-screen.md)).
- Dashboard placeholder (`/dashboard`).
- API client tipado (`lib/api.ts`).

### Documentación
- `docs/features/auth/admin.md`.

---

## Decisiones clave consolidadas

- **JWT access (15 min) + refresh (7 días)** ambos hasheados SHA-256 en BD ([ADR-012](../../10-decisions/adr-012-pbac-casl.md)).
- **2FA por email** (no app TOTP) — más simple, suficiente para esta escala ([ADR-013](../../10-decisions/adr-013-2fa-email.md)).
- **Bloqueo temporal con `blocked_until`** — no permanente. Se libera tras `auth.block_duration_minutes` ([ADR-014](../../10-decisions/adr-014-bloqueo-intentos-fallidos.md)).
- **Anti-enumeration en forgot-password** — siempre devuelve éxito ([ADR-059](../../10-decisions/adr-059-auth-layout-split-screen.md)).
- **Tokens en localStorage** (frontend) — deuda conocida, migrar a HttpOnly cookies en Sprint 13.1.

---

## Verificación de cierre (auditoría 2026-04-26)

- ✅ 12 endpoints implementados en `auth.controller.ts`.
- ✅ Sub-servicios separados (`auth-login`, `auth-register`, `auth-token`, `auth-recovery`).
- ✅ 11 settings auth seedados.
- ✅ Tests E2E auth (register → verify → login → 2FA) pasan.

**Drift menor:** contract `support` no lista `GET /me` en tabla (existe en código). No bloqueante.
