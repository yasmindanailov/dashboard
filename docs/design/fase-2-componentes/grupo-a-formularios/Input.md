# Input — Spec

> Estado: **listo · revisar junto con Button como modelo de la fase 2.A**
> Fuente actual: `frontend/app/components/ui/Input/Input.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/input.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────┐
│ Label                                   │  ← --font-size-sm · medium
│ ┌─────────────────────────────────────┐ │
│ │ [icon]  value           [icon]      │ │  ← container + input + leftIcon? + rightIcon?
│ └─────────────────────────────────────┘ │
│ Helper text  · ó ·  Error message      │  ← --font-size-xs · tertiary | danger
└─────────────────────────────────────────┘
```

| Parte | Token | Uso |
|---|---|---|
| `field` (wrapper) | `gap: var(--space-1_5)` | Vertical: label, control, helper. |
| `field-label` | `--font-size-sm` · `--font-weight-medium` · `--text-primary` | Texto de label. Asociar via `htmlFor` + `id`. |
| `field-control` | relative | Para posicionar iconos absolutos. |
| `input` | `--font-size-base` · `--text-primary` · `--surface-primary` · `--border` · `--radius-sm` | El input real. |
| `field-icon` | `--text-tertiary` · `--icon-size-md` | Icono prefijo o sufijo. Decorativo (pointer-events: none). |
| `field-helper` | `--font-size-xs` · `--text-tertiary` | Texto de ayuda. |
| `field-error` | `--font-size-xs` · `--danger` | Mensaje de validación. **Reemplaza** al helper. |

---

## 2. Tamaños (DD-NEW · cubre D2A-4)

Resolución de heterogeneidad detectada en audit: Input pasa a tener
sm/md/lg para alinearse con Button y Select. Todos los formularios siguen
la misma escala.

| Tamaño | Padding | Font-size | Min-height | Uso |
|---|---|---|---|---|
| `sm` | `--space-1_5 --space-3` | `--font-size-sm` | 32px | Filas de tabla densas, FilterBar. |
| `md` (default) | `--space-2 --space-3` | `--font-size-base` | 36px | Formularios estándar. |
| `lg` | `--space-2_5 --space-4` | `--font-size-md` | 44px | Auth, hero cliente. |

Activar tamaño con la clase `.field-sm` / `.field-md` / `.field-lg` en el
wrapper `.field`.

---

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** | `border: --border`. Label visible, value vacío o con valor. |
| **hover** (sin focus) | `border: --border-hover`. Indicador de interactividad. |
| **focus-visible** | `border: --brand` + `box-shadow: var(--focus-ring)`. |
| **with value** | Igual que default, value en `--text-primary`. |
| **placeholder** | Value en `--text-tertiary`, label visible. |
| **disabled** | `background: --surface-secondary` · `color: --text-tertiary` · `cursor: not-allowed`. |
| **readonly** | Visualmente igual a default pero borde `--border`. Sin focus ring. |
| **error** | `border: --danger` + ring rojo en focus. **Mensaje de error reemplaza al helper**. |

---

## 4. Tokens consumidos

```
Layout       --space-1_5, --space-2, --space-2_5, --space-3, --space-4, --space-10
             --radius-sm
             --icon-size-md
Tipografía   --font-family · --font-size-xs/sm/base/md · --font-weight-medium
Color        --surface-primary · --surface-secondary
             --text-primary · --text-secondary · --text-tertiary
             --border · --border-hover · --brand · --danger · --danger-light
Estado       --focus-ring (anillo doble · DD-014)
Motion       --transition-fast · --ease-out
```

---

## 5. Voz de marca aplicada (DD-022)

Aplica a **labels** y a **placeholders**. Los inputs cuentan parte de la
historia: lo que pides al usuario debe sonar a Aelium.

### Reglas de copy en labels

- Sustantivo concreto, no genérico. **"Tu correo"** no "Email *".
- Sin asterisco para obligatorios cuando casi todos lo son. Marca el
  opcional con `(opcional)` al final.
- Singular y directo. **"Dominio"**, no "Por favor introduzca el dominio".

### Reglas de copy en placeholders

- Ejemplo, no instrucción. **"hola@mitienda.com"** no "Introduce tu email".
- Sustituye al label en formularios densos (admin), nunca lo reemplaza
  cuando el usuario es no técnico (cliente).

### Aelium NUNCA en labels/placeholders

| Genérico | Aelium |
|---|---|
| "Por favor introduzca el correo electrónico" | "Tu correo" |
| "Email *" (con asterisco genérico) | "Tu correo" + helper "te enviamos las credenciales aquí" |
| "Subject" / "Asunto" | "¿Qué necesitas?" |
| "Description" / "Descripción" | "Cuéntanos qué pasa" |

### Reglas de copy en helpers

El helper es donde Aelium **acompaña**. No es texto burocrático — es la
voz del socio aclarando algo:

- ✓ "Te enviamos las credenciales aquí en cuanto el hosting esté listo."
- ✓ "Lo verás en tu factura. Sin sorpresas."
- ✗ "Este campo es obligatorio."
- ✗ "Formato válido: usuario@dominio.com"

---

## 6. Reglas de uso

- Cada input tiene un label visible. **No usar placeholder como label**
  en cliente. En admin (densidad alta) sí está permitido como excepción.
- Helper aparece SI hay algo útil que decir. Texto neutro genérico
  ("Campo obligatorio") es ruido — fuera.
- Un solo error por field. Si hay varios, mostrar el más relevante.
- Iconos prefijo solo si añaden información (icono de email en campo
  email). Decorativos puros: fuera.
- Validación inline al perder focus, no en cada keystroke. La marca
  es paciente y no asume incompetencia.

### Anti-patrones

- ❌ Label "(*)" como obligatoriedad estándar — incomoda al usuario.
- ❌ Placeholder en gris muy claro que no se lee — fallo accesibilidad.
- ❌ Error rojo agresivo mientras el usuario aún escribe.
- ❌ Inputs sin label "porque el placeholder ya dice qué es" — fallo a11y.

---

## 7. Accesibilidad

- `<label htmlFor="x">` + `<input id="x">` — asociación obligatoria.
- `aria-invalid="true"` cuando el campo tiene error.
- `aria-describedby="helper-id"` cuando hay helper o error.
- Contraste de placeholder contra fondo: `--text-tertiary` sobre
  `--surface-primary` debe pasar AA mínimo (verificar al promocionar
  los nuevos tokens DD-021).
- Focus ring `--focus-ring` siempre visible al tabular.
- Tipo del input correcto (`type="email"`, `type="tel"`, `type="url"`,
  `type="number"`) para asistencia de teclado móvil.

---

## 8. Drift vs implementación actual

> Detalle en `audit-existing.md` § Componente 2.

| ID | Drift | Resolución en spec |
|---|---|---|
| **D2A-2** | Focus ring `0 0 0 3px brand-subtle` | Migrar a `--focus-ring` doble. |
| **D2A-3** | Border default = `--border-hover` | Corregir a `--border`. Hover sube a `--border-hover`. |
| **D2A-4** | Sin sm/md/lg | **Añadir** sm/md/lg coherentes con Button y Select. |
| **D2A-8** | Disabled hereda del browser | Estilizar igual que Select/Textarea (`bg: --surface-secondary`). |
| DD-021 | Border invisible (alpha 0.06) | Border más visible (`#E2E8F0`) — coherente con marca. |
| DD-022 | Labels/placeholders genéricos en código | Refactor de copy a voz Aelium. |

---

## 9. Materialización

`docs/design/mockup/components/input.html` — todos los tamaños, estados,
con/sin icono, con error/helper, con copy real de Aelium.
