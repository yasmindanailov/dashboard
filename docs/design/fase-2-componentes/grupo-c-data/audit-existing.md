# audit-existing.md — 5 componentes data

---

## 1. Table (`Table.tsx` 254L · `Table.module.css` 135L)

```ts
columns: TableColumn<T>[]
data: T[]
rowKey, sort, onSortChange, onRowClick
loading, skeletonRows
emptyIcon/title/description/action
selectable, selectedIds, onSelectionChange
```

**Hallazgos:**
- ✓ Soporta sorting, loading skeleton, empty state, bulk selection,
  row click. Completo.
- ⚠ **D2C-D**: Sort icon es texto `↑/↓`. Migrar a SVG inline para mejor
  tipografía y escalado.
- ⚠ **D2C-J**: No hay convención para columnas numéricas con `.num`.
  Spec añade prop `align="right"` + clase `.num` aplicada por columna.
- ⚠ Skeleton cells usan `Skeleton width "80%"` — funcional pero genérico.
  Spec sugiere skeleton-row para una sola variante de loading.
- ⚠ Hover row `--surface-secondary` — ok.
- ⚠ Selected row `--brand-subtle` — ok, coherente con sidebar active.
- ⚠ Custom checkbox 16x16 con check pseudo. Bien diseñado.
- ✓ EmptyState integrado.
- ⚠ Header sticky no implementado. Sería útil en tablas largas. **Deuda
  fase 2 → fase 3 (ListPage)**.

## 2. Pagination (`Pagination.tsx` 129L · `Pagination.module.css` 73L)

```ts
page, totalPages, onPageChange
total?, limit?
maxVisible? (default 5)
```

**Hallazgos:**
- ✓ Página activa con `--brand` bg + `--shadow-brand`. Coherente con
  fase 1.
- ✓ Ellipsis truncation correcta.
- ✓ Info text "11–20 de 95" — bien para listings con total conocido.
- ⚠ **D2C-F**: Chevrons hardcoded 16px. Migrar a `--icon-size-md`.
- ⚠ Active button: `box-shadow: var(--shadow-brand)` muy notorio.
  Considerar reducir intensidad o quitar (mantener solo el fill brand
  para señal clara).
- ⚠ `font-weight-semibold` en active. Ok.
- ⚠ Sin indicador visual del rango (50-100, 100-150). Usuario no sabe
  cuántos items hay sin mirar el info text. Ok, ya está cubierto por
  info.

## 3. StatsCard (`StatsCard.tsx` 84L · `StatsCard.module.css` 70L)

```ts
label: ReactNode
value: string | number
icon?, trend? { value, direction: up|down }, subtext?
accentColor? (border-left)
```

**Hallazgos:**
- ⚠ **D2C-2**: `value` en `--font-size-xl` (24px). Pequeño para impacto
  en Overview. Spec sube a `--font-size-3xl` (40px display-sm) **en métricas
  primarias** y mantiene 24px en secundarias.
- ⚠ Aplicar `.num` (tabular-nums) automáticamente al value.
- ⚠ Icon container 36×36 con `--brand-subtle`. Bien — touch de marca.
  Considerar variantes de color (success/warning/danger) para diferenciar
  tipos de métrica.
- ✓ Trend: ↑ en `--success`, ↓ en `--danger`. Universal y claro.
- ⚠ Trend icons hardcoded 12px. Migrar a `--icon-size-sm` o documentar
  excepción.
- ⚠ **D2C-3**: AccentColor border-left existe pero sin uso semántico
  documentado. Spec define variantes: `accent="success"` para métricas
  positivas, `"warning"` para próximas, `"danger"` para urgentes.
- ⚠ Hover sutil con `--shadow-sm`. Ok pero podría aplicar `.card-action`
  cuando la card es navegable a detalle.

## 4. BulkActionBar (`BulkActionBar.tsx` 56L · `BulkActionBar.module.css` 67L)

```ts
count: number
onClear: () => void
children: ReactNode
```

**Hallazgos:**
- ⚠ **D2C-1 / D2C-G**: Es **light** (`--surface-primary` + `--shadow-xl`),
  pero el mapping de fase 1 decía dark. **Decidir**.
  Mi voto: mantener light. Razones:
  - Coherente con minimalismo funcional.
  - Shadow-xl + brand color en el count ya destacan suficiente.
  - Dark añadiría drama que choca con resto.
- ✓ `--z-dropdown` (100). Coherente.
- ⚠ **D2C-H**: Animación `barIn 200ms ease`. Migrar a `--motion-modal-in`
  (240ms ease-out — más suave para algo que aparece desde abajo).
- ✓ Count en `--brand` `--font-weight-semibold`. Bien.
- ✓ Divider entre count, actions, clear button.
- ⚠ "Deseleccionar" como botón ghost. Ok.
- ⚠ `--radius-lg` (16px). Mapping fase 1 decía `--radius-full`. **Light bar
  con radius-lg está bien** — más sólido que pill. Mantener.

## 5. FilterBar (`FilterBar.tsx` 51L · `FilterBar.module.css` 32L)

```ts
search: ReactNode (slot)
filters?: ReactNode (slot)
```

**Hallazgos:**
- ✓ Layout simple: search flex-1 + filters fixed-right.
- ✓ Responsive: stack en mobile.
- ⚠ **D2C-4**: Sin indicador visual de "filtros aplicados". Cuando un
  usuario aplica filtros, debería verlo claramente. Spec añade pattern:
  cuando hay filtros activos, mostrar pill/badge "3 filtros activos" +
  "Limpiar". Aplicar `.accent-stripe-left` al wrapper o un sub-elemento.
- ⚠ Sin slot para "filtros aplicados" entre search y selects. Spec lo
  añade como composición opcional.

---

## Resumen de drifts y decisiones

| ID | Componente | Drift | Resolución |
|----|------------|-------|------------|
| **D2C-1** | BulkActionBar | Light vs dark mapping fase 1 | **Light**. Documentar decisión. |
| **D2C-2** | StatsCard | Value 24px pequeño | Display-sm 40px primarias. |
| **D2C-3** | StatsCard | accentColor sin semántica | Variantes: brand, success, warning, danger. |
| **D2C-4** | FilterBar | Sin indicador filtros activos | Añadir pattern visible. |
| **D2C-5** | Table | Sort icon texto | Migrar a SVG. |
| **D2C-D** | Table | Sort icon arrow texto | (mismo que D2C-5) |
| **D2C-F** | Pagination | Chevrons hardcoded | Migrar a `--icon-size-md`. |
| **D2C-G** | BulkActionBar | (alias D2C-1) | (mismo) |
| **D2C-H** | BulkActionBar | Anim hardcoded | Migrar a `--motion-modal-in`. |
| **D2C-J** | Table | Sin convención `.num` | Aplicar via columna `align="right"` o prop `numeric`. |
| **D2C-K** | StatsCard | Trend icon hardcoded | `--icon-size-sm` o documentar excepción. |
