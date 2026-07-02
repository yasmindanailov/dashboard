# AuthShell — Spec

> Estado: **listo · 2 variantes (DD-029)**
> Fuente actual: `frontend/app/AuthLayout.tsx` + `frontend/app/auth.module.css`
> Maqueta: `docs/design/mockup/shells/auth.html`
> Pregunta producto: **"¿Cómo entras a Aelium?"**

---

## 1. Anatomía

```
┌──────────────────────────────────┬────────────────────────────┐
│                                  │                            │
│   AURORA (55% · desktop)         │   FORM PANEL (45%)         │
│                                  │                            │
│   ┌────────────────────────┐     │   ┌──────────────────┐     │
│   │  Logo Aelium en card   │     │   │  Mobile logo     │     │
│   └────────────────────────┘     │   │  (only <1024px)  │     │
│   "Tu socio digital,             │   ├──────────────────┤     │
│    a tu lado"                    │   │  h1 form title   │     │
│                                  │   │  form sections   │     │
│   tagline secundario opt         │   │  CTA principal   │     │
│                                  │   │  link secundario │     │
│                                  │   └──────────────────┘     │
└──────────────────────────────────┴────────────────────────────┘

mobile (<1024px): aurora oculta, form full-width con logo arriba.
```

| Bloque | Token | Uso |
|---|---|---|
| `.auth-shell` | grid 55/45 desktop · 1col mobile | Wrapper raíz. |
| `.auth-shell-aurora` | gradient mesh radial brand + info | Panel de marca, decorativo + tranquilizador. |
| `.auth-shell-logo` | Card surface-primary 88px + shadow-md | Logo Aelium real (rombo + wordmark). |
| `.auth-shell-form-inner` | max-width 400px | Form centrado vertical en panel derecho. |

---

## 2. Variantes (DD-029)

### 2.1 `split-aurora` (default)

**Caso producto:**
- `/login`, `/register`, `/forgot-password`, `/reset-password`.

**Cuándo usar:**
- Forms de autenticación que esperan input del usuario (1-3 campos).
- Cliente nuevo: la aurora cuenta marca al primer contacto.

**Composición:** Aurora a la izquierda (logo + slogan + tagline) +
form al lado derecho. Mobile: aurora oculta, mobile-logo arriba del
form.

### 2.2 `centered-status`

**Caso producto:**
- `/verify-email` (confirmación tras click en enlace).
- `/reset-password/expired` (link expirado).
- `/welcome` (post-onboarding).

**Cuándo usar:**
- No hay form. Mensaje de estado + 1 CTA.
- El usuario llega aquí desde un email o tras una acción exitosa.

**Composición:** Sin aurora. Container centrado vertical + horizontal.
Icono estado (success/warning/danger) + h1 + body + CTA único.

---

## 3. Reglas de uso

- Auth **NO comparte shell** con el producto. Sin sidebar, sin topbar.
  El usuario aún no está dentro.
- **Logo Aelium real** (rombo SVG primario), no la "A" cuadrada del
  sidebar (drift D4-1 del audit).
- **Slogan visible**: "Tu socio digital, a tu lado" — frase oficial
  de marca v1.6. Versión secundaria opcional con contexto del flujo
  (registro: "Empieza hoy, sin tarjeta.").
- **Una acción primaria** por pantalla. Login: "Entrar"; register:
  "Empezar"; forgot: "Enviarme el enlace"; reset: "Cambiar contraseña".
- **Link secundario** abajo del CTA — texto pequeño, color secondary.

### Anti-patrones

- ❌ Banner promocional o anuncios en la aurora — el panel de marca
  no es marketing.
- ❌ "Login con Google" + "Login con email" + "Login con SSO" todo
  apilado igual. Si hay providers, jerarquizar (1 primario + "o usa
  email").
- ❌ Forms de >5 campos en login/register. Un alta es alta — datos
  fiscales se piden después en `/onboarding` (FormPage wizard).
- ❌ Subtitle bajo h1 que dice "Inicia sesión para acceder a tu
  cuenta". Sobrante. El título y el contexto ya lo dicen.

---

## 4. Voz de marca aplicada (DD-022)

### Title

| Pantalla | Voz Aelium |
|---|---|
| Login | **"Bienvenida de nuevo"** o **"Entra a Aelium"** |
| Register | **"Empieza con Aelium"** o **"Crea tu cuenta"** |
| Forgot | **"Recupera tu acceso"** |
| Reset | **"Elige una contraseña nueva"** |
| Verify-email · ok | **"Tu email está confirmado"** |
| Reset · expired | **"Este enlace ya caducó"** |

### CTA primaria

**Verbos directos**: "Entrar", "Empezar", "Enviarme el enlace",
"Cambiar contraseña". Nunca "Submit", "Login", "Continue".

### Link secundario

| Contexto | Voz |
|---|---|
| Login → register | "¿Aún no estás con nosotros? **Empieza aquí.**" |
| Login → forgot | "¿Olvidaste tu contraseña? **Te ayudamos.**" |
| Register → login | "¿Ya tienes cuenta? **Entra aquí.**" |

### Mensajes de error

Helpers, no asaltos. **"Ese email no nos suena. ¿Quieres registrarte?"**
(no "Invalid credentials"). **"La contraseña no coincide."** (no
"Password mismatch error code 401").

---

## 5. A11y

- `<main>` envuelve el form panel.
- h1 único = título de la pantalla.
- Labels asociados (`htmlFor`).
- Mensajes de error con `aria-live="polite"` + `role="alert"`.
- Focus inicial en el primer input (no en el logo).
- Mobile: skip a `#auth-form` desde el logo móvil.
- `prefers-reduced-motion`: aurora estática, sin animación de mesh.

---

## 6. Tokens consumidos

```
Layout       grid 55/45 desktop · max-width 400 form
Color        --brand-subtle · --info · --surface-primary · --surface-secondary
             --text-primary · --text-secondary
             --shadow-md (logo card)
             --success/warning/danger -subtle (status icons)
Tipografía   --font-size-lg (slogan) · --font-size-xl (h1) · --font-size-base (body)
             letter-spacing -0.01em (slogan) · -0.015em (h1)
Radius       --radius-lg (logo card)
Motion       respeta prefers-reduced-motion
```

---

## 7. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D4-1** | Logo legacy `/brand/logo-blue-black.svg` | Migrar a `aelium_logo_blue.svg`. |
| **D4-3** | Sin variante `centered-status` para verify-email / link-expired | Añadir variante registrada en este spec. |
| **D4-12** | GradientMesh sin `prefers-reduced-motion` confirmado | Verificar en implementación. |

---

## 8. Composición · qué componentes encajan

| Componente DS | split-aurora | centered-status |
|---|---|---|
| Input (sm/md/lg) | ✅ form fields | ❌ |
| Input · password toggle | ✅ login/register/reset | ❌ |
| Button primary | ✅ CTA | ✅ CTA único |
| AlertBanner | ✅ error global | ✅ |
| HelpTip | opt | ❌ |
| Toast | feedback post-acción | feedback post-acción |
