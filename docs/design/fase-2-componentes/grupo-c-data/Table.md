# Table — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Table/Table.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/table.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────────────────────┐
│ ☐ │ NOMBRE     ↓ │ ESTADO     │ IMPORTE         │ ⋯    │  ← header
├───┼──────────────┼────────────┼─────────────────┼──────┤
│ ☐ │ Floristería… │ ● Activo   │     1.234,50 € │ ⋯    │  ← row hover
│ ☑ │ Bar La E…    │ ● Pendiente│       987,11 € │ ⋯    │  ← row selected
└───┴──────────────┴────────────┴─────────────────┴──────┘
```

| Parte | Token / detalle |
|---|---|
| `table-wrapper` | Contenedor con border + radius. Overflow-x para scroll horizontal. |
| `table` | `<table>` nativo, border-collapse. |
| Header `th` | Background `--surface-secondary`, uppercase 11px, color tertiary. Sortable cambia color en hover. |
| Sort icon | SVG inline (no texto), color `--brand`, 12×12px. |
| Body `tr` | Hover `--surface-secondary`. Selected `--brand-subtle`. |
| `td` | Padding `--space-3 --space-4`, color primary, vertical-align middle. |
| `td.numeric` | Right-aligned + `tabular-nums`. **Aplicar siempre que la columna sea numérica.** |
| Checkbox | Custom 16×16, `--brand` cuando checked. Indeterminate en header. |

## 2. Funcionalidades (props)

| Prop | Detalle |
|---|---|
| `columns` | Array con `key, header, render, sortable, width, align`. |
| `data` | Array de items. |
| `rowKey` | Extractor `(item) => string \| number`. |
| `sort` / `onSortChange` | Estado controlado de ordenación. |
| `onRowClick` | Click en fila navega a detalle. Cursor pointer + hover acentuado. |
| `loading` | Muestra skeleton-row durante carga (≥ 200ms). |
| `skeletonRows` | Default 5. |
| `emptyIcon/title/description/action` | Compone `<EmptyState>` cuando data vacío. |
| `selectable` | Añade columna checkbox. |
| `selectedIds` / `onSelectionChange` | Controlado. |

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** | Tabla con datos. |
| **hover row** | bg `--surface-secondary`. |
| **clickable row** | cursor: pointer, hover más visible. |
| **selected row** | bg `--brand-subtle`. |
| **sorted column** | Icono sort visible en `--brand`. |
| **loading** | N skeleton-rows que mimetizan estructura. |
| **empty** | EmptyState con voz Aelium. |
| **focus en checkbox** | `--focus-ring` + border `--brand`. |

## 4. Tokens consumidos

```
Layout    --space-2/3/4 · --radius-md · --radius-xs · --radius-sm
Tipografía --font-size-xs/sm · --font-weight-medium · --font-feature-numeric
Color     --surface-primary/secondary · --brand · --brand-subtle
          --text-primary/secondary/tertiary · --border · --border-hover
Estado    --focus-ring
Motion    --transition-fast · --ease-out
Iconografía --icon-size-md (sort, checkbox check)
```

## 5. Voz de marca aplicada

- **Headers en uppercase corto**. "NOMBRE", "ESTADO", "IMPORTE", "ACTUALIZADO".
- **Cells con voz Aelium** cuando hay texto: "Pagado" no "PAID", "Activo" no "ACTIVE", fechas en formato natural ("hace 2 días" cuando aplica).
- **Empty state** con voz: "No hay clientes aún. Crea uno o dinos cómo te ayudamos." NO "0 results found."

### Ejemplos producto

| Listado | Columnas típicas |
|---|---|
| Admin · clientes | Nombre · Plan · Estado · Activos · Próximo pago · ⋯ |
| Admin · facturas | Nº · Cliente · Estado · Importe · Vence · ⋯ |
| Admin · tickets | Asunto · Cliente · Prioridad · Asignado · Última actividad · ⋯ |
| Admin · tareas | Título · Cliente · Asignado · Vence · Estado · ⋯ |
| Cliente · servicios | Servicio · Estado · Uptime · Próxima renovación · ⋯ |

## 6. Reglas de uso

- **Columnas numéricas** SIEMPRE align="right" + `.numeric` (tabular nums).
- **Estado** SIEMPRE Badge o StatusDot+texto, no texto plano.
- **Fechas** en formato consistente. Para "hace X tiempo" — solo fechas relativas recientes (≤ 7 días).
- **Última columna `⋯`** para Dropdown row actions. Width fija ~50px, align center.
- **Empty state diferenciado**: "Sin resultados de la búsqueda" ≠ "Aún no hay datos". El primero invita a quitar filtros, el segundo a crear el primer item.

## 7. Accesibilidad

- `<table>` semántico, no divs.
- `<thead>` y `<tbody>`.
- Checkbox header con `aria-label="Seleccionar todo"`.
- Checkbox row con `aria-label="Seleccionar fila X"`.
- Sortable headers con `aria-sort="ascending|descending|none"`.
- Loading state con `aria-busy="true"` en el wrapper.

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2C-5/D** | Sort icon texto ↑↓ | Migrar a SVG inline. |
| **D2C-J** | Sin convención `.num` | Spec: columnas numeric → align right + tabular nums. |
| Skeleton genérico | width 80% en cells | Reemplazar por `.skeleton-row` cuando aplica (header sticky en fase 3). |

## 9. Materialización

`mockup/components/table.html` — 4 ejemplos producto, sortable, selectable, loading, empty, dense vs comfortable.
