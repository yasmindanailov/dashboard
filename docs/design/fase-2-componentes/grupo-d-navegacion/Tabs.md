# Tabs (sistema de 5 variantes · DD-028)

> Estado: **listo · sistema completo**
> Fuentes: `frontend/app/components/ui/Tabs/` + `frontend/app/components/ui/StatusTabs/`
> Maquetas: `mockup/components/tabs.html` (subset) + `mockup/components/tabs-variantes.html` (sistema completo)

---

## 1. Filosofía del sistema

5 variantes. Cada una con un caso de uso real del producto. Cumple DD-029
("variante por contexto real + identidad Aelium en cada una").

```
┌─────────────────┬────────────────────────────────────────┬──────────────────────────┐
│ Variante        │ Caso de uso principal                  │ Reusa firma Aelium       │
├─────────────────┼────────────────────────────────────────┼──────────────────────────┤
│ Underline       │ Detail page (cliente, factura, ticket) │ Border-bottom brand      │
│ Underline+Dot   │ Filtros de estado en listings          │ StatusDot (DD-023)       │
│ Pill / Segment. │ Toggles binarios, period selectors     │ Surface elevation        │
│ Filled compact. │ Modales, drawers, espacios estrechos   │ brand-subtle             │
│ Vertical        │ Settings ≥ 8 secciones                 │ accent-stripe-left brand │
└─────────────────┴────────────────────────────────────────┴──────────────────────────┘
```

**Regla**: ningún uso de Tabs en el producto debería existir sin saber
cuál de estas 5 variantes le toca. Si dudas entre dos, elige la más simple.

---

## 2. Matriz "qué variante para qué caso"

| Si el caso es… | Usa | Por qué |
|---|---|---|
| Navegar entre vistas en una página de detalle (≤ 6 tabs) | **Underline** | Estándar B2B SaaS, escaneable, no abruma. |
| Filtrar listing por estado (todos/activos/vencidos…) | **Underline + StatusDot** | Dot semántico comunica el estado del filtro sin activarlo. |
| Period selector (Hoy/7d/30d/90d/Año) | **Pill / Segmented** | Transmite "interruptor entre opciones excluyentes". |
| Toggle binario (Activos/Archivados) | **Pill / Segmented** | Igual. |
| Tabs dentro de un Modal o Drawer | **Filled compacto** | Underline se pierde en estrecho. brand-subtle destaca el active. |
| Settings con muchas secciones (≥ 8) | **Vertical** | Lista horizontal no cabe; vertical permite scroll natural. |
| Sub-navegación larga en página dedicada | **Vertical** | Coherente con sidebar, accent-stripe brand. |

**Cuando NO usar Tabs en absoluto**: si el contenido entre vistas es
radicalmente distinto y conviene URL distinta, usa **rutas separadas**
con sidebar/breadcrumb, no Tabs.

---

## 3. Variante 1 · Underline (default)

### Anatomía
Botones en línea, border-bottom transparente. Active recibe
`border-bottom: 2px solid var(--brand)` + color brand.

### Estructura

```html
<div class="tabs" role="tablist">
  <button class="tab active" role="tab" aria-selected="true">Resumen</button>
  <button class="tab" role="tab">Servicios <span class="tab-count">5</span></button>
  <button class="tab" role="tab">Notas <span class="tab-count">3</span></button>
</div>
```

### Tokens

```
.tab               --space-3/4 · --font-size-sm · --font-weight-medium · --text-secondary
.tab.active        --brand · border-bottom-color --brand
.tab-count         --surface-secondary · --text-secondary · --radius-full · tabular nums
.tab.active .tab-count   --brand-subtle · --brand
```

### Ejemplos producto
- `/admin/clients/[id]` · Resumen · Servicios · Facturación · Notas · Soporte
- `/dashboard/services/[id]` · Resumen · Detalles · Logs
- `/admin/products/[id]/edit` · General · Pricing · Drivers · Soporte
- `/admin/tasks/[id]` · Detalle · Notas internas · Historial

---

## 4. Variante 2 · Underline + StatusDot (DD-026)

### Anatomía
Underline + StatusDot 8×8 prefix **siempre visible** en color semántico
+ count plano con tabular-nums.

### Estructura

```html
<div class="tabs" role="tablist">
  <button class="tab active" role="tab"><span class="tab-dot"></span>Todas <span class="tab-num">142</span></button>
  <button class="tab" role="tab"><span class="tab-dot warning"></span>Pendientes <span class="tab-num">5</span></button>
  <button class="tab" role="tab"><span class="tab-dot success"></span>Pagadas <span class="tab-num">130</span></button>
  <button class="tab" role="tab"><span class="tab-dot danger"></span>Vencidas <span class="tab-num">7</span></button>
</div>
```

### Tokens

```
.tab .tab-dot          8×8 · --radius-full · {color semántico}
.tab .tab-num          --font-feature-numeric · --text-tertiary
.tab.active .tab-num   --brand
```

### Ejemplos producto
- `/admin/billing` · Todas · Pendientes · Pagadas · Vencidas
- `/admin/clients` · Todos · Activos · Suspendidos · Cancelados
- `/admin/support` · Todos · Abiertos · Sin asignar · En revisión · Cerrados
- `/dashboard/billing` · Todas · Pendientes · Pagadas

### Por qué Aelium (no genérico)
Reusa StatusDot existente. El dot semántico se ve **siempre**, no solo
al activar (que es lo que hacen los pills genéricos). El usuario lee el
estado de cada filtro sin tocar nada.

---

## 5. Variante 3 · Pill / Segmented control (DD-028 · NUEVA)

### Anatomía
Pills agrupados en un wrapper con bg `--surface-secondary` + border.
Active recibe `--surface-primary` + `--shadow-xs` (sensación de
"interruptor presionado").

### Estructura

```html
<div class="tabs-pill" role="tablist">
  <button class="tab-pill" role="tab">Hoy</button>
  <button class="tab-pill active" role="tab">7 días</button>
  <button class="tab-pill" role="tab">30 días</button>
  <button class="tab-pill" role="tab">90 días</button>
  <button class="tab-pill" role="tab">Año</button>
</div>
```

### Tokens

```
.tabs-pill              --surface-secondary · --border · --radius-sm · padding 3px
.tab-pill               --space-1_5/3 · --font-size-sm · --text-secondary · --radius-xs
.tab-pill.active        --surface-primary · --text-primary · --shadow-xs
```

### Ejemplos producto
- Period selector en `/admin` Overview · Hoy / 7d / 30d / 90d / Año
- Modo de visualización · Lista / Tarjetas (con iconos)
- Estado de servicios cliente · Activos / Archivados
- Tipo de gráfica · Línea / Barras / Área (en futuro charts)

### Por qué Aelium (no genérico)
La elevación viene del shadow-xs (sutil, de la misma escala que
`.card-action:hover`) y la transición usa `--ease-out`. Pills cumplen
firma visual general: tokens marca, focus-ring doble.

---

## 6. Variante 4 · Filled compacto (DD-028 · NUEVA)

### Anatomía
Tabs sin underline ni wrapper grupal. Active recibe `--brand-subtle`
bg + `--brand` color. Para espacios estrechos donde el underline se
pierde.

### Estructura

```html
<div class="tabs-filled" role="tablist">
  <button class="tab-filled active" role="tab">General</button>
  <button class="tab-filled" role="tab">Pago</button>
  <button class="tab-filled" role="tab">Notificaciones</button>
</div>
```

### Tokens

```
.tab-filled               --space-1_5/3 · --font-size-sm · --text-secondary · --radius-sm
.tab-filled:hover         --surface-secondary · --text-primary
.tab-filled.active        --brand-subtle · --brand
```

### Ejemplos producto
- Modal "Configurar servicio" · General / Pago / Notificaciones
- Drawer "Detalle de cliente" lateral · Detalles / Historial / Logs
- Side panel de filtros avanzados

### Por qué Aelium (no genérico)
Active `--brand-subtle` es exactamente la misma señal que usa el
sidebar item activo, los CommandPalette items, el `.card-action:hover`,
los applied filters. Coherencia total con la firma de marca.

---

## 7. Variante 5 · Vertical (DD-028 · NUEVA)

### Anatomía
Lista vertical con accent-stripe-left brand 3px en el active.
Coherente con sidebar principal de la app.

### Estructura

```html
<div class="tabs-vertical" role="tablist">
  <button class="tab-vert" role="tab">Perfil</button>
  <button class="tab-vert active" role="tab">Facturación</button>
  <button class="tab-vert" role="tab">Notificaciones <span class="tab-num">3</span></button>
  <button class="tab-vert" role="tab">Seguridad</button>
  <button class="tab-vert" role="tab">Servicios</button>
  <button class="tab-vert" role="tab">Equipo</button>
  <button class="tab-vert" role="tab">Integraciones</button>
  <button class="tab-vert" role="tab">Sesiones</button>
</div>
```

### Tokens

```
.tabs-vertical            min-width 220px · gap 2px
.tab-vert                 --space-2/3/4 · --text-secondary · border-left 3px transparent
.tab-vert:hover           --surface-secondary · --text-primary
.tab-vert.active          --brand-subtle · --brand · border-left-color --brand
```

### Ejemplos producto
- `/dashboard/settings` cliente · Perfil / Facturación / Notificaciones / Seguridad / Servicios / Equipo / Integraciones / Sesiones
- `/admin/settings` · General / Equipo / Roles / Email templates / Webhooks / API keys / Audit log / Facturación de Aelium
- Sub-navegación de un módulo extenso (futuro)

### Por qué Aelium (no genérico)
Reusa el `accent-stripe-left` brand del sidebar — el usuario que entra
a Settings ve el mismo lenguaje visual que en la nav principal: la app
"se siente continua". Cumple DD-023 (firma visual aplicada).

---

## 8. Estados (transversal a las 5)

| Estado | Comportamiento |
|---|---|
| **default** | Color secondary. |
| **hover** | Color primary. Pill: bg sutil. Filled: bg surface-secondary. Vertical: bg surface-secondary. |
| **focus-visible** | `--focus-ring` (universal). |
| **active** | Identificador específico de cada variante (border, bg, color). |

---

## 9. Accesibilidad (transversal)

- `role="tablist"` en wrapper, `role="tab"` en cada botón.
- `aria-selected="true"` en activo.
- **Keyboard nav obligatorio**: Arrow Left/Right (horizontal) o Up/Down (vertical), Home/End, Enter/Space, Tab para salir del tablist.
- Focus visible (`--focus-ring`) sin excepción.

---

## 10. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **DD-028** | Solo Tabs + StatusTabs en código (2 patrones) | Añadir Pill, Filled, Vertical como variantes nuevas. |
| **DD-026** | StatusTabs con pill + count semántico al activar | Reemplazar por StatusDot prefix + tab-num plano. |
| **D2D-7** | Sin keyboard nav | Implementar Arrow keys + Home/End en todas las variantes. |
| Voz | Labels en castellano corto | Aplicar en cada uso. |

### Implementación esperada

Refactor de `Tabs.tsx`:

```ts
interface TabsProps {
  variant?: 'underline' | 'status' | 'pill' | 'filled' | 'vertical'
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
}

interface Tab {
  id: string
  label: string
  count?: number
  status?: 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'neutral'
  icon?: ReactNode
}
```

Alternativa: 3 componentes separados (`Tabs`, `Pills`, `VerticalTabs`)
si la API combinada se complica. Decidir en modo implementación.

---

## 11. Materialización

- `mockup/components/tabs.html` — variantes 1 y 2 con ejemplos producto.
- `mockup/components/tabs-variantes.html` — sistema completo de 5 variantes con análisis industria, casos de uso, comparativas pros/cons.
- `mockup/styles.css` — clases `.tabs`, `.tabs-pill`, `.tabs-filled`, `.tabs-vertical`.
