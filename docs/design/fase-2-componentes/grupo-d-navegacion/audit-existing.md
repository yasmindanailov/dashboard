# audit-existing.md — 5 componentes navegación

---

## 1. Tabs (`Tabs.tsx` 38L · `Tabs.module.css` 47L)

```ts
tabs: { id, label, count? }[]
activeTab: string
onChange: (id: string) => void
```

**Hallazgos:**
- ✓ Activo con `border-bottom: 2px solid var(--brand)` + color brand. Patrón horizontal correcto.
- ✓ Count opcional como pill `--surface-secondary` / `--brand-subtle` cuando activo.
- ✓ ARIA roles correctos.
- ⚠ Transición sin easing token. Migrar a `--ease-out`.
- ⚠ Sin keyboard nav (Arrow left/right entre tabs). Falta a11y.
- ⚠ Sin variant scrollable cuando hay muchos tabs.

## 2. StatusTabs (`StatusTabs.tsx` 79L)

Variante de Tabs con count + variant per-tab para listings de filtros.

```ts
tabs: { label, value, count?, variant? }[]
active: string
```

**Hallazgos:**
- ✓ Variant per-tab (success/warning/danger/info) → count badge usa color semántico cuando el tab está activo.
- ✓ Reemplaza StatsCards en list pages — cuenta filtra **e** informa.
- ⚠ Comparte CSS structure con Tabs base — misma deuda de keyboard + easing.

## 3. Breadcrumb (`Breadcrumb.tsx` 63L · `Breadcrumb.module.css` 33L)

```ts
items: { label, href? }[]
```

**Hallazgos:**
- ✓ Chevron separator SVG inline.
- ✓ Current item con `aria-current="page"`, font-semibold, ellipsis 300px.
- ✓ Link items con hover brand.
- ⚠ Icon hardcoded 14×14. Migrar a token (decidir entre `--icon-size-sm`).
- ⚠ Link items en `--text-tertiary` por defecto. Es muy claro — debería ser `--text-secondary` para legibilidad. Drift menor.
- ⚠ Sin truncate en items intermedios cuando son muy largos.

## 4. CommandPalette (`CommandPalette.tsx` 367L · `CommandPalette.module.css` 189L)

Sofisticado. Cmd+K. Sections (Recientes / Navegar / Acciones rápidas). Búsqueda con fuzzy. Keyboard nav completo. Recent localStorage. Role-aware (PBAC).

**Hallazgos:**
- ✓ Estructura completa: overlay + palette + searchRow + results + sections + footer.
- ✓ Keyboard nav Arrow/Enter/Esc.
- ✓ Animaciones overlayIn + paletteIn.
- ⚠ **D2D-3**: usa `var(--surface-hover)` que **no existe** en tokens.css. Bug — el hover no se ve.
- ⚠ Animaciones sin easing token.
- ⚠ `--surface, --border, --text-link` con fallbacks rgba — herencia de tiempos previos a tokens. Limpiar.
- ⚠ Footer hints OK y útiles. Mantener.
- ⚠ Empty state "No se encontraron resultados para 'foo'" — voz neutra, podría ser más Aelium ("No encontramos nada para 'foo'. Prueba con otra cosa.").

## 5. NotificationBell (`NotificationBell.tsx` 218L · `NotificationBell.module.css` 165L)

**Componente con drift muy importante** — usa colores y patterns legacy.

**Hallazgos:**
- ⚠ **D2D-1 / D2B-A**: hex hardcoded:
  - `#EF4444` en `.badge` → `--danger`
  - `#635BFF` (Stripe purple) en `.linkBtn` color, `.itemUnread` rgba bg, `.dot` background → debe ser `--brand`
  - `#FEF2F2`, `#991B1B`, `#FECACA` (red colors) en `.error` → `--danger-light`, `--danger-strong`, `--danger-border`
  - Border colors con fallbacks `var(--border, #e5e7eb)` — ya hay token. Limpiar fallback.
  - `#fff` literales → `var(--surface-primary)` o `var(--text-on-brand)`.
  - `--text-link` no existe → debería ser `--brand`.
- ⚠ Tamaños hardcoded en lugar de tokens (12px, 13px, etc.).
- ⚠ Box-shadow `0 12px 32px rgba(0,0,0,0.12)` → `--shadow-lg` o `--shadow-xl`.
- ⚠ `.dot` (8×8 round) — coincide con StatusDot, podría reusar componente.
- ⚠ Transition `120ms ease` → `--transition-fast` + `--ease-out`.
- ✓ Polling 30s + click outside + mark read + mark all + relativos en castellano. Lógica completa.
- ✓ Voz empty: "No tienes notificaciones nuevas." Bien.
- ⚠ Voz items: titles vienen del backend. Spec debe documentar reglas de copy backend (en NOTES).
- ⚠ Badge "9+" cuando >9. OK convención.
- ⚠ Sin pulse animation cuando hay nuevas. Aplicar StatusDot pattern (DD-023).

## 6. PortalBadge (`PortalBadge.tsx` 75L · `PortalBadge.module.css` 51L)

```ts
variant: 'admin' | 'client' | 'partner'
subtitle?: string
logo?: ReactNode | null  // default 'Aelium'
compact?: boolean        // sidebar collapsed
```

**Hallazgos:**
- ✓ "Logo + subtitle" pattern. Usado en sidebar header.
- ✓ Compact mode oculta subtitle.
- ✓ ARD-066 documentado en JSDoc — texto canónico vive en `lib/portal.ts`.
- ⚠ **D2D-4**: solo 3 variants (admin/client/partner). Falta `agent`. En la práctica, agente comparte sidebar con admin (mismo portal). Documentar.
- ⚠ **D2D-5**: subtitle admin en `--brand`, client en secondary, partner en secondary. Diferenciación **muy sutil**. Decisión de marca dice "diferenciación es por texto, no por color". Coherente, mantener pero podríamos reforzar con `.aelium-dot` antes del logo.
- ⚠ Logo es texto "Aelium" font-lg — funciona pero el SVG real existe. En la maqueta usamos SVG; en el código JSX se podría aceptar también.

---

## Resumen de drifts y decisiones

| ID | Componente | Drift | Resolución |
|---|---|---|---|
| **D2D-1** | NotificationBell | Hex Stripe legacy `#635BFF` | Migrar a `--brand`. |
| **D2D-2** | NotificationBell | Badge `#EF4444`, sin pulse | `--danger` + StatusDot.pulse opcional. |
| **D2D-3** | CommandPalette | `--surface-hover` no existe | Migrar a `--surface-secondary` o `--brand-subtle`. |
| **D2D-4** | PortalBadge | Sin variant `agent` | Documentar: agent reusa admin shell. |
| **D2D-5** | PortalBadge | Diferenciación sutil | Reforzar con `.aelium-dot.accent` antes del logo. |
| **D2D-6** | Tabs | accent-stripe vs border-bottom | Mantener border-bottom (horizontal). accent-stripe es para verticales. |
| D2D-7 | Tabs | Sin keyboard nav | Añadir Arrow left/right. |
| D2D-8 | Tabs/StatusTabs/Breadcrumb | Sin easing token | Migrar a `--ease-out`. |
| D2D-9 | CommandPalette | Voz empty neutra | Refactor a voz Aelium. |
| D2D-10 | NotificationBell | Tamaños hex hardcoded | Migrar todo a tokens. |
| D2D-11 | NotificationBell | Box-shadow inline | Usar `--shadow-xl`. |
| D2D-12 | Breadcrumb | Link color tertiary muy claro | Subir a secondary. |
