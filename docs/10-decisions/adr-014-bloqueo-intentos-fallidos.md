# ADR-014 — Bloqueo de cuenta por intentos fallidos

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 1) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §20 (parcial)
> **Domain:** auth, security

---

## Contexto

Sin protección contra intentos masivos de login, un atacante puede hacer **fuerza bruta** sobre la password de un usuario o **credential stuffing** (probar combos email/password filtrados de otros sites).

Las defensas necesarias:

1. **Limitar intentos** sobre la misma cuenta (anti fuerza bruta a una cuenta concreta).
2. **Rate limit a nivel IP** (anti ataque a múltiples cuentas desde un mismo origen — implementado en ADR-016).
3. **Notificar al usuario** cuando su cuenta es bloqueada.
4. **No revelar** si un email existe o no en el sistema (para no facilitar enumeración).

---

## Opciones consideradas

1. **Bloqueo permanente** tras N intentos hasta intervención manual del admin.
   - Pros: máxima seguridad.
   - Contras: UX terrible — el usuario legítimo que olvida su password se queda fuera hasta hablar con un admin.

2. **Bloqueo temporal con duración exponencial** (1 min, 5 min, 30 min, 24 h…).
   - Pros: balance seguridad/UX.
   - Contras: complejidad mayor en la lógica. Requiere recordar el "nivel" de bloqueo previo.

3. **(Elegida)** **Bloqueo temporal lineal con duración configurable.** Tras N intentos fallidos consecutivos, la cuenta queda bloqueada X minutos. Reset del contador con login exitoso.
   - Pros: simple de implementar, configurable por settings, suficientemente protector.
   - Contras: si el atacante espera N minutos, puede volver a intentar (mitigado por rate limit IP en ADR-016).

---

## Decisión

### Configuración (settings categoría `auth`)

| Key | Default | Descripción |
|-----|---------|-------------|
| `max_login_attempts` | 5 | Intentos fallidos consecutivos antes de bloqueo |
| `block_duration_minutes` | 15 | Duración del bloqueo |

### Lógica

```
Al fallar login:
  1. Incrementar User.login_attempts.
  2. Si User.login_attempts >= max_login_attempts:
     - Set User.blocked_until = now() + block_duration_minutes.
     - Emitir evento 'auth.account_blocked' { userId, attempts }.
     - (Listener planificado: notificar al superadmin si el rol bloqueado es agent/superadmin).
  3. Devolver error genérico "Credenciales incorrectas" SIN revelar si el email existe.

Al iniciar login:
  1. Si User.blocked_until > now() → 403 "Tu cuenta ha sido bloqueada. Contacta con soporte."
  2. Si no, validar password normalmente.

Al login exitoso:
  1. Reset User.login_attempts = 0.
  2. Reset User.blocked_until = null.
```

### Mensajes al usuario

- **Login fallido:** `"Credenciales incorrectas"` (no revela si el email existe — anti enumeración).
- **Cuenta bloqueada:** `"Tu cuenta ha sido bloqueada. Contacta con soporte."` (no revela cuándo se desbloquea — anti reconnaissance).
- **Email automático opcional:** envío de email al usuario informando del bloqueo + link para cambiar password (mitigación: si fue el propio usuario, le aclara la situación; si fue un atacante, el usuario legítimo se entera). **Estado actual: NO implementado**, pendiente de añadir como mejora.

### Recuperación

- **El usuario espera** `block_duration_minutes` y vuelve a intentar.
- **El admin desde UI** puede desbloquear manualmente (set `blocked_until = null`). Útil si el usuario contacta inmediatamente.
- **El usuario puede usar `/auth/forgot-password`** durante el bloqueo. El reset de password también desbloquea la cuenta (decisión: la nueva password lleva consigo la prueba de control del email).

---

## Consecuencias

- ✅ **Ganamos:**
  - Protección razonable contra fuerza bruta.
  - Configurable sin redeploy (settings en BD).
  - UX recuperable (15 min bloqueo, no permanente).
  - No revelamos enumeración de cuentas existentes.
- ⚠️ **Aceptamos:**
  - Atacante con paciencia puede esperar 15 min y reintentar. Mitigado por rate limit IP (ADR-016).
  - Si un atacante usa **credential stuffing distribuido** (múltiples IPs probando la misma cuenta), el bloqueo se dispara y deja al usuario legítimo fuera 15 min — vector de DoS contra usuarios concretos. Aceptamos el trade-off.
  - **Notificación email al bloqueo** pendiente de implementar (mejora futura).
- 🚪 **Cierra:**
  - **No bloqueo permanente** sin intervención del admin.
  - **No mensajes diferenciados** "este email no existe" vs "password incorrecta" — ambos devuelven el mismo error.

---

## Cuándo revisar

- Si surgen ataques distribuidos (credential stuffing real) que aprovechan el bloqueo para DoS sobre cuentas concretas: añadir CAPTCHA tras N fallos del mismo email aunque desde IPs distintas.
- Si los defaults (5 intentos / 15 min) resultan inapropiados en uso real: ajustar settings.
- Si Aelium gestiona cuentas críticas (admin de bancos, etc.) que justifican lockout más estricto: ADR nuevo.

---

## Referencias

- **Módulos afectados:** auth.
- **Reglas relacionadas:** R7 (errores se notifican).
- **ADRs relacionados:** ADR-011 (roles), ADR-012 (CASL), ADR-013 (2FA), ADR-016 (rate limit).
- **Implementación:** `backend/src/modules/auth/auth-login.service.ts:handleFailedLogin()`, columnas `User.login_attempts` y `User.blocked_until`.
- **Edge cases:** EC-3.5.1 (lowercase de email).
