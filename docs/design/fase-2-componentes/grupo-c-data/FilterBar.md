# FilterBar — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/FilterBar/FilterBar.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/filter-bar.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Buscar cliente…              │ Estado ▾ │ Plan ▾    │
└─────────────────────────────────────────────────────────┘
       SearchInput flex-1               Selects
```

| Parte | Token / detalle |
|---|---|
| `filter-bar` | Flex con gap. Search left flex-1, filters right. |
| `search` slot | SearchInput sin label visible. Placeholder autoexplicativo. |
| `filter-bar-filters` | Flex con Selects (max 2). |
| `applied-filters` | **(NUEVO · D2C-4)** Banda visible cuando hay filtros activos. Accent-stripe-left con `--brand`, bg `--brand-subtle`. |

## 2. Composición

```html
<filter-bar>
  <SearchInput ... />
  <Select ... />
  <Select ... />
</filter-bar>

<!-- Cuando hay filtros aplicados -->
<applied-filters>
  <span>Filtros: <strong>Activos · Plan Pro · Últimos 30 días</strong></span>
  <button>Limpiar</button>
</applied-filters>
```

## 3. Comportamiento responsive

- **Desktop (>700px)**: SearchInput flex-1, filtros a la derecha.
- **Mobile (≤700px)**: stack vertical. Search arriba, filtros debajo.

## 4. Patterns "filtros aplicados"

Cuando el usuario ha aplicado filtros (no son los defaults), mostrar pattern arriba del listado:

```
┌─────────────────────────────────────────────────────────┐
│▎ Filtros: Activos · Plan Pro · Últimos 30 días  Limpiar│
└─────────────────────────────────────────────────────────┘
```

- Background `--brand-subtle`.
- Accent stripe `--brand` 3px lateral izq.
- Texto fijo "Filtros:" + lista de filtros en `--text-primary`.
- "Limpiar" como link `--brand` para resetear.

Esto cubre dos cosas:
1. El usuario **ve** que sus filtros aplican (no se sorprende del recuento).
2. Sabe **cómo quitarlos** sin pelear con cada select.

## 5. Tokens consumidos

```
Layout    --space-2_5/3/4 · --radius-sm
Tipografía --font-size-sm
Color     --brand · --brand-subtle · --border
          --text-primary/secondary/tertiary
Motion    --transition-fast · --ease-out
+ tokens de SearchInput y Select cuando aplican
```

## 6. Voz de marca aplicada

- **SearchInput placeholder** explica qué se busca: "Buscar cliente, NIF, dominio…", no "Buscar…".
- **Filter selects con label corto en placeholder**: "Estado", "Plan", "Periodo".
- **applied-filters** con texto natural: "Filtros: Activos · Plan Pro · Últimos 30 días". No "filter_status=active&plan=pro".
- **Botón "Limpiar"** en lugar de "Reset filters" o "Clear all".

## 7. Reglas de uso

- **Search siempre a la izquierda, flex-1**.
- **Máximo 2 selects** a la derecha. Si hay más, considerar Drawer de filtros avanzados.
- **applied-filters aparece encima del listado**, no encima de la FilterBar (los componentes de input son consultas, applied es resultado).
- **Si todos los filtros están en defaults**, no mostrar applied-filters.
- **No usar Card wrapper** alrededor de FilterBar — vive directo en la página (regla D10).

## 8. Accesibilidad

- Search con `aria-label` cuando no hay label visible.
- Selects con `aria-label` o label visible inline.
- Botón "Limpiar" en applied-filters con `aria-label="Limpiar todos los filtros"`.

## 9. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2C-4** | Sin indicador "filtros aplicados" | Añadir pattern `applied-filters`. |
| Slot opcional | Solo search + filters | OK — composición flexible es ventaja. |

## 10. Materialización

`mockup/components/filter-bar.html`
