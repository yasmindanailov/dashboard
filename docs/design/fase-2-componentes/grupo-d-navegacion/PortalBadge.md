# PortalBadge — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/PortalBadge/PortalBadge.{tsx,module.css}`
> Maqueta: `mockup/components/portal-badge.html`

---

## 1. Anatomía

```
[ ◇◇ ]   Aelium                 ← logo (SVG cuando existe, fallback texto)
         Portal de Cliente       ← subtitle (color por portal · sutil)
```

Identifica el portal donde el usuario está navegando. Vive en el header
del sidebar. Pattern documentado en ADR-066.

| Parte | Token / detalle |
|---|---|
| `.portal-badge` | Flex con gap, sin padding propio (lo gestiona el shell). |
| `.pb-mark` | 22×22 — slot para logo SVG (`aelium_logo_blue.svg`). Fallback: dos rombos CSS. |
| `.pb-logo` | Texto "Aelium" font-md weight-semibold. Solo si no hay logo SVG. |
| `.pb-text` | Stack vertical logo + subtitle. |
| `.pb-subtitle` | Font-xs. **Color por portal** sutil. |

---

## 2. Variantes (data-portal)

| Portal | Subtitle | Color subtitle |
|---|---|---|
| `admin` | "Portal de Administración" | `--brand` weight-medium |
| `agent` | "Portal de Administración" (mismo shell) | `--brand` weight-medium |
| `client` | "Portal de Cliente" | `--text-secondary` |
| `partner` | "Portal de Partner" | `--text-secondary` |

> **D2D-4 cerrada**: el portal `agent` reusa el shell admin (comparten
> sidebar, topbar, navegación). Se diferencia internamente por permisos
> PBAC, no por shell distinto. Por eso PortalBadge expone los mismos 4
> data-attributes pero `agent` resuelve igual que `admin`.

> **D2D-5 cerrada**: la diferenciación es **por texto**, no por color
> dramático. Coherente con marca: "construido para durar" — un solo
> Aelium con dialectos sutiles. Cuando se decida en fase 4 si el
> override de accent por portal aplica (DD-014), PortalBadge consumirá
> esos tokens.

---

## 3. Modos

| Mode | Comportamiento |
|---|---|
| **default** | Logo + subtitle visible. |
| **compact** | Solo logo (subtitle oculto). Para sidebar colapsado. |
| **logo override** | Aceptar SVG inline o ReactNode personalizado. `null` = sin logo, solo subtitle. |

---

## 4. Tokens

```
Layout    --space-1/3 (gap interno · padding lo gestiona el shell)
Tipografía --font-size-xs/md · --font-weight-regular/medium/semibold
Color     --brand · --text-primary/secondary
```

Sin sombras, sin radii (usa el del sidebar). Sin bordes propios.

---

## 5. Validación con documento de marca

- **Trato individualizado (rasgo 3)**: cada portal tiene su contexto. Usuario sabe en qué espacio está.
- **"Construido para durar"**: una marca coherente — no portales con paletas distintas. Diferenciación textual, sutil. Cuando un usuario que es cliente y partner (caso real) cambia de portal, no siente que "saltó a otra app" — sigue en Aelium.
- **Voz**:
  - "Portal de Administración" (no "Admin Portal", no "Backoffice").
  - "Portal de Cliente" (no "Client Area").
  - "Portal de Partner" (no "Partner Console").

### Variantes en el producto

| Portal | Sidebar header se ve así |
|---|---|
| `/admin/*` (superadmin, agent_*) | `[◇◇] Aelium / Portal de Administración` |
| `/dashboard/*` (cliente) | `[◇◇] Aelium / Portal de Cliente` |
| Partner Module (Sprint 19) | `[◇◇] Aelium / Portal de Partner` |

---

## 6. Reglas de uso

- **Vive en el header del sidebar**. No flotante, no en topbar (ahí va NotificationBell + Avatar).
- **Subtitle siempre visible** cuando sidebar expandido. Se oculta en `compact`.
- **Sin click handler** — no es navegable. Si quieres que lleve al overview, envuelves en `<a>` aparte.
- **Logo SVG override** preferido — el texto "Aelium" es fallback si no hay SVG cargado.
- **No usar como Badge en otros sitios** — el nombre puede engañar; no es un Badge tipo pill, es un identificador de portal en sidebar.

---

## 7. Accesibilidad

- Sidebar header con `aria-label="Aelium · Portal de Cliente"` para que screen readers lean el contexto.
- Compact mode: si oculta subtitle, usar `aria-label` que contenga el texto completo.
- Color por portal cumple contraste AA (verificado en DD-021 con valores de marca).

---

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2D-4** | Falta variant `agent` | Documentar: agent reusa admin (mismo shell). PortalBadge puede aceptar el data-attribute para clarity. |
| **D2D-5** | Diferenciación sutil | Mantener (decisión de marca). No reforzar con color dramático. |
| Logo texto vs SVG | Hoy texto, SVG opcional | Spec acepta ambos. Cuando hay `aelium_logo_blue.svg`, usar SVG. |
| Padding propio | Sin padding (el shell lo gestiona) | Mantener — composible. |
