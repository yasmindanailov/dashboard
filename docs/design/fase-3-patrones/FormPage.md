# FormPage — Spec

> Estado: **listo · 3 variantes (DD-029)**
> Fuente actual: `frontend/app/components/ui/FormPage/FormPage.{tsx,module.css}`
> Maqueta: `docs/design/mockup/patterns/form-page.html`
> Pregunta producto: **"¿Qué necesito rellenar?"**

---

## 1. Anatomía

```
┌──────────────────────────────────────────────────────────┐
│ BREADCRUMB                                               │
│  Productos > Nuevo producto                              │
├──────────────────────────────────────────────────────────┤
│ FORM HEADER                                              │
│  h1 (sin subtitle, sin CTA derecha)                      │
├──────────────────────────────────────────────────────────┤
│ STEPPER (solo wizard)                                    │
│  ① Datos básicos ─ ② Configuración ─ ③ Confirmación     │
├──────────────────────────────────────────────────────────┤
│ TOC (solo long-form)        FORM SECTIONS                │
│  ─ Información              ┌──────────────────────────┐ │
│  ─ Configuración            │ Card: Información básica │ │
│  ─ Notificaciones           │  [Input] [Input] [Select]│ │
│  ─ Permisos                 └──────────────────────────┘ │
│                              ┌──────────────────────────┐│
│                              │ Card: Configuración      ││
│                              │  [Select] [Textarea]     ││
│                              └──────────────────────────┘│
├──────────────────────────────────────────────────────────┤
│ FORM ACTIONS (sticky cuando >2vh · default no sticky)    │
│  (helper opt)         [Cancelar]  [Guardar]              │
└──────────────────────────────────────────────────────────┘
```

| Bloque | Token | Uso |
|---|---|---|
| `.form-page` | `max-width: 1200px` · `gap: --space-6` | Wrapper raíz. |
| `.fp-title` | `--font-size-xl` · `letter-spacing: -0.015em` | h1. Sin subtitle (UI_SPEC §2.6). |
| `.fp-sections` | `gap: --space-5` | Cards apiladas. |
| `.fp-actions` | `flex end` · `gap --space-3` | Cancelar (secondary) + Guardar (primary). |
| `.fp-actions.sticky` | `position: sticky bottom 0` + backdrop-filter | Activa cuando form >2× viewport. |

---

## 2. Variantes (DD-029)

### 2.1 `standard` (default)

**Caso producto:**
- `/admin/products/new` — alta de producto (3-4 secciones).
- `/admin/users/new` — alta de usuario.
- `/cliente/billing/payment-method/new` — añadir método de pago.

**Cuándo usar:**
- Form con 1-5 secciones, lineales.
- El usuario rellena top-to-bottom y envía.
- No hay ramificación ni revisión por pasos.

**Composición:** Cards con `<section>` + título + grid 2-4 cols de
inputs. Sticky off por defecto.

### 2.2 `wizard` (multi-paso)

**Caso producto:**
- `/cliente/onboarding` — alta del cliente: datos empresa → preferencias
  → conectar primer servicio → confirmación.
- `/admin/clientes/new` con flujo guiado — empresa → contactos →
  servicios contratados → resumen.
- `/auth/setup-2fa` — escanear QR → introducir código → backup codes.

**Cuándo usar:**
- El form **ramifica** según respuestas previas (paso 3 depende de paso 1).
- El usuario necesita saber **cuánto le queda** (progreso visible).
- Hay un paso de "confirmación" antes de enviar.

**Cuándo NO usar:**
- Form lineal corto (3-4 campos) — wizard es overhead.
- "Cuestionario interminable" — fragmenta en formularios separados o usa
  long-form con TOC.

**Stepper:**
- Top de la página, dentro del wrapper. Card neutra
  (`surface-primary + border + radius-lg`). **Sin rombo** (DD-030).
- Cada paso: número en círculo + label.
- Estados: `is-current` (brand fill), `is-done` (success-subtle bg, success
  fg), default (tertiary).
- Separadores entre pasos: `1px` línea horizontal `--border`.

**Acciones:** "Atrás" (secondary, sin border en step 1) + "Siguiente"
(primary). En último paso: "Confirmar y crear" (primary). Helper `fp-actions-secondary`
("Paso 2 de 4 · te queda 1 minuto") opcional.

### 2.3 `long-form` (con TOC)

**Caso producto:**
- `/cliente/settings` — perfil + notificaciones + facturación + seguridad
  + privacidad + integraciones.
- `/admin/settings` — settings globales del workspace.
- `/cliente/billing/details` — datos fiscales + dirección + IVA + método
  de pago + ciclo de facturación.

**Cuándo usar:**
- >5 secciones independientes.
- El usuario llega a "una sección concreta" — el TOC es navegación, no
  decoración.
- Cada sección puede guardarse de forma independiente (autosave por
  card) o todas a la vez al final.

**Cuándo NO usar:**
- 3-5 secciones — `standard` ya basta. TOC pediría espacio que no se aprovecha.
- El form es secuencial (orden importa) — usa wizard.

**TOC:**
- Sticky a la izquierda 220px. Card neutra.
- Links scroll-to-section con `id` en cada `<section>`.
- `is-active` (brand-subtle bg + brand-active fg) sigue al scroll
  (intersection observer en implementación).
- En mobile (<1024px) colapsa: TOC se oculta o se transforma en select.

**Acciones:** Sticky bottom **siempre** (la página supera 2vh por
naturaleza). "Cancelar" + "Guardar" o "Cancelar" + "Guardar
y cerrar".

---

## 3. Reglas de uso

### Header

- **Solo título.** Sin subtitle (UI_SPEC §2.6). Sin CTA. La acción es
  `fp-actions` al final.
- Breadcrumb integrado en el wrapper — **la página NUNCA renderiza un
  Breadcrumb suelto**.

### Sections

- Agrupar campos por **propósito**, no por tipo. "Identidad" (nombre,
  empresa, NIF), no "Inputs de texto".
- Máximo 4-5 campos por sección. Si supera: divide en otra sección o
  promociona a long-form.
- Cada sección con título h2 dentro de la Card y `id` para deeplink.

### Actions

- **Cancelar (secondary)** + **Guardar (primary)**. En este orden,
  flex-end.
- **Sin background, sin border en default** — los botones flotan en
  el espacio natural. Solo cuando `actionsSticky=true` aparece la
  separación visual (border-top, blur, bg).
- Helper opcional a la izquierda con `fp-actions-secondary`: "Te
  enviamos las credenciales por email cuando termine el setup".

### Anti-patrones

- ❌ Subtitle bajo h1 ("Crea un nuevo producto rellenando los campos
  abajo"). Sobrante. El título y la sección ya lo dicen.
- ❌ CTA primario en el header ("Guardar arriba a la derecha"). El
  CTA va abajo, donde el usuario termina.
- ❌ Sticky actions siempre. Default off — solo si form excede 2× viewport.
- ❌ Wizard cuando standard ya funciona. Stepper genera fricción si los
  pasos no son ramificados.
- ❌ Long-form sin TOC ("ya scrollea el usuario"). El TOC es la
  diferencia entre form-largo y long-form.

---

## 4. Voz de marca aplicada (DD-022)

### Title

Sustantivo + verbo si aplica: **"Nuevo cliente"**, **"Editar factura
INV-00042"**, **"Configurar 2FA"**. No "Form to create..." ni "Add new...".

### Section titles (h2)

Voz de hoja: **"Cómo te llamamos"**, **"Dónde te enviamos las
facturas"**, **"Tu equipo"**, **"Notificaciones que recibes"**. No
"Personal info" / "Address" / "Team".

### Helper de acciones

| Genérico | Aelium |
|---|---|
| "All fields are required" | (silencio · marcar opcionales con label `(opcional)`) |
| "Saving..." | Botón en estado loading — no añadir helper |
| "Form saved successfully" | Toast: "Perfil actualizado" |
| "Please review the errors below" | Toast: "Revisa los campos marcados" |

### Wizard step labels

Sustantivo concreto: **"Datos de empresa"**, **"Tu primer servicio"**,
**"Confirmar y crear"**. No "Step 1" ni "Information".

### Cancel button

Cuando hay datos no guardados: "Cancelar" abre modal confirm:

> "¿Salir sin guardar?
> Perderás lo que llevas escrito en este formulario."
> [No, sigo aquí] [Sí, salir]

(Modal voice DD-022.)

---

## 5. A11y

- `<main role="main">` envuelve `.form-page`.
- `<form>` con `aria-labelledby` apuntando al h1.
- Cada Card-section es `<section aria-labelledby="section-id">`.
- Wizard: stepper con `<ol role="list">`, paso actual con
  `aria-current="step"`. Pasos completados con texto visible "completado"
  para SR.
- Long-form TOC: `<nav aria-label="Secciones del formulario">`,
  links activan focus en `<section>` destino.
- Sticky actions: el botón submit nunca cubre el contenido al hacer
  focus (scroll-margin-bottom en cada section).
- Validación: errores resumidos al inicio del form con
  `role="alert"` + lista de links a campos. Cada campo con
  `aria-invalid` y `aria-describedby="errid"`.

---

## 6. Tokens consumidos

```
Layout       max-width 1200 · gap --space-6
             grid 220 + flex (long-form) · stepper inline
Tipografía   --font-size-xl (h1) · --font-size-sm (steps, links)
             tabular-nums (números de paso)
Color        --text-primary · --text-secondary · --text-tertiary
             --brand · --brand-subtle · --brand-active
             --success · --success-subtle (paso done)
             --surface-primary · --surface-secondary · --surface-tertiary
             --border
Radius       --radius-lg (stepper, TOC, cards) · --radius-full (step number) · --radius-sm (link)
Backdrop     blur 8px (sticky actions)
```

---

## 7. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D3-6** | Sin actionsSticky | Añadir prop `actionsSticky?: boolean` (default false). CSS sticky implementado. |
| **D3-8** | Sin variantes nativas | Añadir `variant?: 'standard' \| 'wizard' \| 'long-form'` + `steps?` + `currentStep?` + `toc?`. |
| **D3-9** | Title con `font-size: 24px` hardcoded | Migrar a `var(--font-size-xl)`. |
| **D3-11** | Actions sin separación visual cuando no sticky | `border-top: 1px solid transparent` default → `--border` cuando sticky. |

---

## 8. Materialización

`docs/design/mockup/patterns/form-page.html` — 3 variantes apiladas con
caso producto real, voz Aelium, sin rombo decorativo (DD-030).

---

## 9. Composición · qué componentes encajan

| Componente DS | Standard | Wizard | Long-form |
|---|---|---|---|
| Breadcrumb | ✅ | ✅ | ✅ |
| Card (form section) | ✅ | ✅ por paso | ✅ por sección |
| Input (sm/md/lg) | ✅ | ✅ | ✅ |
| Input · password toggle | ✅ | ✅ | ✅ |
| Input · prefix/suffix | ✅ | ✅ | ✅ |
| Select | ✅ | ✅ | ✅ |
| Textarea | ✅ | ✅ | ✅ |
| Dropdown · multi-select | ✅ | ✅ | ✅ |
| Dropdown · searchable | ✅ | ✅ | ✅ |
| Button (primary/secondary) | ✅ actions | ✅ pasos + actions | ✅ actions |
| HelpTip | opt | opt | opt |
| AlertBanner | error global opt | error global opt | error global opt |
| Toast | feedback final | feedback paso/final | feedback save |
| Modal (confirm cancel) | ✅ | ✅ | ✅ |
