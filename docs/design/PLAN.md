# PLAN.md — Programa de evolución UI/UX del dashboard

> Documento maestro. Cualquier sesión de diseño empieza leyendo este archivo.
> Actualizado al cerrar cada sesión (ver `SESSION_RULES.md` Regla 7).

---

## Estado actual

- **Fase activa:** 5 — Mockups del Portal Cliente **lista para revisión**
- **Modo activo:** diseño
- **Próxima acción:** revisión humana de los 7 mockups del cliente
  componiendo ClientShell + patterns de fase 3 + componentes de
  fase 2. Si OK, **fase 5 cerrada**. Próximo arranque: **fase 6
  (mockups agente)** — overview operativo, clientes asignados, tickets,
  facturas (vista agente).
- **Última actualización:** 2026-05-03 — fase 5 completa. Audit
  drift D5-1..D5-12 documentado en `fase-5-cliente/audit-existing.md`
  (mayoría de copy: "Mis" → "Tus"; overview con tiles humanos en
  lugar de StatsCards genéricos; transparency con voz Aelium en
  cada evento). 7 mockups entregados: Inicio (saludo adaptativo +
  tiles + novedades + atajos), Tus servicios (ListPage grid),
  Detalle de servicio (DetailPage with-aside con health-rombo dual
  funcional), Tus facturas (ListPage standard + StatusTabs), Detalle
  de factura (DetailPage standard), Transparencia (ListPage timeline
  · activo de marca diferenciador con marker rombo brand), Configuración
  (FormPage long-form con TOC sticky 6 secciones). Cada mockup compone
  ClientShell `comfortable` + pattern de fase 3 + voz Aelium aplicada.
- **Fase 4 cerrada (anterior):** 4 shells
  Audit drift D4-1..D4-19 documentado en
  `fase-4-shells/audit-existing.md`. Specs entregadas para AuthShell
  (2 variantes: split-aurora / centered-status), ClientShell
  (densidad comfortable), AdminShell (densidad compact),
  PartnerShell (densidad standard, NUEVO — separación del
  ClientShell). DD-032 cierra DD-016 con la materialización de
  densidad por portal vía `data-density="comfortable|standard|compact"`
  + topbar variantes (cliente / partner / admin). Eyebrow del portal
  diferencial (`--text-tertiary` cliente · `--info` partner · `--brand`
  admin). Brand wins — el azul Aelium es el mismo para los 3. CSS
  materializado en `mockup/styles.css` sección "FASE 4 · SHELLS".
  Mockups con shell montado y voz Aelium en cada copy. DD-029 (Topbar
  variants) + DD-030 (sidebar logo rombo SVG real, sin accent-stripe en
  brand card · permitido en active items) reafirmadas.

---

## Objetivo macro

Producir un sistema de diseño coherente y un set completo de mockups para el
Aelium Dashboard, alineado con el código existente, la marca (`#3B82F6` +
DM Sans), los 4 roles (cliente, agente, admin, partner) y las restricciones
técnicas del stack.

Resultado esperado: profesional, robusto, **moderno y diferenciador** sin
romper la filosofía de minimalismo funcional (D1–D11 de
`docs/DESIGN_SYSTEM.md`).

---

## Principios rectores

1. **Minimalismo funcional**: jerarquía clara, sin decoración gratuita.
2. **Densidad por rol**: cliente respira, admin/agente productivo, partner medio.
3. **Tokens primero**: cero hex hardcoded, todo amarrado a variables CSS.
4. **Estados completos**: cada componente con default/hover/focus/active/
   disabled/loading/error/empty.
5. **Motion silenciosa, sistemática**: choreography a nivel de design system,
   no decoración por componente.
6. **Firma visual selectiva (DD-030)**: extender el lenguaje de
   `GradientMesh` al producto sutilmente. El **rombo es elemento
   precioso** — se usa solo en momentos funcionales o ilustrativos
   (logo, loader, timeline markers, empty page illustration, health
   indicator). NO como decoración rutinaria en eyebrows, tags, headers.
   El eyebrow es **tipográfico Aelium** (brand color + uppercase +
   letter-spacing); no necesita marker. Recuadros (cards/modales) sin
   accent-stripe lateral — esa firma se reserva a navegación funcional
   (sidebar, tabs vertical).
7. **Coherencia con los canónicos**: respetar `DESIGN_SYSTEM.md` y `UI_SPEC.md`
   mientras no se promocionen cambios.
8. **Implementabilidad**: nada que no se pueda construir con Next.js 16 +
   CSS Modules + Tailwind 4 + Framer Motion, sin librerías UI externas.
9. **Variante por contexto + identidad Aelium en cada variante (DD-029)**:
   donde haya 2+ casos de uso reales, se diseñan las variantes desde el
   inicio. Cada variante mantiene firma de marca — más variantes ≠ más
   genérico.

---

## Fases

| # | Fase | Estado | Entregable principal |
|---|------|--------|----------------------|
| 0 | Brief y confirmación | Cerrada | `BRIEF.md` aprobado |
| 1 | Foundations / Design tokens | **Cerrada** | `tokens.css` + `tokens.md` + `preview.html` + `audit.md` + `NOTES.md` aprobados |
| 2.A | Componentes base · formularios | Cerrada · firma visual aplicada | Button, Input, Select, Textarea, SearchInput, Dropdown · sample-form · firma-visual |
| 2.B | Componentes base · feedback | Cerrada | Badge, StatusDot, Toast, AlertBanner, Tooltip, HelpTip, Skeleton |
| 2.C | Componentes base · data | Cerrada · iteración StatsCard DD-024 | Table, Pagination, StatsCard, BulkActionBar, FilterBar · sample admin-clientes |
| 2.D | Componentes base · navegación | **Cerrada con iteraciones DD-025/026/027/028** | Tabs (5 variantes), Breadcrumb, CommandPalette, NotificationBell, PortalBadge · sample admin-cliente-detalle |
| 2.E | Componentes base · contenedores | Cerrada | Card 5v · Modal 5v · Avatar refactor paleta + with-status + group · EmptyState 4v · sample cliente-overview |
| 2.F | Refresh de variantes en componentes ya entregados | Cerrada | Pagination +3v · Dropdown +2v · Badge +2v · Input +3v |
| 3 | Patrones de página | Cerrada | ListPage 4v · DetailPage 3v · FormPage 3v |
| 4 | Layout shells | Cerrada | AuthShell 2v · ClientShell · AdminShell · PartnerShell + densidad por portal (DD-032) |
| 5 | Mockups cliente | **Listo · revisión humana** | Inicio · Tus servicios · Detalle servicio · Tus facturas · Detalle factura · Transparencia · Configuración |
| 6 | Mockups agente | Pendiente | clients, support, tasks, billing |
| 7 | Mockups admin | Pendiente | overview, products, support-inside-plans, jobs, error-log, templates |
| 8 | Mockups partner | Pendiente | referidos, comisiones, comunicación |
| 9 | Auth flow | Pendiente | login (2FA), register, verify-email, forgot, reset |
| 10 | Estados especiales | Pendiente | Empty states, 404/500, skeletons sistemáticos, modales críticos |
| 11 | Dark mode (opcional) | Pendiente | Tokens dark + ajustes |

Las fases se cierran en orden. No iniciar la siguiente sin cerrar la anterior
(salvo decisión explícita del usuario registrada en `DECISIONS.md`).

---

## Decisiones acumuladas (resumen)

> Ver `DECISIONS.md` para detalle y justificación. DD-001 a DD-018 cerradas.

- **Brand:** `#3B82F6` curado a 5 puntos (`--brand`, `-hover`, `-active`,
  `-light`, `-subtle`). No escala 50–950 (DD-013).
- **Tipografía:** DM Sans 400/500/600. El 600 reservado a números grandes
  (StatsCard), display headings y énfasis fuerte.
- **Spacing:** escala 4px (estado actual de `globals.css`).
- **Semánticos:** success/warning/danger/info **+ pending** (púrpura, ya
  usado por StatusDot). Cada uno con `-light`, `-border`, `-strong`.
- **Gray:** queda como neutral, no se duplica como semántico.
- **Dark mode:** arquitectura semántica preparada en fase 1 (nombres
  desacoplados del literal "blanco"). Valores light en fase 1; valores
  dark en fase 11.
- **Motion:** durations + easings definidos en fase 1, choreography
  sistemática añadida en fase 4 cuando aplican a layouts.
- **Iconografía:** tokens base (`--icon-size-*`, `--icon-stroke-width`) en
  fase 1; íconos concretos en fase 2.
- **Firma visual:** mecanismos entregados en fase 1 (accent indirecto,
  mesh opacity, densidad raw+resuelta, focus ring doble, tabular nums,
  motion choreography). **Override por portal diferido a fase 4** (DD-014).
  `--accent-warm` eliminado (DD-015).
- **Densidad:** mecanismo entregado (vars resueltas + `[data-density]`).
  **Asignación por portal diferida a fase 4** (DD-016).
- **Motion split:** `--transition-*` para CSS simple, `--motion-*` para
  Framer Motion choreography (DD-017).
- **Referentes ampliados:** Linear, Stripe, Vercel, Raycast, Attio, Arc,
  Height, Pylon, Cron/Notion Calendar.
- **DD-029 · variante por contexto + identidad Aelium**: cuando hay 2+
  casos de uso reales, las variantes se diseñan desde el inicio. Más
  variantes ≠ más genérico — cada variante mantiene firma de marca.
- **DD-030 · rombo selectivo + recuadros sin accent-stripe**: rombo
  reservado a momentos funcionales (logo, loader, timeline markers,
  empty page, health, skeleton-rombo, .aelium-dot). Border-left brand
  reservado a navegación (sidebar, tabs vertical, applied-filters).
  Cards/modales/headers sin accent-stripe.
- **DD-031 · patterns con variantes nativas y wrappers responsables**:
  ListPage 4v · DetailPage 3v · FormPage 3v. Wrappers renderizan
  Breadcrumb/PageHeader e imponen ancho único + ritmo vertical. Las
  páginas nunca improvisan layout.
- **DD-032 · densidad por portal materializada + topbar variantes
  (cierre DD-016)**: cliente `comfortable`, partner `standard`, admin
  `compact`. `data-density` en root del shell resuelve vars CSS
  escalonadas (`--shell-pad-y`, sidebar-width, topbar-height,
  nav-item-pad-y). Topbar variants cliente / partner / admin
  diferencian search palette + SupportButton. Eyebrow del portal
  diferencia visualmente sin trocear la marca. Sidebar logo = rombo
  Aelium SVG real, no "A" cuadrada. PartnerShell separado del
  ClientShell (Sprint 19).

---

## Cómo trabajar con este plan

1. Cualquier sesión nueva empieza leyendo este archivo + `DECISIONS.md` +
   la última fase cerrada (ver `SESSION_RULES.md` Regla 2).
2. **Modo diseño:** solo escribir en `docs/design/`. NO tocar `frontend/app/`,
   `backend/`, ni los canónicos `DESIGN_SYSTEM.md` / `UI_SPEC.md`.
3. **Modo implementación:** aplicar fase aprobada al código real. PR
   separado, rama distinta, entrada en `implementation-log/`.
4. Cierre de cada fase: `NOTES.md` con deudas + entrada en `DECISIONS.md` +
   actualización de este `PLAN.md`.

---

## Referencias internas

| Archivo | Uso |
|---------|-----|
| `BRIEF.md` | Producto, audiencia, restricciones técnicas (input fase 0) |
| `DECISIONS.md` | Log de decisiones cerradas |
| `REFERENCES.md` | Referentes visuales y de patrón |
| `SESSION_RULES.md` | Protocolo operativo de sesión |
| `mockup/` | **Maqueta viva** del dashboard. Crece con cada fase. |
| `fase-N-*/` | Specs, audits, NOTES por fase. Append-only. |
| `../DESIGN_SYSTEM.md` | Sistema canónico actual (fuente de verdad) |
| `../UI_SPEC.md` | Anatomía canónica de páginas (fuente de verdad) |
| `../../frontend/app/globals.css` | Tokens en código (estado actual) |
| `../../frontend/app/components/` | 35 componentes ya codeados |
