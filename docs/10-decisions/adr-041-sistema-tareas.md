# ADR-041 — Sistema de tareas internas

> **Status:** Active — **parcialmente superseded** por [ADR-079](./adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) §1 + §2 + §3.1 (tasks pasan a bridge unidireccional read-only desde 5 triggers automáticos cerrados, sin creación manual; enum `TaskType` con 7 valores reemplazado por enum `TaskSourceSystem` con 5 valores; modelo de datos reducido a 11 campos canónicos; eliminación de `task_tags`/`Task.client_note`/`is_recurring`/`metadata`/`reason`). La doctrina §"Lifecycle de la task" y §"Inmutabilidad del cierre" permanece vigente. Los anteriores refinamientos por ADR-072 y ADR-073 también quedan parcialmente superseded por ADR-079 (cola pública sigue existiendo pero gestionada por `autoAssignTask`; tags eliminados). **Aplica tras Sprint 16 (refactor canónico).**
> **Date:** 2026-04 (Sprint 8) · 2026-04-26 (migración a ADR) · 2026-05-02 (parcialmente superseded por ADR-079)
> **Original:** DECISIONS.md §10
> **Domain:** tasks

> 📜 **Nota canónica (Sprint 8 Fase B.7 — 2026-04-29):** [ADR-073](./adr-073-tipos-flexibles-tasks-reason-tags.md) renombra el tipo `wow_call` → `contact_client` y separa el QUÉ del POR QUÉ. El enum `TaskType` se mantiene cerrado y representa qué bloque/automatización dispara la tarea; la intención humana ("Bienvenida primer servicio", "Renovación", "Aviso migración") vive en `Task.reason` (libre <=100) + tags asignables en `task_tags`. Los listeners del Sprint 11 que ADR-041 llamaba `WowCallCreatorListener` se renombran `ContactClientTaskListener` y emiten `type=contact_client` con `reason` + tag `bienvenida`. **Esta nota queda superseded por ADR-079: el listener `client-lifecycle-task-creator` consume `service.activated` y crea task `source_system='client_lifecycle'` (sustituye a `contact_client`); `task.reason` y `task_tags` se eliminan (el `source_system` ya da la categoría operativa).**

---

## Contexto

Aelium opera con un equipo pequeño (1 superadmin + agentes) que atiende a muchos clientes. La operativa diaria gira en torno a **tareas que el sistema o un agente debe ejecutar**: llamada de bienvenida tras compra, mantenimientos mensuales, configuraciones, desarrollos personalizados, etc.

Sin un sistema de tareas formal:
- Los agentes pierden de vista qué deben hacer y cuándo (mantenimientos se atrasan, WOW calls no se hacen).
- No hay traza de qué se hizo, cuándo, ni por quién (auditoría imposible).
- Los disparadores son manuales — depende de que alguien recuerde crear la tarea cuando ocurre el evento de negocio.

Hace falta un módulo de **tareas como ciudadano de primera clase**: tipadas, con triggers automáticos por eventos, asignadas, con estados, con notificaciones al cliente al cerrarlas, y con auditoría completa.

---

## Decisión

### Modelo conceptual

Las tareas son entidades persistentes con estos campos clave:

```
id, type, status, assigned_to, client_id, service_id, project_id,
title, description, due_date, priority, checklist_data, notes_internal,
notes_for_client, completed_at, completed_by
```

El campo `assigned_to` apunta **siempre a un agente concreto** (1:1). La asignación es por cliente: el agente "owner" del cliente recibe todas sus tareas por defecto, salvo override manual del superadmin.

### Tipos de tarea y triggers automáticos

| `type` | Trigger | Plazo / recurrencia |
|--------|---------|---------------------|
| `wow_call` | Cliente nuevo compra su primer producto | 24 horas |
| `maintenance` | Slot de mantenimiento activo | Mensual en fecha de aniversario |
| `maintenance_mgmt` | Slot mantenimiento + gestión activo | Mensual en fecha de aniversario |
| `we_do_it_for_you` | **DEPRECADO** (ADR-022 → ADR-046) | — |
| `project_task` | Tarea vinculada a un proyecto (Sprint 22) | Definido por el proyecto |
| `custom_service` | Servicio manual ad hoc | Lo define el agente |

Los triggers se modelan como listeners de eventos (R1). Por ejemplo `service.created` con `client.is_first_purchase = true` → emite `task.create_wow_call`. Cron mensual emite `task.create_maintenance` para cada slot activo.

### Estados y transiciones

```
pending ──► in_progress ──► completed
   │
   └──────────────────────► not_completed_in_time   (cuando vence due_date)
```

- `not_completed_in_time` se aplica vía cron — no se elimina la tarea, queda como evidencia de incumplimiento.
- Una tarea **completada nunca se reabre.** Si hace falta retomar el trabajo, se crea una tarea nueva (auditabilidad).

### Pantalla de cierre de mantenimiento

El agente, al completar una tarea de mantenimiento, ve:

1. **Checklist del servicio** — heredado del producto, personalizable por servicio concreto.
2. **Notas para el cliente** — van al email / notificación interna.
3. **Notas internas** — solo equipo, quedan en la ficha del cliente.
4. **Canales de notificación** — el sistema muestra los activos según el plan del cliente.
5. Botón **"Completar y notificar"**.

Al pulsarlo: emite `maintenance.completed` → módulo notifications despacha al cliente.

### Checklists por tipo de producto

- Definidos como base al crear el producto (ej: hosting web → "actualizar core, plugins, SSL, backup").
- Personalizables a nivel de servicio concreto (cliente con instrucciones especiales).
- Se renderizan en la pantalla de cierre, marcables uno a uno.

### Panel de tareas del agente

Tres bloques temporales: **HOY · ESTA SEMANA · PRÓXIMAMENTE**, cada tarea con icono según `type`, cliente, prioridad. El superadmin ve todas las tareas de todos los agentes con filtros y puede reasignar.

### AI Workers (Sprint 25 — futuro)

Las tareas `project_task` y `custom_service` podrán asignarse a un AI Worker (ej: OpenClaw) en lugar de a un agente humano. El agente humano siempre revisa y aprueba el resultado. Especificación completa en `docs/AI_WORKERS.md` (futura).

---

## Consecuencias

- ✅ **Ganamos:**
  - Operativa diaria estructurada — cada agente sabe qué hacer y cuándo.
  - Triggers automáticos (mantenimientos, WOW calls) eliminan riesgo de olvido.
  - Auditoría completa: qué se hizo, cuándo, por quién, con notas.
  - Las notificaciones al cliente se disparan en el momento exacto del cierre.
- ⚠️ **Aceptamos:**
  - **Asignación por cliente entero** (1 owner) sacrifica granularidad — a veces una tarea concreta encajaría mejor con otro agente. Mitigación: el superadmin reasigna manualmente cuando hace falta.
  - Mantener checklists por producto requiere disciplina del superadmin para que no se desactualicen.
  - Tareas `not_completed_in_time` no se borran — la tabla crece indefinidamente. Aceptable hasta volúmenes altos; archivar tras 1 año cuando aplique (ADR-056).
- 🚪 **Cierra:**
  - **No tareas sin `assigned_to`.** Toda tarea tiene dueño. Nunca "pool global" a coger por cualquiera.
  - **No reabrir tareas completadas.** Crear una nueva.

---

## Cuándo revisar

- Si los agentes empiezan a desbordarse y la asignación 1:1 por cliente se vuelve cuello de botella → considerar pool de tareas o asignación por skill.
- Cuando se implemente AI Workers (Sprint 25) → revisar interfaz `assigned_to` para soportar workers no humanos sin romper relaciones.
- Si surgen tipos de tarea nuevos no contemplados (ej: `migration_task`, `audit_task`) → ampliar enum `type` con ADR.

---

## Referencias

- **Módulos afectados:** tasks (productor), clients (asignación), products (checklist por tipo), notifications (cierre), support (escalación → ticket si aplica), audit (R3).
- **Reglas relacionadas:** R1 (módulos por eventos), R3 (audit log inmutable), R15 (límites de archivo).
- **ADRs relacionados:** ADR-022 (WDIFY deprecado, motivó eliminación de `we_do_it_for_you`), ADR-042 (notificaciones — receptor de `maintenance.completed`), ADR-046 (Sistema de Proyectos — `project_task`).
- **Glosario:** [Tarea](../00-foundations/glossary.md), [Slot](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/tasks/`, `docs/20-modules/tasks/contract.md`.
- **Deuda conocida:** Sprint 8 WIP — listener `task.assigned` ausente, validación `assigned_to` pendiente, 2 errores lint `no-unsafe-enum-comparison` (ver development-playbook §1).

---

## Notas de revisión

> **2026-04-29 — refinado por [ADR-072](./adr-072-tareas-sin-asignar-cola-publica.md):** la regla §"🚪 Cierra" *"No tareas sin `assigned_to`. Toda tarea tiene dueño. Nunca pool global"* queda **actualizada**. Las tareas pueden nacer sin owner si y sólo si (a) un listener automático las crea y no hay owner determinable, o (b) un admin las crea conscientemente con la opción "Sin asignar" del UI. La cola "Sin asignar" funciona como buffer temporal con presión operativa explícita: SLA por tipo (configurable en settings) + cron `tasks-unassigned-overdue` que alerta al superadmin cuando el plazo se excede. Cualquier staff con CASL `Manage.Task` puede auto-asignarse una tarea de la cola. Las demás reglas de ADR-041 (auditoría completa, tareas completadas no se reabren, asignación 1:1 con un agente concreto cuando hay owner) **siguen vigentes íntegras**.
