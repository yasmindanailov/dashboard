# Auth — Schema

> **Dominio:** autenticación, sesiones, recuperación.
> **Módulo:** [`docs/20-modules/auth/contract.md`](../20-modules/auth/contract.md).
> **Sprint origen:** Sprint 0 + Sprint 1.
> **Estado:** ✅ implementado.
> **ADRs:** [011](../10-decisions/adr-011-roles-sistema.md) (roles) · [012](../10-decisions/adr-012-pbac-casl.md) (PBAC) · [013](../10-decisions/adr-013-2fa-email.md) (2FA) · [014](../10-decisions/adr-014-bloqueo-intentos-fallidos.md) (bloqueo) · [015](../10-decisions/adr-015-encriptacion-credenciales.md) (crypto) · [060](../10-decisions/adr-060-decisiones-pre-schema.md) (sesiones sin histórico).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `roles` | ✅ | Definición de los 7 roles del sistema (immutables vía `is_system`) |
| `users` | ✅ | Todos los usuarios: clientes, agentes, partners, superadmin |
| `sessions` | ✅ | Sesiones activas (sin histórico — al cerrar se elimina, ADR-060) |
| `email_verifications` | ✅ | Tokens de verificación de email (24h TTL) |
| `password_resets` | ✅ | Tokens de recuperación de contraseña (1h TTL) |

---

## Tabla: `roles` ✅

Definición de roles del sistema. Usa enum `RoleSlug` como identificador único.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `slug` | enum `RoleSlug` | NOT NULL, UQ | `superadmin` · `agent_full` · `agent_billing` · `agent_support` · `client` · `partner_pending` · `partner` |
| `name` | varchar(100) | NOT NULL | Nombre visible: "Superadmin", "Cliente", etc. |
| `description` | text | NULLABLE | |
| `permissions` | json | DEFAULT `'[]'` | Permisos granulares (futuro — hoy se usa CASL en código, ADR-012) |
| `is_system` | boolean | DEFAULT `false` | `true` = no editable desde UI |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Datos iniciales (seed):** 7 roles — ver `backend/prisma/seed.ts`.

**Notas de decisión:**
- Roles fijos por diseño ([ADR-011](../10-decisions/adr-011-roles-sistema.md)). Cualquier rol nuevo requiere ADR.
- `partner_pending` y `partner` añadidos para Fase 2 ([ADR-049](../10-decisions/adr-049-partner-roles-onboarding.md)).

---

## Tabla: `users` ✅

Todos los usuarios del sistema — clientes, agentes, partners, superadmin. Relación directa con `roles` via FK (un usuario = un rol).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `email` | varchar(255) | NOT NULL, UQ | |
| `password_hash` | varchar(500) | NOT NULL | Bcrypt 12 rounds. Nunca en claro. |
| `first_name` | varchar(100) | NOT NULL | |
| `last_name` | varchar(100) | NOT NULL | |
| `status` | enum `UserStatus` | NOT NULL, DEFAULT `'pending_verification'` | `pending_verification` · `active` · `blocked` · `inactive` |
| `email_verified_at` | timestamptz | NULLABLE | `null` = no verificado |
| `login_attempts` | integer | NOT NULL, DEFAULT `0` | Se resetea al hacer login exitoso |
| `blocked_until` | timestamptz | NULLABLE | Bloqueo temporal tras N intentos fallidos (configurable, ADR-014) |
| `last_login_at` | timestamptz | NULLABLE | Se actualiza en cada login exitoso |
| `last_login_ip` | varchar(45) | NULLABLE | IPv4 o IPv6 |
| `two_factor_enabled` | boolean | DEFAULT `false` | |
| `two_factor_secret` | varchar(500) | NULLABLE | Hash SHA-256 del código 2FA activo (single-use, ADR-013) |
| `avatar_url` | varchar(1000) | NULLABLE | URL imagen (MinIO) |
| `language` | varchar(5) | DEFAULT `'es'` | Idioma del dashboard |
| `timezone` | varchar(50) | DEFAULT `'Europe/Madrid'` | Zona horaria |
| `role_id` | uuid | NOT NULL, FK → `roles(id)` | Relación directa, sin tabla pivote |
| `partner_id` | uuid | NULLABLE | Si el usuario fue creado por un partner ([partner.md](./partner.md)) |
| `linked_partner_account_id` | uuid | NULLABLE, FK → `partners(id)` | Vinculación cuenta cliente ↔ cuenta partner ([ADR-053](../10-decisions/adr-053-partner-vinculacion-cuenta-cliente.md)) |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | Auto-update |

**Índices:**
- `idx_users_email` — UNIQUE en `email`
- `idx_users_role_id` — en `role_id`
- `idx_users_status` — en `status`

**Notas de decisión:**
- El superadmin solo se crea via seed. Nunca desde la UI.
- `blocked_until` usa bloqueo temporal (15 min por defecto, configurable en `auth.block_duration_minutes` — ver [settings-reference](../50-operations/settings-reference.md)).
- 2FA obligatorio para superadmin y agentes (ADR-013). Código por email, single-use, hasheado en `two_factor_secret`, se borra tras uso.
- Campos `partner_id` y `linked_partner_account_id` añadidos para Fase 2 — ver [partner.md](./partner.md).

---

## Tabla: `sessions` ✅

Sesiones activas. **Sin histórico:** al cerrar sesión o expirar, el registro se elimina ([ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md)). El histórico de logins vive en `audit.access_log` ([audit.md](./audit.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `token_hash` | varchar(500) | NOT NULL, UQ | Hash SHA-256 del access token |
| `refresh_hash` | varchar(500) | NOT NULL, UQ | Hash SHA-256 del refresh token |
| `ip_address` | varchar(45) | NOT NULL | |
| `user_agent` | varchar(1000) | NULLABLE | |
| `device_label` | varchar(200) | NULLABLE | "Windows", "Mobile", "Mac" (parseado) |
| `is_active` | boolean | DEFAULT `true` | (legacy — al implementar ADR-060 estricto, las inactivas se borran) |
| `last_used_at` | timestamptz | NOT NULL, DEFAULT `now()` | Se actualiza en cada refresh |
| `expires_at` | timestamptz | NOT NULL | Configurable: `auth.access_token_expires_minutes` y `auth.refresh_token_expires_days` |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_sessions_user_id` — en `user_id`
- `idx_sessions_is_active` — en `is_active`

**Notas de decisión:**
- Access token: 15 min (configurable). Refresh token: 7 días (configurable).
- "Cerrar sesión en todos los dispositivos" = `DELETE FROM sessions WHERE user_id = $1`.
- El superadmin puede cerrar sesiones de cualquier usuario.

---

## Tabla: `email_verifications` ✅

Tokens para verificación de email al registrarse.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `token_hash` | varchar(500) | NOT NULL, UQ | Hash SHA-256 del token (el token real va en el email) |
| `expires_at` | timestamptz | NOT NULL | 24h (configurable: `auth.email_verification_expires_hours`) |
| `used_at` | timestamptz | NULLABLE | `null` = no usado aún |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_email_verifications_user_id` — en `user_id`

---

## Tabla: `password_resets` ✅

Tokens para recuperación de contraseña.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `token_hash` | varchar(500) | NOT NULL, UQ | Hash SHA-256 |
| `expires_at` | timestamptz | NOT NULL | 1h (configurable: `auth.password_reset_expires_hours`) |
| `used_at` | timestamptz | NULLABLE | |
| `ip_address` | varchar(45) | NOT NULL | IP desde donde se solicitó |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_password_resets_user_id` — en `user_id`

**Notas de decisión:**
- Anti-enumeration ([ADR-059](../10-decisions/adr-059-auth-layout-split-screen.md)): el endpoint forgot-password siempre devuelve éxito al frontend independientemente de si el email existe. El registro solo se crea si el email existe.

---

## Diagrama de relaciones (auth)

```
roles
  └── users (1:N)        ← un usuario = un rol
        ├── sessions (1:N)
        ├── email_verifications (1:N)
        └── password_resets (1:N)
```

Cuando se borra un `user`:
- `sessions`, `email_verifications`, `password_resets` → CASCADE.
- `client_profiles` → ver [clients.md](./clients.md) (CASCADE).
- `services`, `invoices`, `tasks` → RESTRICT (no se puede borrar usuario con datos comerciales — usar anonimización RGPD, [ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)).

---

## Cross-references

- **Quien apunta a `users`:** prácticamente todas las tablas del schema (relación cliente / agente / actor).
- **Audit:** todo cambio en `users` (status, role, blocked_until) genera entrada en `audit.change_log` ([audit.md](./audit.md)).
- **Settings consumidos:** `auth.max_login_attempts`, `auth.block_duration_minutes`, `auth.access_token_expires_minutes`, `auth.refresh_token_expires_days`, `auth.email_verification_expires_hours`, `auth.password_reset_expires_hours`, `auth.two_factor_code_expires_minutes` — ver [settings-reference](../50-operations/settings-reference.md).
- **Eventos emitidos:** `auth.registered`, `auth.email_verified`, `auth.login_success`, `auth.login_failed`, `auth.account_blocked`, `auth.2fa_required`, `auth.password_reset`, `auth.session_closed` — ver [`_events.md`](../20-modules/_events.md).
- **Plantillas de email:** `auth.verify-email`, `auth.two-factor-code`, `auth.password-reset`, `auth.welcome` — ver [email-templates](../50-operations/email-templates.md).
- **Errores API:** familia 401 (`INVALID_CREDENTIALS`, `REFRESH_TOKEN_INVALID`, `JWT_INVALID`, `SESSION_REVOKED`, `ACCOUNT_INACTIVE`) + 403 (`ACCOUNT_BLOCKED`, `NO_PERMISSION`) — ver [api-errors](../50-operations/api-errors.md).
