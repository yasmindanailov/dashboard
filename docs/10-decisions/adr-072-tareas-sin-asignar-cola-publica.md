# ADR-072 — Tareas sin `assigned_to`: cola pública con SLA explícito (refina ADR-041)

> **Status:** Active — **parcialmente refinado** por [ADR-079](./adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) §3.4 (la cola pública sigue existiendo conceptualmente pero su gobernanza pasa al helper canónico `autoAssignTask` que devuelve `null` cuando no hay candidato eligible — entonces la task queda "sin asignar" automáticamente). El cron `tasks-unassigned-overdue` permanece intacto. **Aplica tras Sprint 16.**
> **Date:** 2026-04-29 · 2026-05-02 (parcialmente refinado por ADR-079)
> **Domain:** tasks, operativa interna
> **Sprint:** Sprint 8 Fase B.1.bis

> 📜 **Nota canónica (2026-04-29 — [ADR-073](./adr-073-tipos-flexibles-tasks-reason-tags.md)):** el setting `tasks.unassigned_sla_hours.wow_call` se renombra a `tasks.unassigned_sla_hours.contact_client`. El listener canónico aludido aquí como `WowCallCreatorListener` se renombra `ContactClientTaskListener`. Mismo comportamiento, nombre alineado con el enum vigente.

---

## Contexto

[ADR-041 §"🚪 Cierra"](./adr-041-sistema-tareas.md) declaró textualmente:

> **No tareas sin `assigned_to`.** Toda tarea tiene dueño. Nunca "pool global" a coger por cualquiera.

La intención de Sprint 8 P0.1 (2026-04-26) era proteger contra la deriva de tareas huérfanas que nadie mira (riesgo operativo real cuando hay >5 agentes y la asignación se hace ad-hoc). Sin embargo, en Sprint 8 Fase B.1.bis (2026-04-29) se introdujo en UI la **vista segmentada** del tablero `/admin/tasks` con tres scopes: **Mis tareas / Sin asignar / Todas** ([UI_SPEC §5.15](../UI_SPEC.md#L1652-L1738)). El segundo scope **es exactamente la cola pública** que ADR-041 prohibía.

Hay dos motivos prácticos por los que la prohibición original era demasiado estricta:

1. **Triggers automáticos sin owner determinable.** Listeners como `WowCallCreatorListener` (Sprint 8 Fase C) reciben `service.provisioned` y deben crear una task `wow_call`. Si el cliente no tiene agente "owner" asignado por configuración (caso real cuando un nuevo cliente entra y todavía no se ha hecho la asignación de cuenta), el listener tiene tres opciones malas:
   - Asignar al superadmin por defecto → sobrecarga sistemática del único superadmin.
   - No crear la task → se pierde el WOW call (síntoma exacto que ADR-041 quería evitar).
   - Asignar arbitrariamente al primer agente → injusto y poco transparente.
2. **Operativa B2B real.** El admin a veces crea una tarea sin saber a quién asignársela todavía (depende de capacidad del equipo, especialidad técnica, idioma del cliente, etc.). La opción canónica debería ser "déjala en la cola pública y que la tome el agente disponible más adecuado".

> **¿Qué pasaría si NO tomáramos esta decisión?** El código (UI scope=unassigned + backend findAll permite `assigned_to=null`) y la doctrina (ADR-041 lo prohíbe) seguirían en conflicto. Cualquier futuro Claude que lea ADR-041 al pie de la letra rechazaría la cola pública como bug a corregir, deshaciendo trabajo legítimo. Necesitamos cerrar la inconsistencia con un ADR formal que actualice la regla.

---

## Opciones consideradas

### A. Mantener la prohibición de ADR-041 → revertir scope=unassigned

- **Pros**: coherencia con doctrina previa.
- **Contras**: rompe la realidad operativa (los 2 motivos arriba). El `WowCallCreatorListener` se queda sin solución limpia. UI ya entregada y validada con Yasmin tendría que volver atrás.

### B. (elegida) Permitir tareas sin `assigned_to` con doctrina explícita y SLA

Las tareas pueden nacer sin owner si y sólo si:

1. **Trigger automático** las crea cuando no hay owner determinable.
2. **Admin las crea conscientemente** sin asignación (el dropdown UI permite "Sin asignar").

A cambio, se introduce un **SLA explícito** (configurable por tipo) que las saca de la cola si no se toman en plazo: cron `tasks-unassigned-overdue` emite alerta al `superadmin` con la lista de tareas huérfanas excedidas. La cola "Sin asignar" deja de ser un cementerio y se vuelve **buffer temporal con presión operativa**.

- **Pros**:
  - Resuelve los dos motivos prácticos del contexto.
  - Conserva el espíritu de ADR-041 (auditabilidad + ningún olvido) vía SLA + alerta automática.
  - Compatible con la UI ya entregada (scope=unassigned como vista canónica).
  - Cualquier staff con `Manage.Task` puede tomar tareas de la cola (auto-asignación), alineado con CASL Opción A ([Sprint 8 Fase B.1.bis](../60-roadmap/current.md)).
- **Contras**:
  - Requiere implementar el cron + setting + plantilla notification (Sprint 8 Fase C extendida).
  - Hasta que el cron esté implementado, la cola puede crecer sin presión. Mitigación: el dashboard del admin muestra count "Sin asignar" en Topbar (futuro Sprint 13.5) o vía StatusTabs ya disponible.

### C. Crear un usuario especial `unassigned-pool@aelium.internal`

- **Pros**: técnicamente cualquier task tendría `assigned_to` no nulo.
- **Contras**: hack visible que confunde al admin (vería un "usuario" inexistente como propietario), introduce special-casing en notifications/audit, y no resuelve el problema real (sigue habiendo cola pública, sólo que disfrazada).

---

## Decisión

Se elige Opción B. ADR-041 §"🚪 Cierra" se actualiza vía ADR-072 con la nueva doctrina:

### Reglas canónicas

1. **Permitido `assigned_to = NULL`** sólo en estos dos casos:
   - **(a) Creación automática por listener** cuando no se puede determinar owner del cliente (`client_profiles.account_owner_id` futuro, hoy implícito = ninguno).
   - **(b) Creación manual admin** vía UI con el dropdown "Sin asignar" del `NewTaskModal`.
2. **Auto-asignación**: cualquier staff con CASL `Manage.Task` puede tomar una tarea de la cola con `PATCH /tasks/:id` `{assigned_to: <su id>}`. El backend permite la transición `null → <staff id>` sin requerir rol admin pleno (refina la regla legacy de `update()` que sólo permitía editar tareas propias).
3. **SLA por tipo de tarea** (configurable en `settings`):
   - `tasks.unassigned_sla_hours.wow_call` — default 24h ([ADR-041 §"Tipos y triggers"](./adr-041-sistema-tareas.md) ya marcaba este plazo).
   - `tasks.unassigned_sla_hours.maintenance` — default 12h.
   - `tasks.unassigned_sla_hours.maintenance_management` — default 12h.
   - `tasks.unassigned_sla_hours.custom_work` — default 48h.
   - `tasks.unassigned_sla_hours.support_setup` — default 4h (alta prioridad).
   - Si una entrada falta, fallback global `tasks.unassigned_sla_hours.default = 24h`.
4. **Cron `tasks-unassigned-overdue`** (BullMQ scheduled, daily 09:00, [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md)):
   - Selecciona `tasks` con `assigned_to = NULL` y `created_at + sla_hours < now()`.
   - Emite evento `task.unassigned_overdue` con payload `{ task_ids: string[], total: number }`.
   - Listener `notifications-unassigned-overdue` despacha a `superadmin` (campana + email) con resumen.
5. **Doctrina permanente**: la cola "Sin asignar" no debe crecer indefinidamente. Si el cron alerta repetidamente sobre el mismo conjunto de tareas, es señal de capacidad insuficiente del equipo o de configuración mala de `account_owner_id` — investigación operativa, no técnica.
6. **Tareas `not_completed_in_time` con `assigned_to = NULL`**: no aplican al cron `tasks-overdue-to-failure` (diferente del `unassigned-overdue`). Una tarea sin owner que no se toma a tiempo se queda en `pending` con alerta — no pasa a `not_completed_in_time` automáticamente, porque **no hubo fallo de un agente**, hubo fallo de gestión.

### Reglas que ADR-041 mantiene intactas

- **Tareas completadas nunca se reabren.** Sigue válido. Reasignar una tarea cerrada no es posible (refuerza con [Sprint 8 Fase B.1.bis EC-T8-20](../60-roadmap/current.md)).
- **Auditoría completa.** La toma de una tarea de la cola sin asignar emite `task.assigned` con `assignedBy = userId` (auto-asignación), persistido en audit log igual que cualquier asignación.
- **Asignación 1:1 con un agente concreto.** Cuando una task tiene `assigned_to`, sigue siendo un humano (o futuro AI Worker, [ADR-041 §"AI Workers"](./adr-041-sistema-tareas.md)). La cola pública es un estado **temporal**, no un estado permanente alternativo.

---

## Consecuencias

- ✅ **Ganamos:**
  - Coherencia entre código, doctrina y UI.
  - Triggers automáticos (`WowCallCreatorListener` futuro Sprint 8 Fase C) tienen camino limpio para crear tareas sin owner.
  - Agentes tienen visibilidad explícita de la cola disponible y pueden auto-tomarse tareas según capacidad/disponibilidad.
  - SLA + cron de alerta convierte la cola en **mecanismo activo**, no en cementerio pasivo.
- ⚠️ **Aceptamos:**
  - **Implementación pendiente** del cron `tasks-unassigned-overdue` y los settings asociados (Sprint 8 Fase C extendida). Hasta entonces la cola puede crecer sin presión. Mitigación temporal: el admin chequea la pestaña "Sin asignar" diariamente (operativa manual).
  - **Settings nuevos** (6 entradas SLA por tipo + 1 default) que el seed debe poblar. Se añade en `seedSettings`.
  - **Nuevo evento `task.unassigned_overdue`** que requiere plantilla `notification_templates` (email + internal). Se añade al seed cuando se implemente el cron.
- 🚪 **Cierra:**
  - **No usuario fantasma "unassigned-pool"** — la solución elegida es ortogonal a esa opción C descartada.
  - **No cola pública sin SLA** — la presión temporal es no-negociable. Sin SLA, ADR-041 vuelve a aplicar y rechazaría la cola.

---

## Cuándo revisar

- Si la cola "Sin asignar" promedio se mantiene >50 tasks por más de 1 mes → indica falta de capacidad de equipo o malconfiguración de `account_owner_id`. **No es problema técnico, es operativo** — el ADR sigue válido pero hay que actuar en negocio.
- Si Sprint 22 (Projects) introduce tasks `project_task` sin owner natural → revisar si el SLA por tipo es suficiente o necesita SLA por proyecto.
- Si Sprint 25 (AI Workers) introduce assigned_to no humano → revisar si la cola pública debería excluir AI workers por defecto.

---

## Referencias

- **Módulos afectados:**
  - `tasks` (Sprint 8) — owner del cron `tasks-unassigned-overdue` y de la regla de auto-asignación.
  - `notifications` — consumidor del evento `task.unassigned_overdue`.
  - `audit` — consume `task.assigned` igual que antes; la auto-asignación es un caso del mismo evento.
- **Reglas relacionadas:**
  - [R1](../00-foundations/rules.md) — módulos por eventos.
  - [R3](../00-foundations/rules.md) — audit log inmutable.
  - [R13](../00-foundations/rules.md) — los jobs fallidos nunca desaparecen.
- **ADRs relacionados:**
  - [ADR-041](./adr-041-sistema-tareas.md) — sistema de tareas (refinado por este ADR).
  - [ADR-042](./adr-042-sistema-notificaciones.md) — notifications consume `task.unassigned_overdue`.
  - [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md) — infra BullMQ del cron.
  - [ADR-067](./adr-067-granularidad-casl-rol-staff.md) — `Manage.Task` para los 4 staff (auto-asignación).
- **Glosario:** *Cola pública de tareas* (definida aquí), *SLA de cola* (configurable por tipo en settings).
- **Discusión externa:** conversación Yasmin ↔ Claude 2026-04-29 sobre vista segmentada del tablero (UI_SPEC §5.15) y auditoría de edge cases.
- **Implementación parcial actual (Sprint 8 Fase B.1.bis 2026-04-29):**
  - UI: scope=unassigned visible para staff, scope=mine default.
  - Backend `tasks.service.findAll`: scope=unassigned filtra por `assigned_to: null`.
  - Backend `tasks.service.update`: refinado en este sprint para permitir auto-asignación staff (EC-T8-22).
  - Cron + settings + plantilla: pendientes Sprint 8 Fase C extendida.

---

## Notas de revisión

> **2026-04-29:** ADR creado en respuesta a la auditoría de edge cases del módulo tasks. Yasmin pidió revisión rigurosa; se descubrió la contradicción doctrinal entre la cola UI ya entregada y ADR-041 §"🚪 Cierra". Este ADR formaliza el camino limpio.
