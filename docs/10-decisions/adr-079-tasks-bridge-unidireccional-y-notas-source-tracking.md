# ADR-079 — Tasks como bridge unidireccional read-only + consolidación de notas con source tracking

> **Status:** Active (supersedes [ADR-041](./adr-041-sistema-tareas.md) §"Tipos canónicos" + §"Creación manual"; supersedes [ADR-073](./adr-073-tipos-flexibles-tasks-reason-tags.md) §"Tags M2M" + §"reason libre"; refina [ADR-038](./adr-038-notas-estructuradas-cliente.md) §"Categorías" + §"Origen de la nota"; refina [ADR-072](./adr-072-tareas-sin-asignar-cola-publica.md) §"Cola pública"; refina [ADR-074](./adr-074-ticket-task-bridge.md) §"Bridge ticket↔task"; ADR-041, ADR-072, ADR-073, ADR-074, ADR-038 permanecen `Active` para las decisiones NO superseded por este)
> **Date:** 2026-05-02
> **Domain:** tasks, notes, support, support_inside, provisioning, project (cross-cutting de la operativa del agente)
> **Sprint:** Decisión arquitectónica que **gobierna Sprint 16 — Tasks refactor + Notes consolidation**. Se mergea como PR doc-only **antes** del primer commit del sprint, replicando el patrón Sprint 8 D.0 (ADR-075 antes de Fase D), Sprint 11 A (ADR-077 antes de Fase B) y Sprint 11 pre-D (ADR-078 antes de Fase D).

---

## Contexto

El sistema de tareas (`tasks`) nació en Sprint 5 ([ADR-041](./adr-041-sistema-tareas.md)) con dos objetivos mezclados: (a) ser **lista priorizada del trabajo del agente** y (b) ser **sistema completo tipo Jira con tipos flexibles, tags, prioridades, descripciones, recurrencia, metadata libre**. Sprint 8 Fases A→D ampliaron el módulo en la dirección (b): se añadieron tags M2M ([ADR-073](./adr-073-tipos-flexibles-tasks-reason-tags.md)), `reason` libre, 7 tipos de task (`contact_client`, `maintenance`, `maintenance_management`, `project_task`, `custom_work`, `support_setup`, `support_ticket`), checklists por servicio, recurrencia (`is_recurring`/`recurrence_day`), `metadata` jsonb. Cobertura E2E sólida; código bien escrito; **pero el modelo mental se desvió de la intención original.**

En paralelo, las **notas estructuradas del cliente** ([ADR-038](./adr-038-notas-estructuradas-cliente.md)) viven en una tabla `client_notes` con 5 categorías (`conversation/solution/billing/technical/general`). Sprint 8 B.4 conectó `client_notes.task_id` para vincular notas técnicas a tareas. Pero hoy el "trabajo de dejar nota tras una acción" vive **disperso en 3 mecanismos paralelos**:

1. `Task.client_note` (campo string en la propia task) — razón humana de la tarea. Se rellena al crear.
2. `client_notes` con `task_id` — notas técnicas que el agente escribe DURANTE la task.
3. `MaintenanceLog.notes` (público, va al email) + `MaintenanceLog.internal_notes` (privado) — al cerrar mantenimiento.

Auditoría 2026-05-02 (durante revisión arquitectónica con Yasmin) detectó:

- **El sistema de tareas hace de más en lo conceptual y de menos en lo operativo.** Tiene tags + tipos flexibles + `reason` + `metadata` + recurrencia + creación manual… **pero no tiene** widget unificado en sidebar/dashboard, accionadores inline contextuales en la card de la task que deleguen en el sistema vinculado, asignador automático por carga + rol coherente, ni priorización cross-sistema declarativa. **La cara operativa que justificaba el sistema en primer lugar nunca se construyó.**
- **`task_tags` es código muerto.** Tabla M2M con endpoints CRUD existentes, cero filtros UI, cero lógica CASL los usa. Sprint 8 B.7 los introdujo para "futuras búsquedas + CASL filtering" que no llegaron.
- **3 modelos de nota solapan.** `Task.client_note`, `client_notes(task_id)` y `MaintenanceLog.internal_notes` resuelven la misma intención canónica ("trazabilidad de qué hizo el agente sobre el cliente"). Drift conceptual: cada flujo eligió el suyo.
- **El "qué es urgente" está hardcoded por listener.** El priority de la task se setea en cada creador (`SupportTicketTaskCreatorListener` mapea `conversation.priority`, `MaintenanceMonthlyService` setea `medium`, etc.) — sin regla canónica única que cruce `source_system` + tier Support Inside del cliente.
- **El bridge ticket↔task funciona en una sola dirección efectiva** (al asignar). El cierre delega bien (ADR-074 implementado), pero **NO hay widget que muestre al agente "estos son los tickets que tienes que tratar hoy ordenados por urgencia real del cliente"**. El agente sigue navegando a `/admin/support` o `/admin/tasks` indistintamente.

Yasmin formuló sin tecnicismos la intención original: *"yo quiero organizar y agilizar el flujo de trabajo del dashboard. El dashboard centra muchas de sus features en soporte y trabajos manuales de la persona que gestiona y administra. Las tareas son la cara amable y organizada del trabajo de los demás sistemas — no duplicación, agilización."*

> **¿Qué pasaría si NO tomáramos esta decisión?** Sprint 16 (refactor inevitable de tasks/notes) se construiría sin ADR canónico → cada decisión (qué tipos consolidar, qué notas migrar, qué eliminar) se tomaría en code review. Cuando llegue Sprint 12 (Settings + KB) y Sprint 22 (Projects), ambos extenderán tasks (Settings con reglas declarativas de prioridad/asignación, Projects con promoción checklist→task) **sin contrato congelado** → drift inter-sprint inevitable. Y los plugins reales del Sprint 15A-G entrarán a un dashboard con un sistema de tareas todavía sin cara operativa, multiplicando la fricción del agente justo cuando el volumen de clientes empiece a crecer. Es exactamente el antipatrón "interface emerges from implementation" que ADR-077 §"Cuándo revisar" advierte. Yasmin lo formuló: *"no quiero seguir avanzando con esta deuda, y lo que viene es muy crítico (plugins de provisioning), me quiero centrar totalmente en eso cuando llegue, en vez de pensar que tenemos que remodelar las tareas y notas"*.

---

## Opciones consideradas

### A. Status quo — dejar tasks/notes tal como están

- **Pros**: cero trabajo inmediato.
- **Contras**:
  - Drift conceptual permanente — 3 mecanismos de nota, 7 tipos de task que solapan con `source_system`, tags muertos, priorización ad-hoc por listener.
  - Sprint 12 (Settings + KB) extenderá un modelo conceptualmente roto.
  - Sprint 15A-G (plugins reales) llegarán cuando el agente todavía navegue 3 sitios distintos para ver "su trabajo".
  - La fricción operativa se multiplica con el volumen — hoy es soportable porque hay 1 cliente seedeado; con 50 clientes reales será bloqueante.
- **Descartada.**

### B. Refactor reactivo en cada sprint que toque tasks (sin ADR previo)

- Cada sprint que toca tasks o notes hace su micro-refactor.
- **Pros**: granularidad, no bloquea sprints adyacentes.
- **Contras**:
  - Sin contrato canónico → cada sprint (Sprint 12, 15A, 22) decide su parte ad-hoc.
  - Imposible documentar la doctrina ("tasks es bridge unidireccional") sin ADR; quedaría como nota dispersa que se pierde.
  - Antipatrón **B** del proyecto (descrito en ADR-070, ADR-077, ADR-078): "interface emerges from implementation".
- **Descartada.**

### C. (elegida) — ADR previo + sprint dedicado de refactor (Sprint 16)

Tres mecanismos coordinados, idénticos al patrón Sprint 11.A + 11.B:

1. **Este ADR-079** congela la doctrina canónica antes de tocar código:
   - `tasks` = bridge unidireccional read-only desde 5 triggers automáticos cerrados.
   - Sin creación manual de tasks (excepción `manual_admin` rechazada explícitamente — Yasmin: *"las tareas no quiero que se puedan crear manualmente por ahora"*).
   - Modelo de datos: 9 campos canónicos (de 16 actuales). Drop completo `task_tags`, `Task.client_note`, `MaintenanceLog.internal_notes`, `is_recurring`, `recurrence_day`, `billing_month`, `reason`, `metadata`, `title`, `description`, `created_by`.
   - Notas consolidadas en `client_notes` con `source_system` + `source_id` + `triggered_by_action` nuevos. Categorías simplificadas.
   - Auto-asignación V1 hardcoded ahora; V2 settings configurable diferida a Sprint 12.
   - Prioridad cross-sistema con regla canónica de 2 niveles (no enum complejo).
   - Promoción manual checklist→task en proyectos (Opción A descrita en §3.7).
2. **Sprint 16 dedicado** ejecuta la migración + refactor completo en una pasada, con migración Opción B (drop + reseed canónico, pre-producción según ADR-069).
3. **ADRs predecesores marcados** como superseded en las secciones específicas (ADR-041 §"Tipos canónicos", ADR-073 §"Tags M2M", ADR-038 §"Categorías"); el resto de su contenido permanece `Active`.

- **Pros**:
  - Contrato congelado antes de codear → cero refactor cross-sprint cuando lleguen Sprint 12 (Settings con reglas declarativas) y Sprint 22 (Projects con promoción checklist→task).
  - Sprint 15A-G (plugins reales) entran a un dashboard con cara operativa real (widget + asignador + accionadores inline).
  - Replica el patrón canónico del proyecto: ADR antes de código produce los mejores sprints (Sprint 8 D.0, Sprint 11.A, Sprint 11.D pre).
  - Migración Opción B aprovecha la ventana pre-producción ([ADR-069](./adr-069-estrategia-deploy-diferido.md)) — schema limpio desde el día 1.
- **Contras**:
  - Sprint 16 se inserta antes de Sprint 15A o se intercala entre 15A y 15C (~2-3 sesiones).
  - 1 migración con drop de columnas → backfill no necesario (Opción B), pero los seeds y E2E que dependen de campos viejos necesitan ajuste.
- **Elegida.**

---

## Decisión

Se elige **Opción C**. A continuación se especifica de forma exhaustiva: doctrina, modelo de datos canónico, triggers, lifecycle, priorización, asignación, accionadores inline, integración con notas, política de migración, política de extensión futura.

---

### 1. Doctrina canónica: tasks como bridge unidireccional read-only

**Las tareas son la cara organizada del trabajo del agente — no un sistema autónomo, no un Jira interno, no un gestor de proyectos genérico.**

**Tres invariantes duros:**

1. **Toda task viene de un trigger automático canónico.** No hay endpoint `POST /tasks` ni botón "crear task" en la UI. La task es el reflejo organizado de algo que ya pasó en otro sistema.
2. **La fuente de verdad es el sistema vinculado, NUNCA la task.** Si el sistema vinculado cambia (ticket pasa a `closed`, slot Support Inside se libera, proyecto se cancela), la task refleja ese cambio. Si el agente cierra la task, el cierre se delega al sistema vinculado.
3. **La task NO duplica datos del sistema vinculado**: no copia el subject del ticket, no copia la descripción del proyecto, no copia el checklist del producto. Renderiza dinámicamente en la card lo necesario consultando el sistema vinculado on-demand (con caché si aplica). Sólo persiste lo que la propia task aporta como capa transversal: `assigned_to`, `priority` calculada, `due_date` calculada, `status`.

**Consecuencia operativa:** la página `/admin/tasks` es **read-only sobre triggers**. El agente puede asignarse, completar, ejecutar accionadores inline, pero **no puede crear ni editar el "qué" de la task** — eso vive en el sistema vinculado.

---

### 2. Catálogo canónico cerrado de triggers (5)

Lista exhaustiva. Cualquier trigger nuevo requiere ADR específico.

| `source_system` | Trigger | Emisor | Cuándo se crea | Cuándo se completa | Cuándo se cancela |
|-----------------|---------|--------|----------------|---------------------|-------------------|
| `support_ticket` | `conversation.assigned` (sólo `type='ticket'`) | `SupportTicketTaskCreatorListener` (existente, ADR-074) | Asignación de un ticket a un agente | Agente cierra task → `support.updateConversation(status=resolved\|closed)` | Reasignación / unassign del ticket → si la task estaba abierta, se libera o reasigna según ADR-074 |
| `support_inside_slot` | Cron `maintenance-monthly` (diario 06:00 UTC, filtra por `anniversary_day = today`) | `MaintenanceMonthlyService` (existente, ADR-034) | Día aniversario del slot, una task por mes (idempotente UNIQUE `(service_id, billing_month, source_system)`) | Agente registra `MaintenanceLog` (existente, refactorizado) | Slot se libera ANTES de completar la task → task se cancela automáticamente (listener nuevo: `tasks-on-slot-released`) |
| `provisioning_manual` | Plugin con `capabilities.completes_via_task=true` devuelve `followUp: ['create_setup_task']` | `ProvisioningOrchestratorService` (existente, ADR-077) | Activación de un servicio que requiere setup manual del agente | Agente completa task → `ProvisioningOnTaskCompletedListener` activa el servicio (existente, ADR-077) | Servicio cancelado antes de setup → task se cancela (listener nuevo: `tasks-on-service-cancelled`) |
| `client_lifecycle` | `service.activated` del **PRIMER** servicio del cliente (helper canónico `clientsService.isFirstService(clientId)`) | Listener nuevo: `ClientLifecycleTaskCreatorListener` | Alta del primer servicio del cliente | Agente cierra task con nota obligatoria de la llamada | Cliente se da de baja antes → task se cancela |
| `project` | Promoción manual del superadmin de un item de checklist → task (ver §3.7) | Endpoint nuevo: `POST /api/v1/admin/projects/:id/checklist/:itemId/promote-to-task` | Superadmin decide externalizar un item del checklist a un agente real | Agente completa task → item del checklist se marca `completed` automáticamente | Item del checklist se elimina → task se cancela |

**Lo que NO crea task** (decisión consciente):

- `invoice.created` / `invoice.overdue` / `invoice.paid` — son notificaciones al cliente, no trabajo del agente. El equipo no actúa, el sistema actúa.
- Renovaciones automáticas, retries de cobro, suspensiones automáticas, dunning — sistema lo resuelve solo.
- `auth.account_blocked`, `auth.password_reset` — alertas operativas, no trabajo planificable.
- Errores 5xx (`system.error`, `dlq.job_failed`) — alertas a superadmin vía notification, no task.
- Conversaciones tipo `chat` (`conversation.assigned` con `type='chat'`) — el flujo es respuesta directa por mensajes, no requiere "task tracking" (ya está en ADR-074).

**Excepción `manual_admin` rechazada explícitamente.** Yasmin: *"las tareas no quiero que se puedan crear manualmente por ahora. Es sobre trabajo de ese sistema, no quiero un sistema de tareas tipo Jira"*. Si en el futuro un caso real requiere creación manual recurrente, se redacta ADR específico para añadir trigger automático nuevo (no para reabrir creación manual).

---

### 3. Especificación canónica

#### 3.1 Modelo de datos — tabla `tasks`

```prisma
enum TaskSourceSystem {
  support_ticket
  support_inside_slot
  provisioning_manual
  client_lifecycle
  project
}

enum TaskStatus {
  pending
  in_progress
  completed
  not_completed_in_time
  cancelled
}

enum TaskPriority {
  low
  medium
  high
  critical
}

model Task {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  source_system  TaskSourceSystem
  source_id      String           @db.Uuid              // ID en el sistema vinculado: conversation_id | slot_id | service_id | client_id | project_id
  client_id      String           @db.Uuid              // Cliente afectado (denormalizado para query rápida + filtros UI)
  assigned_to    String?          @db.Uuid              // null = cola pública (ADR-072 sigue vigente)
  priority       TaskPriority     @default(medium)      // Calculada al crear según helper §3.4
  status         TaskStatus       @default(pending)
  due_date       DateTime?        @db.Timestamptz()     // SLA — calculado al crear según §3.5
  completed_at   DateTime?        @db.Timestamptz()
  completed_by   String?          @db.Uuid              // Quién completó (auditoría)
  created_at     DateTime         @default(now())  @db.Timestamptz()
  updated_at     DateTime         @default(now()) @updatedAt @db.Timestamptz()

  assignee        User?         @relation("TaskAssignee", fields: [assigned_to], references: [id])
  client          User          @relation("TaskClient", fields: [client_id], references: [id])
  completer       User?         @relation("TaskCompleter", fields: [completed_by], references: [id])
  structured_notes ClientNote[] @relation("TaskClientNotes")  // Vivas vía source_system=task_completion en client_notes (§3.8)

  // Idempotencia trigger-específica:
  //   - support_inside_slot: 1 task por (slot, mes) → UNIQUE (source_system, source_id, billing_month_derived)
  //     billing_month se deriva de date_part('month' || 'year', created_at) — no es campo persistido
  //   - support_ticket: 1 task activa por ticket simultáneamente → CHECK lógico en listener (no UNIQUE en DB)
  //   - resto: cero idempotencia DB; listeners son idempotentes por construcción
  @@unique([source_system, source_id, status], name: "uniq_task_active_per_source", map: "tasks_uniq_active_per_source")
  @@index([assigned_to])
  @@index([status])
  @@index([client_id])
  @@index([source_system, source_id])
  @@index([due_date])
  @@map("tasks")
}
```

**De 16 campos a 11 campos canónicos.** Drop explícito:

| Campo eliminado | Motivo |
|-----------------|--------|
| `type` (TaskType enum 7 valores) | Reemplazado por `source_system` (5 valores). El nombre semántico cambia: ya no es "qué clase de tarea es" sino "de qué sistema viene". |
| `title` (varchar 500) | El title se renderiza dinámicamente desde el sistema vinculado (subject del ticket, "Mantenimiento mes X", "Llamada bienvenida cliente Y"). |
| `description` (text) | El "qué hay que hacer" vive en el sistema vinculado. |
| `created_by` (uuid) | Siempre será un cron/listener interno — no aporta info útil al agente. |
| `client_note` (string en task) | Desaparece. Va a `client_notes` con `source_system=task_completion` o `source_system=ticket` según el flujo. |
| `is_recurring`, `recurrence_day` | La recurrencia vive en el sistema vinculado (slot Support Inside). La task es para ESTE mes concreto. |
| `billing_month` (varchar 7) | Idem — se deriva de `created_at` cuando aplica (mantenimiento). No campo persistido. |
| `reason` (varchar 100) | No aplica — era texto humano para tasks manuales que ya no existen. |
| `metadata` (jsonb) | No aplica — no hay datos arbitrarios; el contexto vive en el sistema vinculado. |
| `service_id`, `conversation_id` (FK) | Reemplazados por `source_id` polimórfico (con `source_system` que define a qué tabla apunta). Se gana 1 columna y se pierde la integridad referencial dura — aceptado porque listeners ya validan existencia antes de crear, y los borrados en cascada se gestionan vía listeners de cancelación. |

**Tablas eliminadas:**

- `task_tags` (3 columnas + endpoints CRUD).
- `task_tag_assignments` (M2M).
- Endpoints `/api/v1/admin/task-tags/*`.
- Frontend chips de tags en card.

#### 3.2 Lifecycle canónico

```
[trigger emite evento]
        │
        ▼
[Listener canónico crea task con priority/due_date calculados]
        │
        ▼
   ┌─────────┐  agente toma de cola pública / auto-asignación V1
   │ pending │ ─────────────────────────────────────────►  pending (assigned_to poblado)
   └────┬────┘
        │ agente abre la task → marca in_progress (auto-marcado al hacer cualquier accionador inline)
        ▼
  ┌────────────────┐
  │ in_progress    │
  └────────┬───────┘
           │
   ┌───────┴────────────────┬──────────────────────────────┐
   ▼                        ▼                              ▼
[Agente completa]      [Cron tasks-overdue]      [Sistema vinculado se cancela]
   │                        │                              │
   ▼                        ▼                              ▼
completed              not_completed_in_time          cancelled
[delegación al sistema   [emit task.overdue +
 vinculado: ej. resolver  alerta agente]
 ticket, registrar
 maintenance log,
 activar service, etc.]
```

**Inmutabilidad del cierre:** una task `completed` / `cancelled` / `not_completed_in_time` no se reabre. Si el sistema vinculado cambia (ticket reabierto), se crea task NUEVA — no se reabre la vieja. Esto preserva auditoría inmutable y evita estados confusos ("¿quién cerró esto la primera vez?").

#### 3.3 Priorización canónica — regla de 2 niveles

**El enum `TaskPriority` con 4 valores se mantiene, PERO sólo `support_ticket` lo usa en la práctica.** El resto va `medium` por defecto (no es que sean medias — es que la priorización entre ellas la marca el sistema vinculado, no un enum).

**Helper canónico `calculateTaskPriority(sourceSystem, clientSITier)`** (vive en `core/tasks/priority-helper.ts`):

```typescript
export function calculateTaskPriority(
  sourceSystem: TaskSourceSystem,
  clientSITier: 'pro' | 'medium' | 'basic' | null,
): TaskPriority {
  if (sourceSystem === 'support_ticket') {
    if (clientSITier === 'pro') return 'critical';
    if (clientSITier === 'medium') return 'high';
    if (clientSITier === 'basic') return 'high';
    return 'medium'; // sin Support Inside
  }
  // Resto de sistemas: orden no marcado por priority sino por due_date / FIFO.
  return 'medium';
}
```

**Regla de orden canónica del listado `/admin/tasks`** (helper `core/tasks/list-ordering.ts`):

```
1. Tasks vencidas (status=not_completed_in_time) en banner rojo arriba del todo.
2. Tickets primero, en bloque, ordenados por:
   - tier SI del cliente (Pro > Medium > Basic > sin SI)
   - dentro de cada tier, por antigüedad (más viejo primero — first-in-first-out dentro del tier)
3. Resto de tasks debajo, agrupadas por source_system con orden interno:
   - support_inside_slot: por anniversary_day del slot (ascendente)
   - provisioning_manual: FIFO por created_at
   - client_lifecycle: FIFO por created_at (con due_date = +24-48h calculado al crear)
   - project: FIFO por created_at
```

**Por qué esta regla y no `priority DESC, due_date ASC` puro:** la priorización por enum funciona dentro de cada bloque pero no cross-bloque (un mantenimiento mensual con `due_date` mañana NO es "menos urgente" que un ticket SI Pro de hoy — son trabajos distintos). Agrupar por sistema preserva la coherencia operativa: el agente ve todos los tickets de hoy juntos, todos los mantenimientos del día juntos, etc.

**Cuándo migrar a settings configurables (V2):** Sprint 12 (Settings + KB). El helper `calculateTaskPriority` se sustituye por lectura del `tasks.priority_rules` setting (jsonb con mapping `source_system × clientSITier → priority`). Misma firma input/output → cero refactor del resto del sistema.

#### 3.4 Auto-asignación V1 — hardcoded por rol + carga

**Helper canónico `autoAssignTask(task)`** (vive en `core/tasks/auto-assign.ts`). Se ejecuta al CREAR la task desde el listener; si el agente disponible no existe (todos los roles vacíos), la task queda en cola pública (`assigned_to=null`).

```typescript
const ROLES_BY_SOURCE: Record<TaskSourceSystem, RoleSlug[]> = {
  support_ticket:        ['agent_support', 'agent_full'],
  support_inside_slot:   ['agent_support', 'agent_full'],
  provisioning_manual:   ['agent_support', 'agent_full'],
  client_lifecycle:      ['agent_support', 'agent_full', 'agent_billing'],  // bienvenida la puede hacer cualquier agente
  project:               [],  // sin auto-asignación; cola pública para que superadmin asigne
};

export async function autoAssignTask(prisma, task): Promise<string | null> {
  const eligibleRoles = ROLES_BY_SOURCE[task.source_system];
  if (eligibleRoles.length === 0) return null;

  // SELECT id FROM users
  // WHERE role.slug IN (eligibleRoles) AND status='active'
  // ORDER BY (count of tasks WHERE assigned_to=user.id AND status IN ('pending', 'in_progress')) ASC,
  //          random() ASC  -- desempate justo
  // LIMIT 1;
  const candidate = await prisma.$queryRaw`...`;
  return candidate?.id ?? null;
}
```

**"Menor carga" canónico:** count de tasks con `status IN ('pending', 'in_progress')` asignadas al agente. Cuando empate, desempate aleatorio (no por orden alfabético — evita sesgo sistemático).

**Casos especiales documentados:**

- **`support_ticket`**: el ticket VIENE asignado al agente desde el módulo support (auto-asignación de support, no de tasks). El listener `SupportTicketTaskCreatorListener` hereda `assigned_to` del ticket directamente, NO invoca `autoAssignTask` (excepción documentada — el sistema vinculado ya tomó la decisión).
- **`project`**: cola pública pura. El superadmin asigna manualmente cuando promueve un item de checklist a task (§3.7). `autoAssignTask` devuelve `null`.

**Migración V2 (Sprint 12):** el mapping `ROLES_BY_SOURCE` y la fórmula de "menor carga" se mueven a settings (`tasks.auto_assign_rules` jsonb). Misma firma → cero refactor.

#### 3.5 SLA canónico — `due_date` calculado al crear

**Helper canónico `calculateTaskDueDate(sourceSystem, clientSITier, createdAt)`** (vive en `core/tasks/sla-helper.ts`):

```typescript
export function calculateTaskDueDate(
  sourceSystem: TaskSourceSystem,
  clientSITier: 'pro' | 'medium' | 'basic' | null,
  createdAt: Date,
): Date | null {
  switch (sourceSystem) {
    case 'support_ticket': {
      // SLA según tier SI (canónico ADR-061)
      const hoursMap = { pro: 4, medium: 12, basic: 24 };
      const hours = clientSITier ? hoursMap[clientSITier] : 24;
      return addHours(createdAt, hours);
    }
    case 'support_inside_slot': {
      // El slot tiene anniversary_day; el cron crea la task ese día.
      // SLA = fin del día (23:59 UTC del mismo día) — el agente tiene la jornada para completarlo.
      return endOfDay(createdAt);
    }
    case 'provisioning_manual': {
      // Setup manual: SLA estándar 24h.
      return addHours(createdAt, 24);
    }
    case 'client_lifecycle': {
      // Bienvenida primer servicio: 48h (ADR canónico — cliente nuevo no se siente abandonado).
      return addHours(createdAt, 48);
    }
    case 'project': {
      // Sin SLA — los proyectos son trabajo de fondo, due_date queda null.
      return null;
    }
  }
}
```

**Cron `tasks-overdue` (existente, BullMQ scheduled `0 2 * * *` UTC) sigue intacto** — ya respeta `due_date != null AND due_date < now() AND status IN ('pending', 'in_progress')`. Los proyectos (sin `due_date`) quedan fuera por construcción.

#### 3.6 Card de task — diseño canónico

**Una sola línea visible + 1 línea de contexto + accionadores inline.** Sin tabs, sin pestañas, sin secciones expandibles dentro de la card.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🎫 Ticket Support  [SI Pro]  · Carla Fernández · hace 2h · vence 2h  │
│  "Email no envía desde el panel"                                       │
│  [Resolver]  [Cerrar]                          [Abrir ticket completo →]│
└─────────────────────────────────────────────────────────────────────────┘
```

**Reglas de renderizado:**

| Elemento | Comportamiento |
|----------|----------------|
| **Icono + label sistema** | Mapeo canónico (en `frontend/app/_shared/tasks/source-labels.ts`): `🎫 Ticket Support`, `🔧 Mantenimiento mensual`, `📞 Llamada bienvenida`, `⚙️ Setup servicio`, `📁 Proyecto` |
| **Badge SI** | Solo aparece si `source_system='support_ticket'` Y cliente tiene SI activo. Color: Pro=dorado, Medium=plateado, Basic=neutro. Texto: `[SI Pro]`, `[SI Medium]`, `[SI Basic]` |
| **Cliente** | Nombre + apellido. Click → `/admin/clients/[id]` |
| **Edad de la task** | `hace 2h` (relativo desde `created_at`) |
| **SLA visual** | `vence 2h` con color: verde (>50% restante), amarillo (20-50%), rojo (<20% o vencido) |
| **Línea de contexto** | Subject del ticket / "Mantenimiento octubre 2026" / Nombre del proyecto / Producto del setup. **Truncada a 80 chars con ellipsis.** |
| **Accionadores inline** | Lista cerrada según `source_system` (§3.6.1). Máximo 3 botones inline + 1 CTA "Abrir [sistema] completo →" |

##### 3.6.1 Accionadores inline canónicos por `source_system`

**Listado cerrado por sistema. Cada accionador delega 100% en el servicio del sistema vinculado — cero duplicación de lógica.**

| Sistema | Accionadores inline | Delegación canónica | CTA "abrir completo" |
|---------|---------------------|---------------------|---------------------|
| `support_ticket` | `Resolver` (cierra como `resolved` con nota), `Cerrar` (cierra como `closed` con nota) | `support.updateConversation(id, status, internal_note)` (existente) | `/admin/support/conversations/[id]` |
| `support_inside_slot` | `Completar mantenimiento` (abre modal `MaintenanceLogModal` con checklist + nota) | `MaintenanceLogService.recordCompletion()` (existente, refactorizado §4.3) | `/admin/clients/[clientId]/services/[serviceId]` |
| `provisioning_manual` | `Marcar setup completado` (abre modal con nota) | `ProvisioningOnTaskCompletedListener` activación (existente) | `/admin/services/[serviceId]` |
| `client_lifecycle` | `Marcar como contactado` (abre modal con nota obligatoria de la llamada) | Crea `client_notes` con `source_system=client_lifecycle` + marca task `completed` | `/admin/clients/[clientId]` |
| `project` | `Marcar item completado` (cierra task + marca item del checklist del proyecto como `completed`) | Listener `tasks-on-project-task-completed` (nuevo) → `ProjectsService.markChecklistItemCompleted()` | `/admin/projects/[projectId]` |

**Regla canónica:** los accionadores son **los 1-3 más usados por dominio**. Cualquier acción avanzada (re-abrir ticket, editar checklist del proyecto, ver historial completo, transferir a otro agente) **NO se replica como accionador inline** — el agente usa el CTA "Abrir completo →" para esas operaciones avanzadas.

**Cuando llegue trigger nuevo (ADR específico):** define qué accionadores inline tiene su card. La doctrina es: *"si necesitas más de 3 accionadores inline para un sistema, eso es señal de que la card no es la herramienta — el agente debe ir al sistema completo"*.

#### 3.7 Promoción checklist→task en proyectos (Sprint 22 dependiente)

**Aplicable cuando exista módulo `project` (Sprint 22).** Doctrina canónica congelada aquí para que el módulo nazca alineado.

**Modelo:**

- `Project` tiene `ProjectChecklist[]` con `ProjectChecklistItem[]` (orden, etiqueta, completed_at, **`assigned_to_task_id` nullable**).
- Worker IA (OpenClaw, futuro) ejecuta items SIN crear task — marca `completed_at` directamente. La task es para trabajo del agente humano.
- Superadmin abre `/admin/projects/[id]` → ve checklist → click "Promover a task" sobre item → endpoint `POST /api/v1/admin/projects/:id/checklist/:itemId/promote-to-task`:
  1. Crea task con `source_system='project'`, `source_id=projectId`, `assigned_to=<agente seleccionado en modal>`, `priority='medium'`, `due_date=null` (proyectos sin SLA).
  2. Setea `ProjectChecklistItem.assigned_to_task_id = task.id`.
  3. Item del checklist se renderiza en UI del proyecto como "Delegado a agente X" con link a la task.
- Cuando agente completa la task → listener `tasks-on-project-task-completed` marca `ProjectChecklistItem.completed_at = now()` y opcionalmente notifica al cliente si el proyecto tiene `notify_on_milestone`.

**Por qué Opción A (promoción explícita) y no Opción B (assignable inline en checklist):**

- Mantiene la pureza: checklists = trabajo automatizable o secuencia interna del proyecto. Tasks = trabajo del equipo.
- La promoción es un acto consciente del superadmin → trazabilidad clara de "cuándo se decidió externalizar este item a agente real".
- Worker IA ejecuta items directos sin pasar por tasks → no contamina la lista del agente.
- Si en el futuro se necesita mass-promote (ej. proyecto con 10 items todos para agentes), eso será endpoint adicional `POST /admin/projects/:id/checklist/promote-all-to-tasks` — extensión limpia.

#### 3.8 Notas — consolidación canónica en `client_notes`

**Una sola tabla de notas, todas las acciones del agente sobre el cliente quedan registradas con source tracking.**

```prisma
enum NoteCategory {
  support             // notas de tickets/chats
  maintenance         // notas de mantenimientos
  onboarding          // notas de bienvenida / primer servicio
  billing             // notas relacionadas con facturación / pagos
  project             // notas de proyectos
  technical_incident  // notas de incidentes técnicos del cliente
  exceptional         // nota libre del agente desde perfil cliente, sin actuador
}

enum NoteSourceSystem {
  ticket              // ticket cerrado/resolved → nota
  chat                // mensaje interno en chat (futuro, no Sprint 16)
  maintenance_log     // mantenimiento completado
  task_completion     // task completada (cubre client_lifecycle, project promotion, etc.)
  exceptional         // nota libre desde perfil cliente
}

model ClientNote {
  id                    String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id               String              @db.Uuid    // Cliente al que pertenece
  author_id             String              @db.Uuid    // Staff que escribió
  category              NoteCategory
  body                  String              @db.Text
  source_system         NoteSourceSystem    // De qué sistema viene la nota
  source_id             String?             @db.Uuid    // ID en el sistema vinculado (ticket_id, slot_id, task_id, project_id) — null para exceptional
  triggered_by_action   String?             @db.VarChar(100)  // Acción que disparó la nota: 'ticket.resolved', 'ticket.closed', 'task.completed', 'maintenance.completed', 'manual_entry'
  is_pinned             Boolean             @default(false)
  created_at            DateTime            @default(now()) @db.Timestamptz()

  user                  User                @relation("ClientNoteUser", fields: [user_id], references: [id])
  author                User                @relation("ClientNoteAuthor", fields: [author_id], references: [id])
  task                  Task?               @relation("TaskClientNotes", fields: [source_id], references: [id], onDelete: SetNull, map: "fk_clientnote_task_optional")
  // Nota: la FK a Task es opcional — solo aplica cuando source_system='task_completion'.
  // Para otros source_system, source_id apunta a entidades distintas (Conversation, Slot, Project)
  // sin FK formal — validación a nivel de listener.

  @@index([user_id, created_at(sort: Desc)])
  @@index([author_id])
  @@index([source_system, source_id])
  @@index([category])
  @@map("client_notes")
}
```

**Cambios sobre el schema actual:**

| Cambio | Tipo |
|--------|------|
| Renombrado enum `NoteCategory`: nuevos valores `support`, `maintenance`, `onboarding`, `billing`, `project`, `technical_incident`, `exceptional`. | breaking |
| Eliminados valores: `conversation`, `solution`, `general`, `technical` (mapping de migración: `conversation→support`, `solution→support`, `technical→technical_incident`, `general→exceptional`, `billing→billing`). | breaking |
| Añadido enum `NoteSourceSystem` con 5 valores. | nuevo |
| Añadido campo `source_system` (NOT NULL, con default `'exceptional'` en migración para backfill). | nuevo |
| Añadido campo `source_id` (nullable, sin FK dura excepto opcional a Task). | nuevo |
| Añadido campo `triggered_by_action` (nullable, varchar 100). | nuevo |
| Eliminados campos `conversation_id`, `task_id` directos (reemplazados por `source_id` polimórfico). | breaking |
| Índices nuevos: `(source_system, source_id)`, `category`. | nuevo |

**Lo que esto elimina del modelo actual:**

- `Task.client_note` (campo string en task) — **eliminado**. La razón humana de la task ya no se persiste en la task; si el agente quiere dejar contexto al crearse una task automática, ese contexto vive en el sistema vinculado (ticket subject, project description, etc.).
- `MaintenanceLog.internal_notes` (campo en `maintenance_logs`) — **eliminado**. Va a `client_notes` con `source_system='maintenance_log'` + `triggered_by_action='maintenance.completed'`.
- `MaintenanceLog.notes` (campo público que va al email) — **PERMANECE**. Es contenido del email al cliente, no nota interna. Naming clarificado: renombrado a `client_facing_notes` para evitar confusión.

#### 3.9 Nota obligatoria al completar — regla canónica

**Cuando una task se completa con `client_id` poblado, EL MODAL DE COMPLETAR EXIGE NOTA OBLIGATORIA**, salvo que el sistema vinculado ya capturó nota suficiente:

| `source_system` | Nota obligatoria al completar | Categoría asignada |
|-----------------|-------------------------------|--------------------|
| `support_ticket` | NO (el modal "Resolver/Cerrar ticket" del módulo support ya pide `internal_note`; ese campo va a `client_notes` directamente con `source_system='ticket'`) | `support` |
| `support_inside_slot` | NO (el modal "Completar mantenimiento" ya pide nota; va a `client_notes` con `source_system='maintenance_log'`) | `maintenance` |
| `provisioning_manual` | SÍ (el modal de "Marcar setup completado" pide nota → `client_notes` con `source_system='task_completion'`) | `support` |
| `client_lifecycle` | SÍ (el modal de "Marcar contactado" pide nota obligatoria de la llamada → `client_notes`) | `onboarding` |
| `project` | SÍ (el modal "Marcar item completado" pide nota explicando qué se hizo → `client_notes`) | `project` |

**Regla canónica:** *"si el agente actúa significativamente sobre algo del cliente, queda nota. Si el sistema vinculado ya tiene su propio mecanismo de nota canónico, se delega allí."*

**Excepciones documentadas:**

- **Cancelación de task:** NO exige nota. La cancelación normalmente viene de cancelación del sistema vinculado (slot liberado, servicio cancelado) — la nota correspondiente la captura el evento de cancelación si aplica.
- **`status='not_completed_in_time'`** (cron): NO crea nota. La task vencida es un fallo operativo, no una acción del agente.

#### 3.10 Permisos CASL canónicos (refina §3 de matrix.md)

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|:---------:|:----------:|:-------------:|:-------------:|:------:|:-------:|
| `Task` | Manage (todas) | Read+Update (own + cola pública) | Read+Update (own) | Read+Update (own) | — | — |
| `ClientNote` | Manage | Manage | Read+Create+List | Read+Create+List | — | — |
| `ProjectChecklistItem` (Sprint 22) | Manage + promote | Read | — | — | — | — |

**Reglas derivadas:**

- **`Task.Update` (own)**: el agente puede asignarse de cola pública, completar, cancelar. NO puede reasignar a otro agente.
- **`Task.Manage` (superadmin)**: puede reasignar entre agentes, ver todas las tasks (toggle "Ver todas"), forzar completar/cancelar.
- **`ClientNote.Create`** lo tienen todos los staff porque cualquier acción del agente puede generar nota. La creación va siempre vía listener / modal de completar; no hay endpoint `POST /client-notes` libre salvo el de "nota excepcional" (`source_system='exceptional'`) restringido a `Manage.ClientNote` para evitar spam.

#### 3.11 Widget sidebar + dashboard staff

**Sidebar (todos los portales staff `/admin`):**

- Item "Tareas" en sidebar lleva badge numérico con count de tasks `assigned_to=current_user AND status IN ('pending', 'in_progress')`.
- Color del badge: rojo si hay vencidas, naranja si alguna vence en <2h, neutro resto.

**Dashboard `/admin` (página inicio staff):**

- Widget "Tu trabajo de hoy" en posición prominente (top de la página).
- Muestra **5 tasks top** del agente ordenadas por la regla canónica §3.3.
- Cada task = card simplificada (sin accionadores inline; el click va a `/admin/tasks?focus=<id>`).
- Footer del widget: "Ver todas las tareas →" → `/admin/tasks`.

**Superadmin extra:** widget "Tareas del equipo" debajo del personal con resumen agregado por agente (count + p95 SLA).

---

### 4. Migración canónica — Opción B (drop + reseed)

**Ventana pre-producción ([ADR-069](./adr-069-estrategia-deploy-diferido.md)) permite migración limpia sin backfill.** Yasmin: *"opción B, como no estamos en producción eso no importa ahora, lo que haya en la BD"*.

#### 4.1 Migración Prisma `sprint16_tasks_notes_refactor`

```sql
-- Tasks: drop schema viejo + recrear canónico
DROP TABLE IF EXISTS task_tag_assignments CASCADE;
DROP TABLE IF EXISTS task_tags CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;  -- Datos seed son de prueba; reseed canónico tras migración

CREATE TYPE "TaskSourceSystem" AS ENUM (
  'support_ticket', 'support_inside_slot', 'provisioning_manual',
  'client_lifecycle', 'project'
);

-- TaskStatus + TaskPriority enums permanecen idénticos.
DROP TYPE IF EXISTS "TaskType";  -- 7 valores viejos eliminados.

CREATE TABLE tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system   "TaskSourceSystem" NOT NULL,
  source_id       uuid NOT NULL,
  client_id       uuid NOT NULL REFERENCES users(id),
  assigned_to     uuid REFERENCES users(id),
  priority        "TaskPriority" NOT NULL DEFAULT 'medium',
  status          "TaskStatus" NOT NULL DEFAULT 'pending',
  due_date        timestamptz,
  completed_at    timestamptz,
  completed_by    uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tasks_uniq_active_per_source
  ON tasks (source_system, source_id) WHERE status IN ('pending', 'in_progress');
CREATE INDEX tasks_assigned_to_idx ON tasks (assigned_to);
CREATE INDEX tasks_status_idx ON tasks (status);
CREATE INDEX tasks_client_id_idx ON tasks (client_id);
CREATE INDEX tasks_source_idx ON tasks (source_system, source_id);
CREATE INDEX tasks_due_date_idx ON tasks (due_date);

-- ClientNote: drop schema viejo + recrear canónico
DROP TABLE IF EXISTS client_notes CASCADE;
DROP TYPE IF EXISTS "NoteCategory";

CREATE TYPE "NoteCategory" AS ENUM (
  'support', 'maintenance', 'onboarding', 'billing', 'project',
  'technical_incident', 'exceptional'
);
CREATE TYPE "NoteSourceSystem" AS ENUM (
  'ticket', 'chat', 'maintenance_log', 'task_completion', 'exceptional'
);

CREATE TABLE client_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id),
  author_id             uuid NOT NULL REFERENCES users(id),
  category              "NoteCategory" NOT NULL,
  body                  text NOT NULL,
  source_system         "NoteSourceSystem" NOT NULL,
  source_id             uuid,
  triggered_by_action   varchar(100),
  is_pinned             boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_notes_user_created_idx ON client_notes (user_id, created_at DESC);
CREATE INDEX client_notes_author_idx ON client_notes (author_id);
CREATE INDEX client_notes_source_idx ON client_notes (source_system, source_id);
CREATE INDEX client_notes_category_idx ON client_notes (category);

-- MaintenanceLog: drop campo internal_notes (va a client_notes); rename notes a client_facing_notes
ALTER TABLE maintenance_logs DROP COLUMN IF EXISTS internal_notes;
ALTER TABLE maintenance_logs RENAME COLUMN notes TO client_facing_notes;
```

#### 4.2 Reseed canónico

`backend/prisma/seeds/sample-tasks.ts` (sustituye al seed actual): no genera tasks demo (no son necesarias en estado limpio — los triggers las crearán cuando se ejerciten flujos reales). Los E2E de tasks generan sus propias tasks dentro del spec.

`backend/prisma/seeds/sample-client-notes.ts` (nuevo): genera 2 notas demo para Carla (una `source_system=ticket`, una `source_system=exceptional`) para que la UI tenga datos al hacer smoke testing.

#### 4.3 Código backend — refactor

| Archivo | Cambio |
|---------|--------|
| `backend/prisma/schema.prisma` | Aplicar §3.1 + §3.8 |
| `backend/src/modules/tasks/tasks.service.ts` | Reducir de 740 → ~250 LOC. Eliminar: `create()` manual, `update()` libre, `setReason()`, todos los métodos relacionados con tags/recurrencia. Mantener: `assign()`, `complete()`, `cancel()`, `findOne()`, `findAll()` con la nueva regla de orden §3.3 |
| `backend/src/core/tasks/priority-helper.ts` (nuevo) | §3.3 |
| `backend/src/core/tasks/auto-assign.ts` (nuevo) | §3.4 |
| `backend/src/core/tasks/sla-helper.ts` (nuevo) | §3.5 |
| `backend/src/core/tasks/list-ordering.ts` (nuevo) | §3.3 regla 2 niveles |
| `backend/src/modules/tasks/tasks.controller.ts` | Eliminar `POST /tasks` manual. Eliminar `PATCH /tasks/:id` libre (solo permitidos: `assign`, `complete`, `cancel`). Endpoints simplificados |
| `backend/src/modules/tasks/dto/task.dto.ts` | Reducir a `AssignTaskDto`, `CompleteTaskDto` (con `note?` opcional según regla §3.9), `CancelTaskDto`, `TaskListQueryDto` |
| `backend/src/modules/tasks/task-tags.{controller,service,spec}.ts` | **Eliminar** (3 archivos completos) |
| `backend/src/modules/tasks/dto/task-tag.dto.ts` | **Eliminar** |
| `backend/src/modules/tasks/dto/task-note.dto.ts` | **Eliminar** (la creación de nota es atómica con `complete()`, no endpoint dedicado) |
| `backend/src/modules/tasks/task-notes.service.ts` | **Eliminar** (lógica absorbida por `client-notes.service.ts` consolidado) |
| `backend/src/modules/tasks/listeners/support-ticket-task-creator.listener.ts` | Refactor: usa `source_system='support_ticket'` + `source_id=conversation_id` + `autoAssignTask` returns ticket's assigned_agent_id (no recalcula) |
| `backend/src/modules/support-inside/crons/maintenance-monthly.service.ts` | Refactor: crea task con `source_system='support_inside_slot'` + `source_id=slot_id` + `client_id=slot.subscription.client_id` |
| `backend/src/modules/provisioning/listeners/provisioning-on-task-completed.listener.ts` | Refactor: filtra por `source_system='provisioning_manual'` (en lugar de `task.type='support_setup'`) |
| `backend/src/modules/clients/listeners/client-lifecycle-task-creator.listener.ts` (nuevo) | Listen `service.activated`; helper `isFirstService(client_id)`; crea task `source_system='client_lifecycle'` |
| `backend/src/modules/tasks/listeners/tasks-on-slot-released.listener.ts` (nuevo) | Listen `support_inside.slot_released`; cancela task pendiente con `source_id=slot_id` |
| `backend/src/modules/tasks/listeners/tasks-on-service-cancelled.listener.ts` (nuevo) | Listen `service.cancelled`; cancela task `source_system='provisioning_manual'` con `source_id=service_id` |
| `backend/src/modules/clients/client-notes.service.ts` (nuevo, absorbe `task-notes.service`) | Gestión consolidada `client_notes`. Métodos: `createFromTaskCompletion()`, `createFromTicketCompletion()`, `createFromMaintenanceCompletion()`, `createExceptional()`, `findByClient()`, `togglePin()` |
| `backend/src/modules/tasks/maintenance-log.service.ts` | Refactor: `recordCompletion()` ya NO crea ClientNote directamente; delega en `clientNotesService.createFromMaintenanceCompletion()`. `internal_notes` del DTO → `client_notes`; `notes` del DTO → `MaintenanceLog.client_facing_notes` |
| `backend/src/core/casl/permissions.ts` | Aplicar §3.10. Eliminar Subject `TaskTag` |

#### 4.4 Código frontend — refactor

| Archivo | Cambio |
|---------|--------|
| `frontend/app/admin/tasks/page.tsx` | Reescribir con nueva regla de orden §3.3. Sin tabs scope (mías/sin/todas) — vista única + toggle superadmin |
| `frontend/app/admin/tasks/NewTaskModal.tsx` | **Eliminar** (no hay creación manual) |
| `frontend/app/admin/tasks/TaskTable.tsx` | Reemplazar por `TaskCard.tsx` (card §3.6) + listado vertical agrupado por bloques §3.3 |
| `frontend/app/admin/tasks/[id]/page.tsx` | Simplificar — solo info de la task + accionadores inline + CTA al sistema vinculado. Sin edición libre |
| `frontend/app/_shared/tasks/source-labels.ts` (nuevo) | Mapeo icono+label por `source_system` |
| `frontend/app/_shared/tasks/TaskCard.tsx` (nuevo) | Card canónica §3.6 |
| `frontend/app/_shared/tasks/CompleteTaskModal.tsx` (nuevo) | Modal con nota obligatoria condicional §3.9 |
| `frontend/app/_shared/widgets/TasksWidget.tsx` (nuevo) | Widget dashboard §3.11 |
| `frontend/app/_shared/shell/Sidebar.tsx` | Añadir badge numérico al item "Tareas" §3.11 |
| `frontend/app/admin/page.tsx` | Insertar `<TasksWidget />` en top de la página |
| `frontend/app/admin/clients/[id]/ClientNotesTab.tsx` | Ajustar a nuevo schema (`source_system` + `triggered_by_action` mostrados; filtros por `category` actualizados) + botón "Añadir nota excepcional" → modal `ExceptionalNoteModal` |
| `frontend/app/_shared/notes/ExceptionalNoteModal.tsx` (nuevo) | Modal para nota libre del agente desde perfil cliente |

#### 4.5 Tests — refactor

- `backend/src/modules/tasks/tasks.service.spec.ts`: reescribir según nuevo modelo (eliminar tests de manual creation, tags, recurrencia; añadir tests de `autoAssignTask` y `calculateTaskPriority`).
- E2E `tests/e2e/tasks.spec.ts`: ajustar a nuevo flujo (sin POST manual; flujo es siempre vía trigger).
- E2E `tests/e2e/tasks-crons.spec.ts`: mantener (los crons de overdue/critical no cambian de lógica, solo de campos consultados).
- E2E nuevo `tests/e2e/client-lifecycle-welcome-task.spec.ts`: cliente nuevo paga primer servicio → task `client_lifecycle` aparece para agente → completar con nota → verificar `client_notes` row.
- E2E `tests/e2e/support-inside.spec.ts`: ajustar mantenimiento mensual (notas van a `client_notes` no a `maintenance_logs.internal_notes`).
- E2E `tests/e2e/notes.spec.ts` (nuevo): cobertura del flujo notas (crear desde 5 source_systems + nota excepcional + listado con filtros).

---

### 5. Política de extensión — cuándo abrir trigger nuevo

**Catálogo de 5 triggers cerrado por este ADR.** Para añadir un trigger nuevo:

1. ADR específico que justifique por qué el caso requiere "trabajo del agente que se debe trackear" y por qué los 5 existentes no lo cubren.
2. Añadir valor al enum `TaskSourceSystem` (migración Prisma).
3. Añadir entrada al mapeo `ROLES_BY_SOURCE` en `auto-assign.ts`.
4. Añadir cálculo de `priority` y `due_date` para el nuevo `source_system` en helpers.
5. Añadir entrada al mapeo `source-labels.ts` frontend (icono + label).
6. Añadir accionadores inline canónicos para la card.
7. Implementar listener creador + listener cancelador (si aplica).
8. Tests unit del listener + E2E del flujo.

**Triggers candidatos previsibles** (no son compromiso, sólo memoria):

| Candidato | Justificación previsible | Cuándo se evaluará |
|-----------|-------------------------|---------------------|
| `partner_request` | Sprint 19 (Partner Module): partner solicita acción al equipo Aelium sobre uno de sus clientes. | Sprint 19 |
| `kb_article_review` | Sprint 12 (KB): cuando un artículo de KB lleva >6 meses sin actualizar, crear task de revisión. | Sprint 12 (KB) si hay volumen real |
| `compliance_review` | Sprint dedicado RGPD: revisión periódica de retención/anonymización. | Cuando se aborde sprint RGPD |

---

### 6. Política de versionado del contrato `tasks/notes`

- **v1** (este ADR) es la versión canónica fijada hoy. Estable hasta nuevo ADR.
- Cambios **compatibles hacia atrás** (añadir trigger nuevo, añadir categoría de nota, añadir accionador inline a card existente) se documentan como amendment a este ADR (sección "Amendments" al final). NO bumpean a v2.
- Cambios **breaking** (eliminar `source_system`, cambiar el modelo a sub-tasks, reabrir creación manual) requieren ADR-NNN nuevo + migración.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Doctrina canónica congelada** antes de Sprint 16 → cero ambigüedad en code review.
  - **Modelo simple y robusto:** 11 campos en `tasks` (vs 16), 5 `source_system` (vs 7 `type`), zero código muerto (`task_tags` eliminado).
  - **Cara operativa real**: widget sidebar/dashboard + accionadores inline + asignador automático = lo que justificaba el sistema en primer lugar.
  - **Notas consolidadas con source tracking**: trazabilidad completa de "qué hizo el agente sobre el cliente y desde qué sistema" — exactamente la visión Yasmin.
  - **Sprint 12 (Settings + KB)** entra a un sistema preparado: helpers de prioridad/asignación tienen mismo input/output → migración a settings configurables = cero refactor.
  - **Sprint 22 (Projects)** nace alineado: doctrina checklist→task promotion fija desde hoy.
  - **Sprint 15A-G (plugins reales)** entran a un dashboard con flujo del agente unificado.
  - **Migración Opción B aprovecha ADR-069**: schema limpio sin debt legacy.
- ⚠️ **Aceptamos:**
  - **Sprint 16 inserta ~2-3 sesiones** entre Sprint 11 y Sprint 15A. Decisión consciente: la fricción operativa actual del sistema de tareas crece con el volumen de clientes, refactorizar antes de plugins reales es más barato que después.
  - **Drop + reseed pierde datos demo** (acceptable pre-producción, ADR-069).
  - **5 ADRs predecesores marcados parcialmente superseded** (ADR-041, 072, 073, 074, 038) — secciones específicas; el resto permanece `Active`. Genera complejidad de lectura ("¿qué parte de ADR-041 sigue vigente?") — mitigación: cada ADR predecesor lleva header explícito apuntando a §superseded.
  - **Auto-asignación V1 es hardcoded** — V2 (settings configurables) llega en Sprint 12. ~4-6 semanas de gap.
- 🚪 **Cierra:**
  - **No tasks manuales** salvo trigger automático canónico.
  - **No tags en tasks** — el `source_system` ya da la "categoría".
  - **No 3 mecanismos de nota** — solo `client_notes` con source tracking.
  - **No descripción libre en task** — el "qué hay que hacer" vive en el sistema vinculado.
  - **No reabrir tasks** — completed/cancelled/not_completed_in_time son terminales; reabrir = nueva task.
  - **No sub-tasks de tasks** — si se necesita anidación, eso es proyectos+checklists (Sprint 22).
  - **No `if (source_system === 'X')` en frontend** salvo en helpers canónicos centralizados (`source-labels.ts`, accionadores inline).

---

## Cuándo revisar

- **Si Sprint 12 implementa settings configurables y descubre que el helper `calculateTaskPriority` no es flexible suficiente** (ej. necesita reglas por hora del día, por estación, por agente concreto): añadir amendment a este ADR si compatible; ADR nuevo si breaking.
- **Si Sprint 22 (Projects) descubre que la promoción Opción A (explícita) genera fricción real** (ej. proyectos con 50+ items que el superadmin no quiere promover uno a uno): considerar mass-promote endpoint o evaluar Opción B (assignable inline en checklist).
- **Si llega un caso real recurrente de "necesito crear task manual"** (ej. el superadmin pide constantemente "task ad-hoc para investigar incidente X"): NO reabrir creación manual; redactar ADR-NNN para añadir trigger automático que cubra el caso (ej. `incident_investigation` desde `error-log`).
- **Si surge un partner externo (Sprint 19) que necesita ver/crear tasks de sus clientes**: revisar §3.10 permisos (añadir `partner_scoped` a `Task`) o ADR específico.
- **Si el volumen de tasks supera 10k/mes**: revisar índices y considerar particionado por `created_at` o archivado periódico.
- **Si el helper `autoAssignTask` con "menor carga + random desempate" produce sesgos detectados** (ej. siempre asigna al mismo agente porque otros tienen permanente bug que les deja tasks colgadas): añadir métricas + ajustar fórmula.
- **Si Yasmin decide más adelante que sí necesita tags por motivos no anticipados hoy** (ej. para filtrar tasks por tema: "todas las relacionadas con SSL"): añadir tabla nueva `task_labels` (NO `task_tags`, naming distinto para no confundir con la versión eliminada) con ADR específico.

---

## Referencias

- **Módulos afectados:**
  - `tasks` — refactor masivo (servicio, controllers, listeners, DTOs, frontend).
  - `clients` — `client-notes.service.ts` consolidado + `client-lifecycle-task-creator.listener.ts` nuevo.
  - `support-inside` — `MaintenanceMonthlyService` adaptado al nuevo schema.
  - `provisioning` — `ProvisioningOnTaskCompletedListener` adaptado.
  - `support` — `support-ticket-task-creator.listener.ts` adaptado.
  - `core/tasks/*` — nuevos helpers (priority, auto-assign, sla, list-ordering).
  - `core/casl/permissions.ts` — eliminar Subject `TaskTag`, refinar `Task` y `ClientNote`.
- **Reglas relacionadas:**
  - [R1](../00-foundations/rules.md) — módulos por eventos. El refactor preserva R1 (todos los triggers son listeners).
  - [R3](../00-foundations/rules.md) — audit log inmutable. Las tasks completed/cancelled no se reabren (analogía).
  - [R7](../00-foundations/rules.md) — manejo de errores. Las cancelaciones por sistema vinculado ausente loguean warn + no crashean.
  - [R15](../00-foundations/rules.md) — tamaño de archivos. `tasks.service.ts` baja de 740 → ~250 LOC.
- **ADRs predecesores (parcialmente superseded por este):**
  - [ADR-041](./adr-041-sistema-tareas.md) — sistema de tareas v1. **Supersede** §"Tipos canónicos" (los 7 tipos pasan a 5 `source_system`) + §"Creación manual" (eliminada). El resto (lifecycle, asignación, eventos básicos) permanece `Active`.
  - [ADR-072](./adr-072-tareas-sin-asignar-cola-publica.md) — cola pública con SLA. **Refina** §"Cola pública" (sigue existiendo pero gestionada por `autoAssignTask` que devuelve null cuando no hay candidato).
  - [ADR-073](./adr-073-tipos-flexibles-tasks-reason-tags.md) — tipos flexibles + reason + tags. **Supersede** §"Tags M2M" (eliminados) + §"reason libre" (eliminado). §"Renombrado wow_call → contact_client" pierde relevancia (tipo `contact_client` reemplazado por `client_lifecycle`).
  - [ADR-074](./adr-074-ticket-task-bridge.md) — bridge ticket↔task. **Refina** §"Bridge ticket↔task" (sigue vigente; el listener pasa a usar `source_system='support_ticket'` + `source_id=conversation_id`).
  - [ADR-038](./adr-038-notas-estructuradas-cliente.md) — notas estructuradas. **Refina** §"Categorías" (5 → 7 valores nuevos) + §"Origen de la nota" (añade `source_system` + `source_id` + `triggered_by_action`).
- **ADRs relacionados (no superseded):**
  - [ADR-037](./adr-037-arquitectura-dual-chat-tickets.md) — arquitectura dual. Permanece intacto; el bridge solo aplica a tickets.
  - [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) — tiers SI. Consumido por helper `calculateTaskPriority`.
  - [ADR-067](./adr-067-permisos-granulares-staff.md) — permisos granulares staff. Refina §3.10.
  - [ADR-069](./adr-069-estrategia-deploy-diferido.md) — deploy diferido. Habilita migración Opción B.
  - [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) — contrato `ProvisionerPlugin` v2. El plugin manual sigue creando tasks `provisioning_manual` igual.
  - [ADR-078](./adr-078-auth-server-side-cookies-httponly.md) — auth server-side. Sprint 16 frontend respeta marker `TODO(ADR-078, Sprint 13)` en cualquier Client Component nuevo (Sprint 13 §13.AUTH cierra la migración bulk).
- **Backlog:**
  - **Sprint 16 (nuevo)** — Tasks refactor + Notes consolidation. ~2-3 sesiones, 5 fases A→E.
  - **DC.32** (registrar): `MaintenanceLog.notes` renombrado a `client_facing_notes` (decisión cosmética para evitar confusión con notas internas que ahora viven en `client_notes`).
- **Glosario:** *Source system* (sistema vinculado de una task), *Source ID* (ID en el sistema vinculado), *Trigger automático* (evento que crea task), *Promoción checklist→task* (Opción A §3.7), *Nota excepcional* (`source_system='exceptional'`).
- **Sprint:** Decisión arquitectónica que **gobierna Sprint 16** (Tasks refactor + Notes consolidation). Mergeada doc-only antes del primer commit del sprint, replicando patrón canónico Sprint 8 D.0 / Sprint 11.A.
- **Inspiración industrial:**
  - Linear (Issues como reflejo de PRs/branches/commits, no creación manual recurrente).
  - Front (Conversations como source-of-truth; tasks son layer organizativa).
  - Pipedrive (Activities atadas a deals/contacts, no autónomas).

---

## Amendments

> Reservado para cambios compatibles hacia atrás post-cierre del ADR. Cada amendment con fecha + ADR específico que lo justifica.

(ninguno todavía)
