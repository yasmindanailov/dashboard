# Bitácora — Rediseño UI · F3·E8: Support Inside gestionado

> **Ramas:** `redesign/f3-support-inside` (backend + cliente, Fase A+B+C — [PR #144](https://github.com/yasmindanailov/dashboard/pull/144), MERGED) **+** `redesign/f3-support-inside-admin` (admin Fase D + cierre Fase E, 2026-06-29). · **Estado:** 🟢 **E8 CÓDIGO-COMPLETO** (A+B+C backend/cliente · D admin · E cierre).
> **Mapa:** [`ui-migration-backlog-2026-06-26.md` §8 E8](./ui-migration-backlog-2026-06-26.md) · mockups [`SupportInside.dc.html`](../../../mockup-uiux/SupportInside.dc.html) (cliente) · [`admin/SupportInside.dc.html`](../../../mockup-uiux/admin/SupportInside.dc.html) + [`admin/SupportInsideDetalleAdmin.dc.html`](../../../mockup-uiux/admin/SupportInsideDetalleAdmin.dc.html) (admin).

## Objetivo

Hacer **gestionado** el Support Inside: técnico asignado ("tu técnico"),
última/próxima revisión + estado por slot, histórico de mantenimientos visible
al cliente, presencia del staff, y la gestión admin per-cliente.

## Decisiones (Yasmin, 2026-06-28)

1. **Técnico = por subscription** (cuidador estable "tu técnico"), NO por slot ni por tarea.
2. **Presencia = construir `user_presence`** (no diferir).
3. **Alcance = FULL** (incluye la página admin per-cliente net-new).
4. **Reasignar técnico** → mueve la tarea de mantenimiento del mes en curso **solo si está `pending`** (si `in_progress`, se respeta; futuras → nuevo técnico).
5. **"Programar mantenimiento" DIFERIDO** (choca con D-3: sin creación manual de tareas; el cron ya las crea). Omitido.
6. **Selector "Reasignar técnico"** = **encargo a claude design** ([DS-A18](./ui-migration-backlog-2026-06-26.md), registrado). Yasmin: lo construyo con el DS y claude design lo reskinea después → no bloquea.
7. **Reskin cliente = 1:1 completo** (como E10), no solo los elementos gestionados.
8. **Value-stats "El valor que te aporta" = datos reales** (tiempo medio real de 1ª respuesta + timeline de mantenimientos recientes).

## Diagnóstico empírico (lo que ahorró trabajo)

Verificado contra código + mockups: **la mayoría de E8 era DERIVABLE, no net-new**:
`next_maintenance_at` ← `anniversary_day` · `last_maintenance_at` ← `MaintenanceLog.performed_at` · `maintenance_status` ← tarea del periodo + último log. Helpers puros, **0 columnas extra**. Lo genuinamente nuevo: **técnico asignado** + **presencia**.

**Modelo de 2 niveles técnico↔tarea** (verificado contra `core/tasks/auto-assign.ts` + `tasks.service.ts assign`):

| | "Tu técnico" (E8) | `Task.assigned_to` (transversal) |
|---|---|---|
| Qué | Cuidador estable del cliente | Quién ejecuta esa instancia mensual |
| Nivel | `SupportInsideSubscription` | `Task` |
| Lo cambia | Admin (reasignar técnico) | Auto-asignación / reasignación de tarea |
| Persistencia | Permanente | Por tarea (reasignable, ya existía) |

El cron pasa a heredar `assigned_to = subscription.assigned_technician_id` con **fallback a `autoAssignTask`** (menor carga) si no hay técnico/no elegible — **mismo patrón que `support_ticket`** (hereda del ticket). No rompe nada transversal.

## Lo hecho — Fase A (fundación de datos)

- Migración additiva `20260628135551_f3_e8_si_technician_and_presence`: `SupportInsideSubscription.assigned_technician_id` (FK User, SetNull) + modelo `UserPresence` (heartbeat `last_seen_at`).
- Helpers puros derivados: `support-inside/maintenance.helper.ts` (next + status) y `core/presence/presence.helper.ts` (online<5min/away<15min/offline). **18 tests**.

## Lo hecho — Fase B (backend, completo)

- **B1 cron** [`maintenance-monthly.service.ts`]: hereda al técnico asignado (+ fallback) · nuevo gate reutilizable `isAssigneeEligible` en `core/tasks/auto-assign.ts`. +5 tests.
- **B2 técnico** [`support-inside-admin.service.ts` + controller]: `PATCH /admin/support-inside/subscriptions/:id/technician` (triple guard + `Manage.SupportInside`); valida elegibilidad; reasigna tareas **pending**; evento `support_inside.technician_assigned` → audit R3 (`action=assign_technician`) + `_events.md`. +4 tests. **Boot smoke 4/4.**
- **B3 presencia** [`modules/presence/`]: `PresenceModule` + `PresenceService` (heartbeat upsert + `getPresence`/`getPresenceMap`) + `POST /presence/heartbeat`. Exportado (reutilizable por E7). +5 tests. **Boot smoke 4/4.**
- **B4 `getStatus` enriquecido + histórico**: técnico + presencia + por slot última/próxima/estado (derivados) · `GET /dashboard/support-inside/slots/:id/maintenance-history` (ownership-safe, labels de checklist) · value-data (`maintenance_count` + `avg_first_response_minutes` real + `recent_maintenances`). +5 tests. **Boot smoke 4/4.**

## Lo hecho — Fase C (UI cliente, reskin 1:1)

- **C1**: `MaintenanceHistoryModal` (modal "Ver mantenimientos") + tipos front + action.
- **C2a**: componentes reutilizables `_shared/support-inside/` → `PresenceDot` (online/away/offline) · `TechnicianCard` (variantes onBrand/default) · `MaintenanceSlotCard` (badge estado + última/próxima + acciones). **6 tests**.
- **C2b**: `ManagedView` — hero "Tu plan de cuidado" (plan + técnico + presencia + stats) · slots · canales · "El valor que te aporta" (datos reales + timeline).
- **C2c**: `PlanComparator` siempre-visible (toggle ciclo + "Tu plan" + "Cambiar a este plan" → modal prorrateo R5) + hero "sin plan" + danger zone. Retiradas la comparativa/PlanCard viejas.
- **Smoke de Yasmin (3 arreglos):** (1) canales: TODOS con badge de estado (Activo/Próximamente/"Plan X"), data-driven desde los configs; (2) slots-full: detecta plan superior — en el máximo "Cobertura completa", no upsell incoherente; (3) cambio de plan: guard que explica "pendiente de activación" cuando el servicio SI está `pending`.

## DoD (parcial — backend + cliente)

`pnpm ci:check` **verde**: backend typecheck+lint+**113 suites/1455** · frontend typecheck+lint+**11 suites/74** · build prod ✓ · **boot smoke 4/4** en cada cambio de DI. ~55 tests añadidos en E8. 1 migración additiva.

## Hallazgo de billing (anotado, NO E8)

El smoke reveló: una **suscripción SI puede quedar `active` con su servicio `pending`** (el flujo de alta marca la suscripción activa antes del cobro de la factura). El cambio de plan exige `service.status='active'` (correcto). Es deuda de **billing/lifecycle pre-existente**, ajena a E8 — el comparador nuevo solo la hace visible. Candidata a revisar aparte.

## Hallazgo (2026-06-29) — drift bitácora ↔ mockups (verificado contra el HTML real)

La Fase D se planificó como *"lista de suscripciones SI + página `SupportInsideDetalleAdmin` net-new"*. **Los mockups dicen otra cosa** (regla CLAUDE.md §2.1 — la doc es mapa, verifica contra el código/mockup):

1. **`admin/SupportInside.dc.html` NO es una lista de clientes** — es la **lista de los 3 PLANES tier** (catálogo) + editor por plan, que **ya existe** como `admin/support-inside-plans/` (Sprint 8). No hay mockup de "lista de suscripciones SI por cliente".
2. **`admin/SupportInsideDetalleAdmin.dc.html`** (breadcrumb *"Servicios › Support Inside · Sara Gómez"*) **es el detalle de servicio admin** cuando el servicio es SI. Esa página (`/admin/services/[id]`) usa la **plantilla única frozen** `ServiceDetailLayout` (Sprint 15C.II F.12, registry declarativo, capability-routed — ADR-070/R4) y **ya tiene** notas, auditoría, suspender/cancelar/reenviar/cambiar-plan, datos técnicos y el kebab "Más acciones".

**Decisión Yasmin (2026-06-29):** **extender** el detalle de servicio unificado, NO crear página/lista nuevas (duplicaría ~80% y se desviaría de la arquitectura frozen — lección L18: la arquitectura frozen gana sobre la nota de bitácora). El reskin visual completo de la página sigue siendo **F4**.

## Lo hecho — Fase D (admin, extendiendo el detalle de servicio)

**Backend** (`SupportInsideAdminService` + controller, sin página nueva):
- Refactor compartido: `enrichSlotsMaintenance` extraído a `maintenance.helper.ts` (recibe `prisma`) → reuso cliente (`getStatus`) + admin sin duplicar (cero divergencia en la derivación de mantenimiento). `eligibleAssigneeRoles()` exportado en `core/tasks/auto-assign.ts`.
- `PresenceService` inyectado en `SupportInsideAdminService` (cambio de DI → boot smoke).
- `getManagedByService(serviceId)` → bloque "Plan de soporte" (técnico + presencia + progreso `period_done/total` + overdue + SLA), SI-INV-8 (1 query + presencia + derivación), 404 si no es SI.
- `listEligibleTechnicians()` → técnicos elegibles (mismos roles que la auto-asignación) con **presencia** (`getPresenceMap`) + **carga de mantenimiento activa** (`groupBy`), para el picker.
- Endpoints (controller base → `admin/support-inside`, la URL del PATCH queda idéntica): `GET subscriptions/by-service/:serviceId` · `GET technicians/eligible` (triple-guard + `Manage.SupportInside`). +9 tests admin service.

**Frontend** (extiende `/admin/services/[id]`, no duplica):
- `ServiceDetailContext.supportInside` (admin-only; el wrapper cliente lo deja `null`). El page admin lo fetchea fail-soft sii `product_type === 'support_inside'`.
- Sección **"Plan de soporte"** en `ADMIN_SERVICE_DETAIL_SECTIONS` (grupo summary, prioridad 450, gated por `supportInside != null && !isTerminal` — 1:1: se oculta en cancelado). Componente `SupportInsidePlanCard` (DS: `SectionCard` + `Meter` + `Avatar` + `PresenceDot`).
- Ítem **"Reasignar técnico…"** en `AdminServiceActionsMenu` (gated SI + no terminal, como el kebab del mockup) → **`ReassignTechnicianModal`** (DS-A18 funcional: avatar + presencia + rol + carga + buscador + desasignar + callout) → `assignTechnicianAction` (`PATCH …/technician` de B2). Server Actions en `_actions.ts`. +5 tests de componente.
- **"Programar mantenimiento" OMITIDO** (D-3, sin creación manual de tareas).

## Lo hecho — Fase E (cierre)

- **Heartbeat de presencia**: `PresenceHeartbeat` (`_shared/presence/`, ping al montar + cada 2 min + al volver a la pestaña, no con pestaña oculta) montado en `AdminShell` (los técnicos son staff) → `sendHeartbeatAction` → `POST /presence/heartbeat`. Hace **real** la presencia que consume la card admin + el picker + "tu técnico" del cliente.
- **Cableado del TODO de `SidebarSupportSlot`** (cliente): `getSupportInsideTechnicianAction` → muestra el técnico asignado real con presencia (`online` → punto verde; resto sin punto, honesto), fallback a "Soporte Aelium" si no hay plan/técnico.

## DoD (E8 completo) — verde 2026-06-29

`pnpm ci:check` (+ builds) **verde**: backend typecheck+lint+**114 suites/1472** + build · frontend typecheck+lint+**13 suites/91** + build prod · **boot smoke 4/4** (rutas SI admin mapeadas; grafo DI sano tras inyectar `PresenceService`). DS-A18: picker funcional construido con el DS (claude design lo reskinea después; no bloquea — decisión Yasmin).

## Follow-up post-smoke (2026-06-29) — 3 mejoras (decisiones Yasmin)

Tras el smoke visual de Yasmin, 3 ajustes (ver `docs/features/support-inside/admin.md` §11.2):

1. **Superadmin asignable como técnico (a mano, sin auto-rotación).** `auto-assign.ts`: nuevo `MANUALLY_ASSIGNABLE_EXTRA=['superadmin']` → `eligibleAssigneeRoles` = pool + superadmin (picker + `isAssigneeEligible`); `autoAssignTask` sigue con el pool **sin** superadmin (no se le auto-carga). El cron honra un superadmin asignado a mano. +tests `auto-assign.spec`.
2. **Notificación campana (info) al técnico al asignarlo.** Taxonomía `support_inside.technician_assigned → soporte` + plantilla seed internal + `NotificationsOnTechnicianAssignedListener` (`dispatchToUser` al nuevo técnico, solo si `!= null`, fail-soft R7). +test listener + entrada en `notification-taxonomy.spec`. **Requiere reseed** en dev (plantilla nueva).
3. **Filtro "Mis clientes" / por técnico en `/admin/clients`.** Backend: `?assigned_technician=<uuid|me>` (controller resuelve `'me'`→actor JWT; service filtra por suscripción SI activa) + técnico en el select de la lista. Frontend: Select "Técnico asignado" (Todos / Mis clientes / por técnico, poblado desde `technicians/eligible` fail-soft) + técnico por fila.

**Aclaración doctrinal (Yasmin):** notificación ≠ tarea — la tarea es el trabajo accionable (mantenimiento mensual, la crea el cron); la notificación es info sin acción.

## Follow-up 2 (2026-06-29) — el técnico como punto de contacto del cliente SI

Ampliación del rol del técnico (decisiones Yasmin; antes solo hacía el mantenimiento mensual):

4. **Routing de tickets+chats al técnico.** `SupportInsideTechnicianRoutingListener` (`@OnEvent('conversation.created')`): si el cliente SI tiene técnico **activo + elegible**, le asigna la conversación (compare-and-swap, no pisa asignación manual) y emite `conversation.assigned` → campana al técnico + task bridge si es ticket + WS. Sin técnico elegible → cola (fallback básico). **Siempre** (ticket y chat) — el gating por presencia/horario se difiere. +6 tests.
5. **Auto-asignar técnico al contratar.** `SupportInsideAutoAssignTechnicianListener` (`@OnEvent('support_inside.subscribed')`): si la suscripción no tiene técnico, asigna el de **menor carga** (`autoAssignTask`, pool sin superadmin) vía `assignTechnician` (→ notificación + audit). Cubre ambos caminos de alta (subscribe + checkout). +5 tests.

**Verificado empíricamente (premisa de Yasmin):** el admin/superadmin **VE** todas las conversaciones en el panel (backend no filtra por agente para staff), pero **NO es notificado** de cada una (campana solo al asignársele); su red de seguridad es vigilancia activa del panel. El "técnico no puede" fino (horario/24h-PRO informativo · disponibilidad · tope de carga · reasignación por SLA) queda **diferido** (Yasmin observa y se pule después; horario = setting global cuando se aborde).

**DoD follow-up verde 2026-06-29:** primera tanda (3 mejoras): back **115/1478** · front **13/91** · boot 4/4 · reseed. Segunda tanda (routing + auto-asignar): back typecheck+lint+**117 suites/1489** · boot smoke (DI sano, 2 listeners nuevos) · sin cambios de frontend.

## Falta (Yasmin)

- Smoke visual del cliente reskineado (incl. los 3 arreglos del smoke; reiniciar `dev` para HMR).
- **Smoke visual admin (F3·E8 Fase D):** abrir un servicio Support Inside en `/admin/services/[id]` → ver la card "Plan de soporte" + reasignar técnico desde el kebab; verificar la presencia (con un agente con la app abierta).
- **Smoke de las 3 mejoras:** superadmin aparece en el picker · al asignar, el técnico recibe campana "ahora eres el técnico de X" · filtro "Mis clientes"/por técnico en `/admin/clients`.
- Decisión opcional: activar el servicio SI `pending` en dev para probar el cambio de plan.
