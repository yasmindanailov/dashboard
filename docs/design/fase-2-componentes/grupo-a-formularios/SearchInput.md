# SearchInput — Spec

> Estado: **listo**
> Fuente actual: `frontend/app/components/ui/SearchInput/SearchInput.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/search-input.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────┐
│ Label (opcional)                        │
│ ┌─────────────────────────────────────┐ │
│ │ 🔍  buscando…              ⟳ | ✕   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

| Parte | Token / detalle |
|---|---|
| `field-label` | Opcional. Muchos usos del SearchInput van sin label (toolbar de tabla). |
| `search` | Wrapper relative que contiene icono + input + clear. |
| `search-icon` | Lupa SVG, posición absolute izquierda. Cambia a `--brand` con `:focus-within`. |
| `input` | type=search. Padding-left para hueco del icono. |
| `clear-btn` | Botón "✕" que aparece cuando hay valor. Hover background `--surface-secondary`. |
| `loading spinner` | Reemplaza al clear button mientras hay búsqueda en curso. |

---

## 2. Tamaños

`sm` y `md`. **No hay `lg`** — un buscador grande raramente tiene sentido
(los grandes son hero, no buscador).

| Tamaño | Padding | Font-size | Min-height |
|---|---|---|---|
| `sm` | `--space-1_5` vert. + `--space-3` h. + hueco icono | `--font-size-sm` | 32px |
| `md` (default) | `--space-2` vert. + `--space-3` h. + hueco icono | `--font-size-base` | 36px |

---

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default vacío** | Icono lupa visible, sin clear, sin spinner. |
| **focus-within** | Icono lupa pasa a `--brand`. Borde y ring estándar. |
| **con valor** | Aparece clear button a la derecha. |
| **loading** | Reemplaza clear con spinner (`--text-tertiary`, animación 1s linear). |
| **disabled** | `bg: --surface-secondary` · cursor not-allowed. |
| **focus en clear button** | `--focus-ring` sobre el botón. |

---

## 4. Tokens consumidos

```
Layout       --space-1_5/2/3/8/10 · --radius-sm · --radius-xs
Tipografía   --font-size-sm/base
Color        --surface-primary/secondary
             --text-primary/tertiary/secondary
             --border · --border-hover · --brand
Estado       --focus-ring
Motion       --transition-fast · --ease-out
Iconografía  --icon-size-md (16px) lupa, 14px clear
```

---

## 5. Voz de marca aplicada (DD-022)

### Reglas en placeholder

- **Verbo "Buscar" + objeto concreto.**
  - ✓ "Buscar cliente, NIF, dominio…"
  - ✓ "Buscar factura por número o cliente…"
  - ✗ "Buscar…"
  - ✗ "Search"
- Tres puntos suspensivos al final invitan a escribir.
- Mencionar qué campos se buscan ayuda al usuario.

### Sin label en toolbar de tabla

Cuando vive solo en una toolbar, el placeholder hace de label. En esos
casos el placeholder debe ser autoexplicativo y no quedarse en
"Buscar…" abstracto.

### Ejemplos producto

| Contexto | Placeholder |
|---|---|
| Admin · listado clientes | "Buscar cliente, NIF, dominio…" |
| Admin · listado facturas | "Buscar por número o cliente…" |
| Admin · tickets | "Buscar ticket o cliente…" |
| Cliente · servicios | "Buscar en mis servicios…" |
| CommandPalette inline (Cmd+K) | "Empieza a escribir…" |

---

## 6. Reglas de uso

- **Debounce 300ms** desde el último keystroke antes de disparar búsqueda.
  Sin debounce = sobrecarga de red y UX ruidosa.
- Si la búsqueda no devuelve resultados, mostrar **EmptyState** con voz:
  "No encontramos nada para 'foo'. Prueba con otra cosa." (no "0 resultados").
- En toolbars, ocupar ancho razonable (~280–360px). No 100%.
- Sin error/helper. Si necesitas validar formato → es un Input
  normal, no un buscador.

---

## 7. Accesibilidad

- `type="search"` correcto.
- `aria-label` cuando no hay label visible: `aria-label="Buscar cliente"`.
- Clear button con `aria-label="Limpiar búsqueda"`.
- Override CSS para esconder el cancel nativo de WebKit:
  `::-webkit-search-cancel-button { display: none; }` si choca con el
  custom (D2A-9).

---

## 8. Drift vs implementación actual

> Detalle en `audit-existing.md` § Componente 5.

| ID | Drift | Resolución |
|---|---|---|
| **D2A-2** | Focus ring custom | Migrar a `--focus-ring`. |
| **D2A-3** | Border default `--border-hover` | Corregir a `--border`. |
| Spinner SVG | width/height 16 hardcoded | Usar `--icon-size-md`. |
| **D2A-9** | Sin override `::-webkit-search-cancel-button` | Añadir. |

---

## 9. Materialización

`docs/design/mockup/components/search-input.html`
