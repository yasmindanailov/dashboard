# StatusDot — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/StatusDot/StatusDot.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/status-dot.html`

---

## 1. Anatomía

```
●
```

Círculo de 8px relleno con el color semántico.

## 2. Variantes

| Color | Token bg | Uso |
|---|---|---|
| `success` | `--success` | Online, activo, OK. |
| `warning` | `--warning` | Atención, vence pronto. |
| `danger`  | `--danger`  | Caído, suspendido, error. |
| `info`    | `--info`    | Aviso pasivo. |
| `pending` | `--pending` | **(nuevo · D2B-1)** En revisión, esperando. |
| `neutral` | `--text-tertiary` | Sin estado, inactivo. |

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** | Círculo lleno. |
| **pulse** | `box-shadow` expandiéndose alrededor con animación 2s. Usado para "vivo en tiempo real" (online ahora, ticket nuevo). |

Sin estados interactivos — StatusDot no es clickable.

## 4. Composición

StatusDot se usa **inline con texto**: "● Activo", "● Floristería Pérez". Va antes del texto, separado por `--space-2`.

```html
<span class="status-dot status-dot-success"></span>
<span>Activo</span>
```

Acompaña a Badge cuando se quiere refuerzo visual:
```html
<span class="badge badge-success">
  <span class="status-dot status-dot-success"></span>
  Activo
</span>
```

## 5. Tokens consumidos

```
Layout    8×8px hardcoded (excepción justificada — mismo tamaño que .aelium-dot)
          --radius-full
Color     --{state} para los 5 semánticos + --text-tertiary para neutral
Motion    --ease-in-out (en pulse)
```

## 6. Reglas de uso

- StatusDot **siempre lleva texto** al lado. Solo dot sin contexto = ambigüedad.
- **Pulse solo para "vivo ahora"**, no para "estado persistente". Un servicio que está activo desde hace 3 meses no pulsa — solo cuando un evento ocurre o cuando el agente está realmente online.
- No abusar del color: prioriza neutral cuando el estado es informativo no-crítico.

## 7. Accesibilidad

- `aria-hidden="true"` en el dot (decorativo). El texto adjacente comunica el estado.
- Pulse animation respeta `prefers-reduced-motion: reduce` en spec — implementación añade media query.

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2B-1** | Sin variant pending | Añadir. |
| Color info → --brand | StatusDot info usa `--brand` | Migrar a `--info` (mismo valor, distinto rol). |
| Tamaño 8px | hardcoded | Mantener — es el tamaño signature de marca (`.aelium-dot`). Documentar como excepción justificada. |
