# NOTES.md — Fase 1, deudas y decisiones que pasan a fases siguientes

> Cosas que esta fase deja abiertas o que requieren atención en fases
> posteriores. Cada item indica la fase responsable de cerrarlo.

---

## Para fase 2 (componentes base)

### N-1 · Refactor de hardcoded text colors a `-strong`
Componentes que actualmente pintan texto sobre fondo `-light` con hex
literal (`#047857`, `#92400E`, `#B91C1C`, `#1E40AF`). Candidatos
identificados sin auditar: `Badge`, `AlertBanner`, `Toast`. La spec de
cada uno debe pasar a consumir `--{state}-strong`.

### N-2 · Set concreto de iconografía
Decidir entre Lucide (no instalado), Phosphor, Heroicons o set custom.
La fase 1 entrega tokens (`--icon-size-*`, `--icon-stroke-width`); la
elección del set y la integración (¿inline SVG generado?, ¿librería ligera?)
es de fase 2.

### N-3 · Tabular nums: aplicación práctica
Decidir entre:
- (a) Clase utility `.tabular-nums` aplicada manualmente.
- (b) Aplicación automática en `<td>` de cualquier `Table` que tenga
  columnas marcadas como `numeric`.
- (c) Mixin / hook reutilizable.

Sea cual sea la opción, debe consumir `--font-feature-numeric`.

### N-4 · Focus ring en cada componente interactivo
Los specs de Button, Input, Select, Textarea, Dropdown, Tabs, Pagination,
SearchInput deben sobreescribir el outline nativo y aplicar
`box-shadow: var(--focus-ring)` en `:focus-visible`. Caso especial:
componentes sobre `--surface-dark` (BulkActionBar, Tooltip) usan
`--focus-ring-on-dark`.

### N-5 · Componentes que consumen `--accent` vs `--brand`
Definir regla por componente. Hipótesis: componentes de **shell** y
**navegación** (Sidebar, Topbar, NotificationBell, sidebar item activo)
consumen `--accent` para que el portal-aware override funcione en fase 4.
Componentes de **acción brand** (Button primary, link primario) consumen
`--brand` directo — la marca no cambia por portal.

### N-6 · Densidad — qué consume `--card-padding` / `--row-height`
Listar exactamente qué componentes usan las variables resueltas:
- `Table` → `--row-height`, `--cell-padding`
- `Card` → `--card-padding` (vs `--space-5/6` actuales)
- `<body>` o shell → `font-size: var(--body-size)` para el dialecto del shell

Si `Card` migra de `--space-5/6` a `--card-padding`, hay que asegurar
que `--card-padding-compact` (16px) y `--card-padding-comfortable` (24px)
cubren los usos actuales.

---

## Para fase 4 (layout shells)

### N-7 · Asignación por portal de `--accent`
Decisión cerrada en DD-014: el override por portal se decide en fase 4.
Material para esa decisión:
- ¿Se mantiene `--accent` ≡ `--brand` en todos los portales? (defensa de marca)
- ¿O se introduce variación por portal? Si sí, mecanismo recomendado:
  variar **intensidad del mesh** (`--mesh-tint`) y **densidad**, no el
  color del accent.
- Si finalmente se mete acento por portal, evitar `#F59E0B` (= warning,
  antipatrón).

### N-8 · Asignación por portal de `[data-density]`
Decisión cerrada en DD-016: la asignación se decide en fase 4. Hipótesis
provisional:
- Cliente → `[data-density="comfortable"]`
- Agente → compact (default)
- Admin → compact (default)
- Partner → compact (provisional, confirmar en fase 8)

### N-9 · Mesh aplicado al producto
`--mesh-opacity-product: 0.04` está definido. Falta especificar:
- Dónde aparece (Overview de cada portal, hero cliente, empty states grandes).
- Si el mesh "tinta" varía por portal (decisión vinculada a N-7).
- Cómo se combina con `--surface-secondary` de fondo de página.

### N-10 · Choreography concreta de cambios de ruta
`--motion-route` está definido (220ms ease-out). Falta:
- Patrón concreto: ¿fade?, ¿slide horizontal sutil?, ¿fade + scale?
- Implementación con Framer Motion (variants compartidas en el shell).

---

## Para fase 11 (dark mode)

### N-11 · Valores oscuros por definir
Pendiente:
- `--surface-primary`, `--surface-secondary`, `--surface-tertiary` invertidos.
- `--text-primary` rgba(255,255,255,0.92) y escalas.
- `--border` con alpha sobre fondo oscuro.
- Revisar contraste de los `-strong` sobre `-light` oscuros.
- `--shadow-*` reducidos o sustituidos por `--border-active`.
- `--mesh-opacity-product` posiblemente más alto en dark.

### N-12 · Activación
Decidir entre `[data-theme="dark"]`, `prefers-color-scheme: dark`, o ambos
con override manual. Persistencia en localStorage / cookie.

---

## Decisiones controvertidas registradas para no olvidar

### N-13 · `--surface-tertiary` con un solo uso conocido (Skeleton)
Si en fase 2 no aparecen más usos justificados, considerar:
- (a) Renombrar a `--surface-skeleton` (semántico claro).
- (b) Ampliar uso a fondos planos de tag/separador denso (documentado
  en notas del HTML).
- (c) Eliminar y migrar Skeleton a `--surface-secondary`.

Decisión pospuesta a fase 2 — ahí se ve si más componentes lo necesitan.

### N-14 · `--text-on-brand` y `--text-on-dark` no documentados
Existen en `globals.css` y se preservan. Falta documentación visual del
contraste blanco sobre fondo brand y rgba(255,255,255,0.92) sobre dark.
Añadir a la sección Color en una iteración menor del preview o cubrirlo
en specs de Button (primary) y Tooltip en fase 2.

---

## Reapertura DD-021 — alineación con documento de marca v1.6

Tras cerrar la fase en draft se detectó drift entre `globals.css` y
`docs/aelium-documento-de-marca.md` v1.6. La fase se reabrió **sobre
valores de color** (no estructura) para corregirlo. Ver:

- `audit.md` § 3.3
- `DECISIONS.md` DD-021
- `tokens.css` (valores actualizados)

Lo siguiente queda para fase de implementación:

### N-15 · Verificar contraste WCAG con los nuevos valores
- `--text-primary #0F172A` sobre `--surface-primary #FFFFFF`: alto contraste, sin riesgo.
- `--text-primary #0F172A` sobre `--surface-secondary #F8FAFF`: verificar AA antes de promocionar.
- `--text-secondary #64748B` sobre `--surface-secondary #F8FAFF`: caso límite, calcular ratio.
- Bordes `#E2E8F0` sobre `--surface-primary` y sobre `--surface-secondary`: visibilidad.

### N-16 · Caso de uso de `--accent-secondary` (#1F8EFA)
Marca lo introduce sin asignarle función. Decidir en fase 2 o 3 si:
- (a) Se usa para énfasis adicional sobre brand (link "ver más", info-light reforzado).
- (b) Se usa como acento en alguna superficie específica (StatsCard de éxito, success light variant).
- (c) Se reserva para cuando aparezca un caso real.

Mi voto: (c) hasta que aparezca uso. Token disponible, sin compromiso.

### N-17 · Posible refactor de hex literales en componentes
Tras promocionar tokens corregidos, hay que pasar el `grep` del audit § 3.3
sobre `frontend/` y migrar cualquier hex literal antiguo. Trabajo mecánico
de refactor, no de diseño.

---

## Lo que esta fase explícitamente NO entregó

- Specs visuales de los 35 componentes existentes — fase 2.
- Patrones de página (DetailPage, ListPage, FormPage) — fase 3.
- Layout shells por portal — fase 4.
- Mockups de páginas reales — fases 5–8.
- Auth flow — fase 9.
- Empty states con voz de marca — fase 10.
- Valores dark mode — fase 11.
- Set de iconos concreto — fase 2.
- Choreography concreta de rutas y stagger — fase 4.
