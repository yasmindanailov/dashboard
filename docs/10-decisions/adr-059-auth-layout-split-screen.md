# ADR-059 — Arquitectura de auth layout (split-screen Aurora Digital)

> **Status:** Active
> **Date:** 2026-04 (Sprint 7.5 · D27) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §48
> **Domain:** ui

---

## Contexto

Las **5 páginas de autenticación** (login, register, forgot-password, reset-password, verify-email) tenían serios problemas de calidad:

- **~105 `style={{}}` inline** dispersos por las páginas — imposible mantener consistencia.
- **~28 colores hex hardcodeados** — sin tokens semánticos, sin alineación con design system.
- **Cada página montaba su propia instancia de `GradientMesh`** (canvas pesado, animación Aurora Digital) — performance deficiente, 5 instancias del mismo canvas en navegación.
- **No había layout compartido** — cada página re-implementaba el wrapper.
- **Logo era texto hardcodeado ("aelium")** sin el SVG real de la marca.
- **Experiencia visualmente desconectada de la landing** (Aurora Digital) — el usuario llegaba de un mundo y aterrizaba en otro.

El Sprint 7.5 (D27) abordó la refactorización completa con un patrón estándar de la industria.

---

## Decisión

### Patrón elegido: split-screen 55%/45%

**Aurora Digital | Form** — idéntico al usado por **Stripe, Vercel, Clerk, Supabase**.

**Justificación:**

1. **Continuidad de marca:** El usuario llega de la landing (Aurora Digital animation) y ve la **misma animación** en el auth → transición mental fluida.
2. **Single mount de GradientMesh:** Canvas pesado montado **una vez en el layout**, no 5 veces en cada page → mejor performance, menos jank.
3. **Responsive:** A `<1024px`, el panel Aurora se oculta y el form ocupa 100% con logo arriba → móvil limpio.

### Arquitectura de archivos

```
app/
  AuthLayout.tsx           ← Layout compartido (split-screen)
  auth.module.css          ← CSS module único (24 clases, zero hex, zero Tailwind)
  auth-components.tsx      ← Shared sub-components (EyeIcon, PasswordCheck) — DRY
  page.tsx                 ← Login (Suspense → credentials → 2FA → redirect)
  register/page.tsx        ← Register (form → verify email success)
  forgot-password/page.tsx ← Forgot (email → success, anti-enumeration)
  reset-password/page.tsx  ← Reset (Suspense + token → new password → success)
  verify-email/page.tsx    ← Verify (Suspense + auto-verify on mount)
```

### Panel izquierdo (Aurora Digital)

- `GradientMesh` (Canvas 2D, Aurora Digital — **misma animación de la landing**).
- Logo SVG real (`/brand/logo-blue-black.svg`) en card glassmorphism.
- Slogan "Tu socio digital, a tu lado" con animación cascada (fadeInUp).
- **El panel es decorativo** — nunca contiene formularios ni inputs.

### CSS Module: `auth.module.css`

Todas las clases de auth viven en un **único CSS module**. Reglas:

- **Todo valor de color viene de `globals.css`** (tokens semánticos).
- **Todo spacing usa `var(--space-*)`** — escalas semánticas, no pixeles arbitrarios.
- **Focus states:** `var(--brand)` ring + `var(--brand-subtle)` glow.
- **Alerts:** 3 variantes (danger, success, info) con tokens `--*-light` + `--*-border`.
- **Zero hex colors. Zero Tailwind.** Solo CSS module + tokens.

### Tokens semánticos de border (añadidos a `globals.css`)

```
--success-border: rgba(16, 185, 129, 0.15)
--warning-border: rgba(245, 158, 11, 0.15)
--danger-border:  rgba(239, 68, 68, 0.15)
--info-border:    rgba(59, 130, 246, 0.15)
```

Esto elimina los últimos `rgba()` literales del módulo auth — todo viene de tokens.

### Patrones aplicados en cada página

#### Login (`page.tsx`)

- Suspense para detectar query params (`?expired=true`, `?next=...`).
- Flujo: credentials → 2FA → redirect (a `next` o a `/dashboard`).
- Detección de **`?expired=true`** muestra AlertBanner info: *"Tu sesión ha expirado. Inicia sesión de nuevo."* — sin bloquear el formulario.

#### Register (`register/page.tsx`)

- Form de registro → success page con mensaje "Verifica tu email".
- No login automático aquí — el usuario debe verificar primero.

#### Forgot password (`forgot-password/page.tsx`)

- **Anti-enumeration:** el formulario **siempre muestra el mensaje de éxito**, independientemente de si el email existe en el sistema.
- Esto previene la enumeración de emails por un atacante.
- Si el email existe → email de reset enviado. Si no existe → no se envía nada, pero el usuario ve éxito.

#### Reset password (`reset-password/page.tsx`)

- Suspense + token validation.
- Token inválido o expirado → mensaje de error sin permitir reset.
- Token válido → form de nueva contraseña → success.

#### Verify email (`verify-email/page.tsx`)

- Suspense + auto-verify on mount (sin click manual).
- Mensajes claros para casos: éxito · token inválido · ya verificado.

### Componentes compartidos (DRY)

`auth-components.tsx` exporta:
- **`EyeIcon`** — toggle de visibilidad de password (usado en login, register, reset).
- **`PasswordCheck`** — indicador visual de fortaleza de password (usado en register, reset).

Sin esto, cada página re-implementaba estos componentes con divergencias visuales.

### Quality hardening (D27.1)

6 fixes post-migración aplicados como pulido final:

1. **`ContextBackLink`:** `<a>` → `<Link>` (SPA navigation, no full reload).
2. **`DetailPage`:** import duplicado unificado.
3. **Alert borders:** `rgba()` → tokens `--*-border`.
4. **Login:** detección de `?expired=true` con AlertBanner.
5. **DRY:** `auth-components.tsx` (EyeIcon, PasswordCheck compartidos).
6. **Backend:** `sequence_number` refetch en 3 métodos de creación de tickets (relacionado pero parte del mismo sprint).

### Mejoras futuras identificadas (no implementadas en D27)

- Auto-focus en primer input.
- Metadata por página (pestaña del navegador con título específico).
- Footer legal (GDPR: © + Privacidad + Términos).
- Redirect con `?next=` (volver a donde estabas tras login) — **base ya añadida**, falta UX completa.
- CSS autofill styling (neutralizar colores de Chrome).
- OTP Input (6 cajas individuales para 2FA).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Continuidad visual landing → auth** — el usuario no nota cambio brusco.
  - **Performance mejorada** — 1 instancia de GradientMesh en lugar de 5.
  - **CSS mantenible** — todos los tokens, sin hex, sin Tailwind, sin estilos inline.
  - **Anti-enumeration** en forgot-password — security por diseño.
  - **DRY** — componentes reutilizados.
  - **Patrón estándar de la industria** — fácil de entender para devs nuevos.
- ⚠️ **Aceptamos:**
  - **GradientMesh siempre montado** en auth (incluso si el usuario no lo ve por mobile <1024px) — el componente decide internamente no renderizar el canvas en mobile. Coste: validación que el componente lo respeta.
  - **Refactor grande de un sprint** (Sprint 7.5 D27) — bloqueó otros frentes durante esa semana.
  - **Mejoras pendientes** (auto-focus, OTP input) → UX no es 100% pulida todavía.
- 🚪 **Cierra:**
  - **No volver a estilos inline** en auth pages.
  - **No hex hardcodeado** en auth — todo vía tokens.
  - **No múltiples instancias de GradientMesh** — una en el layout, punto.
  - **No formularios en el panel izquierdo** — siempre decorativo.

---

## Cuándo revisar

- Si surge necesidad de auth multi-paso compleja (SSO con Google/Microsoft, magic link) → revisar el layout para acomodar más pasos sin romper el split-screen.
- Si la landing rediseña Aurora Digital → coordinar para que auth no quede desincronizado visualmente.
- Si métricas muestran abandono alto en alguna página de auth (ej: register) → revisar UX específica de esa página manteniendo el layout.
- Si las mejoras pendientes (OTP input, autofocus, footer legal) generan fricción real → priorizar Sprint UI específico.

---

## Referencias

- **Módulos afectados:** ui (auth pages), auth (backend valida tokens y sesiones — sin cambio en este ADR).
- **Reglas relacionadas:** R14 (no tragar errores frontend), R15 (límites de archivo — Sprint 7.5 dividió monolitos de auth).
- **ADRs relacionados:** ADR-005 (stack frontend), ADR-013 (2FA — login flow), ADR-014 (bloqueo intentos — visible en login), ADR-058 (integración landing — Aurora Digital compartida).
- **Glosario:** [Aurora Digital](../00-foundations/glossary.md), [GradientMesh](../00-foundations/glossary.md), [Glassmorphism](../00-foundations/glossary.md), [Anti-enumeration](../00-foundations/glossary.md).
- **Implementación:** `frontend/app/(auth)/AuthLayout.tsx`, `frontend/app/(auth)/auth.module.css`, `frontend/app/(auth)/auth-components.tsx`.
- **Sprint:** 7.5 (D27 + D27.1 hardening).
