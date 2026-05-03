# NotificationBell — Spec

> Estado: **listo · refactor crítico necesario**
> Fuente: `frontend/app/_shared/shell/NotificationBell.{tsx,module.css}`
> Maqueta: `mockup/components/notification-bell.html`

---

## 1. Anatomía

```
                    ┌───────────────────────────────────────┐
       ╔═══════╗    │ Notificaciones        Marcar todas   │ ← header
       ║ [🔔] ⓒ ║    ├───────────────────────────────────────┤
       ╚═══════╝    │ ▌ Marina escribió en su ticket       │ ← unread (brand-subtle)
                    │   "El correo no envía desde ayer."   │
       trigger      │   hace 5 min                       ●  │
       (con badge   ├───────────────────────────────────────┤
        pulse)      │   Pago confirmado · 49,90 €          │ ← read
                    │   Floristería Pérez · hace 2h        │
                    └───────────────────────────────────────┘
```

| Parte | Token / detalle |
|---|---|
| `.bell` (trigger) | 36×36 ghost button. Hover bg `--surface-secondary`. |
| `.bell-badge` | Min 16×16, bg `--danger`, color on-brand, font-xs semibold. Posición top-right. |
| `.bell-badge.pulse` | Pulso radial cuando hay notificación nueva — refuerza "te avisamos antes". |
| `.bell-panel` | 360px right-aligned, `--shadow-xl`, `--radius-md`. Animación `--motion-stack-in`. |
| `.bell-header` | Title + "Marcar todas" link brand. |
| `.bell-item` | Title + body + meta. Unread bg `--brand-subtle`. Hover bg `--surface-secondary`. |
| `.bell-item-meta .unread-dot` | Dot 8×8 brand para reforzar señal de unread. |
| `.bell-empty` | "No tienes notificaciones nuevas." voz Aelium. |

---

## 2. Comportamiento

| Acción | Resultado |
|---|---|
| Click trigger | Toggle panel. Si abre, hace fetch sync. |
| Polling | Cada 30s en background fetch `/notifications/unread`. |
| Click item | Marca como read + navega a `action_url` si existe. |
| Click "Marcar todas" | Mark all read, badge desaparece. |
| Click outside | Cierra panel. |
| Esc | Cierra panel (a añadir — D2D pendiente). |

Badge muestra:
- `count` cuando 1–9.
- `9+` cuando ≥10.

---

## 3. Estados

| Estado | Comportamiento |
|---|---|
| **default** (sin nuevas) | Bell sin badge, color tertiary. |
| **con nuevas** | Badge danger, pulse animation. |
| **trigger hover** | bg `--surface-secondary`. |
| **trigger focus** | `--focus-ring`. |
| **panel abierto** | Anima entrada `--motion-stack-in`. |
| **item read** | bg transparente, hover `--surface-secondary`. |
| **item unread** | bg `--brand-subtle`, dot brand en meta. |
| **empty** | Texto "No tienes notificaciones nuevas." centrado. |
| **error** (fetch falla) | Banner inline en `--danger-light` + `--danger-strong`. |

---

## 4. Tokens

```
Layout    --space-1/3/4/6 · --radius-sm/md/full · --z-dropdown
Tipografía --font-size-xs/sm · --font-weight-medium/semibold
          --font-feature-numeric (badge count)
          --line-height-normal
Color     --surface-primary/secondary
          --brand · --brand-hover · --brand-subtle
          --danger · --danger-light · --danger-strong · --danger-border · --text-on-brand
          --text-primary/secondary/tertiary · --border
Sombras   --shadow-xl
Motion    --motion-stack-in · --transition-fast · --ease-out · --ease-in-out (pulse)
```

---

## 5. Validación con documento de marca

- **Proactivo (rasgo 5)**: el documento dice "Anticipa, propone, sorprende". La campana materializa esto: el usuario no busca novedades, llegan a él.
- **"Construido para durar"**: notificaciones llegan en tiempo real (Socket.io futuro, polling hoy). Sistema robusto.
- **Voz**:
  - Header: "Notificaciones" (no "Notifications", no "Alertas").
  - "Marcar todas" (no "Mark all read").
  - Empty: "No tienes notificaciones nuevas." — directo, cercano.
  - Items con voz Aelium: "Marina escribió en tu ticket" (no "New ticket message"), "Pago confirmado · 49,90 €" (no "Payment received").
  - Tiempos relativos en castellano: "ahora", "hace 5 min", "hace 2 h", "hace 3 d", luego fecha absoluta.

### Notificaciones producto

| Tipo | Title | Body |
|---|---|---|
| Nuevo ticket | "Nuevo ticket de Floristería Pérez" | "El correo no envía desde ayer." |
| Mensaje en ticket | "Marina escribió en su ticket" | "Sigo sin poder enviar." |
| Pago confirmado | "Pago confirmado" | "Floristería Pérez · 49,90 €" |
| Caída detectada | "marina-store está caído" | "Lleva 12 minutos sin responder. Yasmin lo está mirando." |
| Renovación próxima | "Tu hosting renueva en 7 días" | "49,90 € se cargan automáticamente el día 15." |

---

## 6. Reglas de uso

- **Posicionar en topbar**, top-right, antes del avatar/profile menu.
- **Polling 30s** mientras el panel está cerrado. Cuando abierto, refetch instantáneo.
- **Click en notificación**: marca read + navega. Doble efecto en una acción (rasgo "pragmático").
- **Pulse animation** solo cuando hay nuevas. Cuando todo leído, badge desaparece y trigger vuelve a neutro.
- **No abusar**: solo notificaciones que requieren atención del usuario. Marketing, encuestas, etc → otros canales.

---

## 7. Accesibilidad

- Trigger con `aria-label="Notificaciones"` + `aria-expanded`.
- Badge con texto leíble por screen reader: agregar `aria-label="3 notificaciones nuevas"`.
- Panel con `role="menu"`.
- Items como `<button>`, navegables con keyboard.
- Esc para cerrar (a implementar).
- Pulse respeta `prefers-reduced-motion`.

---

## 8. Drift vs implementación actual

> **Refactor crítico** — la implementación actual arrastra colores Stripe legacy.

| ID | Drift | Resolución |
|---|---|---|
| **D2D-1** | `#635BFF` Stripe purple en `.linkBtn`, `.itemUnread`, `.dot` | Migrar TODOS a `--brand`. |
| **D2D-2** | `#EF4444` badge | `--danger`. Añadir `.pulse` opcional. |
| **D2D-10** | Tamaños hex hardcoded (12, 13, 14 px) | Migrar a `--font-size-xs/sm`. |
| **D2D-11** | `box-shadow: 0 12px 32px rgba(0,0,0,0.12)` | `--shadow-xl`. |
| `--text-link` no existe | Variable inventada | Migrar a `--brand`. |
| Border colors con fallback rgba | `var(--border, #e5e7eb)` | Limpiar fallback — el token existe. |
| Error colors hex | `#FEF2F2`, `#991B1B`, `#FECACA` | `--danger-light`, `--danger-strong`, `--danger-border`. |
| `#fff` literales | En badge color | `--text-on-brand`. |
| Transition `120ms ease` | sin token | `--transition-fast` + `--ease-out`. |
| Sin pulse animation | Bell quieto cuando hay nuevas | Aplicar `.pulse` (refuerza "proactivo"). |
| `.dot` standalone | 8×8 round propio | Reemplazar por StatusDot pattern (mismo 8px). |
| Sin Esc para cerrar | a11y incompleto | Añadir handler. |

---

## 9. Materialización

`mockup/components/notification-bell.html` — trigger con/sin badge, panel con items unread/read, empty state, pulse animation visible.
