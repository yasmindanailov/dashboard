# Pagination — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Pagination/Pagination.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/pagination.html`

---

## 1. Anatomía

```
11–20 de 95           ‹ 1 … 3 [4] 5 … 10 ›
─────────             ──────────────────
info text             page controls
```

| Parte | Token / detalle |
|---|---|
| `pagination` | Flex space-between con info izq, controls der. |
| `pagination-info` | "11–20 de 95" en `--text-tertiary`, font-sm. **Tabular nums**. |
| `page-btn` | 36×36, radius-sm, font-medium, **tabular nums**. |
| `page-btn.active` | bg `--brand`, color on-brand, font-semibold. |
| `page-btn-nav` | Chevron < >, color tertiary, hover brand-subtle. |
| `page-ellipsis` | "…" 36×36 sin background. |

## 2. Props

| Prop | Detalle |
|---|---|
| `page` | Página actual (1-indexed). |
| `totalPages` | Total. |
| `onPageChange` | Callback. |
| `total?` / `limit?` | Para info text "11–20 de 95". |
| `maxVisible` | Default 5 — botones visibles antes de ellipsis. |

## 3. Comportamiento

- **≤ maxVisible páginas** → todas visibles, sin ellipsis.
- **> maxVisible** → primera + ventana centrada en current + última, con ellipsis cuando aplica.
- **page 1**: prev button disabled.
- **page totalPages**: next button disabled.
- **totalPages ≤ 1**: paginación no se muestra.

## 4. Estados

| Estado | Comportamiento |
|---|---|
| **default page btn** | color secondary, sin bg. |
| **hover** | bg `--surface-secondary`, color primary. |
| **active** | bg `--brand`, color on-brand, semibold. |
| **focus-visible** | `--focus-ring` + border brand. |
| **disabled (nav)** | opacity 0.35, cursor not-allowed. |
| **nav hover** | color brand, bg brand-subtle. |

## 5. Tokens consumidos

```
Layout    --space-1/2/3/4 · --radius-sm
Tipografía --font-size-sm · --font-weight-medium/semibold
          --font-feature-numeric
Color     --brand · --brand-subtle · --text-on-brand
          --surface-secondary · --text-primary/secondary/tertiary
Estado    --focus-ring
Motion    --transition-fast · --ease-out
Iconografía --icon-size-md (chevrons, antes 16px hardcoded · D2C-F)
```

## 6. Voz de marca aplicada

Pagination es funcional, sin texto narrativo. Un solo elemento textual:

- **Info text**: "11–20 de 95" — formato natural, separador en–dash, **`de`** (no "of"). En castellano siempre.

## 7. Reglas de uso

- **Posicionar al pie de listado**, separación `--space-3` del último item.
- **Width 100%**, justify-content space-between.
- Si `total + limit` no están disponibles, omitir info text — no mostrar string vacío.
- Siempre `tabular-nums` en page numbers para que no salten al cambiar (1 → 10 → 100).

## 8. Accesibilidad

- Botón active con `aria-current="page"`.
- Botones nav con `aria-label="Página anterior"` / `"Página siguiente"`.
- Disabled state via attribute `disabled` (no solo CSS).

## 9. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2C-F** | Chevrons hardcoded 16px | Migrar a `--icon-size-md`. |
| Active shadow | `--shadow-brand` muy notorio | Reducir o quitar — el fill brand ya es suficiente señal. |
| Tabular nums | Sin aplicar | Añadir `--font-feature-numeric` al page-btn. |

## 10. Materialización

`mockup/components/pagination.html`

---

## 11. Variantes adicionales · DD-029 (fase 2.F refresh)

Tras DD-029 se completó el sistema con 3 variantes nuevas. Cada una
responde a un caso producto real:

### 11.1 Load more · activity feeds

Un solo botón centrado bajo el listado. Para feeds donde el usuario
prefiere "ver más" sin paginar.

```html
<div class="pagination-load-more">
  <button class="btn btn-secondary btn-md">Cargar 20 más</button>
  <p class="load-more-meta">Mostrando 40 de 142</p>
</div>
```

**Cuándo**: activity feed admin, audit log, transparency feed cliente,
historial de tickets con scroll natural.

### 11.2 Compact · sidebars y aside

Solo prev/next + "X de Y" tabular. Para listings compactos que conviven
con otra información (sidebar, widget, aside del cliente).

```html
<div class="pagination-compact">
  <button class="page-btn page-btn-nav" aria-label="Anterior">‹</button>
  <span class="compact-info">3 de 12</span>
  <button class="page-btn page-btn-nav" aria-label="Siguiente">›</button>
</div>
```

**Cuándo**: aside con últimas facturas, widget de tickets en topbar
expandido, sidebar listings.

### 11.3 Cursor-based · feeds infinitos

Solo prev/next, sin total ni page numbers. Para colas donde no hay total
conocido o no es relevante.

```html
<div class="pagination-cursor">
  <button class="page-btn page-btn-nav" disabled>‹ Anterior</button>
  <span class="cursor-meta">Más recientes</span>
  <button class="page-btn page-btn-nav">Más antiguas ›</button>
</div>
```

**Cuándo**: historial de chats (sin total contable), notificaciones
en bell, feed de eventos en tiempo real.

### Matriz cuándo usar cada una

| Caso | Variante |
|---|---|
| Listing con total conocido (admin/clients, billing) | Standard |
| Activity feed con scroll natural | Load more |
| Sidebar / aside / widget compacto | Compact |
| Cola sin total conocido (chats, events) | Cursor-based |
