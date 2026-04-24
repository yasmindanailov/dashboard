# Auth Module — Documentación de administración

> Módulo: `auth`
> Sprint: 1 (Backend) + 2 (Emails) + 3 (Frontend) + 3.5 (Hardening) + 7.5 (Design System)
> Estado: ✅ Completo

---

## Resumen

El módulo Auth gestiona todo el ciclo de autenticación: registro, verificación de email, login con 2FA, sesiones JWT, recuperación de contraseña, y gestión de sesiones activas.

---

## Endpoints de la API

| Método | Ruta | Autenticado | Descripción |
|--------|------|-------------|-------------|
| POST | `/auth/register` | No | Crear cuenta de cliente |
| POST | `/auth/login` | No | Login — devuelve tokens o challenge 2FA |
| POST | `/auth/verify-2fa` | No | Verificar código 2FA (paso 2 del login) |
| POST | `/auth/refresh` | No | Renovar access token con refresh token |
| POST | `/auth/logout` | Sí | Cerrar sesión actual |
| POST | `/auth/verify-email` | No | Verificar email con token del enlace |
| POST | `/auth/resend-verification` | No | Reenviar email de verificación |
| POST | `/auth/forgot-password` | No | Solicitar email de recuperación |
| POST | `/auth/reset-password` | No | Restablecer contraseña con token |
| GET | `/auth/sessions` | Sí | Listar sesiones activas |
| DELETE | `/auth/sessions/:id` | Sí | Revocar una sesión específica |
| GET | `/auth/me` | Sí | Obtener perfil del usuario actual |

---

## Páginas del frontend

| Ruta | Función |
|------|---------|
| `/` | Login (credenciales + 2FA) |
| `/register` | Registro de nuevo cliente |
| `/verify-email?token=` | Verificación de email (automática) |
| `/forgot-password` | Solicitar recuperación de contraseña |
| `/reset-password?token=` | Restablecer contraseña |
| `/dashboard` | Dashboard post-login |

---

## Flujos de usuario

### Registro
1. Usuario rellena nombre, apellido, email, contraseña + confirmación
2. Backend crea usuario con `status: pending_verification`
3. Se envía email de verificación (plantilla HTML con branding Aelium)
4. Frontend muestra mensaje "Revisa tu email"

### Verificación de email
1. Usuario hace clic en el enlace del email
2. Frontend navega a `/verify-email?token=xxx`
3. Token se valida automáticamente al cargar
4. Éxito → muestra botón "Iniciar sesión"

### Login
1. Usuario introduce email y contraseña
2. Si 2FA está habilitado → se envía código por email → paso 2FA
3. Si no tiene 2FA → devuelve access + refresh tokens directamente
4. Tokens se guardan en localStorage
5. Redirect a `/dashboard`

### Recuperación de contraseña
1. Usuario introduce email en `/forgot-password`
2. Backend envía email con enlace (siempre responde OK para prevenir enumeración)
3. Usuario hace clic en enlace → `/reset-password?token=xxx`
4. Introduce nueva contraseña con confirmación
5. Éxito → botón "Iniciar sesión"

---

## Seguridad

| Concepto | Implementación |
|----------|---------------|
| Hashing de contraseñas | bcrypt (12 rounds) |
| Tokens de verificación/reset | SHA-256 (solo hash en DB, token real en email) |
| Bloqueo por intentos | `blocked_until` configurable (15 min por defecto) |
| 2FA | Código 6 dígitos por email, single-use, 5 min expiración |
| Rate limiting | `@nestjs/throttler` en todos los endpoints |
| Prevención enumeración | Forgot password siempre responde 200 OK |

---

## Plantillas de email

| Plantilla | Asunto | Uso |
|-----------|--------|-----|
| `verificationEmail` | Verifica tu email — Aelium | Registro |
| `twoFactorEmail` | Código de verificación Aelium | Login con 2FA |
| `welcomeEmail` | Bienvenido a Aelium | Post-verificación |
| `passwordResetEmail` | Recupera tu contraseña — Aelium | Forgot password |

Todas las plantillas usan branding Aelium (color #3B82F6, DM Sans).

---

## Validación de contraseña (frontend)

- Mínimo 8 caracteres
- Al menos una mayúscula
- Al menos una minúscula
- Al menos un número
- Confirmación de contraseña (debe coincidir)
- Indicador visual en tiempo real (verde ✓ / gris ○)

---

## Hardening (Sprint 3.5)

| Fix | Descripción |
|-----|-------------|
| Email lowercase | Todos los emails se normalizan a minúsculas en register, login, forgot, resend |
| Token invalidation | Al generar nuevo token de verificación/reset, los anteriores se invalidan |
| Welcome email | Se envía email de bienvenida tras verificar el email |
| HTML sanitization | `escapeHtml()` en todos los inputs de usuario en plantillas de email |
| AuthProvider | Contexto centralizado: protección de rutas, auto-refresh, auto-redirect |
| Resend verification | Login con email no verificado muestra botón "Reenviar verificación" |
| Strict mode fix | `useRef` guard en verify-email para evitar double-fire |

---

## Design System Migration (Sprint 7.5 — D27/D27.1)

### Layout split-screen
Todas las páginas de autenticación usan `AuthLayout`:
- **55% izquierda**: Aurora Digital (Canvas gradient mesh) + logo glassmorphism card
- **45% derecha**: Formulario con tokens DS
- **Mobile**: panel form full-width + logo arriba

### CSS module: `auth.module.css`
24 clases semánticas. **Zero hex**, **zero Tailwind**.
Todas las propiedades de color usan `var(--token)`.

### Componentes compartidos: `auth-components.tsx`
Extraído en D27.1 para DRY (eliminadas ~90 líneas duplicadas):
- `EyeIcon` — toggle password visibility
- `PasswordCheck` — indicador visual de requisitos

### Sesiones expiradas
Login detecta `?expired=true` (query param inyectado por `AuthProvider` al expirar la sesión) y muestra `AlertBanner info` “Tu sesión ha expirado, inicia sesión de nuevo.”

---

## Archivos clave

```
backend/
  src/modules/auth/
    auth.module.ts          ← Módulo NestJS
    auth.service.ts         ← Lógica de negocio (12 métodos)
    auth.controller.ts      ← 12 endpoints
    dto/auth.dto.ts         ← DTOs con class-validator
    guards/jwt-auth.guard.ts
    strategies/jwt.strategy.ts

  src/core/email/
    email.service.ts        ← Servicio de envío (nodemailer)
    templates/auth.templates.ts ← 4 plantillas HTML + escapeHtml

frontend/
  app/AuthLayout.tsx        ← Split-screen layout (Aurora + form)
  app/auth.module.css       ← 24 clases, zero hex (D27)
  app/auth-components.tsx   ← EyeIcon + PasswordCheck (D27.1 DRY)
  app/page.tsx              ← Login (credenciales + 2FA + ?expired)
  app/register/page.tsx     ← Registro (password checks §4.6)
  app/verify-email/page.tsx ← Verificación (auto + Suspense)
  app/forgot-password/page.tsx ← Recuperación (anti-enumeración)
  app/reset-password/page.tsx  ← Reset (Suspense + token)
  app/lib/api.ts            ← API client (authApi)
  app/lib/auth-context.tsx  ← AuthProvider (route guard + auto-refresh)
  public/brand/             ← Logo SVGs (logo-blue-black.svg)
```

## Ref

- DECISIONS.md §48 (Auth Layout split-screen)
- DESIGN_SYSTEM.md (AuthLayout, auth-components, auth.module.css)
- UI_SPEC.md §5.13 (Auth pages — especificación)
- ROADMAP.md D27, D27.1
