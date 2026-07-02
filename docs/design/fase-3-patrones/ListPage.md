# ListPage — Spec

> Estado: **listo · 4 variantes (DD-029)**
> Fuente actual: `frontend/app/components/ui/ListPage/ListPage.{tsx,module.css}`
> Maqueta: `docs/design/mockup/patterns/list-page.html`
> Pregunta producto: **"¿Qué hay? ¿Necesito actuar sobre algo?"**

---

## 1. Anatomía

```
┌──────────────────────────────────────────────────────────┐
│ PAGE HEADER                                              │
│  (eyebrow opt) ─ h1 ─ subtitle  ─────────  [CTA primary] │
├──────────────────────────────────────────────────────────┤
│ BANNER (opcional · AlertBanner)                          │
├──────────────────────────────────────────────────────────┤
│ STATUS TABS (opcional · §3.2 + DD-026)                   │
├──────────────────────────────────────────────────────────┤
│ FILTER BAR (siempre)                                     │
├──────────────────────────────────────────────────────────┤
│ CONTENT — varía por variante                             │
│   standard: Table                                        │
│   grid:     Card grid auto-fill 280px                    │
│   timeline: Timeline DD-027 envuelto en card             │
│   split:    [master 360px] · [detail flex]               │
├──────────────────────────────────────────────────────────┤
│ PAGINATION (variant según contexto · ver Pagination spec)│
└──────────────────────────────────────────────────────────┘
```

| Bloque | Token | Uso |
|---|---|---|
| `.list-page` | `max-width: 1200px` (1400 si `wide`) · `gap: var(--space-6)` | Wrapper raíz. Flex column. |
| `.lp-content` | Variante define grid/flex/card | Slot principal. La página inyecta el contenido. |
| Page header | `--font-size-xl` · `letter-spacing: -0.015em` | Title h1. |
| Filter bar | Sin Card envolvente (UI_SPEC §2.4) | Misma estructura en todas las páginas. |
| Pagination | Variant por contexto | Standard (con total), load-more (feeds), compact (sidebars), cursor (chats). |

---

## 2. Variantes (DD-029)

### 2.1 `standard` (default) — tabla

**Caso producto:**
- `/admin/clientes` — 142 clientes con columnas tabulares.
- `/admin/facturacion` — facturas con estado, importe, fecha.
- `/agente/tickets` — tickets con asignado, prioridad, fecha.

**Cuándo usar:**
- Hay >5 atributos comparables por fila.
- El usuario escanea filas o ordena por columna.
- Densidad importa (admin/agente).

**Composición:** Table + Pagination standard.

### 2.2 `grid` — cards

**Caso producto:**
- `/cliente/services` — productos contratados como cards visuales.
- `/admin/products` — catálogo con icono, nombre, precio, estado.
- `/partner/referidos` — cada referido como card con avatar + status.

**Cuándo usar:**
- El elemento tiene una **identidad visual** (icono, color, avatar).
- 1-3 atributos clave por elemento.
- El usuario "busca el suyo", no compara columna a columna.

**Cuándo NO usar:**
- Hay >5 atributos relevantes — usa tabla.
- La lista es de >100 items sin filtros — la cuadrícula se vuelve laberinto.

**Composición:** Card (variantes service/featured) repetidas en grid +
Pagination standard o load-more.

### 2.3 `timeline` — eventos

**Caso producto:**
- `/cliente/transparency` — timeline de jobs hechos por el agente IA / humano.
- `/admin/audit-log` — eventos de auditoría con actor, acción, entidad.
- `/admin/error-log` — errores agrupados temporalmente.

**Cuándo usar:**
- Los items son **eventos en el tiempo**.
- El orden cronológico aporta significado (no es solo metadata).
- Cada evento tiene actor + acción + objeto + timestamp.

**Composición:** Timeline DD-027 dentro de un recuadro neutro
(`.lp-content` ya aplica `surface-primary + border + radius-lg`).
Pagination preferida: **load-more** (feeds) o **cursor** (sin total).

### 2.4 `split` — master-detail interno

**Caso producto:**
- `/agente/support` — lista de tickets a la izquierda, detalle del
  ticket activo a la derecha (sin abandonar la página).
- `/admin/jobs` — lista de jobs en cola + log/output del seleccionado.

**Cuándo usar:**
- Triage: el usuario revisa muchos items rápidamente y necesita el
  detalle sin cambiar de URL.
- El contexto se pierde si abrir el detalle implica navegar.

**Cuándo NO usar:**
- Si el detalle es complejo (varias pestañas, sub-secciones) — usa
  DetailPage propia. Split es para detalle compacto.

**Composición:** Master con `.split-master-item` (avatar + nombre + meta
+ snippet). Detail con header inline + body. **Activa `wide`** por
defecto (1400px) — necesita el ancho.

---

## 3. Reglas de uso

### Cuándo usar ListPage

- Cualquier página que liste entidades del producto y permita
  **filtrar / actuar / paginar**.
- Tabla, grid, timeline o split — todas son ListPage.

### Cuándo NO usar ListPage

- Una página de **panel de control** (overview con StatsCards) — usa
  un layout de overview propio. ListPage no admite StatsCards
  (UI_SPEC §2.4 regla crítica).
- Un **chat / workspace** — usa pattern Workspace (futuro).

### Anti-patrones

- ❌ Mezclar StatsCards con la lista. Las cifras viven en Status Tabs
  o en la Overview, no en la cabecera de la lista.
- ❌ Variar el ancho página a página. **1200px / 1400px** son los dos
  únicos valores permitidos (UI_SPEC §2.8).
- ❌ Re-implementar paginación inline. Usar el componente Pagination
  con la variante apropiada.
- ❌ Quitar el FilterBar "porque esta página tiene pocos items".
  Coherencia > excepción.
- ❌ Card list cuando lo correcto es tabla (>5 atributos).

---

## 4. Voz de marca aplicada (DD-022)

### Title (h1)

Sustantivo concreto en plural. **"Clientes"**, **"Facturas"**,
**"Tickets"**, **"Servicios"**. Sin "Lista de", sin "Gestión de".

### Subtitle (contador)

Voz de socio que cuenta. **No** "Total: 142 records":

| Voz operativa | Voz Aelium |
|---|---|
| "142 results" | "142 clientes" |
| "Showing 1-20 of 142" | "Mostrando 20 de 142 · ordena por nombre" |
| "0 records" | empty state, no subtitle vacío |
| "Filtered" | "20 con plan Pro" (subtitle se actualiza con filtro) |

### CTA del header

**"Nuevo cliente"** (no "+ Add" ni "Create"). El verbo en imperativo
solo cuando es la acción de un wizard ("Empezar onboarding"). Para
crear: sustantivo "Nuevo X".

### Eyebrow (opcional)

Contexto de sección si la nav lateral no lo deja claro. **"Operaciones >
Soporte"**. No en cliente (la nav ya es suficiente).

---

## 5. A11y

- `<main role="main">` envuelve `.list-page`.
- h1 único por página — el título de ListPage.
- Skip-link a `#lp-content` para saltar filtros.
- Status tabs con `role="tablist"` + `tab` + `tabpanel` (usar el
  componente Tabs DS).
- Filter bar inputs con label propio.
- Tabla con `<caption>` accesible (visualmente oculto si no aporta).
- Loading state: `aria-busy="true"` en `.lp-content`.
- Empty state: `<EmptyState>` con `role="status"` cuando es resultado
  de filtro.

---

## 6. Tokens consumidos

```
Layout       --space-6 (gap entre bloques)
             max-width 1200px / 1400px (wide)
Tipografía   --font-size-xl (h1) · --font-size-sm (subtitle) · --font-size-xs (eyebrow, meta)
             letter-spacing -0.015em (h1) · 0.08em (eyebrow)
Color        --text-primary · --text-secondary · --text-tertiary
             --brand (eyebrow) · --brand-subtle (split active)
             --surface-primary · --surface-secondary
             --border
Radius       --radius-lg (card de variantes timeline/split)
Sombra       --shadow-sm (split panes)
```

---

## 7. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D3-2** | Sin gap explícito entre bloques | Migrar `.container` a `flex column + gap: --space-6`. Hijos sin margin propio. |
| **D3-3** | Sin variantes nativas | Añadir prop `variant?: 'standard' \| 'grid' \| 'timeline' \| 'split'`. CSS materializado en mockup. |
| **D3-7** | PageHeader sin eyebrow | Añadir prop `eyebrow?: string` opcional. |
| **D3-13** | banner único, sin slot aside | No abrir slot. La variante `split` cubre el caso de aside-en-lista. |

---

## 8. Materialización

`docs/design/mockup/patterns/list-page.html` — 4 variantes apiladas con
caso producto real, voz Aelium, sin rombo decorativo (DD-030).

---

## 9. Composición · qué componentes encajan

| Componente DS | Standard | Grid | Timeline | Split |
|---|---|---|---|---|
| PageHeader (eyebrow opt) | ✅ | ✅ | ✅ | ✅ |
| AlertBanner (banner slot) | opt | opt | opt | opt |
| StatusTabs (DD-026) | si hay estados | si hay estados | rara | rara |
| FilterBar | ✅ | ✅ | ✅ | en master |
| Table | ✅ | ❌ | ❌ | ❌ |
| Card (service/featured) | ❌ | ✅ | ❌ | ❌ |
| Timeline (DD-027) | ❌ | ❌ | ✅ | ❌ |
| Pagination · standard | ✅ | ✅ | ❌ | ❌ |
| Pagination · load-more | ❌ | opt | ✅ | ❌ |
| Pagination · cursor | ❌ | ❌ | si sin total | ❌ |
| Pagination · compact | ❌ | ❌ | ❌ | en master |
| EmptyState | ✅ | ✅ | ✅ | ✅ |
| Skeleton | ✅ | ✅ | ✅ | ✅ |
