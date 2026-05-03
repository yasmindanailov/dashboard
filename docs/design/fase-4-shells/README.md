# Fase 4 — Shells por portal

> Estado: **en curso**
> Modo: **diseño**
> Output: 4 shells (`AuthShell`, `ClientShell`, `AdminShell`,
> `PartnerShell`). Cada uno con su densidad propia (DD-016 asignación)
> y su voz aplicada al sidebar/topbar/landmarks. Sin tocar `frontend/`.

---

## Naturaleza de esta fase

Fase 1 dio tokens. Fase 2 dio componentes. Fase 3 dio patterns. Fase 4
da el **caparazón**: sidebar + topbar + main + slots por rol. Cada
shell decide:

- **Densidad**: cliente respira, partner medio, admin productivo.
- **Sidebar**: ancho, secciones, navegación, branding.
- **Topbar**: search (admin sí, cliente no), notificaciones, perfil.
- **Acciones contextuales**: SupportPanel (cliente), ContextBackLink
  (admin/agente), CommandPalette (admin/agente).

Heredamos:
- DD-014 (focus ring doble), DD-016 (densidad por portal **se materializa
  aquí**), DD-021 (marca manda), DD-022 (voz), DD-023 (firma),
  DD-025 (topbar sin kbd-box decorativo), DD-027 (timeline), DD-028
  (Tabs DS), DD-029 (variantes), DD-030 (rombo selectivo + recuadros
  sin accent-stripe), DD-031 (patterns con wrappers responsables).

## Shells cubiertos

| Shell | Spec | Densidad | Pregunta producto |
|---|---|---|---|
| **AuthShell** | `AuthShell.md` | n/a (fuera de portal) | "¿Cómo entras a Aelium?" |
| **ClientShell** | `ClientShell.md` | `comfortable` | "Tu hosting funciona, te lo cuento como un socio." |
| **AdminShell** | `AdminShell.md` | `compact` | "Operación de equipo. Rápido y profundo." |
| **PartnerShell** | `PartnerShell.md` | `standard` | "Tus clientes, tus comisiones, tu enlace." |

## Decisiones que esta fase debe tomar

1. **Anatomía única topbar/sidebar** entre Client/Partner/Admin —
   misma estructura, distinta densidad y secciones.
2. **AuthShell** reusa el split-screen actual (Aurora + form) con
   refinamientos: logo Aelium correcto, copy con voz de marca,
   variante `centered-status` para `verify-email` y confirmaciones.
3. **DD-016 materializada**: `data-density="comfortable|standard|compact"`
   en el body o root del shell. Tokens espacio se ajustan vía vars
   resueltas.
4. **DD-025 reafirmada**: el botón de search del topbar en Admin/Agente
   abre CommandPalette pero **sin `⌘K` kbd visible** (audit drift D4-1
   en código). Cliente NO tiene search de palette — su entrada es la
   nav lateral + Soporte.
5. **Sidebar logo**: símbolo Aelium real (rombo del logo) en estado
   colapsado, no la "A" cuadrada hardcoded actual. Con sidebar
   expandido: `aelium` wordmark + portal sub-eyebrow.
6. **Sidebar active item**: border-left brand 3px (DD-030 explícitamente
   permite en navegación funcional).
7. **Topbar perfil**: avatar + nombre + rol resumido. Dropdown con "Mi
   perfil", "Configuración" (si aplica), "Cerrar sesión".

## Heredamos sin renegociar

- Patterns de fase 3 viven dentro de `<main>` de cada shell.
- Componentes DS (NotificationBell, CommandPalette, Dropdown,
  PortalBadge, Avatar) sin cambios.
- Voz Aelium aplicada en cada label del sidebar y cada copy del topbar.

## Validación

Cada shell entrega:
- **Anatomía** ASCII + slots.
- **Sidebar** con secciones, items, voz aplicada.
- **Topbar** con composición correcta.
- **Densidad** declarada (DD-016).
- **Estados** (collapsed, mobile drawer, focus order).
- **A11y** (landmarks `<nav>`, `<header>`, `<main>`, skip link).
- **Materialización** en `mockup/shells/<shell>.html`.

## Plan

1. ✅ `audit-existing.md` — drift D4-1..D4-N en `frontend/app/{AuthLayout,dashboard,admin,_shared/shell}/`.
2. ✅ CSS de shells en `mockup/styles.css` (sección "FASE 4 · SHELLS").
3. ✅ Spec por shell con anatomía + voz + densidad.
4. ✅ Mockups: `mockup/shells/{auth,client,admin,partner}.html`.
5. ✅ NOTES.md — deudas para implementación TS/CSS module.
6. ✅ DD-032 en `DECISIONS.md`.
7. ✅ PLAN.md actualizado.
8. ✅ Commit `docs(design): fase 4 — shells por portal (Auth · Client · Admin · Partner)`.

## Lo que esta fase NO entrega

- Implementación TS de las variantes en `frontend/` (registrado en NOTES).
- Páginas reales del producto compuestas con shell + patterns (fases 5-9).
- Pattern Workspace puro (chats) — fase propia.
- Settings de configuración profundos (perfil, preferencias) — fase 5+.
- Dark mode tokens — fase 11.
