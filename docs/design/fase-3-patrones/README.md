# Fase 3 — Patrones de página

> Estado: **en curso**
> Modo: **diseño**
> Objetivo: definir los **layouts wrappers** que enmarcan cada página del
> dashboard. Coherencia absoluta de ancho, ritmo vertical, anatomía y
> firma Aelium en los tres patrones que sostienen el 95% del producto.

---

## Naturaleza de esta fase

Fase 1 definió tokens. Fase 2 definió componentes. Fase 3 los compone:
patterns que **enmarcan páginas enteras** y aseguran que ListPage,
DetailPage y FormPage se comporten igual en cliente, agente, admin y
partner. Sin patterns las páginas reinventan estructura — con patterns
hay un único molde y las páginas solo aportan contenido.

Heredamos:
- DD-021 (marca manda).
- DD-022 (voz Aelium en copy operativo).
- DD-023 (firma visual selectiva).
- DD-027 (Timeline pattern).
- DD-028 (Tabs · 5 variantes).
- DD-029 (variante por contexto + identidad Aelium en cada variante).
- DD-030 (rombo selectivo + recuadros sin accent-stripe lateral).

## Patrones cubiertos

| Patrón | Spec | Variantes (DD-029) | Pregunta producto |
|---|---|---|---|
| **ListPage** | `ListPage.md` | standard (tabla) · grid (cards) · timeline (eventos) · split (master-detail) | "¿Qué hay? ¿Necesito actuar?" |
| **DetailPage** | `DetailPage.md` | standard · with-aside (metadata + acciones contextuales) · workspace-lite (3 columnas para tickets/casos) | "¿Qué es esto? ¿Qué puedo hacer?" |
| **FormPage** | `FormPage.md` | standard · wizard (multi-paso) · long-form (con TOC interno) | "¿Qué necesito rellenar?" |

Workspace puro (chats) NO entra en esta fase — pattern propio `Workspace`
en fase posterior cuando abordemos chats.

## Decisiones que esta fase debe tomar

1. **Ancho único 1200 / wide 1400** — ya cerrado en UI_SPEC §2.8. No se reabre.
2. **Ritmo vertical** entre bloques. Convergencia a `--space-6` (32px)
   entre header → tabs → filtros → contenido → pagination.
3. **PageHeader integrado en ListPage**, **Breadcrumb integrado en
   DetailPage y FormPage**. Los wrappers son los responsables — la página
   nunca renderiza un breadcrumb suelto.
4. **DetailPage tabs migrados a `<Tabs>` DS** (DD-028). Hoy DetailPage
   tiene tabs internos hardcoded. Drift D3-1.
5. **DetailPage headerCard sin firma decorativa** — se mantiene tarjeta
   limpia (DD-030). La identidad Aelium en DetailPage la dan el avatar
   con dot, el badge, la tipografía. Cero accent-stripe.
6. **Variantes nativas desde el inicio** (DD-029) — cada wrapper expone
   prop `variant` y la materialización CSS está lista para todas.

## Heredamos sin renegociar

- Sistema de tokens (`tokens.css`, `tokens.md`).
- Componentes base de fase 2 (formularios, feedback, data,
  navegación, contenedores, refresh).
- Voz Aelium (DD-022).
- Disciplina de rombo (DD-030).

## Validación

Cada pattern entrega:
- **Anatomía** ASCII + tokens.
- **Variantes** con caso producto real (página existente o planificada).
- **Reglas "cuándo usar / cuándo no"**.
- **Composición** con qué componentes del DS encajan.
- **A11y** (regiones landmark, headings, focus order, skip links).
- **Materialización** en `mockup/patterns/<pattern>.html` con todas las
  variantes apiladas + sample composition real.

## Plan

1. ✅ `audit-existing.md` — drift detectado en `frontend/app/components/ui/{ListPage,DetailPage,FormPage,PageHeader}/`.
2. ✅ CSS de patterns en `mockup/styles.css` (sección "PATTERNS · Fase 3").
3. ✅ Spec de cada pattern (`ListPage.md`, `DetailPage.md`, `FormPage.md`) con variantes nativas.
4. ✅ Mockups: `mockup/patterns/list-page.html`, `detail-page.html`, `form-page.html`.
5. ✅ NOTES.md — deudas para implementación TS/CSS module.
6. ✅ PLAN.md actualizado.
7. ✅ Commit `docs(design): fase 3 — patrones de página (ListPage, DetailPage, FormPage)`.

## Lo que esta fase NO entrega

- Workspace pattern (chats) — fase propia con sus 3 columnas.
- AuthShell / ClientShell / AdminShell / PartnerShell — fase 4.
- Mockups de páginas reales del producto — fases 5-9.
- Estados especiales (404, 500, error pages enteras) — fase 10.
