# NOTES.md — Fase 2.C · Data

> Deudas y decisiones que pasan a fases siguientes o al modo implementación.

---

## Para modo implementación

### N2C-1 · Sort icons SVG (D2C-5/D)
Texto `↑/↓` → SVG inline. Spec en `Table.md`. Cambio en JSX y CSS.

### N2C-2 · Convención `.numeric` en columnas
Documentar en `TableColumn` interface: prop `numeric?: boolean` que aplica
`align="right"` + clase `.numeric` (tabular nums + lining nums).

### N2C-3 · Pagination chevrons a token (D2C-F)
16px hardcoded → `var(--icon-size-md)`.

### N2C-4 · Pagination tabular nums
Aplicar `--font-feature-numeric` al `.page-btn` para que los números no
salten al cambiar de página (1 → 10 → 100).

### N2C-5 · Pagination shadow active
Quitar o reducir `--shadow-brand` en `.page-btn.active`. El fill brand
ya es señal suficiente y la sombra contamina las páginas adyacentes.

### N2C-6 · StatsCard value display-sm (D2C-2)
24px → `--font-size-3xl` (40px). Variante `compact` mantiene 24px.

### N2C-7 · StatsCard accent semánticos (D2C-3)
Reemplazar prop `accentColor: string` por variantes nombradas:
`accent="brand|success|warning|danger|pending"`.

### N2C-8 · StatsCard tabular nums en value
Aplicar `--font-feature-numeric` al value siempre.

### N2C-9 · BulkActionBar light (D2C-1/G)
**Decisión cerrada**: light. Si el código ya está light, no hay cambio
de implementación — solo reflejar en el mapping de fase 1 que fue dark
(error en mapping, ya documentado en `audit.md`).

### N2C-10 · BulkActionBar animación (D2C-H)
`barIn 200ms ease` → `--motion-modal-in` (240ms ease-out).

### N2C-11 · BulkActionBar tabular nums en count
Aplicar para que el count no salte al cambiar de selección (1 → 10).

### N2C-12 · FilterBar applied-filters pattern (D2C-4)
Añadir composición `applied-filters` con `.accent-stripe-left`. Spec
en `FilterBar.md`. Implementación: nuevo prop o slot, o estructura
composicional documentada.

### N2C-13 · Voz de marca en empty states de Table
Refactor de copy de `emptyTitle/emptyDescription` en cada uso. Voz
Aelium específica del listado: "No hay clientes aún. Crea uno o dinos
cómo te ayudamos." NO "0 results found".

---

## Decisiones cerradas aquí

### BulkActionBar permanece light
Decisión D2C-1 cerrada. Mapping fase 1 era erróneo. Documentado.

### Sort icons como SVG
Adopción de SVG inline para sort indicators — coherente con resto de
iconografía y permite color brand consistente.

### Tabular nums universal en data
Toda tabla con cifras, todo StatsCard, toda Pagination, BulkActionBar
count. Aplicación sistemática mediante `.num` o `--font-feature-numeric`
inline.

### Skeleton-row en Table loading
Heredamos de fase 2.B. Spec lo referencia.

### Empty state voz de Aelium
Inline en Table mediante EmptyState component (ya scaffolded en código,
spec en fase 2.E).

---

## Para fase 2.D (navegación)

### N2C-14 · CommandPalette consume SearchInput pattern
La barra de búsqueda dentro del Cmd+K se construye sobre el patrón de
SearchInput pero con altura mayor y atajos de teclado.

### N2C-15 · Tabs activo con accent stripe
Ya planificado en DD-023. Confirmar al diseñar.

---

## Para fase 3 (patrones)

### N2C-16 · ListPage compone FilterBar + Table + Pagination + BulkActionBar
Patrón canónico que orquesta los 4 componentes. La página de muestra
`pages/admin-clientes.html` ya prefigura ListPage — pero formalizar
en fase 3 con props comunes y skeleton del shell.

### N2C-17 · DetailPage incluye StatsCard secundarias
En detail de cliente: StatsCard compact con uptime, próximo pago,
tickets. Confirmar al diseñar DetailPage.

### N2C-18 · Header sticky en Table
Cuando la tabla tiene >20 rows o cabe en viewport, el header se vuelve
sticky para que sea legible al hacer scroll. Spec en ListPage (fase 3),
no Table base.

---

## Para fase 4 (shells) y fase 5+ (mockups)

### N2C-19 · StatsCard density según portal
- Cliente: compact (densidad cómoda).
- Agente / Admin: default + compact mezclados según jerarquía.
- Partner: a definir.

### N2C-20 · Table density según portal
Cliente: row height comfortable (56px). Admin: compact (36px). FilterBar
y Pagination siguen el mismo dialecto.

### N2C-21 · BulkActionBar solo para admin / agente
Cliente típicamente no hace bulk operations en su portal.

---

## Lo que esta fase NO entregó

- DataGrid avanzado (resize columnas, reorder, freeze) — fuera del alcance.
- Charts/graphs — sin librería instalada, decisión pendiente.
- Tree table / hierarchical data — sin caso real.
- Inline editing — no existe en código auditado.
