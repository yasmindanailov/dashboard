# BulkActionBar — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/BulkActionBar/BulkActionBar.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/bulk-action-bar.html`

---

## 1. Anatomía

```
            ┌─────────────────────────────────────────┐
            │ 3 seleccionados │ [Acción] [Acción]│ Deseleccionar │
            └─────────────────────────────────────────┘
                         flotante bottom-center
```

| Parte | Token / detalle |
|---|---|
| `bulk-bar` | Position fixed bottom-center, light bar con `--shadow-xl`. |
| `bulk-bar-count` | font-sm, weight-semibold, color `--brand`, **tabular nums**. |
| `bulk-bar-divider` | 1px width, `--border` color, height 24px. |
| `bulk-bar-actions` | Flex con buttons (variant ghost típicamente). |
| `bulk-bar-clear` | "Deseleccionar" como ghost text-tertiary. |

## 2. Decisión D2C-1 · light vs dark

**Light.** Mantenemos el diseño actual del código.

Justificación:
- Coherente con minimalismo funcional D1-D11.
- `--shadow-xl` + `--brand` color en count ya destacan suficiente.
- Una bar dark añadiría drama incompatible con voz Aelium "cercana, no jerárquica".
- Override del mapping fase 1 (que decía dark) — registrado como ajuste tras audit.

## 3. Estructura

| Prop | Detalle |
|---|---|
| `count` | Número de items seleccionados. Si 0, no se renderiza. |
| `onClear` | Callback "Deseleccionar". |
| `children` | Action buttons (típicamente Button ghost size sm). |

## 4. Estados

| Estado | Comportamiento |
|---|---|
| **hidden** (count 0) | Componente no renderiza nada. |
| **visible** | Anima entrada `--motion-modal-in` desde abajo. |
| **focus en clear/actions** | `--focus-ring`. |

## 5. Tokens consumidos

```
Layout    --space-2/3/4/5/6 · --radius-lg · --radius-sm
          --z-sticky
Tipografía --font-size-xs/sm · --font-weight-semibold
          --font-feature-numeric
Color     --surface-primary · --border
          --brand · --text-primary/tertiary
          --surface-secondary
Sombras   --shadow-xl
Motion    --motion-modal-in (240ms ease-out, antes 200ms ease)
```

## 6. Voz de marca aplicada

### Count

- Singular/plural natural: `1 seleccionado` / `5 seleccionados`.
- En castellano siempre.

### Clear button

- "Deseleccionar" en lugar de "Cancelar selección" (más corto, más directo).
- Color text-tertiary — secundario al count.

### Acciones

Heredan voz Button (verbo concreto). Ejemplos producto:

| Listado | Acciones bulk típicas |
|---|---|
| Clientes | "Cambiar plan" · "Añadir nota" · "Exportar" · "Suspender" |
| Facturas | "Marcar pagadas" · "Reenviar" · "Anular" |
| Tickets | "Reasignar" · "Cerrar" · "Marcar urgente" |
| Tareas | "Reasignar" · "Aplazar" · "Marcar hechas" |

## 7. Reglas de uso

- Aparece **solo cuando hay ≥ 1 selección**.
- Floating fixed bottom-center, no se mueve con scroll.
- **Máximo 3-4 acciones bulk visibles**. Si hay más, agrupar en Dropdown "Más acciones".
- **No duplicar acciones individuales**: si una row tiene Dropdown con "Editar/Eliminar", la BulkActionBar no debe tener "Editar" (no aplica a múltiples).
- Acción destructiva al final, separada por divider.

## 8. Accesibilidad

- `role="toolbar"` + `aria-label="3 seleccionados"`.
- Animación respeta `prefers-reduced-motion`.
- Focus visible en cada elemento interactivo.

## 9. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2C-1/G** | Mapping fase 1 dark vs código light | **Light**. Documentado. |
| **D2C-H** | Animación `barIn 200ms ease` | Migrar a `--motion-modal-in`. |
| Tabular nums en count | No aplicado | Aplicar para que "1 → 10 → 100" no salte. |

## 10. Materialización

`mockup/components/bulk-action-bar.html`
