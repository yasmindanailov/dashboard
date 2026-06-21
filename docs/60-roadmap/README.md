# Roadmap — Aelium Dashboard

> **Plan de ejecución vivo del proyecto.** Refactorizado en F6 desde el monolítico `docs/ROADMAP.md` (~1.000 líneas, 26 sprints + sub-sprints) sobre la base de la auditoría 2026-04-26 código vs documentación.

> **Última actualización:** 2026-04-26 — F6 cierre (**snapshot histórico**). ⚠️ El estado VIVO de sprints vive en [`current.md`](./current.md) + [`completed/`](./completed/) + la [auditoría 2026-06-21](../90-meta/audit-2026-06-21.md). El snapshot de más abajo refleja abril 2026 (F6) y **no se mantiene actualizado** — no lo uses como estado actual.

---

## ¿Por qué existe esta carpeta?

`docs/ROADMAP.md` (legacy) era monolítico:

- Difícil distinguir **qué está cerrado, qué está en curso, qué viene** sin leer las 1.000 líneas.
- Sprints completados con su ✅ se mezclaban con sprints planificados ⬜ — el lector tenía que filtrar mentalmente.
- Drift de declaración: el header de Sprint 7 decía `⬜` aunque ~95% de sus pasos estuvieran ✅ — auditoría descubrió la inconsistencia.
- Una sola lista cronológica no permite ver claramente la **priorización** ni los bloqueos.

F6 lo parte en 4 vistas con propósito distinto:

| Documento | Para qué sirve | Cuándo consultarlo |
|-----------|----------------|--------------------|
| [`current.md`](./current.md) | **Sprints en curso o próximos** + estado real verificado + bloqueos | Día a día. ¿Qué estoy tocando ahora? |
| [`backlog.md`](./backlog.md) | **Lista priorizada P0/P1/P2/P3** alimentada por la auditoría | Al planificar siguiente sprint. ¿Qué viene? |
| [`completed/`](./completed/) | **Archive de sprints cerrados** con resumen ejecutivo, commit, fecha | Investigación histórica. ¿Cuándo se hizo X? |
| [`_sprint-template.md`](./_sprint-template.md) | **Plantilla activa** para arrancar sprint nuevo | Al iniciar sprint nuevo. Copiar y rellenar. |

---

## Estado actual del proyecto (snapshot 2026-04-26)

### Sprints cerrados ✅

8 sprints completos, archivados en [`completed/`](./completed/):

| Sprint | Título | Commit |
|--------|--------|--------|
| [0](./completed/sprint-0-scaffolding.md) | Scaffolding | `53704d3` |
| [1](./completed/sprint-1-auth.md) | Auth | `13c5f15` |
| [2](./completed/sprint-2-notifications-core.md) | Notifications Core | `ba688c6` |
| [3](./completed/sprint-3-auth-frontend-polish.md) | Auth Frontend Polish | `59f5a21` |
| [3.5](./completed/sprint-3.5-auth-hardening.md) | Auth Hardening | — |
| [4](./completed/sprint-4-clients.md) | Clients | — |
| [5](./completed/sprint-5-products.md) | Products + PBAC | — |
| [6](./completed/sprint-6-billing-engine.md) | Billing Engine | — |

### Sprints en curso 🔄

3 sprints con trabajo parcial (estado real verificado):

| Sprint | Título | Estado real | Detalle |
|--------|--------|-------------|---------|
| 7 | Billing Hardening + Support | 🔄 ~95% | Core + hardening + R15 ✅. Pendientes bloqueados por dependencias (MinIO, Sprint 15, Sprint 8). |
| 7.5 | Design System Foundation | 🔄 50% | Fase 1 (componentes base) ✅. Fase 2 (migración páginas existentes) parcial. |
| 8 | Tasks + Support Inside | 🔄 30% | Fase A 50% (8.1 ✅; 8.1b/c/d/14 ⬜); Fases B-E pendientes. |

Detalle completo en [`current.md`](./current.md).

### Backlog priorizado (output auditoría + refactor 2026-04-26)

| Prioridad | Sprints | Bloquean |
|-----------|---------|----------|
| **P0** — Crítico pre-producción | Cerrar Sprint 8 (listener `task.assigned` + validación FK + tests E2E), Outbox `invoice.*`, F0.6 saneamiento lint | Despliegue real |
| **P1** — Importante | Sprint 9 Audit + Notifications Full, **Sprint 11.5 MinIO standalone (NUEVO)**, Sprint 7.5 Fase 2, Sprint 14 Deploy real | Fase 1 cerrada |
| **P2** — Funcional core | Sprints 10, 11, 12, 12.5, 13 | Producción profesional |
| **P3** — Plugins + Crecimiento | **Sprints 15A-15H (cada plugin independiente)**, Sprint 18, 22, 21, 23, 24, 25, 17, 20, 19, 16 | Negocio |

**Cambios estructurales 2026-04-26:**
- **MinIO** separado de Sprint 14 (Deploy) → Sprint 11.5 standalone, desbloquea adjuntos sin obligar a desplegar.
- **Sprint 15 (Plugins)** partido en 15A (framework) + 15B (Stripe) + 15C-15H (cada plugin uno) — abordados según necesidad real, no en cadena. Coherente con [ADR-009](../10-decisions/adr-009-estrategia-plugins.md) y [ADR-021](../10-decisions/adr-021-provisioners.md).
- **Support Inside** refinado por [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) — UX dedicada (no en catálogo público), schema sin cambios.

Detalle completo en [`backlog.md`](./backlog.md).

---

## Convenciones

### Estados de sprint

| Símbolo | Significado |
|---------|-------------|
| `⬜` | Planificado, sin empezar |
| `🔄` | En curso (algo iniciado, no cerrado) |
| `✅` | Cerrado (verificado contra código) |
| `⛔` | Bloqueado (dependencia no cumplida) |
| `🛑` | Cancelado (ya no aplica) |

**Importante:** un sprint con header `⬜` que tenga pasos `✅` es **drift**. La auditoría 2026-04-26 limpió varios casos. Hay que mantener coherencia: el header debe reflejar la realidad del bulk de los pasos.

### Cuándo se "cierra" un sprint

Definition of Done formalizado en [`docs/90-meta/definition-of-done.md`](../90-meta/definition-of-done.md). Resumen:

- [ ] **Código:** typecheck, build, tests, lint pasan localmente.
- [ ] **CI verde** tras último push.
- [ ] **Documentación**: `contract.md`, `admin.md`, eventos en `_events.md` actualizados con lo nuevo.
- [ ] **Schema docs**: `docs/30-data/<dominio>.md` actualizados con tablas/campos nuevos.
- [ ] **Smoke test manual** de los flujos críticos en navegador.
- [ ] **Commits** con Conventional Commits.
- [ ] **Sprint movido** a `completed/sprint-N-titulo.md` con resumen.

### Naming de archivos en `completed/`

```
sprint-N-titulo-corto-kebab-case.md
```

Ej: `sprint-6-billing-engine.md`, `sprint-7.5-design-system-foundation.md`. El número permite orden alfabético cronológico.

### Cuándo crear sprint nuevo

1. Copiar [`_sprint-template.md`](./_sprint-template.md) → `current.md` (sección nueva) si encaja como continuación, o como nueva entrada planeada.
2. Rellenar las 10 secciones de la plantilla **antes** de empezar a codificar (objetivo, depende de, produce, modifica, pasos atómicos, edge cases, DoD, riesgos, decisiones a registrar).
3. Si introduce decisión arquitectónica → ADR antes de codificar.
4. Si introduce módulo nuevo → `contract.md` antes de codificar.

---

## Cómo se relaciona con el resto

| Si quieres saber... | Ve a... |
|---------------------|---------|
| **Plan general por fases** | [`current.md`](./current.md) (en curso) + [`backlog.md`](./backlog.md) (qué viene) |
| **Detalle granular por paso** | `docs/ROADMAP.md` (legacy — se conserva por compatibilidad de referencias) |
| **Por qué se decidió X arquitectónicamente** | `docs/10-decisions/adr-NNN-*.md` |
| **Qué hace cada módulo hoy** | `docs/20-modules/<modulo>/contract.md` |
| **Qué settings/plantillas/jobs/errores existen** | `docs/50-operations/` |
| **Estado real vs declarado del proyecto** | [`docs/90-meta/audit-2026-06-21.md`](../90-meta/audit-2026-06-21.md) |
| **Cómo trabajo con Claude profesionalmente** | [`docs/90-meta/development-playbook.md`](../90-meta/development-playbook.md) |

---

## Documentos relacionados

- [`docs/ROADMAP.md`](../99-archive/ROADMAP.md) — **Legacy.** Se conserva con headers actualizados (Sprint 7/7.5/8) por compatibilidad con referencias de commits y ADRs antiguos. **No es la fuente de verdad** — esta carpeta sí.
- [`docs/90-meta/audit-2026-06-21.md`](../90-meta/audit-2026-06-21.md) — Auditoría que alimenta este roadmap.
- [`docs/90-meta/development-playbook.md`](../90-meta/development-playbook.md) — Cómo trabajar profesionalmente.
- [`docs/90-meta/definition-of-done.md`](../90-meta/definition-of-done.md) — Cuándo se cierra un sprint.
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — R1–R16 + D1–D11.
