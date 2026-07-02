# Tooltip — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Tooltip/Tooltip.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/tooltip.html`

---

## 1. Anatomía

Bocadillo flotante con flecha de posicionamiento. Background dark (única excepción al light-first del dashboard, junto con BulkActionBar).

```
       ▼
┌───────────┐
│  texto    │
└───────────┘
```

## 2. Variantes

| Variant | Uso |
|---|---|
| **single-line** (default) | Texto corto en una línea. Padding compacto. |
| **multiline** | Texto largo (~240px width), wrap natural. Para HelpTip. |

## 3. Posicionamiento

`top` (default), `bottom`, `left`, `right` — relativo al elemento que envuelve.

## 4. Estados

| Estado | Trigger |
|---|---|
| **hidden** | Default. |
| **visible · hover** | Aparece al pasar cursor sobre el wrapper. |
| **visible · focus** | **(NUEVO · D2B-9)** Aparece al hacer focus por teclado. Accesibilidad. |
| **dismissed** | Esc cierra cuando está visible por focus. |

## 5. Tokens consumidos

```
Layout    --space-1, --space-2 · --radius-sm
Tipografía --font-size-xs · --font-weight-medium
Color     --surface-dark (bg) · --text-on-dark (color)
Z-index   --z-tooltip
Motion    --transition-fast · --ease-out (entrada/salida)
```

## 6. Voz de marca aplicada

Tooltips son **micro-explicaciones**. Aelium NO usa tooltips para repetir labels o duplicar info ya visible. Los usa para añadir contexto que no cabe en el espacio del componente.

### Reglas

- **Una sola frase**. Si necesita más, considerar HelpTip multilínea o ayuda inline.
- **Sin punto final** en single-line.
- **Verbo concreto**, igual que el resto de la voz.

### Ejemplos producto

| Sobre qué | Tooltip |
|---|---|
| Botón icon-only "Editar" | "Editar cliente" |
| Botón icon-only "⋯" en row | "Más acciones" |
| Status dot en topbar (online) | "En línea desde las 09:30" |
| Botón "Filtrar" | "Filtrar por estado, plan, fecha" |

### Anti-patrones

- ❌ Tooltip que dice lo mismo que el botón visible: "Guardar" sobre un botón "Guardar".
- ❌ Tooltip largo con lista o párrafo — usar HelpTip multilínea.
- ❌ Tooltip que oculta información crítica que debería estar siempre visible.

## 7. Reglas de uso

- **Solo en elementos que el usuario puede entender visualmente** pero necesita más contexto. NO usar para ocultar info que debe estar siempre.
- **Delay 300ms** al hacer hover antes de aparecer (no en spec — implementación). Evita parpadeo al pasar rápido.
- **Aparece pegado al elemento** (6px de gap), animación entrada `--transition-fast`.

## 8. Accesibilidad

- `role="tooltip"`.
- El elemento que dispara el tooltip debe tener `aria-describedby="tooltip-id"`.
- **Focus trigger obligatorio** (D2B-9) — además del hover, debe aparecer cuando el usuario tabula al elemento.
- `Esc` cierra el tooltip cuando está visible.
- Animación respeta `prefers-reduced-motion`.

## 9. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2B-9** | Sin focus trigger | Añadir en implementación. Spec lo exige. |
| Animación `fadeIn 100ms ease` | Sin token | Migrar a `--transition-fast` + `--ease-out`. |
| Background `--text-primary` | OK tras DD-021 (#0F172A) | Mantener. Se podría unificar a `--surface-dark` (mismo valor) por claridad semántica. |
