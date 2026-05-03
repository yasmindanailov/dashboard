# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26 + closures Sprint 8 / 9 / 9.5 / 9.6 / 11.5 (2026-04-26 → 2026-05-01) + Sprint 11 Fases A+B (2026-05-01/02). Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)). Los sprints ✅ que aparecen abajo son punteros a `completed/`; viven aquí solo para trazabilidad cronológica de la ola P1.1.

> **Última actualización:** 2026-05-03 — **Sprint 16 + Sprint 13.5 cerrados al 100%**. Sprint 13.5 (Hardening + Saneamiento de Deuda Continua) cerró 8 DCs en una sesión densa (DC.32/33/34 + DC.14/37/38 + DC.8/11/15 parciales) y difirió DC.13 + DC.27 a sub-sprint propio **Sprint 13.5.5 — CI Infra** (en curso, rama `sprint13-5-5-ci-infra`). Cobertura final: **183/183 unit + 118/118 E2E verde** sin regresión. Detalle Sprint 16 en [`completed/sprint-16-tasks-notes-refactor.md`](./completed/sprint-16-tasks-notes-refactor.md). Detalle Sprint 13.5 en [`completed/sprint-13-5-hardening-deuda-continua.md`](./completed/sprint-13-5-hardening-deuda-continua.md).
> **Cambios estructurales recientes:**
> - 📜 **[ADR-069 (2026-04-29)](../10-decisions/adr-069-estrategia-deploy-diferido.md)** reclasifica **Sprint 14 Deploy real** como **gate condicionado P-DEPLOY** (no está en cola activa). Se activa sólo con trigger de negocio explícito (cliente real, demo, captación, validación externa). La cola activa post-cierre Sprint 8 son features (Sprint 11 Provisioning como cabeza, Sprint 10 Infrastructure independiente, sub-sprint billing prorrateo cross-plan ADR-077 propuesto, Sprint 12 Settings+KB, Sprint 13 Hardening) según valor funcional.
> - **Sprint 11 Fases 11.A + 11.B mergeadas en master 2026-05-02** — ADR-077 (contrato canónico `ProvisionerPlugin` v2 congelado) + orquestador + cola BullMQ `provisioning-dispatch` + cache Redis dedicado (DB 2) + plugin registry. **183/183 unit verde** (157 base Sprint 8 + 26 nuevos). Plugins concretos pendientes (Fase 11.C). Plan canónico abajo.
> - **Sprint 8 (Tasks + Support Inside) cerrado 2026-05-01** — 5 ADRs nacieron en el sprint (072..076), 157/157 unit + 117/117 E2E verde, 5 migraciones. Detalle en [`completed/sprint-8-tasks-support-inside.md`](./completed/sprint-8-tasks-support-inside.md).
> - **Sprint 11.5 (MinIO Storage)** añadido como sprint independiente — antes estaba dentro del Sprint 14 Deploy. Desbloquea adjuntos chat/tickets sin obligar a desplegar a producción.
> - **Sprint 14 (Deploy)** limpiado — solo lo que realmente requiere producción real. **Hoy gate condicionado bajo ADR-069.**
> - **Sprint 15 (Plugins)** partido en sub-sprints 15A-15H independientes — cada plugin se aborda según necesidad real, no en cadena.

---

## 🔄 Sprint 7 — Billing Hardening + Support

**Estado:** ~95% completo, **bloqueado por dependencias externas** para los pasos restantes.
**Inicio:** Sprint 6 (continuación). **Cierre formal estimado:** cuando se desbloqueen Sprints 14, 15, 8.

### ✅ Lo cerrado (verificado contra código)

- **Billing hardening (5 pasos):** admin checkout selector, validar `targetUserId`, perfil de facturación contra cliente destino, IVA recálculo en edición, descuento anual aplicado.
- **Support core (8 pasos):** SupportService completo, WebSocket gateway con auth dual JWT+guest, chat tiempo real, arquitectura dual chat+ticket, escalación, panel agente 3 columnas, bandeja tickets, detalle conversación, plantillas de email, admin.md.
- **Support hardening (25 pasos H1-H25):** dedup WS+REST, escalación única, cleanup typing, post-escalación redirige al ticket, página `[id]` diferenciada, sorting waiting_agent, indicador asignación, unread separado por type, stats filtrados, sync notas, nota obligatoria al reabrir, coherencia acciones panel, sidebar contexto cliente, etc.
- **Chat anónimo (8 pasos):** guest token, endpoint guest, rate limit 3/h, gateway auth fallback, widget guest mode, vinculación por email, vinculación manual, cleanup cron 30d.
- **Refactorización R15 (9 pasos R15.1-R15.9):** chats/page (907→77), ChatWidget (671→155), support/page (557→102), support/[id] (733→88), checkout (570→233), layout (394→79), clients/[id] (683→243), products (323→282), products/new (347→296). **Backend support refactor:** support.service (1054→90 fachada + 4 sub-servicios), gateway (526→232).

### ⏳ Lo pendiente (todo bloqueado)

| Paso | Bloqueado por | Cuándo se desbloquea |
|------|---------------|----------------------|
| 7.6.1-3 Horario soporte | Nada — se puede hacer ya | Decisión de priorizar |
| 7.7 Adjuntos archivos | **Sprint 14 — MinIO** | Tras Sprint 14 |
| 7.6.1-4 Ticket UX (rich text + email-style + adjuntos + subject editable) | **Sprint 7.5 Fase 2 + Sprint 14 MinIO** | Cuando ambos cierren |
| 7.8/7.9 IA filtro + copilot | **Sprint 15 Plugins (Claude AI)** | Tras Sprint 15 |
| 7.SI.1/2 Support Inside (badge, página cliente) | **Sprint 8 Fase D** | Tras cierre Sprint 8 |

**Acción recomendada:** **NO cerrar Sprint 7 formalmente** todavía. Cuando todos los bloqueos se resuelvan en sus respectivos sprints, se cierra de una vez.

---

## 🔄 Sprint 7.5 — Design System Foundation

**Estado:** Fase 1 ✅ cerrada. Fase 2 parcial.

### ✅ Fase 1 — Tokens y componentes base (D1–D10f, D11)

Verificada completa contra código en `frontend/components/ui/`:

- D1 Tokens CSS, D2 Button, D3 Input/Select/SearchInput/Textarea, D4 Badge/StatusDot, D5 Card, D6 Modal, D7 Table, D8 Toast, D9 EmptyState/Skeleton, D10 Avatar/Tooltip/Dropdown, D10b Pagination/StatsCard/AlertBanner, D10c UI_SPEC.md, D10d StatusTabs, D10e Breadcrumb, D10f Tabs.
- D11 Dashboard shell migrado (Sidebar, Topbar, Layout) — CSS modules, eliminados inline styles.

### ⏳ Fase 2 — Migración de páginas existentes (parcial)

Algunas páginas migradas en Sprint 7 R15 (chats, support, checkout, layout, clients, products). Otras pendientes — el playbook no enumera el % exacto. Acción: **cuando se aborde una página por trabajo de feature, migrarla al DS en el mismo PR** (oportunismo) en lugar de un sprint dedicado de migración masiva.

---

## ✅ Sprint 8 — Tasks + Support Inside (cerrado 2026-05-01)

> Sprint cerrado al 100%. Movido a [`completed/sprint-8-tasks-support-inside.md`](./completed/sprint-8-tasks-support-inside.md) con retrospectiva completa, métricas, ADRs nacidos (072..076) y lecciones aprendidas. Cobertura final: 157/157 unit + 117/117 E2E verde, 5 migraciones aplicadas.

> Las páginas operativas del módulo viven en:
> - [`docs/features/tasks/admin.md`](../features/tasks/admin.md) — operativa diaria del módulo Tasks
> - [`docs/features/tasks/agent.md`](../features/tasks/agent.md) — guía del agente
> - [`docs/features/support-inside/admin.md`](../features/support-inside/admin.md) — operativa Support Inside (staff)
> - [`docs/features/support-inside/client.md`](../features/support-inside/client.md) — guía cliente Support Inside

---

## ✅ Sprint 9 — Audit + Notifications Full + BullMQ + DLQ (P1.1) (cerrado 2026-04-27)

> Sprint cerrado al 100% del alcance MVP. Movido a [`completed/sprint-9-audit-notifications-bullmq.md`](./completed/sprint-9-audit-notifications-bullmq.md) el 2026-05-01 (saneamiento documental post-Sprint 8 cierre). DoD verificado: typecheck + lint + build + 21/21 unit + 30/30 E2E + boot real con 3 colas BullMQ + 8 crons in-process. P1.1 desbloquea Sprint 14 Deploy sin bloqueos críticos.

---

## ✅ Sprint 9.5 — UX admin de notifications + cabos sueltos (P1.1.5) (cerrado 2026-04-27)

> Sprint cerrado en 1 sesión densa. Movido a [`completed/sprint-9-5-ux-admin-notifications.md`](./completed/sprint-9-5-ux-admin-notifications.md) el 2026-05-01.

---

## ✅ Sprint 11.5 — MinIO Storage local (P1.2) (cerrado 2026-04-26)

> Sub-sprint independiente que aisló storage local del Sprint 14 Deploy para desbloquear adjuntos chat/tickets. Movido a [`completed/sprint-11-5-minio-storage.md`](./completed/sprint-11-5-minio-storage.md) el 2026-05-01.

---

## ✅ Sprint 9.6 — Split admin/cliente retroactivo + 3 portales raíz + permisos granulares (P1.1.6 / DC.7) (cerrado 2026-04-28)

> Sprint cerrado en 1 sesión densa, 12 commits encadenados. ADR-066 + ADR-067 + ADR-068 nacieron aquí. Tres portales raíz formalizados (`/admin/*`, `/dashboard/*`, `/partner/*`). Retrospectiva ejecutiva + plan canónico completo en [`completed/sprint-9-6-split-admin-cliente.md`](./completed/sprint-9-6-split-admin-cliente.md).

---

## ✅ Sprint 11 — Provisioning (P2.1) (cerrado 2026-05-02)

> Sprint cerrado al 100%. Movido a [`completed/sprint-11-provisioning.md`](./completed/sprint-11-provisioning.md) con retrospectiva completa, métricas, 2 ADRs nacidos (077 contrato canónico `ProvisionerPlugin` v2 + 078 auth server-side cookies httpOnly) y lecciones aprendidas. Cobertura final: **241/241 unit + 129/129 E2E verde**, 1 migración aplicada, 7 PRs encadenados (#13 ADR-077 → #14 chasis → #15 cierre doc 11.B → #16 11.C plugins triviales → #17 ADR-078 → #18 11.D REST + frontend → #19 sync), 8 endpoints REST nuevos, 1 cola BullMQ nueva (`provisioning-dispatch`), 5 eventos `service.*` nuevos, 4 DCs nuevas registradas en `backlog.md` (DC.27/29/30/31).

> **Documentación canónica del módulo:**
> - [`docs/features/services/admin.md`](../features/services/admin.md) — operativa diaria del módulo Services para staff.
> - [`docs/features/services/client.md`](../features/services/client.md) — guía cliente.
> - [`docs/features/provisioning/admin.md`](../features/provisioning/admin.md) — vista interna del orquestador.
> - [`docs/20-modules/provisioning/contract.md`](../20-modules/provisioning/contract.md) — contrato canónico (12 secciones, marcado ✅ implementado).

---


## ✅ Sprint 13.5 — Hardening + Saneamiento de Deuda Continua (cerrado 2026-05-03)

> Sub-sprint dedicado a cerrar deuda continua acumulada antes de Sprint 15A Plugin Framework. Movido a [`completed/sprint-13-5-hardening-deuda-continua.md`](./completed/sprint-13-5-hardening-deuda-continua.md) con retrospectiva completa, métricas, lecciones aprendidas y plan de Sprint 13.5.5 CI Infra (sub-sprint nacido del aprendizaje). 8 DCs cerradas (DC.32/33/34 + DC.14/37/38 + DC.8/11/15 parciales) + 2 diferidas (DC.13 + DC.27 → Sprint 13.5.5). Cobertura final: **183/183 unit + 118/118 E2E verde** sin regresión.

---

## 🔄 Sprint 13.5.5 — CI Infra (en curso, rama `sprint13-5-5-ci-infra`)

**Estado:** Fase 0 ✅ (plan + rama). Fase A en arranque.
**Objetivo en una frase:** cerrar DC.27 al 100% (imagen oficial Playwright en CI) + DC.13 parcial-canónica vía sharding CI, sin tocar la suite local.

### Decisión arquitectónica clave (registrada como contexto operativo, NO requiere ADR)

El plan original de Sprint 13.5 §4.1 mencionaba "schema Postgres dinámico por worker + BullMQ_PREFIX por worker" como vía para `workers=4 + fullyParallel=true` local. Tras inspeccionar los 25 specs E2E reales, esa vía **no es viable sin reescribir `webServer` para arrancar un backend NestJS por worker** (puertos 3001/3011/3021/3031 + 4× memoria + 4× boot), porque:

- 22 de 25 specs hacen login con cuenta seed única `admin@aelium.net` + `clearMailbox()` — un worker borra el mailbox justo cuando otro espera el código 2FA → cascada de fallos.
- 6 specs son intrínsecamente system-wide (`tasks-crons`, `outbox-invoice`, `notifications`, `audit-portal`, `admin-error-log`, `admin-tree-migration`) y disparan crons / leen logs globales → race conditions garantizadas en paralelo.
- `playwright.config.ts:webServer` arranca **un solo backend NestJS** antes de los workers; `BULLMQ_PREFIX` y `DATABASE_URL?schema=...` se leen en boot del proceso → no son por-worker sin multi-backend.

**Estrategia adoptada (Opción C — Sharding CI + cuentas seed por-worker como deuda futura):** local mantiene `workers: 1 + fullyParallel: false` (estable). CI parte la suite con `--shard=N/M` en jobs paralelos; cada shard arranca sus propios services efímeros (postgres / redis / mailpit / minio) y su propio backend+frontend. Wall-clock CI esperado: 25 min → ~10 min. DC.13 cierra **parcial-canónica** (CI sí, local no). DC.27 cierra **100%** (imagen oficial Playwright en cada shard).

**Por qué no la Opción B (backend per-worker local):** beneficio marginal (~30-40s/run local) vs coste alto (4× memoria, riesgo de tumbar runner GHA si se aplica también ahí, complejidad webServer dinámica). El cuello real está en CI, no en local. Si en el futuro la suite local crece y el cuello se mueve, sub-sprint dedicado.

### Fases atómicas

| Fase | Salida | Riesgo |
|------|--------|--------|
| **Fase 0** ✅ Plan canónico + rama `sprint13-5-5-ci-infra` desde master | Esta sección + rama nueva | Cero (doc-only) |
| **Fase A** Migrar job E2E del CI a `container: image: mcr.microsoft.com/playwright:v1.59.0-noble` (cierra DC.27): service names en lugar de `localhost`, MinIO como service container `bitnami/minio` (no `docker run` desde step), eliminar cache/install browsers (la imagen ya los trae) | Job E2E corriendo en imagen oficial con Chromium pre-instalado | Medio — requiere verificación CI iterativa, MinIO networking puede fallar |
| **Fase B** Sharding CI con `--shard=${N}/${M}` (cierra DC.13 parcial-canónica): matrix `shard: [1, 2, 3]` × `total: 3` en el job E2E. Cada shard ejecuta `~33%` de specs en paralelo. Job único de "merge reports" al final agrega los HTML reports | CI wall-clock 25min → ~10min | Bajo — Playwright `--shard` es funcionalidad estándar madura |
| **Fase C** Cierre documental: backlog DC.13 ✅ parcial / DC.27 ✅, retrospectiva `completed/sprint-13-5-5-ci-infra.md`, mover a `completed/`, actualizar `e2e-environment.md §4.2` | Doc canónica sincronizada con código | Cero |

### DoD Sprint 13.5.5

- [ ] Job E2E corre en imagen oficial Playwright sin steps de cache/install browsers.
- [ ] MinIO arranca como service container declarado en `services:` (no como step `docker run`).
- [ ] CI E2E split en 3 shards paralelos con `--shard=N/M`.
- [ ] Wall-clock CI E2E ≤ 12 min (vs 25 min baseline).
- [ ] Suite local sigue 118/118 verde con `workers: 1` (sin regresión).
- [ ] `backlog.md` actualizado: DC.13 → "✅ parcial-canónica (Sprint 13.5.5: sharding CI)" con nota de paralelización local diferida; DC.27 → "✅ Sprint 13.5.5".
- [ ] `e2e-environment.md §4.2` reescrita reflejando sharding CI.
- [ ] Retrospectiva en `completed/sprint-13-5-5-ci-infra.md` con métricas + decisión arquitectónica + lecciones.

### Deuda DIFERIDA explícitamente

**Paralelización local con `workers > 1`** queda diferida a sub-sprint futuro condicionado por trigger: si el ratio "specs nuevos por sprint" hace crecer la suite local más allá de 2 min, abrir sub-sprint dedicado **Sprint 13.5.6 — E2E parallel local** que aborde la opción canónica de backend por-worker.

---

## ✅ Sprint 16 — Tasks refactor + Notes consolidation (P2.1.5) (cerrado 2026-05-02)

> Sprint cerrado al 100%. Movido a [`completed/sprint-16-tasks-notes-refactor.md`](./completed/sprint-16-tasks-notes-refactor.md) con retrospectiva completa, métricas, ADR nacido (ADR-079 + Amendments A1/A2/A3) y lecciones aprendidas. Cobertura final: **183/183 unit + 118/118 E2E verde**, 1 migración aplicada (`sprint16_tasks_notes_refactor`), 4 PRs encadenados (#21 ADR-079 → #22 backend → #23 sync → #24 frontend + amendments + cierre documental).

> **Documentación canónica del módulo:**
> - [`docs/20-modules/tasks/contract.md`](../20-modules/tasks/contract.md) — Contract canónico tasks (post-ADR-079).
> - [`docs/30-data/tasks.md`](../30-data/tasks.md) — Schema canónico tasks.
> - [`docs/30-data/clients.md`](../30-data/clients.md) — Schema canónico `client_notes` (consolidación con source tracking).
> - [`docs/features/tasks/admin.md`](../features/tasks/admin.md) — Operativa admin.
> - [`docs/features/tasks/agent.md`](../features/tasks/agent.md) — Guía agente.
> - [`docs/features/notes/admin.md`](../features/notes/admin.md) — Operativa notas consolidadas (nuevo).
> - [`docs/features/support/lifecycle.md`](../features/support/lifecycle.md) — Lifecycle ticket vs chat (Amendments A1+A3, nuevo).

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
