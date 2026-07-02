# Fase 2.C — Data

> Estado: **en curso**
> Modo: **diseño**
> Output: 5 specs + 5 mockups + sample admin page + audit + NOTES.

---

## Componentes

Table, Pagination, StatsCard, BulkActionBar, FilterBar.

## Heredamos

- DD-021 (tokens marca v1.6) · DD-022 (voz) · DD-023 (firma visual).
- Skeleton variantes morfológicas (fase 2.B) — Table las consume.
- StatusDot, Badge, Dropdown, SearchInput, Select, Button — todos
  componentes ya specced que aparecen dentro de Table y FilterBar.

## Por qué este grupo es donde la firma visual brilla

- **Tabular numerals (`.num`)** en columnas numéricas — diferencia visible
  vs SaaS genérico.
- **StatsCard con `display-sm` (40px)** y `.num` — números prominentes
  son momento de marca.
- **FilterBar con `.accent-stripe-left`** cuando hay filtros aplicados —
  conexión con el sidebar pattern.
- **`.skeleton-row`** aplicado a Table loading.
- **BulkActionBar** con focus visible y firma en count.

## Decisiones a tomar

- **D2C-1**: BulkActionBar **light** (mantenemos código actual) o **dark**
  (mapping fase 1). Mi recomendación: **light** — coherente con
  minimalismo funcional, y la diferenciación viene del shadow-xl y el
  brand-color en el count.
- **D2C-2**: StatsCard value tipografía. **Display-sm 40px en métricas
  primarias** (ingresos, ARR, clientes), 24px en secundarias.
- **D2C-3**: Variantes semánticas de StatsCard (success/warning/danger
  border-left) para alertar sobre métricas importantes.
- **D2C-4**: FilterBar con indicador "filtros aplicados". Pattern visible
  cuando el usuario tiene filtros activos.
- **D2C-5**: Sort icons de Table — texto ↑↓ → SVG inline en `--brand`.

## Plan

1. ✅ Audit (`audit-existing.md`).
2. ✅ CSS compartido en `styles.css`.
3. ✅ 5 specs.
4. ✅ 5 páginas de maqueta con ejemplos producto reales.
5. ✅ **Sample admin page** que compone todos en una vista realista:
   "Listado de clientes" (admin).
6. ✅ NOTES + commit.

## Features del producto que se reflejan

- **Table** → listado clientes, facturas, tickets, tareas, productos.
- **Pagination** → todos los listados.
- **StatsCard** → ARR, MRR, churn, clientes activos, tickets abiertos,
  pagos pendientes. KPIs admin / cliente.
- **BulkActionBar** → seleccionar facturas para marcar pagadas, reasignar
  tickets en lote, exportar clientes.
- **FilterBar** → filtros por estado/plan/fecha/prioridad en cada listado.
