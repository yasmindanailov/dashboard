# Bitácora F4·W3 — Auth (login · 2FA · registro · recuperar) · 2026-07-01

> Reskin **1:1** de todo el flujo de autenticación hacia los mockups
> `Login.dc.html` · `Registro.dc.html` · `RecuperarContrasena.dc.html`. Rama
> `redesign/f4-auth` **desde master** (con U24 #151 dentro). Cabeza de la **oleada
> W3**. Doctrina: Modelo A (cookies httpOnly, R17, ADR-078 A1) + Aurora split-screen
> (ADR-059) + 2FA email (ADR-013).

## 1. Verificación empírica mockup ↔ realidad (lo que pidió Yasmin)

| Elemento del mockup | Realidad (backend) | Veredicto |
|---|---|---|
| 2FA: 6 casillas | `generate2FACode` = `randomInt(100000,999999)` (6 díg.) por email | ✅ 1:1 |
| "Cuenta bloqueada" (banner) | `blocked_until` / `status='blocked'` tras N intentos | ✅ real |
| Checklist de contraseña (≥8 · mayús/minús · número · coinciden) | `RegisterDto`/`ResetPasswordDto`: `@MinLength(8)` + `@Matches` upper/lower/number | ✅ 1:1 |
| Registro: tipo cuenta + fiscal + términos | E11 (#140) ya lo construyó | ✅ (solo reskin) |
| Forgot/Reset/Verify-email | endpoints existentes; `RecuperarContrasena.dc.html` los unifica | ✅ |
| **2FA "Reenviar código"** | **NO existía endpoint** (el código solo se generaba en `login()`) | ⚠️ gap → **decisión Yasmin: añadir endpoint** |
| **Pantalla de bienvenida** ("¡Hola de nuevo, {nombre}!") | Modelo A redirige server-side (sin nombre en cliente) | ⚠️ gap → **decisión Yasmin: robusto + fiel** |

## 2. Decisiones Yasmin (durables)

- **2FA reenviar** → nuevo `POST /auth/resend-2fa` (regenera el código + reenvía email
  + devuelve un `temp_token` fresco; rate-limit 3/min R10). No revalida password: el
  `temp_token` ya prueba el paso de credenciales.
- **Pantalla de bienvenida robusta + fiel** vía **ruta `/welcome`**: login/verify-2fa
  fijan las cookies httpOnly server-side (Modelo A / R17 intacto) y hacen
  `redirect('/welcome')` (mismo mecanismo probado, solo cambia el destino). `/welcome`
  (SC autenticada) lee el nombre de la sesión (sin exponer tokens) y delega en
  `WelcomeScreen` (saludo "¡Hola de nuevo, {nombre}!" + spinner + auto-navegación al
  panel del rol + enlace de respaldo). **Por qué una ruta y no devolver `success`:**
  al devolver éxito con las cookies puestas, Next refresca la ruta `/` → `LoginPage`
  (SC) reejecuta `getServerSession()`, encuentra la sesión y redirige al panel **antes**
  de que el cliente pinte el saludo → la bienvenida no llegaba a verse (bug detectado
  por Yasmin, corregido con `/welcome`).
- **Registro** conserva **2 campos** Nombre + Apellidos (el mockup usa uno) porque el
  backend exige `first_name` + `last_name` por separado → más robusto y fiel a la realidad.

## 3. Hecho

**Backend** (`modules/auth`): `POST /auth/resend-2fa` (`Resend2faDto` + `AuthService.resend2fa`
+ `AuthLoginService.resend2fa` reusando `initiate2fa`). **+3 tests** (`auth-login.service.spec`:
token inválido · tipo != temp_2fa · reenvío OK regenera+email+token fresco, sin emitir tokens).

**Frontend** (Modelo A):
- `auth-actions`: login/verify-2fa fijan cookies + **`redirect('/welcome')`**; nueva `resend2faAction`.
  Nueva ruta **`/welcome`** (`page.tsx` SC + `WelcomeScreen` CC) = saludo autenticado + auto-navegación.
- **`AuthLayout`** reskineado 1:1: Aurora (degradado + 3 blobs animados) + eyebrow + **titular
  y value-props por página** (`auth-panels.tsx`: LOGIN/REGISTER/RECOVER) + footer; logo del form
  siempre visible.
- **`auth.module.css`**: aurora + banners con icono + **casillas 2FA** + icon-wells +
  **pantallas de resultado** (icon-well 64px + h1 + CTA) + inputs/labels/botones al mockup.
- **Login** (`LoginForm`): credenciales (banners expired/blocked/error) + **2FA de 6 casillas**
  (auto-avance + pegar) + **"Reenviar código"** + **pantalla de bienvenida** (auto-navega).
- **Registro** (`RegisterForm`): reskin (tipo cuenta + fiscal condicional + **checklist 2×2**
  compartido + IVA hint + términos) + pantalla "Revisa tu correo".
- **Recuperar** (`ForgotPasswordForm` / `ResetPasswordForm` / `reset-password/page` /
  `verify-email/page`): forms + **result screens** (Revisa tu email · Contraseña actualizada ·
  Enlace inválido · Email verificado · Error de verificación) 1:1.
- Compartidos nuevos: `auth-panels.tsx`, `_components/PasswordChecklist.tsx`,
  `auth-components/SubmitSpinner`. Se retiró `framer-motion` de los forms de auth.

## 4. DoD ✅ (2026-07-01)

- **backend**: typecheck + lint + **1536** test (+3) + **boot smoke 4/4** (`/api/v1/auth/resend-2fa`
  mapeado · `[internal, manual, enhance_cp, resellerclub]`).
- **frontend**: typecheck + lint (0 warn) + **96** test + build.

**⚠️ Re-smoke visual (Yasmin):** las 5 pantallas y sus estados —
Login (credenciales · sesión expirada · cuenta bloqueada · error · **2FA** · **bienvenida**) ·
Registro (personal/autónomo/empresa · éxito) · Recuperar (forgot · enviado · reset+checklist ·
actualizada · enlace inválido) · Verify-email (verificado · error). Verde de build/tests NO cubre
regresión visual.
