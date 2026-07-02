# PartnerShell — Spec

> Estado: **listo · densidad `standard` · DD-016 + DD-032 · NUEVO**
> Fuente actual: **no existe** — partners viven hoy en
> `dashboard/Sidebar.tsx` con items filtrados por rol. Sprint 19
> planificado para separar.
> Maqueta: `docs/design/mockup/shells/partner.html`
> Pregunta producto: **"Tus clientes, tus comisiones, tu enlace."**

---

## 1. Anatomía

```
┌─────────────────┬──────────────────────────────────────────────┐
│  SIDEBAR 240px  │  TOPBAR 56px (sin search palette)            │
│                 │  ─────────────────────────────────────────── │
│  ⬛ Aelium      │                          [🔔] [👤 Luis · Pro] │
│  Portal partner │                                              │
│ ─────────────── │  MAIN (densidad standard · pads --space-5)   │
│ TU CARTERA      │                                              │
│  ▸ Inicio       │                                              │
│  ▸ Mis clientes │                                              │
│  ▸ Comisiones   │                                              │
│ ─────────────── │                                              │
│ HERRAMIENTAS    │                                              │
│  ▸ Mi enlace    │                                              │
│  ▸ Recursos     │                                              │
│  ▸ Soporte part.│                                              │
│                 │                                              │
│  [‹ Colapsar]   │                                              │
└─────────────────┴──────────────────────────────────────────────┘
```

| Bloque | Token | Uso |
|---|---|---|
| `.shell[data-density="standard"]` | sidebar 240px / collapsed 64px · topbar 56px · pad 20px | Densidad partner (intermedia). |
| Sidebar **2 secciones**: "TU CARTERA" + "HERRAMIENTAS" | Voz posesiva del partner | Diferencia con admin (Operaciones / Plataforma). |
| Eyebrow `Portal partner` | color `--info` | Diferencia visual con cliente y admin. |

---

## 2. Densidad · `standard` (DD-016 + DD-032)

| Variable resuelta | Valor partner |
|---|---|
| `--shell-pad-y` | `--space-5` (20px) |
| `--shell-pad-x` | `--space-5` (20px) |
| `--shell-gap` | `--space-4` (16px) |
| `--shell-sidebar-width` | 240px |
| `--shell-sidebar-collapsed` | 64px |
| `--shell-topbar-height` | 56px |
| `--shell-nav-item-pad-y` | `--space-2` (8px) |

Justificación: el partner usa el portal regularmente pero no de forma
operativa todo el día. Densidad intermedia entre cliente (que abre
ocasionalmente y respira) y admin (que vive aquí).

---

## 3. Sidebar · 2 secciones

### Branding

- **Rombo Aelium** + wordmark + eyebrow `Portal partner` (color
  `--info` para diferenciar de admin que usa `--brand`).

### Sección 1 · TU CARTERA

| Label | Href | requiredModule |
|---|---|---|
| Inicio | `/partner` | Dashboard |
| Mis clientes | `/partner/clients` | PartnerClient |
| Comisiones | `/partner/commissions` | PartnerCommission |

### Sección 2 · HERRAMIENTAS

| Label | Href | requiredModule |
|---|---|---|
| Mi enlace | `/partner/link` | Partner |
| Recursos | `/partner/resources` | PartnerResource (futuro) |
| Soporte partner | `/partner/support` | PartnerSupport (futuro) |

### Voz aplicada

Posesivo claro: **"Mis clientes"**, **"Mi enlace"**. El partner ve sus
cosas, no las del producto. **"Comisiones"** sin posesivo (substantivo
operativo) — la sección "TU CARTERA" ya pone el contexto.

### Estados

Mismo sistema que ClientShell/AdminShell: hover → bg secondary;
active → brand-subtle bg + border-left brand 3px (DD-030 ✅).

---

## 4. Topbar · variante `partner`

```
[Hamburger movil] ───────────────────────────  [🔔] [👤 Luis │ Partner Pro]
```

### Sin search palette

El partner no busca tickets ni facturas globales — su universo es
estrecho (sus clientes, sus comisiones). La nav lateral es
suficiente.

### NotificationBell

Notificaciones del partner: **comisión cobrada**, **cliente
referido**, **status del partner program** (subida de tier).

### Profile dropdown

Avatar DS + nombre + rol "**Partner Pro**" / "**Partner Pendiente**"
(según subtier). Items: "Mi perfil" · "Configuración" · separador ·
"Cerrar sesión".

---

## 5. Reglas de uso

- PartnerShell envuelve **todas las páginas /partner/*** del rol partner.
- Patterns de fase 3 viven en `.shell-main` con padding standard.
- Sidebar siempre con **2 secciones**, aunque "Herramientas" tenga
  features pendientes (mostrar como "próximamente" si está disabled).

### Anti-patrones

- ❌ Mezclar items de partner con items de cliente (drift D4-5
  actual). Partner tiene su shell.
- ❌ Densidad compact en partner — el partner no es operativo de
  jornada completa.
- ❌ Search palette ⌘K. El partner no necesita comandos rápidos.
- ❌ Eyebrow "Portal partner" con rombo decorativo. Tipográfico
  con color `--info` (DD-030).
- ❌ Topbar con SupportButton de cliente. El partner tiene su propio
  canal "Soporte partner" en el sidebar.

---

## 6. A11y

- Skip link `#shell-main`.
- `<aside aria-label="Navegación de partner">`.
- Eyebrow del portal con texto SR-only ("Portal de partner").
- Mismo focus order: skip → sidebar → topbar → main.

---

## 7. Tokens consumidos

```
Layout       data-density="standard" → vars resueltas arriba
Color        --surface-primary · --surface-secondary
             --info (eyebrow portal · diferencial vs admin/cliente)
             --brand · --brand-subtle · --brand-active (active item)
             --text-primary · --text-secondary · --text-tertiary
             --border
Radius       --radius-sm · 50% (avatar)
Motion       --transition-fast
```

---

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D4-5** | Partner mezclado con cliente | **Crear PartnerShell propio** en `/partner/*` (Sprint 19). |
| **D4-13** | Sidebar sin agrupar por sección | 2 secciones: "TU CARTERA" + "HERRAMIENTAS". |
| **D4-17** | PortalBadge sin variant `partner` | Añadir variant `partner` con color `--info`. |
| Resto | Hereda drift comunes (`data-density`, search trigger, avatar) | Mismas correcciones que ClientShell. |

---

## 9. Composición · qué patterns encajan

| Pattern de fase 3 | Partner |
|---|---|
| ListPage standard | Mis clientes (tabla), comisiones (tabla) |
| ListPage timeline | Historial de comisiones cobradas |
| DetailPage standard | Detalle de un cliente referido |
| DetailPage with-aside | Cliente referido con metadata (estado, plan, MRR generado) |
| FormPage standard | Editar perfil partner, datos fiscales |

Páginas que NO usa partner: workspace-lite (no opera tickets),
ListPage split (no triage), FormPage long-form admin-only.
