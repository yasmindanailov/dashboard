# docs/ — Índice maestro (entry point del agente)

> **Si solo lees UN documento al empezar, lee este.** Te dice qué existe, dónde vive y en qué orden leerlo.
> **Estado:** pre-producción · Sprint **15D** (ResellerClub + comercio de dominios) **EN CURSO**.
> **Auditoría de conformidad vigente:** [`90-meta/audit-2026-06-25.md`](90-meta/audit-2026-06-25.md) (gap go-live módulo-por-módulo; sustituye a `audit-2026-06-21`).

## 🚀 Arranque rápido (lee en este orden)

1. **Este índice** — mapa global.
2. [`90-meta/audit-2026-06-25.md`](90-meta/audit-2026-06-25.md) — estado real **medido** del código hoy (no lo que dice la doc).
3. [`60-roadmap/current.md`](60-roadmap/current.md) — qué se está construyendo **ahora**.
4. [`90-meta/SESSION_RULES.md`](90-meta/SESSION_RULES.md) — reglas operativas de sesión.
5. [`00-foundations/rules.md`](00-foundations/rules.md) — reglas canónicas **R1–R16 / D1–D11** (inviolables).
6. [`90-meta/development-playbook.md`](90-meta/development-playbook.md) — proceso de trabajo. **Si solo lees uno de proceso, este.**

## 🗺️ Mapa de la documentación

Cada zona está etiquetada: **LIVE** (fuente de verdad activa) · **REFERENCE** (referencia transversal) · **FUTURE** (no construido) · **ARCHIVE** (histórico, no vigente).

| Carpeta | Tipo | Qué contiene |
|---------|------|--------------|
| [`00-foundations/`](00-foundations/) | LIVE | Reglas canónicas (R/D) + glosario. Lo no-negociable. |
| [`10-decisions/`](10-decisions/) | LIVE | ADRs individuales (registro de decisiones). Índice en [`10-decisions/README.md`](10-decisions/README.md) — **fuente única del conteo de ADRs** (no hardcodear el número en otros docs). |
| [`20-modules/`](20-modules/) | LIVE | Contratos por módulo + [`_matrix.md`](20-modules/_matrix.md) (integración inter-módulo) + [`_events.md`](20-modules/_events.md) (catálogo de eventos). |
| [`30-data/`](30-data/) | LIVE | Schema por dominio. Dominios aún no construidos viven aquí por disciplina expand-contract. |
| [`40-reference/`](40-reference/) | REFERENCE | ARCHITECTURE · DESIGN_SYSTEM · UI_SPEC · documento-de-marca. |
| [`50-operations/`](50-operations/) | LIVE | Settings, plantillas email, jobs, errores API, seed, entorno E2E. |
| [`60-roadmap/`](60-roadmap/) | LIVE | [`current.md`](60-roadmap/current.md) (sprint activo) · [`backlog.md`](60-roadmap/backlog.md) · [`completed/`](60-roadmap/completed/) (archivo de sprints cerrados). |
| [`70-future/`](70-future/) | FUTURE | Diseño de módulos v2 (Partner, AI Workers) — no implementados. |
| [`90-meta/`](90-meta/) | LIVE | Playbook, reading-order, SESSION_RULES, DoD, plantilla de sprint, convenciones, CI, auditoría vigente. |
| [`features/`](features/) | LIVE | Guías operativas admin/cliente/agente por módulo. |
| [`99-archive/`](99-archive/) | ARCHIVE | Legacy migrado (DECISIONS, DATABASE_SCHEMA, ROADMAP) + auditorías previas + onboarding. **No desarrollar contra esto.** |
| [`_research/`](_research/) | REFERENCE | Specs empíricos de proveedor, referenciados por línea exacta desde ADRs/mocks. **No mover.** |

## 📐 Convenciones del mapa

- **Conteos viven en su índice**, no hardcodeados: nº de ADRs → `10-decisions/README.md`; sprints cerrados → `60-roadmap/completed/`. Evita el drift "60 vs 84".
- **Nada histórico se borra**: se reubica a `99-archive/` con puntero. Las citas legacy (`DECISIONS.md §N`, `ROADMAP.md Sprint N`) siguen resolviendo ahí.
- **v1 vs v2**: v1 = cerrar a calidad de lanzamiento los módulos existentes (ampliar features + hardening + UI/UX). v2 = módulos nuevos (ver `70-future/`).
