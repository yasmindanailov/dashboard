# Badge — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Badge/Badge.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/badge.html`

---

## 1. Anatomía

```
[ icon? ]  TEXT
```

Pill (`--radius-sm`) con background `-light` y texto `-strong` del semántico.

## 2. Variantes (DD-NEW · D2B-1)

| Variant | Background | Color text | Uso |
|---|---|---|---|
| `neutral` | `--surface-secondary` | `--text-secondary` | Metadata sin valoración (categoría, tag de filtro). |
| `success` | `--success-light` | `--success-strong` | Pagado, activo, completado. |
| `warning` | `--warning-light` | `--warning-strong` | Vence pronto, esperando cliente. |
| `danger`  | `--danger-light`  | `--danger-strong`  | Vencida, suspendido, urgente. |
| `info`    | `--info-light`    | `--info-strong`    | Aviso neutro persistente. |
| `pending` | `--pending-light` | `--pending-strong` | **(nuevo)** En revisión, en proceso. Cubre el caso del púrpura ya usado por StatusDot. |
| `brand`   | `--brand-subtle`  | `--brand` | Para acción brand (ej. "Nuevo", "Premium"). |

## 3. Tamaños (DD-NEW · D2B-2)

| Tamaño | Padding | Font-size |
|---|---|---|
| `sm` | 1px / `--space-1_5` | 10px |
| `md` (default) | 2px / `--space-2` | `--font-size-xs` (11) |

Si emerge caso de `lg` se añade. Hoy raramente se justifica un badge grande.

## 4. Estados

Badge no tiene estados interactivos (es informativo). No `:hover`, no `:focus`, no disabled. Si necesitas un badge clickable → es un Button con apariencia de badge.

## 5. Tokens consumidos

```
Layout       --space-1, --space-1_5, --space-2, --space-2_5
             --radius-sm
Tipografía   --font-size-xs · --font-weight-medium
Color        --{state}-light · --{state}-strong (todos los semánticos + pending)
             --surface-secondary · --text-secondary
             --brand-subtle · --brand
```

## 6. Voz de marca aplicada

- **Una palabra siempre que se pueda.** "Activo", no "En estado activo".
- **Capitalización**: solo la inicial. "Pagado", no "PAGADO".
- **Tiempo verbal participio**: "Pagado", "Suspendido", "Vencido". No "Pagar", "Suspender".

### Ejemplos producto

| Contexto | Variant | Texto |
|---|---|---|
| Factura pagada | success | Pagado |
| Factura vencida | danger | Vencido |
| Factura pendiente | warning | Pendiente |
| Servicio activo | success | Activo |
| Servicio suspendido | danger | Suspendido |
| Tarea en revisión | pending | En revisión |
| Plan premium | brand | Premium |

## 7. Reglas de uso

- **Máximo 2 badges por fila** (regla D5 de DESIGN_SYSTEM.md). Si necesitas 3+, replantear la jerarquía de estado.
- Badge **no es CTA**. Si el usuario debe hacer algo, Button no Badge.
- Si Badge va con StatusDot inline, el dot va a la izquierda del texto.

## 8. Accesibilidad

- Si el estado es semánticamente importante para el usuario (no solo decorativo), añadir `<span class="sr-only">` con descripción ("Estado: pagado").

## 9. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2B-A** | text colors hardcoded `#047857`, `#B45309`, `#B91C1C`, `#1D4ED8` | Migrar a `--{state}-strong`. |
| **D2B-1** | Sin pending | Añadir variant `pending`. |
| **D2B-2** | Sin tamaños | Añadir sm/md. |
| Voz | Variants en código sin reglas de copy | Documentar en spec — sin cambio de código. |
