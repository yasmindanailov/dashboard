# ClientShell — Spec

> Estado: **listo · densidad `comfortable` · DD-016 + DD-032**
> Fuente actual: `frontend/app/dashboard/{layout.tsx,Sidebar.tsx}` +
> `frontend/app/_shared/shell/Topbar.{tsx,module.css}`
> Maqueta: `docs/design/mockup/shells/client.html`
> Pregunta producto: **"Tu hosting funciona, te lo cuento como un socio."**

---

## 1. Anatomía

```
┌─────────────────┬──────────────────────────────────────────────┐
│  SIDEBAR 260px  │  TOPBAR 60px (sin search palette)            │
│                 │  ─────────────────────────────────────────── │
│  ⬛ Aelium      │                  [💬 Soporte] [🔔] [👤 ... ] │
│  Portal cliente │                                              │
│ ─────────────── │  MAIN (ListPage / DetailPage / FormPage)     │
│  ▸ Inicio       │  padding-y --space-6 · padding-x --space-6   │
│  ▸ Tus servic.. │                                              │
│  ▸ Tus factur.. │                                              │
│  ▸ Soporte      │                                              │
│  ▸ Transparen.. │                                              │
│                 │                                              │
│  [‹ Colapsar]   │                                              │
└─────────────────┴──────────────────────────────────────────────┘
```

| Bloque | Token | Uso |
|---|---|---|
| `.shell[data-density="comfortable"]` | sidebar 260px / collapsed 72px · topbar 60px · pad 24px | Densidad cliente (respira). |
| `.shell-sidebar` | surface-primary + border-right | Vertical sticky 100vh. |
| `.shell-brand` | rombo Aelium SVG + wordmark + portal eyebrow | Branding portal cliente. |
| `.shell-nav-link.is-active` | brand-subtle bg + brand-active fg + **border-left brand 3px** | Navegación funcional (DD-030 explícito). |
| `.shell-topbar` | surface-primary + border-bottom | Sticky top, z-index 10. |
| `.shell-main` | surface-secondary | Pads grandes para respiro. |

---

## 2. Densidad · `comfortable` (DD-016 + DD-032)

| Variable resuelta | Valor cliente |
|---|---|
| `--shell-pad-y` | `--space-6` (32px) |
| `--shell-pad-x` | `--space-6` (32px) |
| `--shell-gap` | `--space-5` (24px) |
| `--shell-sidebar-width` | 260px |
| `--shell-sidebar-collapsed` | 72px |
| `--shell-topbar-height` | 60px |
| `--shell-nav-item-pad-y` | `--space-2_5` (10px) |

Justificación: el cliente no es un usuario operativo — abre el portal
para confirmar que todo va bien o resolver una duda. Densidad alta
sería abrumadora; densidad cómoda transmite calma y profesionalismo.

---

## 3. Sidebar

### Branding

- **Rombo Aelium SVG real** (no "A" cuadrada · drift D4-4).
- Wordmark "**aelium**" lowercase tras el rombo.
- Eyebrow `Portal cliente` debajo, tipográfico (sin marker).

### Navegación (1 sección, sin titulares)

| Label | Href | Icono | Voz |
|---|---|---|---|
| Inicio | `/dashboard` | dashboard | Resumen del estado |
| Tus servicios | `/dashboard/services` | services | Posesivo cliente |
| Tus facturas | `/dashboard/billing` | billing | Posesivo cliente |
| Soporte | `/dashboard/support` | support | Verbo implícito |
| Transparencia | `/dashboard/transparency` | timeline | Diferenciador Aelium |

5 items — sin titulares de sección. Cliente no quiere navegar 17
módulos; quiere ver lo suyo y pedir ayuda si hace falta.

### Estados

- **default**: text-secondary + ícono outline 1.5px.
- **hover**: surface-secondary bg + text-primary.
- **active**: brand-subtle bg + brand-active fg + **border-left 3px brand** (DD-030 ✅).
- **collapsed**: solo ícono, label oculto.

### Footer

Botón **"‹ Colapsar"** plegable. En móvil: sidebar es drawer con
backdrop.

---

## 4. Topbar · variante `cliente`

```
[Hamburger movil] ──────────────  [💬 Soporte] [🔔3] [👤 María Pérez │ Cliente]
```

**Sin search palette** (DD-025 reafirmado · drift D4-9 + D4-10):
- Cliente NO tiene CommandPalette · su entrada es la nav lateral + Soporte.

**Botón Soporte** (icono chat + count): abre el SupportPanel del
producto (chat en vivo + abrir ticket).

**NotificationBell** con count si hay nuevas.

**Profile dropdown**: Avatar (paleta brand DD-024) + nombre + rol
"Cliente". Items: "Mi perfil" · "Configuración" · separador · "Cerrar
sesión" (danger).

### Voz aplicada

| Genérico | Aelium |
|---|---|
| "Help" | "Soporte" |
| "Notifications" | (icono solo · count visible) |
| "Sign out" | "Cerrar sesión" |
| "Account settings" | "Configuración" |
| Profile role "User" | "Cliente" |

---

## 5. Reglas de uso

- ClientShell envuelve **todas las páginas /dashboard/*** del rol cliente.
- Patterns de fase 3 (ListPage, DetailPage, FormPage) viven dentro
  de `.shell-main` y consumen el ancho disponible (1200px max-width
  centrado).
- ContextBackLink **NO aparece en cliente** — el cliente no salta
  entre contextos administrativos.

### Anti-patrones

- ❌ Search palette ⌘K visible en topbar cliente. El cliente no
  navega así.
- ❌ Sidebar con 12+ items. Si hace falta, hay un módulo mal
  pensado para cliente.
- ❌ Densidad compact en cliente (drift sería brutal — el cliente no
  es operativo).
- ❌ Eyebrow "Portal cliente" con rombo decorativo. **DD-030**:
  tipográfico, sin marker.

---

## 6. A11y

- Skip link `#shell-main` antes del sidebar.
- `<aside aria-label="Navegación principal">` sidebar.
- `<header>` topbar.
- `<main id="shell-main">` con `role="main"`.
- Active item con `aria-current="page"`.
- Mobile drawer: focus-trap + ESC cierra + backdrop con `aria-hidden`.

---

## 7. Tokens consumidos

```
Layout       data-density="comfortable" → vars resueltas arriba
Color        --surface-primary (sidebar/topbar) · --surface-secondary (main)
             --brand · --brand-subtle · --brand-active (active item)
             --text-primary · --text-secondary · --text-tertiary
             --border · --border-hover
Radius       --radius-sm (nav-link) · 50% (avatar)
Sombra       (sidebar sin sombra · borde es suficiente)
Motion       --transition-fast (hover, collapse)
```

---

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D4-4** | "A" cuadrada hardcoded | SVG rombo Aelium real. |
| **D4-5** | Mezcla cliente + partner en mismo sidebar | Separar a PartnerShell propio (Sprint 19). |
| **D4-6** | inline `style={{marginLeft}}` en main | CSS var `--sidebar-width` en grid. |
| **D4-7** | Sin `data-density="comfortable"` en root | Añadir al shell root. |
| **D4-9** | Search trigger con `<kbd>⌘K</kbd>` visible | Eliminar `<kbd>` (DD-025). |
| **D4-10** | Topbar único — cliente sin variante | Topbar `variant="cliente"` sin search palette. |
| **D4-11** | Avatar manual en topbar | Migrar a `<Avatar>` DS. |

---

## 9. Composición · qué patterns encajan

| Pattern de fase 3 | Cliente |
|---|---|
| ListPage standard | Tus facturas, listings administrativos del cliente |
| ListPage grid | Tus servicios contratados |
| ListPage timeline | Transparencia ("Lo que hemos hecho por ti") |
| DetailPage standard | Una factura individual |
| DetailPage with-aside | Detalle servicio con health en aside |
| FormPage standard | Editar perfil, método de pago |
| FormPage wizard | Onboarding, contratar nuevo servicio |
| FormPage long-form | Configuración general (settings con TOC) |
