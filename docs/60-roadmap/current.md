# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26 + closures Sprint 8 / 9 / 9.5 / 9.6 / 11.5 (2026-04-26 → 2026-05-01) + Sprint 11 Fases A+B (2026-05-01/02). Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)). Los sprints ✅ que aparecen abajo son punteros a `completed/`; viven aquí solo para trazabilidad cronológica de la ola P1.1.

> **Última actualización:** 2026-05-03 — **Sprint 16 cerrado al 100%** (Fases 16.A → 16.E mergeadas en master, 4 PRs encadenados #21 → #24). **Sprint 13.5 Hardening + Saneamiento de Deuda Continua arrancado** (rama `sprint13-5-hardening-deuda-continua`, Fase 13.5.A doc-only canónica). Cobertura: **183/183 unit + 118/118 E2E verde**. Detalle Sprint 16 en [`completed/sprint-16-tasks-notes-refactor.md`](./completed/sprint-16-tasks-notes-refactor.md).
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

## 🔄 Sprint 13.5 — Hardening + Saneamiento de Deuda Continua (sub-sprint dedicado)

**Estado:** Fase 13.5.A doc-only en curso. Resto pendiente.
**Inicio:** 2026-05-03 (rama `sprint13-5-hardening-deuda-continua`).
**Cierre estimado:** ~2-3 sesiones (~10-13h efectivas).

> **Doctrina aplicada:** sprint dedicado a cerrar **deuda continua acumulada** (DCs registradas oportunistas que llevan 4 sprints sin cerrarse). El ratio "DCs abiertas vs cerradas" llevaba meses negativo (Sprint 11 abrió 4, Sprint 16 abrió 6 cerrando 2). Sin sprint dedicado, la deuda se vuelve estructural y degrada el ciclo de feedback. Este sprint NO añade features de negocio — pulida estructural antes de saltar a Sprint 15A Plugin Framework.
>
> **Pre-condición:** Sprint 11 + Sprint 16 cerrados al 100% en master. Sin WIP arrastrado. Cero ADR nuevo necesario (todas las DCs son ejecutivas, no doctrinales).

---

### 1. Objetivo en una frase

Cerrar 12 DCs de deuda continua acumulada en 5 fases atómicas (B-F): paralelización E2E + Playwright image (acelera CI), limpieza tasks/notes residual (DC.34/32/33 + drift seed), UX cliente coherente (sidebar admin + WebSocket detalle + chat unificado), backend canónico (R15 restantes + audit auth + endpoint `/me/permissions` + doc E2E env). **Cero feature nueva.** Sprint 13.5 deja el dashboard sin ruido residual antes de Sprint 15A.

---

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué del sprint |
|---|-------------|--------|------------------------|
| 1 | Sprint 11 (Provisioning + 4 DCs nuevas registradas) | ✅ cerrado 2026-05-02 | DC.27 |
| 2 | Sprint 16 (Tasks bridge canónico + 6 DCs nuevas) | ✅ cerrado 2026-05-02 | DC.32/33/34/37/38 + drift seed |
| 3 | Suite E2E 118/118 verde | ✅ | DC.13 (paralelización requiere base verde) |
| 4 | Cero ADR nuevo necesario | ✅ | Todas las DCs son ejecutivas |

---

### 3. Pasos atómicos (sub-fases)

| # | Fase | Contenido | Coste estimado | Salida |
|---|------|-----------|----------------|--------|
| **13.5.A** | **Plan canónico congelado** | Este documento. PR doc-only mergeable inmediato. | 30 min | PR doc-only |
| ~~**13.5.B**~~ | ~~**Performance + Infra del CI**~~ — **diferida tras inspección 2026-05-03**. DC.13 paralelización canónica requiere reescritura completa de `tests/e2e/fixtures/db.ts` + `auth.ts` + cuentas seed por-worker (~3-4h sólidas) con riesgo alto sobre la suite 118/118 verde. DC.27 migrar a `container: image: mcr.microsoft.com/playwright:v1.59.0-noble` requiere cambios cross-cutting en networking del CI (todos los `localhost` → nombres de service: `postgres`, `redis`, `mailpit`, `minio`) + reorganizar arranque MinIO (no admite `docker run` dentro de container). **Decisión doctrinal:** ambas DCs requieren sub-sprint propio dedicado a infra de tests con commits aislados verificables iterativamente contra CI real. Mover Sprint 13.5 a contenido con bordes claros (C/D/E) sin riesgo sobre la suite estable. | — | Sub-sprint dedicado **Sprint 13.5.5 — CI Infra** (futuro). |
| **13.5.C** | **Limpieza tasks/notes residual** | DC.34 (eliminar físicamente `PATCH /tasks/:id/cancel` + 2 specs E2E EC-T8-21 y `tasks-ticket-bridge.spec.ts` "cancelar task bridge → ticket queda sin asignar") + DC.32 verificación rename completo (sin restos de `MaintenanceLog.notes` en código/tests) + DC.33 verificación plantillas seedeadas (`conversation.resolved` + `conversation.auto_closed`) + drift seed `support.auto_close_days` → `support.auto_close_resolved_days`. | ~1h | Sprint 16 doctrina 100% en código (no parcial). |
| **13.5.D** | **UX cliente coherente** | DC.14 (`AdminSidebar` con `collapsed` toggle + drawer móvil paridad cliente) + DC.37 (`useConversationDetail` con WebSocket: `socket.emit('conversation:join')` al montar + listeners `message:new` + `conversation:updated` + `typing:*`) + DC.38 (extraer `<ChatThreadView>` shared, eliminar duplicación `ChatMessages` ↔ `PanelChat`). | ~3-4h | Cliente ve chat live en página detalle; admin tiene sidebar colapsable; cero duplicación frontend chat. |
| **13.5.E** | **Backend canónico** | DC.5 (refactor R15 archivos al límite 300 LOC: identificar candidatos vía `wc -l backend/src/modules/**/*.service.ts \| sort -n` y partir en sub-services) + DC.8 (listeners `auth.*` → `AuditService.logAccess`: 7 eventos hoy huérfanos pasan a registrar audit) + DC.15 (endpoint `/api/v1/me/permissions` que retorne matriz CASL al login + cachear en `AuthContext`, eliminar drift backend↔frontend) + DC.11 (documentar suite E2E env coherente como referencia para Sprint 14). | ~2-3h | Backend sin candidatos R15 abiertos; audit auth completo; permisos en una sola fuente de verdad. |
| **13.5.F** | **Cierre documental** | Actualizar `_matrix.md` (R1 + R15 reflejados), `_events.md` (listeners `auth.*` consumidos), `backlog.md` (12 DCs cerradas + ratio actualizado). Retrospectiva `completed/sprint-13-5-hardening-deuda-continua.md`. Mover Sprint 13.5 entero de `current.md` a `completed/`. | ~1h | PR doc-only cierre. |

---

### 4. Definition of Done

#### Código
- [ ] Backend: typecheck + lint:check + build + suite unit completa verde (sin regresión sobre 183/183).
- [ ] Frontend: typecheck + lint + build verde.
- [ ] Suite E2E **118/118 verde** ejecutándose con 4 workers paralelos en CI (verificación: tiempo total ≤ 25s).
- [ ] CI E2E job usa imagen oficial Playwright sin `apt-get install` block.

#### Por DC

- [ ] **DC.13** — `playwright.config.ts` permite `workers: 4` + `fullyParallel: true` en CI sin regresión. Cada spec genera DB de test propia (schema dinámico) o usuarios aislados `e2e-${uid}-${role}` que no colisionan con seeds canónicos.
- [ ] **DC.27** — `.github/workflows/ci.yml` usa `container: image: mcr.microsoft.com/playwright:v<X>-noble`. Versión major.minor sincronizada con `playwright/test` del `package.json`. Bloque `apt-get install` eliminado.
- [ ] **DC.34** — `PATCH /tasks/:id/cancel` eliminado del controller (queda `service.cancel()` para listeners cross-sistema). Tests E2E `tasks-edge-cases.spec.ts:EC-T8-21` y `tasks-ticket-bridge.spec.ts:cancelar task bridge` borrados.
- [ ] **DC.32 verif** — `grep -r "MaintenanceLog.notes\|maintenance_logs.notes" backend/ tests/` devuelve 0 matches funcionales (solo doc histórica en retrospectivas).
- [ ] **DC.33 verif** — `grep "conversation.resolved\|conversation.auto_closed" backend/prisma/seeds/notification-templates.ts` devuelve las 2 plantillas seedeadas con guard EC-T8-17 OK.
- [ ] **drift seed** — `backend/prisma/seeds/settings.ts:32` siembra key `auto_close_resolved_days` (no `auto_close_days`). Servicio `SupportResolvedAutoCloseService` lee la canónica con default 7.
- [ ] **DC.14** — `AdminSidebar.tsx` con prop `collapsed`/`onToggle`/`mobileOpen`/`onMobileClose` espejo del `Sidebar.tsx` cliente. Toggle persiste en localStorage (post Sprint 13 §13.AUTH se moverá a cookie).
- [ ] **DC.37** — `useConversationDetail.ts` extiende con socket que escuche `message:new` + `conversation:updated`. Smoke test manual: cliente abre `/dashboard/support/[id]`, agente responde, cliente ve mensaje sin recargar.
- [ ] **DC.38** — `<ChatThreadView>` shared en `frontend/app/_shared/support/`. `ChatMessages.tsx` eliminado o reducido a wrapper. `PanelChat.tsx` consume el shared. Cero divergencia de comportamiento.
- [ ] **DC.5** — `backend/src/modules/**/*.service.ts` máximo 300 LOC. Si algún archivo crece tras Sprint 16 (esperado: `tasks.service.ts` ya en 432 — re-evaluar qué partir). Sub-services creados sin acoplamiento R1.
- [ ] **DC.8** — listeners `audit-auth-*.listener.ts` consumen los 7 eventos `auth.*` huérfanos (`auth.login_success`, `auth.login_failed`, `auth.session_closed`, `auth.password_reset`, `auth.email_verified`, `auth.account_blocked`, `auth.2fa_required`) → `AuditService.logAccess()`. Los datos quedan en `audit_access_log` para portal RGPD `/dashboard/transparency`.
- [ ] **DC.15** — endpoint `GET /api/v1/me/permissions` retorna `{subjects: {Subject: [Action, ...]}}`. Frontend `AuthContext` lo cachea al login + tras refresh. Eliminar duplicación `frontend/app/lib/permissions.ts` (queda como `import { permissions } from AuthContext`).
- [ ] **DC.11** — sección nueva en `docs/50-operations/` o `docs/90-meta/` documenta env vars necesarias para suite E2E coherente (NODE_ENV, DATABASE_URL test, REDIS test DB, MailPit endpoint).

#### Documentación (Fase 13.5.F)
- [ ] `docs/20-modules/_matrix.md` actualizada (R15 candidatos cerrados, audit auth como consumidor `auth.*`).
- [ ] `docs/20-modules/_events.md` actualizada (`auth.*` 7 eventos cerrados con consumidor real).
- [ ] `docs/60-roadmap/backlog.md` con 12 DCs marcadas ✅ + nota cierre Sprint 13.5.
- [ ] Retrospectiva `completed/sprint-13-5-hardening-deuda-continua.md`.
- [ ] Sprint 13.5 movido de `current.md` a `completed/`.

#### Smoke testing manual
- [ ] Login como agente → ver `/admin/tasks` con widget sidebar badge correcto.
- [ ] Login como cliente → abrir `/dashboard/support/[id]` → agente responde → mensaje aparece sin recargar (DC.37).
- [ ] Cambiar a viewport móvil en `/admin/*` → drawer móvil del AdminSidebar funciona (DC.14).
- [ ] Login con cuenta inexistente → verificar que entrada `auth.login_failed` aparece en `/dashboard/transparency` (DC.8).
- [ ] CI E2E run en PR pasa con `workers=4` paralelo en ≤25s (DC.13).

---

### 5. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| DC.13 paralelización rompe specs por dependencias ocultas (datos shared) | Alto | Empezar con `workers=2`, identificar specs que fallan, aislar uno a uno. Si imposible: dejar `workers=1` para esos specs específicos vía `test.describe.configure({ mode: 'serial' })`. |
| DC.27 imagen Playwright tiene browsers diferente versión que `playwright/test` | Medio | Sincronizar `image: v${MAJOR}.${MINOR}.0-noble` con `package.json` `@playwright/test`. Pin major.minor. |
| DC.15 endpoint expone permisos al cliente que pueden filtrar info de roles internos | Medio | Devolver SOLO los Subjects/Actions del rol del usuario actual, NO la matriz completa global. Server-side filter. |
| DC.38 unificación rompe `useChatWidget` que ambos componentes consumen | Bajo | Tests E2E `chat-flow.spec.ts` cubren ambos flujos; el shared component recibe props para diferenciar contexto (flotante vs panel). |
| DC.8 audit listener crea volumen alto en `audit_access_log` (1 row por login) | Bajo | Cron `cleanupOldAuditLogs` ya retiene 730 días (Sprint 9 Fase E). Si en localhost crece demasiado, ajustar setting. |
| DC.5 R15 refactor toca archivos crónicos críticos | Bajo | Pre-Sprint 13.5 verificar suite verde; aplicar refactor archivo por archivo con commits atómicos. |

---

### 6. Decisiones registradas

#### Decisiones locales sin ADR
- **Sprint 13.5 NO toca DC.6 + DC.28** (auth server-side cookies httpOnly). Pertenecen a Sprint 13 §13.AUTH ~3-5 sesiones aparte. Mezclarlos duplicaría trabajo.
- **Sprint 13.5 NO toca DC.16-19** (billing prorrateo cross-plan). Es feature, no limpieza — sub-sprint propio post Sprint 8.D.12.
- **Sprint 13.5 NO toca DC.18-26** (Support Inside features). Sprint 12 (Settings+KB) las absorbe naturalmente.
- **Sprint 13.5 NO toca DC.29-31** (UX admin cross-módulo). Pueden ser oportunistas en Sprint 12+ o sub-sprint UX dedicado si Yasmin lo prioriza.
- **Sprint 13.5 NO toca DC.35-36** (regenerar task al vencer + linkear `task_completion` notes). Necesitan Amendment A4 ADR-079 / Sprint 22 — son feature, no limpieza.

---

### ✍ Próxima sesión — orden recomendado

> **Frase canónica para arrancar Fase 13.5.C con contexto fresco:**
>
> *"Lee `docs/90-meta/development-playbook.md`, `docs/60-roadmap/current.md` §Sprint 13.5, `docs/60-roadmap/backlog.md` DC.34 + DC.32 + DC.33. Vamos con Sprint 13.5 Fase 13.5.C — limpieza tasks/notes residual + drift seed. Rama actual: `sprint13-5-hardening-deuda-continua`."*

> **Nota Fase 13.5.B diferida (2026-05-03):** DC.13 + DC.27 requieren sub-sprint propio "Sprint 13.5.5 — CI Infra" por complejidad cross-cutting (networking + reescritura fixtures). Ambas siguen en backlog con su análisis técnico vivo.

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
