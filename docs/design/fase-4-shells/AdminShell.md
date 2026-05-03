# AdminShell — Spec

> Estado: **listo · densidad `compact` · DD-016 + DD-032**
> Fuente actual: `frontend/app/admin/{layout.tsx,AdminSidebar.tsx}` +
> Topbar compartido `_shared/shell/Topbar.tsx`
> Maqueta: `docs/design/mockup/shells/admin.html`
> Pregunta producto: **"Operación de equipo. Rápido y profundo."**

---

## 1. Anatomía

```
┌──────────────────┬─────────────────────────────────────────────┐
│  SIDEBAR 232px   │  TOPBAR 52px (con search palette)           │
│                  │  ────────────────────────────────────────── │
│  ⬛ Aelium       │  [🔍 Buscar (sin kbd)]    [🔔7] [👤 Julia]  │
│  Portal admin    │                                              │
│ ──────────────── │  MAIN (densidad compact · pads --space-4)   │
│ OPERACIONES      │                                              │
│  ▸ Inicio        │                                              │
│  ▸ Clientes  142 │                                              │
│  ▸ Productos     │                                              │
│  ▸ Servicios     │                                              │
│  ▸ Facturación   │                                              │
│  ▸ Soporte    14 │                                              │
│  ▸ Tareas        │                                              │
│ ──────────────── │                                              │
│ PLATAFORMA       │                                              │
│  ▸ Settings      │                                              │
│  ▸ Error log   3 │                                              │
│  ▸ Jobs DLQ      │                                              │
│  ▸ Plantillas    │                                              │
│                  │                                              │
│  [‹ Colapsar]    │                                              │
└──────────────────┴─────────────────────────────────────────────┘
```

| Bloque | Token | Uso |
|---|---|---|
| `.shell[data-density="compact"]` | sidebar 232px / collapsed 56px · topbar 52px · pad 16px | Densidad admin (productivo). |
| Sidebar con **2 secciones** | "OPERACIONES" + "PLATAFORMA" | Visibilidad por CASL. |
| Active item | brand-subtle + border-left 3px (DD-030) | Igual que cliente. |
| `.shell-search-trigger` | min-width 280px, sin `<kbd>` | DD-025 reafirmado. |

---

## 2. Densidad · `compact` (DD-016 + DD-032)

| Variable resuelta | Valor admin |
|---|---|
| `--shell-pad-y` | `--space-4` (16px) |
| `--shell-pad-x` | `--space-5` (20px) |
| `--shell-gap` | `--space-3` (12px) |
| `--shell-sidebar-width` | 232px |
| `--shell-sidebar-collapsed` | 56px |
| `--shell-topbar-height` | 52px |
| `--shell-nav-item-pad-y` | `--space-1_5` (6px) |

Justificación: el admin/agente trabaja todo el día aquí. Cada píxel
ahorrado son más filas visibles. Densidad alta sin perder respiro
estructural — el espaciado interno de cada componente (Card, Modal,
Form) sí mantiene su ritmo.

---

## 3. Sidebar · 2 secciones por CASL

### Branding

- **Rombo Aelium** + wordmark + eyebrow `Portal admin` (color **brand**
  para diferenciar del cliente que usa tertiary).

### Sección 1 · OPERACIONES (visibilidad granular)

| Label | Href | requiredModule | Roles |
|---|---|---|---|
| Inicio | `/admin` | Dashboard | todos staff |
| Clientes | `/admin/clients` | Client | superadmin · agent_full · agent_billing · agent_support (read) |
| Productos | `/admin/products` | Product | superadmin · agent_full |
| Support Inside | `/admin/support-inside-plans` | SupportInside | superadmin · agent_full |
| Servicios | `/admin/services` | Service | superadmin · agent_full |
| Facturación | `/admin/billing` | Invoice | superadmin · agent_full · agent_billing |
| Soporte | `/admin/support` | Conversation | superadmin · agent_full · agent_support |
| Chat en vivo | `/admin/support/chats` | Conversation | superadmin · agent_full · agent_support |
| Tareas | `/admin/tasks` | Task | superadmin · agent_full · agent_billing · agent_support |

### Sección 2 · PLATAFORMA (solo superadmin)

| Label | Href | requiredModule |
|---|---|---|
| Settings | `/admin/settings` | Setting |
| Error log | `/admin/error-log` | ErrorLog |
| Jobs en DLQ | `/admin/jobs/failed` | Job |
| Plantillas notificaciones | `/admin/notifications/templates` | NotificationTemplate |

### Counters inline (badge tabular-nums)

Items con count operativo activo: **Clientes (142)**, **Soporte (14)**,
**Tareas (8)**, **Error log (3)**. Counter en el lado derecho del
nav-link, monospace pequeño.

### Voz aplicada

Labels son sustantivos directos del backend. El admin habla en jerga
operativa porque es su trabajo. Sin "amabilidad performativa" para el
admin — pero sin tecnicismos crípticos tampoco. **"Plantillas
notificaciones"** ✅ · **"Notification template registry"** ❌.

---

## 4. Topbar · variante `admin`

```
[Hamburger movil] [🔍 Buscar...]  ──── [🔔7] [👤 Julia M. │ Agente]
```

### Search palette (DD-025 reafirmado · drift D4-9 corregido)

- Input visual del topbar con icono lupa + texto "Buscar...".
- **NO** `<kbd>⌘K</kbd>` visible (DD-025).
- Click abre CommandPalette (`/cliente buscar`, `/factura saltar`,
  `/ticket abrir`).
- Atajo `⌘K` / `Ctrl+K` sigue funcionando para usuarios power.

### Resto

- NotificationBell (mismo componente DS).
- Profile dropdown con Avatar DS + nombre + rol ("Agente", "Admin",
  "Superadmin").
- **Sin** SupportButton — admin no abre tickets a sí mismo.

---

## 5. Reglas de uso

- AdminShell envuelve **todas las páginas /admin/*** del rol staff.
- ContextBackLink (`/admin/clients/[id]` desde `/admin/billing`)
  visible cuando aplica — coexiste con Breadcrumb sin doblar.
- Sidebar con **2 secciones siempre**, aunque la segunda esté vacía
  por permisos. Coherencia visual entre roles.
- Patterns de fase 3 viven en `.shell-main` con padding compact.

### Anti-patrones

- ❌ Densidad comfortable en admin. El operativo necesita densidad.
- ❌ Sidebar sin secciones. Mezclar Operaciones + Plataforma sin
  agrupar es ruido visual.
- ❌ Topbar idéntico al cliente. El admin necesita search palette.
- ❌ Eyebrow "Portal admin" con rombo decorativo. Tipográfico (DD-030).
- ❌ Mostrar items que el rol no puede usar (visibles + disabled).
  Filtrado por CASL = ocultos.

---

## 6. A11y

- Skip link `#shell-main`.
- `<aside aria-label="Navegación de administración">`.
- Cada sección con `<nav aria-labelledby="section-id">`.
- Counters con texto SR-only adicional ("3 errores nuevos en error log").
- Search trigger con `aria-haspopup="dialog"` apuntando al
  CommandPalette.
- Active item con `aria-current="page"`.

---

## 7. Tokens consumidos

```
Layout       data-density="compact" → vars resueltas arriba
Color        --surface-primary · --surface-secondary
             --brand · --brand-subtle · --brand-active (active item · eyebrow portal)
             --text-primary · --text-secondary · --text-tertiary
             --border · --border-hover
             --danger (error log count)
Radius       --radius-sm (nav-link) · 50% (avatar) · 999px (count badge)
Tipografía   --font-size-sm (nav-label) · --font-size-xs (count)
             tabular-nums en counts
Motion       --transition-fast
```

---

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D4-4'** | "A" cuadrada hardcoded | SVG rombo Aelium real. |
| **D4-8** | Sin `data-density="compact"` | Añadir al shell root. |
| **D4-9** | Search trigger con `<kbd>⌘K</kbd>` visible | Eliminar `<kbd>` (DD-025). |
| **D4-10** | Topbar idéntico al cliente | Topbar `variant="admin"` con search, sin SupportButton. |
| **D4-11** | Avatar manual en topbar | Migrar a `<Avatar>` DS. |
| **D4-14** | AdminSidebar sin collapse | Añadir collapse pattern (mismo botón "‹"). |

---

## 9. Composición · qué patterns encajan

| Pattern de fase 3 | Admin |
|---|---|
| ListPage standard | /admin/clients, /admin/billing, /admin/services |
| ListPage grid | /admin/products (catálogo con icono) |
| ListPage timeline | /admin/error-log, /admin/audit-log |
| ListPage split | /admin/support (cola + detalle) |
| DetailPage standard | /admin/billing/[id], /admin/products/[id] |
| DetailPage with-aside | /admin/clients/[id] (ficha cliente operativa) |
| DetailPage workspace-lite | /admin/support/[id] con triage |
| FormPage standard | /admin/products/new, /admin/users/new |
| FormPage wizard | /admin/clients/new (alta guiada) |
| FormPage long-form | /admin/settings (settings TOC) |
