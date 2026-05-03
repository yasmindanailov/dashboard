# DetailPage — Spec

> Estado: **listo · 3 variantes (DD-029)**
> Fuente actual: `frontend/app/components/ui/DetailPage/DetailPage.{tsx,module.css}`
> Maqueta: `docs/design/mockup/patterns/detail-page.html`
> Pregunta producto: **"¿Qué es esto? ¿Qué puedo hacer con ello?"**

---

## 1. Anatomía

```
┌──────────────────────────────────────────────────────────┐
│ BREADCRUMB                                               │
│  Clientes > Juan García                                  │
├──────────────────────────────────────────────────────────┤
│ DETAIL HEADER (card limpia · sin accent-stripe DD-030)   │
│  Avatar(with-status) ─ (eyebrow opt)                     │
│                       ─ h1 Título   [Badge]   [Acciones] │
│  ─────────────────────────────────────────────────────   │
│  Metadata inline (id · email · fecha alta · plan · ...)  │
├──────────────────────────────────────────────────────────┤
│ TABS (DS · DD-028 · variant=underline por defecto)       │
│  Resumen │ Servicios │ Facturas │ Historial              │
├──────────────────────────────────────────────────────────┤
│ TAB CONTENT — varía por variante                         │
│   standard:        contenido full-width                  │
│   with-aside:      [main 2/3] · [aside 1/3 metadata]     │
│   workspace-lite:  [rail 280] · [main flex] · [rail 320] │
└──────────────────────────────────────────────────────────┘
```

| Bloque | Token | Uso |
|---|---|---|
| `.detail-page` | `max-width: 1200px` (1400 si `wide`) · `gap: --space-6` | Wrapper raíz. Flex column. |
| `.dp-header` | `surface-primary + border + radius-lg + shadow-sm + padding 5/6` | **Sin border-left** (DD-030). |
| `.dp-header-eyebrow` | `--brand` · uppercase · letter-spacing 0.08em | Tipográfico, sin rombo. |
| `.dp-header-meta` | `border-top: --border` · `gap: 3 5` | Metadata inline en `<dl>`. |
| Tabs | Componente DS Tabs (DD-028) | NO Tabs hardcoded en el wrapper. |

---

## 2. Variantes (DD-029)

### 2.1 `standard` (default)

**Caso producto:**
- `/cliente/billing/[id]` — factura individual con resumen + items + acciones.
- `/admin/clientes/[id]` — ficha cliente con tabs (resumen / servicios /
  facturas / historial).
- `/admin/products/[id]` — producto editable.

**Cuándo usar:**
- El detalle es **lineal**: el usuario consume top-to-bottom y las
  acciones globales están en el header.
- No hay metadata densa que requiera estar visible siempre.

**Composición:** Header con avatar/icono + título + badge + acciones.
Tabs DS si hay >2 secciones. Cada tab content full-width 1200px.

### 2.2 `with-aside`

**Caso producto:**
- `/agente/clientes/[id]` — ficha cliente operativa: a la izquierda el
  hilo (notas, conversaciones, facturas); a la derecha **siempre
  visible** la ficha de identidad (plan, productos contratados, último
  contacto, score, persona asignada).
- `/admin/support/[id]` — ticket con conversación (main) + metadata
  estructurada (aside: cliente, asignado, prioridad, SLA, etiquetas).
- `/cliente/services/[id]` — servicio con detalle técnico (main) +
  acciones rápidas + estado de salud (aside).

**Cuándo usar:**
- Hay **metadata estructurada** que el usuario necesita ver
  permanentemente mientras opera en el cuerpo.
- Acciones rápidas que se repiten — botones contextuales viven en el aside.
- Productividad > respiro: típico de agente y admin.

**Cuándo NO usar:**
- Cliente final navegando — el aside compite por atención. Excepción:
  `/cliente/services/[id]` cuando el aside da seguridad ("estado: ✓
  todo en orden").

**Composición:** Main (`<Card>` o tabla o timeline) + Aside con cards
neutras (sin border-left, DD-030) que agrupan metadata. Aside **sticky
top** — sigue al usuario al hacer scroll.

### 2.3 `workspace-lite`

**Caso producto:**
- `/agente/support/[id]` con triage activo — rail izquierdo con la
  cola de tickets, main con el detalle del ticket activo, rail derecho
  con ficha cliente y acciones.
- `/admin/error-log/[id]` — rail izquierdo con stack de errores
  similares, main con el error en detalle, rail derecho con metadata
  de servidor / contexto.

**Cuándo usar:**
- El usuario hace **triage** — necesita saltar entre items sin perder
  contexto.
- Tres planos de información: cola → foco → contexto.
- Específico de agente / admin en flujos operativos.

**Cuándo NO usar:**
- Cualquier cosa orientada a cliente — workspace-lite es densidad alta.
- Workspace puro de chats — usar pattern Workspace (futuro), no esta
  variante "lite".

**Composición:** 3 columnas con scroll independiente. Cada columna en
card limpia (border + radius-lg + shadow-sm). **Activa `wide`** por
defecto (1400px).

---

## 3. Reglas de uso

### Header card

- **Una sola tarjeta limpia** (DD-030). Nada de border-left. Nada de
  gradient mesh. La firma Aelium la dan: avatar with-status, badge
  tipográfico, eyebrow opcional, tabular-nums en IDs/fechas.
- **Metadata inline** en `<dl>`, no en sub-cards. Regla del UI_SPEC §2.5
  ("La información de cabecera es inline, no en cards").
- **Acciones** a la derecha del título. Máximo 1 primaria + 1-2
  secundarias o un Dropdown "Más acciones".

### Tabs

- Siempre **componente DS Tabs** (DD-028). Variant `underline` por
  defecto. `underline + StatusDot` cuando los tabs sean estados
  (cliente / ticket).
- **No** renderizar tabs hardcoded dentro del wrapper. El wrapper
  acepta `tabs` como ReactNode.

### Anti-patrones

- ❌ Header con StatsCards "para resaltar el ID y el total". El número
  va inline (h1 + tabular-nums). StatsCards solo en Overview.
- ❌ Border-left brand en el header card. Reservado a navegación
  (sidebar, vertical tabs). DD-030 lo prohíbe en recuadros.
- ❌ Doble breadcrumb (uno arriba + uno dentro del header). Solo el
  Breadcrumb superior.
- ❌ With-aside en cliente final cuando no aporta — el aside vacío
  (relleno de metadata genérica) ensucia.
- ❌ Workspace-lite cuando standard ya funciona. La densidad alta
  exige justificación operativa real.

---

## 4. Voz de marca aplicada (DD-022)

### Title

**Nombre real de la entidad** (no genérico). "Floristería Pérez", no
"Cliente #142". "INV-00042" cuando el ID es la identidad. **DD-029
N2F-9** (Inline edit) aplica al nombre cliente — click → edita sin modal.

### Eyebrow

Cuando hay relación con otra entidad. **"Cliente desde octubre 2025"** o
**"Plan Pro · activo"**. No "Detail page" ni "Información".

### Metadata

Voz de hoja de servicio:

| Genérico | Aelium |
|---|---|
| "Email: jose@..." | "Le escribimos a · jose@..." |
| "Created at: 2025-10-12" | "Cliente desde · oct 2025" |
| "Status: Active" | Badge `active` con dot |
| "ID: 00142" | "ID · 00142" (tabular-nums) |

### Acciones

Verbos directos. **"Generar factura"**, **"Suspender servicio"**,
**"Asignar a partner"**. Nunca "Submit" / "Process".

---

## 5. A11y

- `<main role="main">` envuelve `.detail-page`.
- Breadcrumb con `<nav aria-label="Migas de pan">`.
- h1 único en el header card.
- Avatar with-status: dot con `aria-label` describiendo estado
  ("Cliente activo").
- Metadata inline como `<dl><dt><dd>` correctos.
- Tabs DS gestiona ARIA correctamente (heredado de fase 2.D).
- Variante with-aside: aside con `<aside aria-label="Ficha del
  cliente">`, no `<div>`.
- Variante workspace-lite: cada rail con `role="region" aria-label`
  ("Cola de tickets", "Detalle", "Contexto").
- Focus order: breadcrumb → header acciones → tabs → content → aside.

---

## 6. Tokens consumidos

```
Layout       max-width 1200/1400 · gap --space-6
             grid 2/3 + 1/3 (with-aside) · grid 280 · 1fr · 320 (workspace-lite)
Tipografía   --font-size-xl (h1) · --font-size-sm/xs (meta)
             letter-spacing -0.015em / 0.08em (eyebrow)
             tabular-nums en IDs y fechas
Color        --text-primary · --text-secondary · --text-tertiary
             --brand (eyebrow) · --border (separadores)
             --surface-primary
Radius       --radius-lg (cards) · --radius-md (avatar)
Sombra       --shadow-sm (cards)
```

---

## 7. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D3-1** | Tabs hardcoded en el componente (no usa Tabs DS DD-028) | Migrar a `tabs?: ReactNode` aceptando el componente DS. Compat: legacy `tabs: DetailTab[]` durante migración fase 5+. |
| **D3-4** | headerCard genérico SaaS sin firma Aelium | Sin rombo, sin border-left (DD-030). Firma vía contenido (avatar with-status, eyebrow, tabular-nums, badge). |
| **D3-5** | Sin variantes nativas | Añadir prop `variant?: 'standard' \| 'with-aside' \| 'workspace-lite'` + `aside?: ReactNode`. |
| **D3-15** | Ritmo vertical inconsistente (mt/mb dispersos) | gap del wrapper a `--space-6`. Hijos sin margin propio. |

---

## 8. Materialización

`docs/design/mockup/patterns/detail-page.html` — 3 variantes apiladas
con caso producto real, voz Aelium, sin rombo decorativo (DD-030).

---

## 9. Composición · qué componentes encajan

| Componente DS | Standard | With-aside | Workspace-lite |
|---|---|---|---|
| Breadcrumb | ✅ | ✅ | ✅ |
| Avatar (with-status) | ✅ en header | ✅ en header | ✅ en header |
| Badge | ✅ junto al título | ✅ | ✅ |
| Tabs DS (DD-028) | si >2 secciones | si >2 secciones | rara (rails ya separan) |
| Card | en content | en main + aside | en cada rail |
| Table | en content | en main | en main |
| Timeline (DD-027) | en content (historial) | en main | en main |
| InlineEdit (N2F-9) | título cliente | título cliente | rara |
| Pagination · compact | ❌ | en aside (sub-listas) | en rail-left |
| Modal (confirm/destructive) | ✅ | ✅ | ✅ |
| Toast | ✅ | ✅ | ✅ |
