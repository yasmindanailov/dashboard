# Fase 2 — Componentes base

> Estado: **en curso** (grupo A activo)
> Modo: **diseño**
> Entrada: tokens cerrados en fase 1 (`../fase-1-tokens/tokens.css`).

---

## Objetivo

Especificar visualmente los **35 componentes existentes** (más los nuevos que
emerjan justificadamente) usando exclusivamente los tokens cerrados en
fase 1. Cada componente entra a la maqueta viva `../mockup/components/`
con todos sus estados y variantes.

---

## Estrategia — audit just-in-time por grupo

Los 35 componentes no se auditan ni se especifican de golpe. Cada **grupo**
se cierra en una sesión propia con este flujo:

1. **Audit just-in-time:** leer las fuentes reales de los N componentes
   del grupo (`frontend/app/components/ui/{Componente}/`), producir
   `audit-existing.md` con drift detectado, valores hardcoded, props,
   variantes existentes.
2. **Spec del primer componente del grupo** como modelo, esperar
   aprobación humana.
3. **Spec en bloque** del resto del grupo siguiendo el mismo formato.
4. **Página(s) en la maqueta viva** (`mockup/components/{componente}.html`).
5. **`NOTES.md` del grupo** con deudas que pasan a fases siguientes.
6. **Commit** `docs(design): fase 2.{X} — {grupo} specs cerrados`.

Razón de este enfoque (vs auditar los 35 al inicio): coste de contexto
manejable, problemas sistémicos afloran grupo a grupo, no bloquea avance.

---

## Grupos y orden

| # | Grupo | Componentes | Razón del orden |
|---|-------|-------------|-----------------|
| **2.A** | Formularios | Button, Input, Select, Textarea, SearchInput, Dropdown | Base para todos los demás (botones aparecen en cards, modales, headers, tablas). |
| **2.B** | Feedback | Badge, StatusDot, Toast, AlertBanner, Tooltip, HelpTip, Skeleton | Una vez los formularios están, los componentes que les acompañan en pantalla. |
| **2.C** | Data | Table, Pagination, StatsCard, BulkActionBar, FilterBar | Consumen formularios y feedback. |
| **2.D** | Navegación | Tabs, Breadcrumb, CommandPalette, NotificationBell, PortalBadge | Atan al shell y necesitan los anteriores. |
| **2.E** | Contenedores | Card, Modal, Avatar, EmptyState | Wrappers que consumen todos los anteriores. |

`DetailPage`, `ListPage`, `FormPage`, `PageHeader`, `EditorSectionCard`
NO son componentes base — son **patrones de página** y se especifican en
fase 3.

`Sidebar`, `AdminSidebar`, `Topbar`, `ChatWidget`, `SupportPanel`,
`GradientMesh` NO son componentes base — son **shell** y se especifican
en fase 4.

---

## Estructura de cada spec individual

Cada `{Componente}.md` sigue este esqueleto:

1. **Anatomía** — partes nombradas (label, container, value, prefix, suffix, helper, error, ...).
2. **Variantes** — las que existen + las que se proponen, justificadas.
3. **Tamaños** — sm / md / lg con dimensiones derivadas de tokens.
4. **Estados** — default / hover / focus-visible / active / disabled / loading / error / readonly / con valor / vacío (los que apliquen).
5. **Tokens consumidos** — referencia explícita a tokens.css. Incluye los nuevos (`--accent`, `--focus-ring`, `--row-height`, etc.).
6. **Reglas de uso** — cuándo sí, cuándo no, anti-patrones.
7. **Accesibilidad** — rol ARIA, navegación teclado, contraste, mensajes.
8. **Drift detectado vs implementación actual** — qué cambia respecto al código de hoy y por qué.

Las decisiones que afectan a más de un componente o a fases siguientes se
extraen a `../DECISIONS.md` con su propio número (DD-NNN).

---

## Maqueta viva

Cada componente entra a `../mockup/components/{componente}.html` mostrando
todas sus variantes, tamaños y estados con anotaciones. La maqueta crece
fase a fase y eventualmente contendrá patrones (fase 3), shells (fase 4)
y mockups de páginas reales (fases 5-9). Ver `../mockup/README.md`.

---

## Estado por grupo

| Grupo | Estado | Carpeta |
|-------|--------|---------|
| 2.A formularios | En curso (modelo en revisión) | `grupo-a-formularios/` |
| 2.B feedback | Pendiente | `grupo-b-feedback/` (sin crear) |
| 2.C data | Pendiente | `grupo-c-data/` (sin crear) |
| 2.D navegación | Pendiente | `grupo-d-navegacion/` (sin crear) |
| 2.E contenedores | Pendiente | `grupo-e-contenedores/` (sin crear) |

Las carpetas de cada grupo se crean al activarse el grupo, no antes.
