# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26. Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)).

> **Última actualización:** 2026-04-26 — refactor de roadmap (post F6).
> **Cambios estructurales recientes:**
> - **Sprint 11.5 (MinIO Storage)** añadido como sprint independiente — antes estaba dentro del Sprint 14 Deploy. Desbloquea adjuntos chat/tickets sin obligar a desplegar a producción.
> - **Sprint 14 (Deploy)** limpiado — solo lo que realmente requiere producción real.
> - **Sprint 15 (Plugins)** partido en sub-sprints 15A-15H independientes — cada plugin se aborda según necesidad real, no en cadena.
> - **Sprint 8 Fase D (Support Inside)** refinada con UX dedicada según [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md).

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

## 🔄 Sprint 8 — Tasks + Support Inside

**Estado:** WIP confirmado en auditoría 2026-04-26. Fase A 50%, Fases B-E pendientes.

> **Bloquea cadena de Sprint 9** (Audit + Notifications) que necesita listeners de `task.*` para emails.

### Fase A — Schema + fixes base

| # | Paso | Estado real | Notas |
|---|------|-------------|-------|
| 8.1 | TasksService CRUD + asignación + estados + Controller con CASL | ✅ **Cerrado P0.1 (2026-04-26)** — validación FK `assigned_to` (existe + activo + rol asignable) implementada en `assertAssignableUser`. |
| 8.1b | Schema: `task_checklist_completions`, `maintenance_logs`, `product_checklist_items`, `service_checklist_items` + migración | ⬜ |
| 8.1c | Schema: campo `task_id` nullable FK en `client_notes` + migración | ⬜ |
| 8.1d | Backend: completar maintenance → `maintenance_log` + persistir notas + crear `ClientNote(task_id)` | ⬜ |
| 8.14 | Backend: endpoint listar agentes (`GET /api/v1/users?role=agent*`) | ⬜ |

### Fase B — Frontend core

| # | Paso | Estado real |
|---|------|-------------|
| 8.8 | Tablero ListPage + DetailPage + NewTaskModal + TaskTable | 🔄 |
| 8.8b/c/d/e | Select agente, bloques adaptativos, DS compliance, ClientNotesTab vinculación tarea | ⬜ |

### Fase C — Automatización

| # | Paso | Estado real |
|---|------|-------------|
| 8.2 | Listener `service.provisioned` → crear `wow_call` automático | ⬜ |
| 8.3 | WOW calls checklist post-alta (depende 8.1b) | ⬜ |
| 8.10 | **Listeners `task.assigned`, `task.overdue`, `maintenance.completed`, `maintenance.critical`** | 🔄 **`task.assigned` cerrado P0.1 (2026-04-26)** vía `tasks-email.listener.ts` (email + notificación interna). Resto pendiente Sprint 9. |
| 8.12 | Cron `not_completed_in_time` + emit `task.overdue` | ⬜ |

### Fase D — Support Inside (UX dedicada — ADR-061)

> **Refinada por [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md):** Support Inside se presenta como **tier de cuenta** con páginas dedicadas, no como producto en el catálogo público. El schema sigue igual ([ADR-034](../10-decisions/adr-034-support-inside-modelo.md)) — solo cambia la presentación.

| # | Paso | Estado real |
|---|------|-------------|
| 8.4 | Schema + Service support_inside_* + planes Básico/Medium/Pro (sin cambios respecto a ADR-034) | ⬜ |
| **8.4b** | **(NUEVO ADR-061)** Admin `/admin/support-inside-plans` — página dedicada con los 3 planes lado a lado, NO en el CRUD genérico de productos | ⬜ |
| 8.5 | Página cliente `/dashboard/support-inside` — 3 planes comparados si no tiene activo; gestión de plan/slots si tiene activo. **NO aparece en `/dashboard/catalog`** | ⬜ |
| 8.6 | Cancelación cascada + recurrencia anniversary_day + cron mensual generación de tareas mantenimiento | ⬜ |
| 8.7 | ~~We Do It For You~~ — **DEPRECADO** ([ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md), reemplazado por Projects Sprint 22) | 🛑 |
| 8.9 | Frontend vista mantenimiento mensual (depende 8.6) | ⬜ |
| 8.13 | Cron alerta tarea crítica (X días antes fin mes, configurable) | ⬜ |

### Fase E — Cierre

| # | Paso | Estado real |
|---|------|-------------|
| 8.11 | docs/features/tasks/admin.md + agent.md | ⬜ |
| **8.E.1** | **(NUEVO desde auditoría)** Tests E2E para tasks: crear → asignar → completar | ✅ **Cerrado P0.1 (2026-04-26)** — `tests/e2e/tasks.spec.ts` con 3 specs (flujo completo + 2 validaciones FK). |

### ✅ P0.1 cerrado (2026-04-26) — cierre mínimo Sprint 8

1. ✅ Listener `@OnEvent('task.assigned')` en `backend/src/modules/tasks/tasks-email.listener.ts` → email al agente + notificación interna en tabla `notifications`.
2. ✅ Validación FK `assigned_to` (helper privado `assertAssignableUser` en `tasks.service.ts`): valida user existe + status=`active` + rol en `superadmin|agent_full|agent_billing|agent_support`. Devuelve 400 (`BadRequestException`) si no.
3. ✅ Tests E2E (`tests/e2e/tasks.spec.ts`) — 3 specs serializados (gestión 2FA del superadmin), incluyen helper `loginSuperadminAPI` reusable. Suite completa CI mode 10/10 pasa.
4. ✅ Fix oportunista: 2 errores `no-unsafe-enum-comparison` resueltos (uso `TaskStatusDto.completed` en vez de string literal). Lint backend mejora -4 errores netos.

### 🔴 Resto del Sprint 8 — pendiente

- Fase A: schemas pendientes (8.1b/c/d/14).
- Fase B: frontend bloques adaptativos + ClientNotesTab vinculación tarea.
- Fase C: listener `task.overdue` + cron `not_completed_in_time` + WOW calls automáticos.
- Fase D: Support Inside (UX dedicada — ADR-061).
- Fase E: docs admin/agent.

**Próximo paso recomendado tras P0.1:** ~~**P0.2 Outbox Pattern para `invoice.*`**~~ ✅ **Cerrado 2026-04-26** — los 4 eventos `invoice.*` (`created`, `paid`, `failed`, `overdue`) usan `OutboxService.enqueue(tx, ...)` dentro de transacción Prisma; `OutboxWorker` (`@Interval(5s)` + `FOR UPDATE SKIP LOCKED`) los despacha vía `EventEmitter2.emitAsync` con retries y crash recovery. Test E2E `tests/e2e/outbox-invoice.spec.ts` demuestra persistencia tras "crash" del bus. ADR-033 actualizado.

~~**Siguiente: P0.3 saneamiento lint**~~ ✅ **Cerrado 2026-04-26** — Backend 294 → 0 errores, Frontend 117 → 0 errores, CI lint bloqueante en ambos. 4 commits incrementales (`3b2df25`, `8f91daf`, `56285d3`, `36099a8`, `f313e31`, `3d27da1`). Deuda residual DC.6 (27 warnings `set-state-in-effect` — migración Server Components, ver [`backlog.md`](./backlog.md)).

**Siguiente:** **P0.4 tests E2E exhaustivos** (2FA real, checkout completo, PDF, escalación WS) — última pieza P0 antes del primer deploy productivo.

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
