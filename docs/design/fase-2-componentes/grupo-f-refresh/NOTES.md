# NOTES.md — Fase 2.F · Refresh de variantes

> Deudas a modo implementación de las variantes nuevas.

---

## Pagination · 3 variantes nuevas

### N2F-1 · Load more
Botón único con metadata "Mostrando X de Y". Estado loading mientras
fetch. Pattern para activity feeds + audit log + transparency feed.

### N2F-2 · Compact
Solo prev/next + "X de Y" tabular. Para sidebars y aside.

### N2F-3 · Cursor-based
Sin total ni page numbers. Para feeds donde no hay total contable
(chats, notificaciones, eventos en tiempo real).

**Implementación**: extender `PaginationProps` con prop
`variant?: 'standard' | 'load-more' | 'compact' | 'cursor'`.
Para cursor, props distintos (`hasNext`, `hasPrev`, `onNext`, `onPrev`).

---

## Dropdown · 2 variantes nuevas

### N2F-4 · Multi-select
Items con check 16×16 + footer con count + "Aplicar". Aplicar con prop
`multiSelect?: boolean` y `onApply?: (selectedIds[]) => void`. Estado
local pendiente hasta apply (o auto-apply según preferencia del flow).

### N2F-5 · Searchable / combobox
Search input arriba filtra por substring. Empty state con voz Aelium.
Aplicar con `searchable?: boolean` + `onSearch?: (query) => filtered[]`.

---

## Badge · 2 variantes nuevas

### N2F-6 · Removable (filter chip)
Badge con botón ✕ al final. `aria-label` describe qué se quita. Aplicar
con prop `onRemove?: () => void`.

### N2F-7 · Dot-only
Sin pill, solo dot semántico + texto. Componente nuevo `BadgeDot` o
prop `variant: 'dot'` en Badge. Ultra-compacto.

---

## Input · 3 variantes nuevas

### N2F-8 · Password toggle
Botón eye/eye-off al final. Cambia `type` entre `password` y `text`.
Aria-label dinámico ("Mostrar contraseña" / "Ocultar contraseña").
Aplicar con `type="password"` + prop `togglable?: boolean` (default true para password).

### N2F-9 · Inline edit
Patrón "view → click → edit → confirm/cancel". State machine en
componente nuevo `InlineEdit` separado:
- `value` controlado
- `onSave(newValue)` callback
- `editIcon` opcional (default lápiz)
- ESC cancela, Enter confirma

### N2F-10 · Prefix / suffix text
Texto fijo dentro del input (€, %, https://, +34). Aplicar con props
`prefix?: string` / `suffix?: string`. Mono font, color tertiary,
pointer-events: none.

---

## Decisiones cerradas en esta fase

### Cursor-based vs infinite scroll
Cursor es navegación explícita ("siguiente página"); infinite scroll
es trigger automático al hacer scroll. **Cursor preferred** — el
infinite scroll es difícil de mantener accesible. Si el caso real lo
exige, decisión separada.

### Badge dot-only NO sustituye a Badge
Coexisten. Dot-only para contextos densos. Badge estándar para casos
normales. La regla: si la pill ocupa demasiado en un layout denso,
usar dot-only.

### Inline edit via componente separado
No es prop de Input — el comportamiento (state machine view→edit)
justifica componente propio. Reusa `Input` internamente cuando edita.

---

## Para fase 3 (patrones)

### N2F-11 · ListPage usa Pagination apropiada según contexto
Listings con total: standard. Activity feeds: load more. Sidebar
listings: compact. Chats/eventos: cursor.

### N2F-12 · FilterBar applied-filters consume Badge removable
Refactor del pattern actual para usar `<Badge removable>` en cada
filtro aplicado, con onRemove handler que limpia ese filtro
específico.

### N2F-13 · DetailPage header consume Inline edit en nombre
"Floristería Pérez" en detail header → inline edit (sin abrir modal).

---

## Lo que esta fase NO entregó

- Date picker, Time picker — sin caso real validado todavía.
- Combobox con creación inline ("añadir nuevo si no existe") — futuro.
- Multi-tag input (chips dentro del input mientras escribes) — futuro.
- Range input (slider) — futuro.
