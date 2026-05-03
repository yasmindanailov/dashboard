# Toast — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/Toast/Toast.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/toast.html`

---

## 1. Anatomía

```
┌─────────────────────────────────────────┐
│ [icon]  message text       [Deshacer] [✕]│
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← progress bar (solo undo)
└─────────────────────────────────────────┘
```

| Parte | Token / detalle |
|---|---|
| `toast-container` | Position fixed bottom-right, z `--z-toast`, column-reverse para apilar nuevo arriba. |
| `toast` | Pill con `--radius-md`, `--shadow-lg`, animación entrada `--motion-stack-in`. |
| `icon` | 18×18 SVG inline. Color heredado del variant. |
| `message` | Texto principal, `--font-size-sm`. |
| `undo` | Botón "Deshacer" — solo en variant undo. |
| `close` | "✕" 24×24, opacity 0.6 → 1 hover. |
| `progress-bar` | 3px en bottom, anima width de 100% a 0% con `animation-duration` = `duration` del toast. Solo en variant undo. |

## 2. Variantes (DD-NEW · D2B-8 renombrar `error` a `danger`)

Background **dark** (filosofía Aelium — toast es notificación destacada que merece levantarse del UI).

| Variant | Background hex | Color text |
|---|---|---|
| `success` | `#064E3B` | `#D1FAE5` |
| `danger`  | `#7F1D1D` | `#FEE2E2` |
| `warning` | `#78350F` | `#FEF3C7` |
| `info`    | `#1E3A5F` | `#DBEAFE` |

> Estos hex son la **versión dark de los semánticos** — no son hardcoded arbitrarios. Decisión: documentar su mapeo en `tokens.css` con tokens nuevos `--{state}-dark` y `--{state}-on-dark` si emergen más usos. Por ahora, hex en CSS de la maqueta documentado como deuda técnica menor.

## 3. Variantes especiales

- **standard** — autodismiss tras 5s.
- **undo** — autodismiss tras 8s + botón Deshacer + countdown bar visible.

## 4. Estados

| Estado | Comportamiento |
|---|---|
| **entrada** | Slide desde la derecha + fade · `--motion-stack-in`. |
| **idle** | Visible y posicionado. |
| **hover** | (opcional · pendiente fase 3) pausar countdown. |
| **salida** | Slide hacia la derecha · `--motion-stack-out`. |
| **dismissed manualmente** | Click en ✕ o en Deshacer cierra inmediato. |

## 5. Tokens consumidos

```
Layout       --space-2/3/4/6 · --radius-md · --radius-sm · --radius-xs · --z-toast
Tipografía   --font-size-xs/sm · --font-weight-medium/semibold
Color        Backgrounds dark hardcoded (semánticos dark) + colors light
             rgba(255,255,255,0.x) para detalles secundarios
Sombras      --shadow-lg
Motion       --motion-stack-in (entrada) · --motion-stack-out (salida)
             --transition-fast · --ease-out (close hover)
```

## 6. Voz de marca aplicada

Toasts son **micro-comunicación** del producto al usuario. El mensaje debe sonar a Aelium.

### Reglas

- **Confirmación con verbo en participio**: "Factura creada", "Cambios guardados", "Ticket enviado".
- **Error con voz humana**: "No pudimos guardar los cambios. Vuelve a intentarlo." NO "Error 500. Operation failed."
- **Frase corta**, una oración. Nada de listas ni párrafos en toast.
- **Acciones reversibles → variant undo** con "Deshacer". Aelium asume que el usuario puede equivocarse y le da margen.

### Ejemplos producto

| Acción | Variant | Mensaje |
|---|---|---|
| Pagar factura OK | success | "Pago confirmado · 49,90 €" |
| Crear cliente | success undo | "Cliente creado." (Deshacer) |
| Ticket enviado | success | "Ticket enviado. Yasmin lo verá enseguida." |
| Error de red | danger | "Sin conexión. Revisa y vuelve a intentarlo." |
| Validación de form | warning | "Faltan campos por rellenar." |
| Aviso de mantenimiento | info | "Mantenimiento programado mañana de 4 a 5h." |

### Anti-patrones

- ❌ "Operation completed successfully" — frío, robot.
- ❌ "Error: 500 Internal Server Error" — técnico.
- ❌ Toast de 5 líneas — no es chat.

## 7. Reglas de uso

- Position fija **bottom-right**. No mover.
- Máximo ~3 toasts visibles a la vez. Más → cola.
- Auto-dismiss **5s standard**, **8s undo**.
- Undo solo para acciones reversibles. Si la acción es destructiva e irreversible (eliminar permanente), usar **Modal** de confirmación, no toast con undo.

## 8. Accesibilidad

- `role="alert"` para que lectores de pantalla lo anuncien.
- `aria-live="polite"` (default `alert`) para que no interrumpa.
- Botón close con `aria-label="Cerrar"`.
- Animación respeta `prefers-reduced-motion`.

## 9. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2B-A** | Backgrounds hex hardcoded | Documentar como decisión (dark variants), considerar tokens `--{state}-dark` si más usos. |
| **D2B-5** | Filosofía dark/light | **Mantener dark.** Documentado: toast oscuro destaca sin invadir layout. |
| **D2B-6** | Animación `slideIn 200ms ease` | Migrar a `--motion-stack-in`. |
| **D2B-7** | Iconos 18px hardcoded | Aceptar como tamaño intermedio para Toast/AlertBanner — documentar excepción. |
| **D2B-8** | Variant `error` | Renombrar a `danger`. |
| Voz | Mensajes en código sin patrón | Aplicar reglas de copy en cada `toast()` y `toastUndo()`. |
