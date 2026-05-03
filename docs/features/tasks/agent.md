# Tasks — Guía del agente

> **Doctrina canónica vigente: [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)** + Amendments A1/A2/A3 (Sprint 16 cerrado 2026-05-02).
> Tasks es la **cara organizada de tu trabajo**: refleja eventos de los demás sistemas (tickets, slots Support Inside, provisioning manual, ciclo de vida del cliente, proyectos). NO duplica trabajo — agiliza tu flujo trayendo todo a un sitio.

> Módulo: `tasks`
> Última actualización: 2026-05-03 (post Sprint 16 cierre).
> Audiencia: agentes del staff Aelium (`agent_full`, `agent_billing`, `agent_support`).
> Para la vista superadmin / configuración del módulo, ver [`admin.md`](./admin.md).

---

## 1. Tu día a día — `/admin/tasks` + widget dashboard

**Empieza siempre por el widget "Tu trabajo de hoy"** en `/admin` (página inicio staff): muestra tus 5 tasks top ordenadas por la regla canónica. Click en una card → te lleva a `/admin/tasks?focus=<id>` con esa task abierta.

**El sidebar** lleva un badge numérico junto al item "Tareas" — count de tasks tuyas en `pending` o `in_progress`. Color rojo si hay vencidas, naranja si alguna vence en <2h, neutro resto.

**`/admin/tasks` (vista completa)** te muestra todas tus tasks aplicando la regla canónica de orden:

```
1. Vencidas (banner rojo arriba) — status=not_completed_in_time.
2. Tickets primero, agrupados:
   - Pro > Medium > Basic > sin SI (por tier del cliente)
   - dentro de cada tier, FIFO (más viejo primero).
3. Resto agrupado por tipo:
   - Mantenimientos (por anniversary_day del slot)
   - Setup servicio (FIFO)
   - Llamada bienvenida (FIFO, due_date +48h)
   - Items de proyecto (FIFO).
```

> **Por qué este orden y no `priority DESC, due_date ASC`:** un mantenimiento mensual con `due_date` mañana NO es "menos urgente" que un ticket SI Pro de hoy — son trabajos distintos. Agrupar por sistema preserva la coherencia operativa: ves todos los tickets de hoy juntos, todos los mantenimientos del día juntos.

**Toggle superadmin "Ver todas las tareas"** te aparece sólo si eres superadmin: cambia el scope a todos los agentes.

---

## 2. Los 5 tipos de task que existen

Las tasks **NO se crean manualmente**. Las generan automáticamente 5 triggers cerrados:

| Tipo (`source_system`) | Cuándo te llega | Qué pide |
|------------------------|-----------------|----------|
| 🎫 **Ticket Support** (`support_ticket`) | Te asignan un ticket de soporte (o el cliente responde sobre un ticket que dejaste en `resolved`) | Resolver el ticket inline desde la card |
| 🔧 **Mantenimiento mensual** (`support_inside_slot`) | Día aniversario del slot Support Inside del cliente | Completar el checklist + dejar nota cliente + nota interna |
| ⚙️ **Setup servicio** (`provisioning_manual`) | Cliente compró un servicio cuyo plugin es `manual` (alta requiere setup humano) | Hacer el setup en el panel real + marcar completado con nota |
| 📞 **Llamada bienvenida** (`client_lifecycle`) | Cliente paga su primer servicio en Aelium | Llamarle, dejar nota obligatoria de la llamada |
| 📁 **Proyecto** (`project`) | Superadmin promueve un item de checklist de un proyecto a task | Hacer lo que pone el item + marcar completado con nota |

**Lo que NO crea task** (el sistema lo resuelve solo o no es trabajo del agente):

- Facturas (creación, cobro, retries, vencimiento) — son notificaciones al cliente, no acción del staff.
- Renovaciones / suspensiones / dunning automáticas.
- Cambios de password, account_blocked, login failures — alertas, no trabajo planificable.
- Errores 5xx — alertas a superadmin vía notification.
- **Conversaciones de chat** — no abren task. Un chat es feedback inmediato; si requiere seguimiento, lo escalas a ticket (que sí abre task).

---

## 3. Tomar una task de la cola pública

Las tasks con `assigned_to=null` viven en la sección "Cola pública" (filtro). Tienes dos formas de cogerla:

1. **Desde la lista** → click en la card → botón "Asignarme" (sólo aparece si está sin asignar).
2. **Aceptación atómica:** si otro agente la coge un segundo antes, recibirás un 409 ("Esta tarea ya fue asignada"). Refresca y elige otra.

**No puedes "robar" tasks asignadas a otro agente.** Solo el **superadmin** puede reasignar tasks que ya tienen dueño (Amendment A2 — la doctrina lo formaliza: la decisión de "quién hace este trabajo" la toma el superadmin, no cualquier agente con full access).

**SLA cola pública:** cron diario `tasks-unassigned-overdue` (09:00 UTC) detecta tasks sin asignar fuera de SLA por `source_system` y manda resumen al superadmin.

---

## 4. Trabajar una task — la card canónica

Cada task aparece como **una sola card** con:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🎫 Ticket Support  [SI Pro]  · Carla Fernández · hace 2h · vence 2h  │
│  "Email no envía desde el panel"                                       │
│  [Completar]                                  [Abrir ticket completo →]│
└─────────────────────────────────────────────────────────────────────────┘
```

- **Icono + tipo**: te dice de qué sistema viene.
- **Badge SI**: solo en tickets, color según tier del cliente (Pro=dorado, Medium=plateado, Basic=neutro).
- **Cliente**: click → ficha del cliente.
- **Edad**: cuánto hace que se creó.
- **SLA visual**: verde / amarillo / rojo según porcentaje restante de SLA.
- **Línea de contexto**: subject del ticket / "Mantenimiento octubre 2026" / nombre del proyecto / producto del setup. Truncada a 80 chars.
- **Accionadores inline**: máx. 3 botones según `source_system` (§5).
- **CTA "Abrir [sistema] completo →"**: para acciones avanzadas, ver el ticket completo, ver el detalle del proyecto, etc.

> **Doctrina:** *si una task necesita más de 3 accionadores inline, eso es señal de que la card no es la herramienta — abre el sistema vinculado.*

---

## 5. Completar una task — los accionadores por tipo

| Tipo | Accionador inline | Qué hace por debajo |
|------|------------------|---------------------|
| 🎫 Ticket Support | **Completar** | Cierra task + delega `support.updateConversation(status='resolved', internal_note)`. El cliente recibe la plantilla canónica `conversation.resolved`. |
| 🔧 Mantenimiento mensual | **Completar mantenimiento** | Abre `MaintenanceLogModal`: marca checklist (items obligatorios bloquean si faltan) + 2 campos de nota (`client_facing_notes` que va al email del cliente; `internal_notes` que va a `client_notes`). Persiste `maintenance_log` + cierra task + emite `maintenance.completed`. |
| ⚙️ Setup servicio | **Marcar setup completado** | Modal con nota obligatoria. Cierra task + activa servicio (`service.status='active'` + emite `service.activated`). |
| 📞 Llamada bienvenida | **Marcar como contactado** | Modal con nota obligatoria de la llamada. Cierra task + persiste `client_notes` con `category='onboarding'`. |
| 📁 Proyecto | **Marcar item completado** | Modal con nota obligatoria. Cierra task + marca item del checklist `completed`. |

### 5.1 Nota obligatoria al completar (ADR-079 §3.9)

| Tipo | Nota obligatoria | Dónde queda guardada |
|------|------------------|----------------------|
| 🎫 Ticket | Sí (la pide el modal del módulo support, no la task) | `client_notes` con `source_system='ticket'` + `category='support'` |
| 🔧 Mantenimiento | Sí (la pide el modal de completar mantenimiento — campos `client_facing_notes` + `internal_notes`) | `client_facing_notes` se inyecta en email; `internal_notes` va a `client_notes` con `source_system='maintenance_log'` |
| ⚙️ Setup servicio | Sí (modal task) | `client_notes` con `source_system='task_completion'` + `category='support'` |
| 📞 Bienvenida | Sí (modal task — explica qué se habló en la llamada) | `client_notes` con `source_system='task_completion'` + `category='onboarding'` |
| 📁 Proyecto | Sí (modal task — explica qué se hizo en el item) | `client_notes` con `source_system='task_completion'` + `category='project'` |

> **Buena práctica:** escribe la nota como si fuese leída en 6 meses por otro agente. Contexto + qué hiciste + por qué.

### 5.2 Lifecycle ticket post Amendment A1

Hay **un solo accionador `Completar`** en la card del ticket (no dos como antes). El frontend siempre envía `ticket_action='resolve'` — el ticket queda en `resolved` (estado **transitorio**).

A partir de `resolved`, el ticket tiene 3 caminos:

1. **Cliente confirma resolución** desde su panel → `→closed` explícito.
2. **Cliente responde** (sigue teniendo problema) → emite `conversation.reactivated` → **nueva task bridge** te aparece (la antigua queda inmutable como auditoría).
3. **Pasan 7 días sin respuesta** → cron `support-resolved-auto-close` (02:30 UTC) cierra silencioso + recibes email `conversation.auto_closed`.

> **Por qué un solo accionador:** la doctrina canónica reconoce que la diferencia entre "Resolver" y "Cerrar" pertenece al **lifecycle del ticket**, no al cierre del trabajo del agente. Tú haces tu trabajo (resolver el problema reportado); el cierre archivado es decisión del cliente o del cron.

---

## 6. Lo que NO puedes hacer (boundaries — Amendment A2)

| Acción | ¿Puedes? |
|--------|----------|
| Crear una task manualmente | ❌ — no existe `POST /tasks`. La doctrina canónica lo prohíbe. |
| Editar `title` / `description` / `type` de una task | ❌ — esos campos NO existen en el schema canónico. El "qué hay que hacer" vive en el sistema vinculado. |
| Cancelar una task | ❌ — la cancelación es consecuencia mecánica de eventos del sistema vinculado. Si la task no aplica, completa con nota explicando o pide al superadmin que actúe sobre el sistema vinculado. |
| Reasignar una task a otro agente | ❌ — sólo superadmin (vía `ReassignTaskModal`). |
| Reabrir una task terminal (`completed`/`cancelled`/`not_completed_in_time`) | ❌ — terminales son inmutables. Si el sistema vinculado vuelve a estar vivo (ticket reactivado), nace task NUEVA. |
| Editar tasks de otro agente | ❌ — solo `superadmin` y `agent_full` (read+update); para reasignar entre agentes, sólo superadmin. |
| Cerrar un ticket directamente desde `/admin/support` ignorando su task bridge | ❌ — la doctrina ADR-074 unifica el cierre en la task. La pill "Trabajando en tarea →" en `ConversationHeader` te lleva a la task. |

---

## 7. Notas y timeline del cliente

Toda nota que dejas al completar una task se persiste en `client_notes` con source tracking polimórfico:

- `source_system` te dice de qué flujo vino (`ticket`, `chat`, `maintenance_log`, `task_completion`, `exceptional`).
- `source_id` apunta al sistema vinculado (`conversation_id`, `slot_id`, `task_id`).
- `triggered_by_action` granular: `ticket.resolved`, `chat.resolved`, `task.completed`, `maintenance.completed`, `manual_entry`.

Tu autor es tu usuario (FK `client_notes.author_id` ON DELETE RESTRICT — protege contra borrado de usuario con notas).

**Visibilidad:** las notas aparecen en `/admin/clients/[id]` tab "Notas" agrupadas por `source_system` con filtros por `category`. Click → te lleva al sistema vinculado (ticket, mantenimiento, task de origen) cuando aplique.

**Nota excepcional** (sin actuador): puedes crear notas libres desde la ficha del cliente (botón "Añadir nota excepcional") con `source_system='exceptional'` + `category='exceptional'` + `triggered_by_action='manual_entry'`. Útil para registrar contextos que no salen de un flujo automático (incidente comentado por teléfono, decisión interna, etc.).

Detalle completo: [`docs/features/notes/admin.md`](../notes/admin.md).

---

## 8. Crons que afectan tus tasks

| Cron | UTC | Qué hace contigo |
|------|-----|------------------|
| `tasks-overdue` | `02:00` | Si una task tuya excede `due_date + 7 días` (config), la marca `not_completed_in_time` y te llega email. Es terminal — no puedes recuperarla. |
| `tasks-unassigned-overdue` | `09:00` | Si tareas en cola pública exceden SLA, el superadmin recibe resumen. No te afecta directo. |
| `maintenance-critical` | `08:00` | Si servicios con mantenimiento contratado llevan >60 días sin `maintenance_log`, superadmin recibe alerta. Te puede tocar tarea nueva. |
| `maintenance-monthly` | `06:00` (diario, filtra `anniversary_day=today`) | Crea las `support_inside_slot` del día. Nacen en cola pública (sin asignar). |
| **`support-resolved-auto-close`** (Amendment A1) | **`02:30`** | **Cierra silencioso tickets en `resolved` >`support.auto_close_resolved_days` (default 7) si el cliente no respondió ni confirmó. Recibes email `conversation.auto_closed` informando.** |

> **Si tu task pasó sola a `not_completed_in_time`:** es comportamiento canónico de la presión operativa. Si tu vencimiento estaba apretado pero la task seguía siendo válida, **cambia la `due_date`** (vía `/assign` desde superadmin si necesario) **antes** de que el cron la marque, o pide al admin que ajuste `tasks.overdue_to_failure_days`.

---

## 9. Tickets de soporte y tasks (bridge ADR-074 + Amendment A1)

Si trabajas tickets en `/admin/support`, esto te concierne:

- **Asignar un ticket = crear una task bridge** automáticamente. La verás aparecer en tu listado.
- **Cerrar el ticket directamente desde `/admin/support`** ya no es el flujo canónico. La pill "Trabajando en tarea →" en el `ConversationHeader` te lleva a la task bridge.
- **Cerrar el ticket pasa por la task** (accionador inline `Completar`).
- **Reactivación (Amendment A1):** si el cliente responde sobre `resolved` o admin reabre, emite `conversation.reactivated` → nueva task. La task antigua sigue inmutable como auditoría.
- **Desasignar un ticket** cancela la task bridge correspondiente con flag interno para evitar el ciclo.

---

## 10. Si algo va mal

| Síntoma | Qué pasa | Qué hacer |
|---------|----------|-----------|
| "No puedo editar esta task" | Estado terminal | Si el trabajo sigue vivo, lo absorbe una nueva task (vía reactivación) o pide al superadmin reasignación. |
| "Me sale 409 al asignarme" | Otro agente la cogió un segundo antes | Refresca y elige otra. |
| "Marqué el checklist y no me deja completar" | Hay items requeridos sin marcar | Mira los pintados en rojo. Items opcionales no bloquean. |
| "Cancelé una task y el sistema vinculado sigue vivo" | (No deberías poder cancelar — Amendment A2). Si te aparece el botón viejo, repórtalo. | El backend solo acepta cancel de superadmin (deprecated, DC.34 pendiente). |
| "Mi task pasó sola a `not_completed_in_time`" | El cron `tasks-overdue` la marcó vencida | Si el trabajo sigue siendo necesario, una task nueva debería nacer (DC.35 — pendiente Sprint 16 Fase 16.D residual). Mientras tanto, escala al superadmin. |
| "El ticket se cerró solo al cabo de 7 días" | Cron `support-resolved-auto-close` (Amendment A1) | Comportamiento canónico. Si era prematuro, ajusta `support.auto_close_resolved_days` o resuelve más tarde. |
| "Tengo banner azul 'Escalado al ticket TK-XXX'" | Amendment A3: el chat se escaló a ticket | Click te lleva al ticket destino. El chat queda `resolved` inmutable. |

---

## 11. Lo que NO puedes hacer (boundaries — recap)

- ❌ Crear tasks manualmente.
- ❌ Editar `source_system`/`source_id`/`title`/`description` (no existen en schema canónico).
- ❌ Cancelar tasks (Amendment A2 — consecuencia mecánica de eventos cross-sistema).
- ❌ Reasignar tasks a otros agentes (solo superadmin).
- ❌ Reabrir tasks terminales.
- ❌ Cerrar tickets ignorando su task bridge.
- ❌ Disparar manualmente los crons (solo superadmin con `Manage.Job`).
- ❌ Escribir mensajes en chats `resolved` (Amendment A3 — chats son terminales absolutos en ese estado, ni cliente ni agente pueden escribir).

---

## 12. Referencias rápidas

- Vista admin del módulo: [`admin.md`](./admin.md)
- Operativa de notas: [`docs/features/notes/admin.md`](../notes/admin.md)
- Lifecycle ticket vs chat (Amendments A1+A3): [`docs/features/support/lifecycle.md`](../support/lifecycle.md)
- ADRs vivos: [041](../../10-decisions/adr-041-sistema-tareas.md) (parcial) · [067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md) · [072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) · [074](../../10-decisions/adr-074-ticket-task-bridge.md) (refinada) · **[079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) — canónico vigente**
