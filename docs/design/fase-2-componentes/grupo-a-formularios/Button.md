# Button — Spec

> Estado: **modelo · pendiente de aprobación**
> Fuente actual: `frontend/app/components/ui/Button/Button.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/button.html`

---

## 1. Anatomía

```
[ leftIcon? ]  CHILDREN  [ rightIcon? ]
```

Partes nombradas:

| Parte | Qué es | Token / dimensión |
|-------|--------|-------------------|
| `container` | El propio `<button>`. | radius/padding/altura por tamaño (ver §3). |
| `leftIcon` | SVG inline opcional antes del label. | `--icon-size-{sm,md}` heredando `currentColor`. |
| `children` | Label de texto. Idealmente 1–3 palabras. | `--font-weight-medium`. |
| `rightIcon` | SVG inline opcional después del label. | Igual que leftIcon. |
| `spinner` | Reemplaza el contenido visual cuando `loading=true`. | 16×16, `currentColor`, anima `btn-spin`. |

Variantes especiales:

- **Icon-only** — sin `children`, solo `leftIcon` (cuadrado).
- **Full-width** — ocupa el ancho del padre (`width: 100%`).

---

## 2. Variantes

| Variante | Uso | Color base | Border | Texto |
|----------|-----|------------|--------|-------|
| `primary` | CTA principal de la pantalla. **Una sola por contexto** (D1 de DESIGN_SYSTEM.md). | `--brand` | `--brand` | `--text-on-brand` |
| `secondary` | CTA secundaria. Acompaña a primary o aparece sola en contextos no decisivos. | `--surface-primary` | `--border-hover` | `--text-primary` |
| `ghost` | Acción terciaria, dentro de cards densas, links de tabla. Sin peso visual. | transparente | transparente | `--text-secondary` |
| `danger` | Solo para acciones destructivas confirmadas (eliminar, suspender, cancelar de forma irreversible). | `--danger` | `--danger` | `--text-on-brand` |

Sin nuevas variantes propuestas — el set actual cubre los casos
identificados en el código real. Si emerge un caso nuevo (ej. botón
"success" para confirmación), se reabre.

---

## 3. Tamaños

| Tamaño | Padding | Font-size | Min-height | Radius | Icon size |
|--------|---------|-----------|------------|--------|-----------|
| `sm` | `--space-1_5 --space-3` (6/12) | `--font-size-xs` (11) | 28px | `--radius-sm` (8) | `--icon-size-sm` (14) |
| `md` (default) | `--space-2 --space-4` (8/16) | `--font-size-sm` (13) | 36px | `--radius-sm` (8) | `--icon-size-md` (16) |
| `lg` | `--space-3 --space-6` (12/24) | `--font-size-base` (14) | 44px | `--radius-md` (12) | `--icon-size-md` (16) |

Icon-only conserva el `min-height` y lo iguala al `min-width` (cuadrado).

---

## 4. Estados

| Estado | Comportamiento visual |
|--------|------------------------|
| **default** | Como tabla §2. |
| **hover** (no disabled) | Background → `-hover` token. Primary y danger añaden `box-shadow` (ver §5). Transition `--transition-fast` con `--ease-out`. |
| **focus-visible** | `box-shadow: var(--focus-ring)` (anillo doble). `outline: none`. **Sin parpadeo** al hacer click (CSS `:focus-visible`, no `:focus`). |
| **active** (pressed) | `transform: scale(0.98)`. Background → `-active` token cuando aplica. |
| **disabled** | `opacity: 0.5`. `cursor: not-allowed`. Sin hover. |
| **loading** | Contenido oculto (`color: transparent`), spinner centrado. `pointer-events: none`. **`disabled` lógico** para evitar doble click. |

Estados que NO aplican a Button: `error`, `readonly`, `empty` (no son
botones).

---

## 5. Tokens consumidos

```
Layout
  --space-1, --space-1_5, --space-2, --space-3, --space-4, --space-6
  --radius-sm, --radius-md
  --icon-size-sm, --icon-size-md

Tipografía
  --font-family
  --font-size-xs, --font-size-sm, --font-size-base
  --font-weight-medium

Color · primary
  --brand, --brand-hover, --brand-active
  --text-on-brand
  --shadow-brand

Color · secondary
  --surface-primary, --surface-secondary
  --border-hover, --border-active
  --text-primary

Color · ghost
  --surface-secondary
  --text-primary, --text-secondary

Color · danger
  --danger, --danger-hover
  --text-on-brand
  --shadow-danger  (NUEVO — propuesto en este spec, ver §8)

Estado
  --focus-ring   (anillo doble — DD-014)

Motion
  --transition-fast
  --ease-out
```

---

## 6. Reglas de uso

**Cuándo usar cada variante.**

- `primary` — **una sola por pantalla** (regla D1 de DESIGN_SYSTEM.md). Es
  la acción que el usuario más probablemente quiere ejecutar.
- `secondary` — acompañando a primary en grupos de acción
  ("Cancelar / Confirmar"), o como única CTA en contextos no decisivos
  (filtros, "Editar", "Ver más").
- `ghost` — para acciones inline densas: "Editar" en una fila de tabla,
  "Cerrar" en un Toast, items de Dropdown trigger. **Nunca como CTA
  principal**.
- `danger` — solo si la acción es **irreversible y destructiva**
  (eliminar, suspender, cancelar suscripción). Si la acción es
  reversible (archivar, ocultar), usar `secondary` con icono de papelera
  — no `danger`.

**Tamaños.**

- `sm` — toolbars, FilterBar, acciones inline en tablas densas (Admin).
- `md` — default. Cards, formularios, headers de página.
- `lg` — solo para CTA destacadas (hero del cliente, checkout final,
  empty state principal). No abusar; un dashboard con muchos `lg` se
  siente promocional.

**Anti-patrones.**

- ❌ Dos `primary` visibles a la vez.
- ❌ `ghost` como CTA principal — no comunica acción.
- ❌ `danger` para acciones reversibles.
- ❌ Texto largo (≥4 palabras) — es síntoma de que el botón no comunica.
- ❌ Solo icono sin `aria-label` — accesibilidad rota.

---

## 7. Accesibilidad

- **Rol**: `<button>` nativo (no `<div>` ni `<a>` para acciones).
- **Tipo**: por defecto `type="button"`. Solo `type="submit"` en
  formularios reales. **Nunca** `type` ausente dentro de un `<form>` —
  por defecto sería `submit`.
- **Disabled**: el atributo `disabled` previene click y focus. Para
  comunicar "deshabilitado" accesiblemente sin perder focus, usar
  `aria-disabled="true"` + handler que cancela.
- **Loading**: además del spinner visual, marcar `aria-busy="true"` y
  `disabled` mientras carga.
- **Icon-only**: obligatorio `aria-label` con la acción ("Cerrar",
  "Editar cliente").
- **Focus visible**: `--focus-ring` doble es suficiente (contraste 4.5:1
  mínimo sobre `--surface-primary` y `--surface-secondary`).
- **Texto**: peso 500, contraste verificado AA en todas las variantes.

---

## 8. Drift detectado vs implementación actual

> Resumen de hallazgos de `audit-existing.md` aplicables a este spec.
> Las decisiones que afectan a más de un componente se elevan a DECISIONS
> globales (DD-NNN).

### 8.1 Focus ring → migrar a `--focus-ring` doble (D2A-2)

**Hoy:** Button hereda el `outline: 2px solid var(--brand)` global de
`globals.css`. Funcional pero inconsistente con el resto de formularios.

**Spec:** `outline: none; box-shadow: var(--focus-ring)` en
`:focus-visible`. Comportamiento idéntico para todas las variantes — el
ring doble se ve sobre cualquier fondo (`--surface-primary` o
`--surface-secondary`).

### 8.2 Hex hardcoded en `.danger:hover` → `--danger-hover` (D2A-5)

**Hoy:**
```css
.danger:hover {
  background: #DC2626;
  box-shadow: 0 4px 24px rgba(239, 68, 68, 0.15);
}
```

**Spec:**
```css
.btn-danger:hover {
  background: var(--danger-hover);          /* = #DC2626 ya existe */
  box-shadow: var(--shadow-danger);          /* token nuevo, ver §8.3 */
}
```

### 8.3 Nuevo token `--shadow-danger` (propuesta D2A-5b)

**Razón:** `--shadow-brand` existe (`0 4px 24px rgba(59,130,246,0.12)`).
La variante danger tiene su propia sombra hoy, pero hardcoded. Coherencia:
añadir `--shadow-danger: 0 4px 24px rgba(239,68,68,0.18)`.

> Decisión a registrar como **DD-019** si apruebas. Si no, mantenemos el
> rgba inline en `.btn-danger` con un comentario justificándolo.

### 8.4 Border-radius — corrección al mapping de fase 1 (D2A-1)

El mapping de `phase-1-tokens.html` decía `Button → --radius-full`.
**Es un error**. El código actual y `docs/SESSION_RULES.md` línea 88
("dashboard: botones radius 8px") concuerdan en `--radius-sm` (sm/md) y
`--radius-md` (lg).

> **Acción:** corregir el mapping de fase 1 (decisión a registrar como
> **DD-020**). El componente Button mantiene su radius actual.

### 8.5 Easing explícito en transition

**Hoy:**
```css
transition: background var(--transition-fast),
            border-color var(--transition-fast), ...;
```
El `ease` queda implícito (nativo del navegador, lineal-ish).

**Spec:**
```css
transition: background var(--transition-fast) var(--ease-out),
            border-color var(--transition-fast) var(--ease-out), ...;
```
Coherente con DD-007 (ease-out para entradas / enriquecimientos).

### 8.6 Spinner — mantener implementación actual

El spinner inline con `border + animation` es correcto y performante. No
requiere cambios. Documentado para que en fase 2.B (cuando se haga
`Skeleton`) se considere una utilidad compartida si emergen más spinners.

---

## 9. Implementación esperada (resumen mecánico)

Cambios necesarios en `Button.module.css` para promocionar la spec
(modo implementación, NO ejecutar aquí):

```diff
.btn {
  /* ... */
  transition:
-   background var(--transition-fast),
-   border-color var(--transition-fast),
-   box-shadow var(--transition-fast),
-   transform var(--transition-fast);
+   background var(--transition-fast) var(--ease-out),
+   border-color var(--transition-fast) var(--ease-out),
+   box-shadow var(--transition-fast) var(--ease-out),
+   transform var(--transition-fast) var(--ease-out);
+ outline: none;
}

+ .btn:focus-visible { box-shadow: var(--focus-ring); }

.danger:hover:not(:disabled) {
- background: #DC2626;
- border-color: #DC2626;
- box-shadow: 0 4px 24px rgba(239, 68, 68, 0.15);
+ background: var(--danger-hover);
+ border-color: var(--danger-hover);
+ box-shadow: var(--shadow-danger);  /* tras añadir el token a globals */
}
```

Nada más cambia. Variantes, tamaños, props, loading, iconOnly, fullWidth
quedan idénticos.

---

## 10. Verificación visual

Spec materializada en la maqueta viva: ver
`docs/design/mockup/components/button.html` — incluye las 4 variantes,
los 3 tamaños, los estados (default/hover/focus/active/disabled/loading),
icon-only, full-width, ejemplos sobre fondo claro y oscuro.
