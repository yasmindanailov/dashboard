# Select — Spec

> Estado: **listo**
> Fuente actual: `frontend/app/components/ui/Select/Select.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/select.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────┐
│ Label                                   │
│ ┌─────────────────────────────────────┐ │
│ │ Selected option         ▼          │ │  ← chevron (decorativo, currentColor)
│ └─────────────────────────────────────┘ │
│ Helper text  · ó ·  Error message      │
└─────────────────────────────────────────┘
```

| Parte | Token / detalle |
|---|---|
| `field-label` | Mismo que Input. |
| `select` | `<select>` nativo con `appearance: none`. Padding-right reservado para chevron. |
| Chevron | SVG en `background-image` con `stroke="--text-secondary"` (escapado). Apunta abajo. |
| `field-helper` / `field-error` | Mismos que Input. |

**Por qué nativo y no custom:** accesibilidad, soporte teclado/móvil
nativo, comportamiento esperado por usuarios. El estilizado va por
encima sin sustituir el comportamiento.

---

## 2. Tamaños

| Tamaño | Padding | Font-size | Min-height |
|---|---|---|---|
| `sm` | `--space-1_5` vert. + `--space-3` h. + `--space-10` der. (chevron) | `--font-size-sm` | 32px |
| `md` (default) | `--space-2` vert. + `--space-3` h. + `--space-10` der. | `--font-size-base` | 36px |
| `lg` | `--space-2_5` vert. + `--space-4` h. + `--space-10` der. | `--font-size-md` | 44px |

Coherente con Input y Button.

---

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** | `border: --border`, chevron `--text-tertiary`. |
| **hover** | `border: --border-hover`, chevron `--text-secondary`. |
| **focus-visible** | `border: --brand` + `--focus-ring`. |
| **placeholder seleccionado** | Primera opción `disabled selected` con texto en `--text-tertiary`. |
| **disabled** | `bg: --surface-secondary` · `color: --text-tertiary` · cursor not-allowed. |
| **error** | `border: --danger` + ring rojo en focus + mensaje. |
| **abierto (menu nativo)** | Lo gestiona el navegador. Sin diseño custom. |

---

## 4. Tokens consumidos

```
Layout       --space-1_5/2/2_5/3/4/10 · --radius-sm
Tipografía   --font-size-sm/base/md · --font-weight-medium
Color        --surface-primary · --surface-secondary
             --text-primary/secondary/tertiary
             --border · --border-hover · --brand · --danger
Estado       --focus-ring
Motion       --transition-fast · --ease-out
Iconografía  chevron a 16px · stroke 1.5
```

---

## 5. Voz de marca aplicada (DD-022)

### Reglas en opciones

- **Opciones cortas y concretas.** "Activo", "Suspendido", no "Servicio en estado activo".
- **Una palabra cuando se pueda.** Si la opción necesita explicación, va en helper, no dentro del select.
- **Placeholder es invitación, no orden.** "Elige un plan" no "Seleccione una opción".
- **Orden alfabético** salvo que haya un orden lógico de negocio (ej. estados de factura: pagada > pendiente > vencida).

### Ejemplos producto

| Contexto | Label | Opciones |
|---|---|---|
| Cliente · plan | "¿Qué plan te encaja?" | Web Inicio · Web Pro · Web Business |
| Cliente · facturación | "Periodicidad" | Anual (recomendado) · Mensual |
| Admin · cliente | "Estado del cliente" | Activo · Suspendido · Cancelado |
| Admin · ticket | "Prioridad" | Urgente · Alta · Media · Baja |
| Admin · idioma | "Idioma de comunicación" | Español · Catalán · Inglés |

### Anti-patrones

- ❌ Opciones tipo "Por favor seleccione..." dentro del menú.
- ❌ Selects con 30+ opciones — usar Combobox/Autocomplete (futuro).
- ❌ Iconos en cada opción (overload visual).

---

## 6. Reglas de uso

- Usar Select para 3–10 opciones. **Menos de 3** → considerar Radio/Toggle.
  **Más de 10** → considerar Combobox con búsqueda (componente futuro).
- Placeholder solo si hay un default obvio. Si toda opción es válida y
  no hay default, omitir placeholder y mostrar la primera seleccionada.
- Etiqueta visible siempre. Sin label = inaccesible.

---

## 7. Accesibilidad

- `<label htmlFor>` + `<select id>`.
- Native `<select>` ya soporta teclado (flechas, escribir letra, Enter).
- `aria-invalid="true"` en error.
- `aria-describedby` para helper/error.
- Disabled options dentro del menú: usar `disabled` en `<option>`.

---

## 8. Drift vs implementación actual

> Detalle en `audit-existing.md` § Componente 3.

| ID | Drift | Resolución |
|---|---|---|
| **D2A-2** | Focus `box-shadow brand-subtle` | Migrar a `--focus-ring`. |
| **D2A-3** | Border default `--border-hover` | Corregir a `--border`. |
| Chevron 16px hardcoded | SVG width/height `16` literal | Mantener pero documentar como `--icon-size-md`. |
| DD-021 | Stroke chevron color hardcoded `currentColor` | OK, no requiere cambio. |

---

## 9. Materialización

`docs/design/mockup/components/select.html`
