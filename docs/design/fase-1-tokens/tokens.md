# tokens.md — Aelium Dashboard, Fase 1

> Tabla canónica de todos los design tokens entregados en fase 1.
> Cada token se referencia por nombre — nunca por valor literal.
> Fuente visual: `preview.html`. Fuente código: `tokens.css`.

---

## 1. Color · Brand

| Token | Valor | Uso |
|-------|-------|-----|
| `--brand` | `#3B82F6` | Color principal de marca. CTA primary, link, focus, sidebar item activo. |
| `--brand-hover` | `#2563EB` | Hover de elementos brand. |
| `--brand-active` | `#1D4ED8` | Estado pressed/active de elementos brand. |
| `--brand-light` | `#DBEAFE` | Fondo suave brand (badge, sidebar item activo). |
| `--brand-subtle` | `rgba(59,130,246,0.06)` | Fondo aún más suave (hover de sidebar item, área brand pasiva). |

> **Nota.** Curado a 5 puntos, no escala 50–950. Si un componente futuro pide
> pasos intermedios, se añaden ahí. Ver DD-013.

## 2. Color · Semánticos

Cada estado tiene 5 variantes: `base`, `-hover`, `-light`, `-border`, `-strong`.

### Success — resuelto, activo, online, pago confirmado

| Token | Valor |
|-------|-------|
| `--success` | `#10B981` |
| `--success-hover` | `#059669` |
| `--success-light` | `rgba(16,185,129,0.08)` |
| `--success-border` | `rgba(16,185,129,0.18)` |
| `--success-strong` | `#047857` (texto sobre `-light`, AA 5.9:1) |

### Warning — esperando cliente, vencimiento próximo, ratelimit

| Token | Valor |
|-------|-------|
| `--warning` | `#F59E0B` |
| `--warning-hover` | `#D97706` |
| `--warning-light` | `rgba(245,158,11,0.08)` |
| `--warning-border` | `rgba(245,158,11,0.18)` |
| `--warning-strong` | `#92400E` (texto sobre `-light`, AA 7.1:1) |

### Danger — error, suspendido, factura vencida

| Token | Valor |
|-------|-------|
| `--danger` | `#EF4444` |
| `--danger-hover` | `#DC2626` |
| `--danger-light` | `rgba(239,68,68,0.08)` |
| `--danger-border` | `rgba(239,68,68,0.18)` |
| `--danger-strong` | `#B91C1C` (texto sobre `-light`, AA 6.4:1) |

### Info — aviso neutro, ayuda contextual

| Token | Valor |
|-------|-------|
| `--info` | `#3B82F6` (≡ brand, role distinto) |
| `--info-hover` | `#2563EB` |
| `--info-light` | `rgba(59,130,246,0.08)` |
| `--info-border` | `rgba(59,130,246,0.18)` |
| `--info-strong` | `#1E40AF` (texto sobre `-light`, AA 8.6:1) |

### Pending — en proceso, en revisión, pendiente de validación

| Token | Valor |
|-------|-------|
| `--pending` | `#8B5CF6` |
| `--pending-hover` | `#7C3AED` |
| `--pending-active` | `#6D28D9` |
| `--pending-light` | `rgba(139,92,246,0.08)` |
| `--pending-border` | `rgba(139,92,246,0.18)` |
| `--pending-strong` | `#6D28D9` |

> **Regla.** Gris neutral para metadata descriptiva sin valoración (fecha,
> autor, ID). Color semántico solo cuando hay estado o riesgo. Los
> semánticos cuestan atención del usuario — no se gastan en metadata.

## 3. Color · Neutrales

### Superficies

| Token | Valor | Uso |
|-------|-------|-----|
| `--surface-primary` | `#FFFFFF` | Lienzo de Card, Modal, Dropdown. |
| `--surface-secondary` | `#F7F7F8` | Fondo de página detrás de las cards. Topbar background. |
| `--surface-tertiary` | `#F1F5F9` | Skeleton, fondo de tag plano, separador denso. **Uso restringido**. |
| `--surface-dark` | `#0A0A0B` | Tooltip oscuro, BulkActionBar floating. |

### Texto

| Token | Valor | Uso |
|-------|-------|-----|
| `--text-primary` | `#0A0A0B` | Texto principal, valores, títulos. |
| `--text-secondary` | `#6B7280` | Descripciones, labels, texto secundario. |
| `--text-tertiary` | `#9CA3AF` | Metadata, placeholder, separadores tipográficos. |
| `--text-on-brand` | `#FFFFFF` | Texto sobre fondo brand (Button primary). |
| `--text-on-dark` | `rgba(255,255,255,0.92)` | Texto sobre `--surface-dark`. |

### Bordes

| Token | Valor | Uso |
|-------|-------|-----|
| `--border` | `rgba(0,0,0,0.06)` | Default — Card, Input, Topbar. |
| `--border-hover` | `rgba(0,0,0,0.10)` | Hover de Card interactiva, Input, Select, Dropdown trigger. |
| `--border-active` | `rgba(0,0,0,0.15)` | Estado presionado o seleccionado (no `--brand`). |

> **Regla.** Hover/active del borde = transición de **intensidad**, no de color.
> El `--brand` se reserva para focus visible y acento.

## 4. Spacing — escala 4px

| Token | Valor | Uso recomendado |
|-------|-------|-----------------|
| `--space-0` | `0px` | Reset. |
| `--space-0_5` | `2px` | Ajustes ópticos en iconos. |
| `--space-1` | `4px` | Gap label↔valor, ajuste interno de chip. |
| `--space-1_5` | `6px` | Padding vertical de tag/chip pequeño. |
| `--space-2` | `8px` | Gap botón↔icono, padding badge. |
| `--space-2_5` | `10px` | Padding vertical de Input sm. |
| `--space-3` | `12px` | Padding Input md, gap entre items en lista. |
| `--space-4` | `16px` | Padding Card sm, gap horizontal de FilterBar. |
| `--space-5` | `20px` | Padding Card md, separación filas de form. |
| `--space-6` | `24px` | Padding Card lg, padding interior de PageHeader. |
| `--space-8` | `32px` | Separación entre secciones dentro de página. |
| `--space-10` | `40px` | Padding lateral de main, separación PageHeader↔contenido. |
| `--space-12` | `48px` | Top padding de página, separación entre bloques mayores. |
| `--space-16` | `64px` | Empty state vertical, separación hero/contenido en cliente. |

## 5. Tipografía

### Familias

| Token | Valor | Uso |
|-------|-------|-----|
| `--font-family` | `'DM Sans', ui-sans-serif, system-ui, ...` | Toda la UI. Pesos: 400 / 500 / 600. |
| `--font-mono` | `'JetBrains Mono', ui-monospace, ...` | IDs, hashes, dominios, IPs, timestamps técnicos. |

### Pesos

| Token | Valor | Uso |
|-------|-------|-----|
| `--font-weight-regular` | `400` | Default. Cuerpo, párrafos, labels, valores en celdas. |
| `--font-weight-medium` | `500` | Botones, headers de tabla, navegación activa, badges, h2/h3, énfasis ligero. |
| `--font-weight-semibold` | `600` | **Reservado** — números grandes en StatsCard, display headings, h1, énfasis fuerte. |

### Escala

| Token | Tamaño | Line-height token | Uso semántico |
|-------|--------|-------------------|---------------|
| `--font-size-xs` | `11px` | `--line-height-normal` | caption, badge interno, metadata muy secundaria. |
| `--font-size-sm` | `13px` | `--line-height-normal` | small, helper de input, items de menú compacto. |
| `--font-size-base` | `14px` | `--line-height-normal` | body — cuerpo del shell denso (agente/admin). |
| `--font-size-md` | `16px` | `--line-height-normal` | body-lg — cuerpo cliente, descripciones de empty state, lede. |
| `--font-size-lg` | `20px` | `--line-height-snug` | h3 — título de Card, sección dentro de Detail. |
| `--font-size-xl` | `24px` | `--line-height-snug` | h2 — subtítulo de página, header de Detail. |
| `--font-size-2xl` | `32px` | `--line-height-tight` | h1 — título de página. |
| `--font-size-3xl` | `40px` | `--line-height-tight` | display-sm — número StatsCard, hero cliente. |
| `--font-size-4xl` | `56px` | `--line-height-tight` | display-lg — empty state grande, hero principal. |

### Line-heights

| Token | Valor | Uso |
|-------|-------|-----|
| `--line-height-tight` | `1.2` | Display y h1. |
| `--line-height-snug` | `1.35` | h2 y h3. |
| `--line-height-normal` | `1.5` | Body por defecto. |
| `--line-height-relaxed` | `1.625` | Párrafos largos en empty states o auth. |

## 6. Radios

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-xs` | `4px` | Code chip, inline tag, kbd, focus ring inset. |
| `--radius-sm` | `8px` | Input, Select, Textarea, AlertBanner. |
| `--radius-md` | `12px` | Card, Modal, Dropdown, Tooltip dark, Toast. |
| `--radius-lg` | `16px` | Modal grande, panel lateral (NotificationBell, SupportPanel). |
| `--radius-xl` | `24px` | Hero cliente, contenedor de empty state grande. |
| `--radius-full` | `9999px` | Button, Badge, Avatar, StatusDot, Pagination. |

## 7. Sombras

> **Regla.** Card no usa sombra por defecto — vive sobre `--surface-secondary`
> con borde. Las sombras se reservan para elementos *levantados*.

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.03)` | Hover sutil de Card interactiva. |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | Topbar al hacer scroll. |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | Dropdown, CommandPalette, Popover. |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.08)` | Modal, Toast. |
| `--shadow-xl` | `0 12px 40px rgba(0,0,0,0.12)` | ChatWidget flotante, panel lateral overlay. |
| `--shadow-brand` | `0 4px 24px rgba(59,130,246,0.12)` | Hover de botón brand prominente, focus de input crítico. |

## 8. Motion

### Durations

| Token | Valor | Uso |
|-------|-------|-----|
| `--transition-fast` | `150ms` | Hover de botón/link, color, focus ring, opacidad. |
| `--transition-normal` | `200ms` | Apertura de Dropdown, transform de Toggle. |
| `--transition-slow` | `300ms` | Cambio de pestaña, layout shifts. |

### Easings

| Token | Curva | Uso |
|-------|-------|-----|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entradas. Modal entrando, dropdown abriendo, toast apareciendo. |
| `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Salidas. Modal cerrando, toast auto-dismiss, item eliminado. |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Default. Hover bidireccional, expand/collapse, swap. |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Énfasis. Toast aparece, badge nuevo, success. **Uso restringido**. |

> **Regla qué token con qué tecnología.**
> - `--transition-*` + `--ease-*` → CSS transitions de propiedad simple.
> - `--motion-*` (ver Firma visual) → Framer Motion entry/exit choreography.

## 9. Layout

### Chrome

| Token | Valor | Uso |
|-------|-------|-----|
| `--sidebar-width` | `260px` | Sidebar expandido. |
| `--sidebar-collapsed` | `72px` | Sidebar replegado (solo iconos). |
| `--topbar-height` | `56px` | Altura del topbar sticky. |

### Containers — ancho máximo de contenido por tipo de página

| Token | Valor | Uso |
|-------|-------|-----|
| `--container-form` | `720px` | Form pages (D10) — una columna, lectura cómoda. |
| `--container-detail` | `1040px` | Detail pages — header + tabs, contenido a 2 columnas máximo. |
| `--container-list` | `1280px` | List pages — tablas con muchas columnas, dashboards. |
| _(none)_ | _fluid_ | Workspace (chats 3 columnas), sin container. |

## 10. Z-index

| Token | Valor | Uso |
|-------|-------|-----|
| `--z-dropdown` | `100` | Dropdown, Select abierto, autocomplete. |
| `--z-sticky` | `200` | Topbar sticky, header de tabla sticky, BulkActionBar. |
| `--z-overlay` | `300` | Backdrop oscuro de Modal/panel. |
| `--z-modal` | `400` | Modal, CommandPalette (Cmd+K), panel lateral. |
| `--z-toast` | `500` | Toast container, ChatWidget flotante. |
| `--z-tooltip` | `600` | Tooltip, HelpTip — siempre encima. |

## 11. Iconografía

| Token | Valor | Uso |
|-------|-------|-----|
| `--icon-size-sm` | `14px` | Inline en texto sm/body, dentro de Badge, prefijo de Input. |
| `--icon-size-md` | `16px` | Default — Botón sm/md, sidebar, navegación, header de tabla. |
| `--icon-size-lg` | `20px` | Botón lg, StatsCard, empty state, AlertBanner. |
| `--icon-stroke-width` | `1.5` | Stroke uniforme — coherente con DM Sans (humanista, no geométrico). |

> **Nota fase 2.** El set concreto (Lucide, Phosphor, custom) se decide en
> fase 2. Esta fase establece solo los tokens.

## 12. Firma visual

### Accent — variable indirecta

| Token | Valor | Uso |
|-------|-------|-----|
| `--accent` | `var(--brand)` | Componentes consumen esto en vez de `--brand` directo. |
| `--accent-hover` | `var(--brand-hover)` | |
| `--accent-light` | `var(--brand-light)` | |
| `--accent-subtle` | `var(--brand-subtle)` | |

> Override por portal **diferido a fase 4 (shells)**. Por ahora `--accent`
> ≡ `--brand` en toda la app.

### Mesh — extiende GradientMesh al producto

| Token | Valor | Uso |
|-------|-------|-----|
| `--mesh-opacity-auth` | `1` | Pantallas de auth. Visible. |
| `--mesh-opacity-product` | `0.04` | Producto. Imperceptible aislado, reconocible comparado. |

### Densidad — dos dialectos del mismo sistema

#### Valores raw

| Token | Valor |
|-------|-------|
| `--row-height-compact` | `36px` |
| `--row-height-comfortable` | `56px` |
| `--cell-padding-compact` | `10px 12px` |
| `--cell-padding-comfortable` | `16px 20px` |
| `--card-padding-compact` | `16px` |
| `--card-padding-comfortable` | `24px` |
| `--body-size-compact` | `14px` |
| `--body-size-comfortable` | `16px` |

#### Variables resueltas (las que consumen los componentes)

| Token | Resuelto vía |
|-------|--------------|
| `--row-height` | `[data-density]` (compact por defecto en `:root`) |
| `--cell-padding` | idem |
| `--card-padding` | idem |
| `--body-size` | idem |

> Asignación por portal (cliente=comfortable, agente/admin=compact, partner=?)
> se decide en fase 4.

### Focus ring — anillo doble

| Token | Valor | Uso |
|-------|-------|-----|
| `--focus-ring` | `0 0 0 2px var(--surface-primary), 0 0 0 4px var(--brand)` | `:focus-visible` sobre fondo claro. |
| `--focus-ring-on-dark` | `0 0 0 2px var(--surface-dark), 0 0 0 4px var(--brand-light)` | `:focus-visible` sobre fondo oscuro. |

> **Aplicación.** `outline: none; box-shadow: var(--focus-ring);` en
> `:focus-visible`. Inputs, selects, botones, links.

### Tabular numerals

| Token | Valor | Uso |
|-------|-------|-----|
| `--font-feature-numeric` | `"tnum" 1, "lnum" 1` | Tablas, métricas, importes, fechas, IDs. **No** en cuerpo narrativo. |

### Motion choreography (Framer Motion)

#### Stagger

| Token | Valor | Uso |
|-------|-------|-----|
| `--motion-stagger-fast` | `30ms` | Listas cortas (≤ 5 elementos). |
| `--motion-stagger-base` | `60ms` | Listas largas, grids, columnas de tabla. |

#### Transiciones canónicas

| Token | Valor | Uso |
|-------|-------|-----|
| `--motion-route` | `220ms ease-out` | Cambio de ruta entre páginas de la misma sección. |
| `--motion-stack-in` | `180ms ease-out` | Card / Drawer / Dropdown entrando. |
| `--motion-stack-out` | `140ms ease-in` | Card / Drawer / Dropdown saliendo. |
| `--motion-modal-in` | `240ms ease-out` | Modal grande, panel lateral overlay. |
| `--motion-modal-out` | `180ms ease-in` | Cierre de modal/panel. |

---

## Resumen

- **42 tokens nuevos** sobre `globals.css` actual.
- **0 valores existentes modificados.** Migración aditiva.
- **1 selector nuevo:** `[data-density="comfortable"]`. Default compact en `:root`.
- **Override por portal:** diferido a fase 4. `--accent` ≡ `--brand` por ahora.
- **Implementabilidad:** 100% Next.js 16 + CSS Modules + Tailwind 4 +
  Framer Motion 12. Sin librerías UI externas.
