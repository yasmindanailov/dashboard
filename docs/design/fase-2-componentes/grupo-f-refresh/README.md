# Fase 2.F — Refresh de variantes pendientes (DD-029)

> Estado: **en curso**
> Modo: **diseño**
> Output: variantes nuevas en componentes ya entregados, sin reescribir
> los specs base. Specs originales reciben una sección "Variantes
> adicionales · DD-029" con el contenido nuevo.

---

## Naturaleza de esta fase

Tras DD-029 (variante por contexto + identidad Aelium), auditamos los
componentes ya entregados y detectamos casos producto reales no cubiertos.
Esta fase los completa **sin tocar los specs base** — solo se añaden
variantes.

## Componentes refrescados

| Componente | Spec base | Variantes nuevas | Caso producto |
|---|---|---|---|
| **Pagination** | `grupo-c-data/Pagination.md` | load more · compact · cursor-based | Activity feeds (load more), sidebar lists (compact), historial sin total conocido (cursor) |
| **Dropdown** | `grupo-a-formularios/Dropdown.md` | multi-select · searchable (combobox) | Filter dropdowns con múltiples valores, listas largas (asignar a cliente entre 147) |
| **Badge** | `grupo-b-feedback/Badge.md` | removable (filter chip) · dot-only | Chips de filtros aplicados, indicadores ultra-compactos |
| **Input** | `grupo-a-formularios/Input.md` | password toggle · inline edit · prefix/suffix text | Login form, editar nombre cliente inline, montos en facturas |

## Heredamos

- DD-029 metodología.
- DD-030 rombo selectivo + recuadros sin accent-stripe.
- StatusDot, Tabs (5 variantes), CommandPalette pattern para combobox.
- Voz Aelium aplicada en cada caso.

## Validación

Cada nueva variante con:
- Caso de uso producto **concreto**.
- Anatomía + tokens.
- Reglas "cuándo usar / cuándo no".
- Voz cuando aplica.
- Sin rombo decorativo (DD-030 disciplina).

## Plan

1. ✅ CSS para 4 componentes y sus variantes nuevas.
2. ✅ Sección "Variantes adicionales · DD-029" en cada spec base.
3. ✅ Sección "Refresh DD-029" en cada mockup HTML.
4. ✅ NOTES de fase con deudas de implementación.
5. ✅ PLAN actualizado.
6. ✅ Commit `docs(design): fase 2.F — refresh de variantes (DD-029)`.

## Ejemplos producto a cubrir

| Variante | Página/feature real |
|---|---|
| Pagination · load more | Activity feed admin · audit log · timeline transparency cliente |
| Pagination · compact | Sidebar listings · facturas en aside del cliente · tickets en widget |
| Pagination · cursor-based | Historial chats · notificaciones, sin total conocido |
| Dropdown · multi-select | Filtrar tickets por agente asignado (varios) · etiquetar cliente |
| Dropdown · searchable | "Asignar a cliente" entre 147 · seleccionar producto del catálogo |
| Badge · removable | Filtros aplicados como chips ("Activo ✕", "Plan Pro ✕") |
| Badge · dot-only | Tabla densa: estado como dot mínimo · sidebar item con count solo |
| Input · password toggle | Login, registro, reset password, cambio de pass en settings |
| Input · inline edit | Editar nombre cliente sin abrir modal · tags rápidos |
| Input · prefix/suffix text | Importes (€), porcentajes (%), URLs (.com), dominios (https://) |
