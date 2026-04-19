# Auth — Documentación Admin

> Sprint 1 | Abril 2026
> Audiencia: Superadmin

---

## Flujos de registro

### 1. Registro directo (sin compra)
1. El cliente introduce: nombre, email, contraseña
2. Se crea la cuenta con status `pending_verification`
3. Se envía email con link de verificación (token válido 24h)
4. **El cliente NO puede acceder al dashboard hasta verificar su email**
5. Tras verificar → status cambia a `active` → acceso completo al dashboard

### 2. Registro via compra de producto
1. El cliente introduce: nombre, email, contraseña durante el checkout
2. Se crea la cuenta con status `active` (acceso inmediato)
3. Se envía email con link de verificación
4. **El cliente PUEDE acceder al dashboard sin verificar**, pero ve notificación persistente para verificar email
5. **No puede comprar más productos** hasta verificar email

### 3. Registro de partner (futuro — Sprint Partners)
1. El partner se registra con rol `partner_pending`
2. Puede acceder al dashboard pero todo está limitado
3. Notificación persistente para verificar email
4. Incluso tras verificar email, sigue limitado hasta que un superadmin o agente apruebe su cuenta
5. Tras aprobación → rol cambia a `partner` → acceso completo a su panel

---

## Login

- Auth unificado: un solo formulario para todos los roles
- JWT con access token (15 min) + refresh token (7 días)
- El access token se envía en header `Authorization: Bearer <token>`
- El refresh token se almacena en httpOnly cookie (más seguro que localStorage)
- Al hacer login exitoso se crea un registro en la tabla `sessions`
- Cada sesión registra: IP, user agent, device label, última actividad

---

## Bloqueo por intentos fallidos

| Parámetro | Valor por defecto | Configurable |
|-----------|-------------------|--------------|
| Intentos máximos antes de bloqueo | 5 | Sí (settings: auth.max_login_attempts) |
| Duración del bloqueo | 15 minutos | Sí (settings: auth.block_duration_minutes) |

- Tras X intentos fallidos → campo `blocked_until` se setea a `now() + duración`
- El contador se resetea al desbloqueo automático (no al login exitoso intermedio)
- Los intentos fallidos se registran en `audit_access_log` con action `login_failed`

---

## Política de contraseñas

| Requisito | Valor |
|-----------|-------|
| Longitud mínima | 8 caracteres |
| Mayúscula | Al menos 1 |
| Minúscula | Al menos 1 |
| Número | Al menos 1 |
| Carácter especial | No requerido |
| Hash algorithm | bcrypt (12 rounds) |

---

## 2FA por email (superadmin + agentes)

- **Obligatorio** para roles: superadmin, agent_full, agent_billing, agent_support
- **No disponible** para clientes (por ahora)
- Método: código de 6 dígitos enviado por email
- Validez del código: 5 minutos
- El código se hashea antes de almacenar (no plaintext)
- Flujo:
  1. Login con email + contraseña exitoso
  2. Si el usuario requiere 2FA → respuesta con `requires_2fa: true`
  3. Se envía código al email del usuario
  4. El frontend muestra input para el código
  5. El usuario envía el código → si válido, se emiten los tokens JWT

---

## Tokens de seguridad

| Token | Expiración | Almacenamiento |
|-------|-----------|----------------|
| Access JWT | 15 minutos | Header Authorization |
| Refresh JWT | 7 días | httpOnly cookie |
| Verificación email | 24 horas | Link en email |
| Reset contraseña | 1 hora | Link en email |
| Código 2FA | 5 minutos | Email |

- Todos los tokens se hashean (SHA-256) antes de almacenar en la base de datos
- Los tokens expirados se limpian periódicamente (job programado)

---

## Gestión de sesiones

- El usuario puede ver sus sesiones activas (device, IP, última actividad)
- El usuario puede cerrar sesiones individuales o todas excepto la actual
- El superadmin puede ver y cerrar sesiones de cualquier usuario
- Las sesiones expiradas se limpian automáticamente

---

## Endpoints de la API

```
POST   /api/v1/auth/register          → Registro de cliente
POST   /api/v1/auth/login             → Login (paso 1)
POST   /api/v1/auth/verify-2fa        → Verificar código 2FA (paso 2)
POST   /api/v1/auth/refresh           → Renovar access token
POST   /api/v1/auth/logout            → Cerrar sesión actual
POST   /api/v1/auth/verify-email      → Verificar email con token
POST   /api/v1/auth/resend-verification → Reenviar email de verificación
POST   /api/v1/auth/forgot-password   → Solicitar reset de contraseña
POST   /api/v1/auth/reset-password    → Resetear contraseña con token
GET    /api/v1/auth/sessions          → Listar sesiones del usuario
DELETE /api/v1/auth/sessions/:id      → Cerrar una sesión específica
GET    /api/v1/auth/me                → Perfil del usuario autenticado
```

---

## Eventos emitidos

```
auth.registered       → Trigger: registro completado
auth.login_success    → Trigger: login exitoso
auth.login_failed     → Trigger: intento fallido
auth.account_blocked  → Trigger: cuenta bloqueada por intentos
auth.email_verified   → Trigger: email verificado
auth.password_reset   → Trigger: contraseña cambiada via reset
auth.session_closed   → Trigger: sesión cerrada
auth.2fa_required     → Trigger: se requiere 2FA
```
