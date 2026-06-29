# Bitácora — Rediseño UI · F3·E8: Support Inside gestionado

> **Rama:** `redesign/f3-support-inside` (desde `origin/master`) · **Fecha:** 2026-06-28 · **Estado:** 🟡 **backend + cliente CÓDIGO-COMPLETO** (Fase A+B+C), **admin (Fase D) + cierre (Fase E) PENDIENTES** (se siguen en otro chat). · **[PR #144](https://github.com/yasmindanailov/dashboard/pull/144)**.
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

## PENDIENTE (se sigue en otro chat)

- **Fase D — admin per-cliente:** lista de suscripciones SI + página `SupportInsideDetalleAdmin` net-new (progreso del mes, **reasignar técnico** [backend ya hecho en B2; picker con el DS] + [DS-A18], timeline de actividad, datos técnicos) + endpoints admin de lista/detalle. *(La acción "Programar mantenimiento" del mockup queda OMITIDA por D-3.)*
- **Fase E — cierre:** heartbeat de presencia en el front (ping mientras la app está abierta) + cablear los puntos de presencia (incl. el TODO de `SidebarSupportSlot`) + smoke visual + cierre de docs.
- **Encargo de diseño DS-A18** (selector reasignar técnico) a claude design.

## Falta (Yasmin)

- Smoke visual del cliente reskineado (incl. los 3 arreglos del smoke; reiniciar `dev` para HMR).
- Decisión opcional: activar el servicio SI `pending` en dev para probar el cambio de plan.
