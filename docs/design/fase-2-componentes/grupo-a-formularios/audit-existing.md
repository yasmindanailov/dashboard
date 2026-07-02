# audit-existing.md — 6 componentes de formularios

> Auditoría just-in-time de las fuentes reales en `frontend/app/components/ui/`.
> Sirve de input para las specs de fase 2.A. Cada hallazgo se resuelve en
> el spec correspondiente o se eleva a una decisión (DD-NNN).

---

## Componente 1 — Button

**Fuente:** `Button.tsx` (73 líneas) · `Button.module.css` (149 líneas)

### Props actuales
```ts
variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
size?: 'sm' | 'md' | 'lg'
loading?: boolean
fullWidth?: boolean
iconOnly?: boolean
leftIcon?: ReactNode
rightIcon?: ReactNode
+ ButtonHTMLAttributes<HTMLButtonElement>  (disabled, type, onClick, ...)
```

### Tamaños actuales

| Variante | Padding | Font-size | Min-height | Radius |
|----------|---------|-----------|------------|--------|
| sm | `--space-1_5 --space-3` (6/12) | `--font-size-xs` (11) | 28px | `--radius-sm` (8) |
| md | `--space-2 --space-4` (8/16) | `--font-size-sm` (13) | 36px | `--radius-sm` (8) |
| lg | `--space-3 --space-6` (12/24) | `--font-size-base` (14) | 44px | `--radius-md` (12) |

### Hallazgos
- ⚠ **D2A-1**: `--radius-sm` y `--radius-md`, NO `--radius-full`. El mapping
  de fase 1 (Mapping a componentes en `phase-1-tokens.html`) dice
  `--radius-full` para Button. Conflicto. El estado real del producto y
  `docs/SESSION_RULES.md` línea 88 ("dashboard: botones radius 8px")
  apoyan el código actual. Recomendación: corregir el mapping de fase 1,
  no el código.
- ⚠ **D2A-5**: hex hardcoded en `.danger:hover`:
  - `background: #DC2626` → debe ser `var(--danger-hover)`.
  - `box-shadow: 0 4px 24px rgba(239, 68, 68, 0.15)` → no hay token. Proponer `--shadow-danger`.
- ⚠ **D2A-2**: sin focus ring custom. Hereda el outline global
  (`*:focus-visible { outline: 2px solid var(--brand) }`). Debe migrarse
  a `box-shadow: var(--focus-ring); outline: none;` para consistencia con
  los demás formularios.
- ✓ Loading state: spinner con keyframe `spin` propio. Bien implementado.
  Color del spinner por variante (correcto).
- ✓ `:active:not(:disabled) { transform: scale(0.98); }` — micro-interacción
  buena. Mantener.
- ✓ Variantes coherentes con DESIGN_SYSTEM.md.
- ✓ `iconOnly` con tamaños cuadrados (28/36/44). Bien.
- ⚠ Transición incluye `box-shadow var(--transition-fast)` (correcto) pero
  no menciona qué easing — usa `ease` nativo. Debería ser explícito
  `var(--transition-fast) var(--ease-out)` (DD-007).

---

## Componente 2 — Input

**Fuente:** `Input.tsx` (39 líneas) · `Input.module.css` (60 líneas)

### Props actuales
```ts
label?: string
error?: string
helperText?: string
leftIcon?: ReactNode
+ InputHTMLAttributes<HTMLInputElement>
```

### Estructura
```
<wrapper>
  <label>
  <inputContainer> (relative, hasError)
    <leftIcon> (absolute)
    <input> (hasLeftIcon padding shift)
  </inputContainer>
  <error> | <helper>
</wrapper>
```

### Hallazgos
- ⚠ **D2A-2**: focus ring usa `box-shadow: 0 0 0 3px var(--brand-subtle)`,
  NO el nuevo `--focus-ring` doble. Migrar.
- ⚠ **D2A-3**: border default = `var(--border-hover)`. Debería arrancar en
  `var(--border)` y subir a `--border-hover` en hover (regla nueva del
  audit de fase 1). Estado actual = "todo se ve siempre intenso".
- ⚠ **D2A-4**: sin tamaños sm/md/lg. Solo un tamaño implícito (md).
  Decidir si añadir.
- ⚠ Sin estado disabled custom. Hereda del navegador (sin opacidad
  uniforme con Select/Textarea que sí tienen `opacity: 0.5`).
- ⚠ Sin estado readonly diferenciado.
- ⚠ `padding-left: var(--space-10)` (40px) cuando hay leftIcon. El icono
  se posiciona en `left: var(--space-3)` (12px). Espacio = 40-12-icono.
  Funcional pero algo apretado para iconos `--icon-size-md` (16). Revisar
  con la spec.
- ✓ Wrapper `gap: var(--space-1)` (4px) entre label/input/error. Coherente.
- ✓ Error message en `--font-size-xs` color `--danger`. Bien.
- ✓ Helper en mismo tamaño color `--text-tertiary`. Bien.
- ✗ **No prefix/suffix** más allá de leftIcon. No hay rightIcon ni
  unidad inline (€, %, .com). Decidir si añadir o diferir a fase 2.B.

---

## Componente 3 — Select

**Fuente:** `Select.tsx` (90 líneas) · `Select.module.css` (75 líneas)

### Props actuales
```ts
label?: string
error?: string
helperText?: string
size?: 'sm' | 'md' | 'lg'
placeholder?: string
options?: SelectOption[]   // alternativa a children
+ Omit<SelectHTMLAttributes, 'size'>
```

### Estructura
```
<wrapper sizeClass>
  <label>
  <selectContainer> (hasError)
    <select> (native, appearance:none, padding-right para chevron)
    <chevron> (absolute, currentColor)
  </selectContainer>
  <error> | <helper>
</wrapper>
```

### Hallazgos
- ✓ Native `<select>` con `appearance: none` + chevron SVG inline. Bien
  para accesibilidad y compatibilidad.
- ✓ Tamaños sm/md/lg implementados. **Coherentes con Button**.
- ✓ Disabled state: `opacity: 0.5; background: var(--surface-secondary)`.
  Visual claro.
- ✓ Hover del container cambia chevron de `--text-tertiary` a
  `--text-secondary`. Buen detalle.
- ⚠ **D2A-2**: focus ring `box-shadow: 0 0 0 3px var(--brand-subtle)`.
  Mismo problema que Input. Migrar.
- ⚠ **D2A-3**: border default = `var(--border-hover)`. Mismo problema.
- ⚠ Chevron icon hardcoded a 16px (`<svg width="16" height="16">`).
  Debería usar `var(--icon-size-md)` (mismo valor pero token).
- ⚠ Padding right del select: `var(--space-8)` (32px) para sm/md,
  `var(--space-10)` (40px) para lg. Coherente con tamaño del chevron pero
  algo arbitrario. Revisar.
- ⚠ Sin estado readonly (los `<select>` nativos no tienen readonly,
  solo disabled). Documentar el patrón si se necesita "solo lectura".
- ✓ `placeholder` como first disabled option. Patrón estándar.

---

## Componente 4 — Textarea

**Fuente:** `Textarea.tsx` (76 líneas) · `Textarea.module.css` (71 líneas)

### Props actuales
```ts
label?: string
error?: string
helperText?: string
showCount?: boolean
resizable?: boolean
+ TextareaHTMLAttributes<HTMLTextAreaElement>
```

### Estructura
```
<wrapper>
  <label>
  <textareaContainer hasError>
    <textarea noResize?>
  </textareaContainer>
  <footer>  (flex, justify-between)
    <error> | <helper>
    <charCount [Warning|Error]>?
  </footer>
</wrapper>
```

### Hallazgos
- ✓ Char counter con umbrales: ≥0.9 → warning color, ≥1 → danger color.
  Buen detalle UX. Usa `--warning` y `--danger` directos.
- ✓ `line-height: var(--line-height-normal)`. Bien.
- ✓ `resize: vertical` por defecto, `resizable={false}` lo desactiva.
- ⚠ **D2A-2** y **D2A-3**: mismos problemas que Input/Select (focus ring
  + border default).
- ⚠ **D2A-4**: sin tamaños sm/md/lg. Solo un tamaño + `rows` configurable.
- ⚠ Disabled state: `opacity: 0.5; background: var(--surface-secondary)`.
  Coherente con Select.
- ✓ Footer flex layout limpio: error/helper a la izquierda, contador a la
  derecha. Migra bien al nuevo design.

---

## Componente 5 — SearchInput

**Fuente:** `SearchInput.tsx` (101 líneas) · `SearchInput.module.css` (77 líneas)

### Props actuales
```ts
label?: string
loading?: boolean
onClear?: () => void
size?: 'sm' | 'md'
+ Omit<InputHTMLAttributes, 'type' | 'size'>
```

### Estructura
```
<wrapper sizeClass>
  <label>
  <searchContainer>
    <searchIcon> (absolute left, currentColor)
    <input type="search">
    <loading>? | <clearButton>?
  </searchContainer>
</wrapper>
```

### Hallazgos
- ✓ `type="search"` HTML5 correcto.
- ✓ Search icon cambia a `--brand` cuando container está `:focus-within`.
  Detalle excelente.
- ✓ Clear button con su propio hover (`--surface-secondary`).
- ✓ Loading spinner inline (animación `spin` propia, distinta a Button).
- ⚠ **D2A-4**: solo sm/md, **no tiene lg**. Decidir si añadir lg para
  coherencia (probablemente no es necesario — el SearchInput rara vez
  necesita ser grande).
- ⚠ **D2A-2** y **D2A-3**: mismos problemas que Input.
- ⚠ Spinner SVG hardcoded a 16px en JSX, no usa token.
- ⚠ Clear icon en SearchInput (14px) y SVG search (16px) con tamaños
  distintos. ¿Intencional para distinguir acción vs decoración? Probable.
  Documentar si lo es.
- ⚠ Sin override del cancel nativo de Webkit
  (`::-webkit-search-cancel-button { display: none }`). Si el navegador
  añade su propio "x", choca con el clear custom. Verificar y decidir.
- ✗ Sin estado error/helper. SearchInput hoy NO acepta error/helper.
  Defendible (es un buscador, no un campo de formulario). Documentar.

---

## Componente 6 — Dropdown

**Fuente:** `Dropdown.tsx` (74 líneas) · `Dropdown.module.css` (83 líneas)

### Props actuales
```ts
items: DropdownItem[]
trigger?: ReactNode
align?: 'left' | 'right'

DropdownItem = {
  label: string
  onClick: () => void
  icon?: ReactNode
  danger?: boolean
  divider?: boolean
}
```

### Estructura
```
<wrapper> (relative)
  <button trigger> ⋯ icon o custom
  {open && <menu align>
    {items}: divider | <button item [danger]>
      <icon>?
      label
    </button>
  </menu>}
</wrapper>
```

### Hallazgos
- ✓ `aria-haspopup="true"` y `aria-expanded`. Accesibilidad básica OK.
- ✓ Click outside con `useEffect` + `mousedown` listener. Estándar.
- ✓ `--z-dropdown` (100). Correcto.
- ✓ `--shadow-lg` y `--radius-md` para el menú. Mapping coherente con
  fase 1.
- ✓ Item danger: color `--danger`, hover bg `--danger-light`. Coherente.
- ⚠ Animación: `animation: fadeIn 100ms ease`. Debería usar
  `--motion-stack-in` (180ms ease-out, DD-017) o `--transition-fast`.
- ⚠ Trigger por defecto no tiene focus ring custom. Hereda outline global.
- ⚠ Sin keyboard navigation (Arrow up/down, Esc para cerrar, Enter para
  ejecutar item activo). Defecto importante de accesibilidad.
- ⚠ No hay submenu / nested items. Defendible (Dropdown simple).
- ⚠ Trigger custom (`triggerCustom`) sin tamaño fijo, trigger default fijo
  a 32×32. Inconsistencia menor.
- ⚠ Item disabled NO existe (los DropdownItem siempre son ejecutables).
  Si se necesita en algún caso de uso real (visto en `/admin/clients`?),
  hay que añadirlo.

---

## Resumen de drift y decisiones

| ID | Aplica a | Drift | Resolución propuesta |
|----|----------|-------|----------------------|
| **D2A-1** | Button | Mapping fase 1 dijo `--radius-full`; código usa `--radius-sm/md` | **Corregir mapping fase 1**. Documentar en spec Button. |
| **D2A-2** | Input · Select · Textarea · SearchInput · Button | Focus ring custom (3px brand-subtle) en lugar de `--focus-ring` doble | **Migrar todos a `--focus-ring`** en specs. |
| **D2A-3** | Input · Select · Textarea · SearchInput | Border default = `--border-hover` (intenso). Debería ser `--border`. | **Corregir** en specs. |
| **D2A-4** | Input · Textarea (sin tamaños) · SearchInput (sin lg) | Heterogeneidad de tamaños sm/md/lg | **Decisión necesaria**: nivelar todos a sm/md/lg, o mantener heterogeneidad documentada. |
| **D2A-5** | Button | Hex hardcoded `#DC2626` y `rgba(239,68,68,0.15)` en danger:hover | **Migrar** a `--danger-hover`. Proponer nuevo token `--shadow-danger`. |
| D2A-6 | Dropdown | Animación `fadeIn 100ms ease` | Migrar a `--motion-stack-in` o `--transition-fast var(--ease-out)`. |
| D2A-7 | Dropdown | Sin keyboard navigation (arrow up/down, Esc, Enter) | **Añadir en spec**. Implementación en modo implementación. |
| D2A-8 | Select · Textarea · Input | Disabled inconsistente (Input hereda del browser; Select/Textarea con `opacity:0.5`) | Unificar en spec. |
| D2A-9 | SearchInput | Sin override de `::-webkit-search-cancel-button` | Verificar visualmente y añadir si choca. Detalle de implementación. |

---

## Lo que NO está y debe documentarse

- **Tooltip de helper / error**: hoy son texto debajo. Decidir si en
  algún caso conviene un Tooltip flotante (p.ej. en formularios densos).
- **Async validation**: ningún input tiene estado "validating" (spinner
  inline). Considerar para fase 2.B o 2.C cuando aparezca caso real.
- **Field group**: no hay un componente FieldGroup que agrupe Input + Input
  + Select (p.ej. dirección con calle/ciudad/CP). Patrón emerge en fase 3.
- **Auto-resize textarea**: hoy es resize manual con `resize: vertical`.
  Decidir si añadir auto-resize por contenido.
