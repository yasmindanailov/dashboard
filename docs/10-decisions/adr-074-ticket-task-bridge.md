# ADR-074 — Ticket ↔ Task: bridge automático con cierre unificado en la tarea

> **Status:** Active — **refinado** por [ADR-079](./adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) §2 + §3.6.1 (el bridge sigue vigente como mecanismo canónico; la implementación pasa a `source_system='support_ticket'` + `source_id=conversation_id` en lugar de `task.type='support_ticket'` + `conversation_id` directo. Los accionadores inline de la card delegan en `support.updateConversation` igual que hoy. La doctrina "cierre delegado al sistema vinculado" se eleva a regla universal aplicable a los 5 `source_system`). **Aplica tras Sprint 16.**
> **Date:** 2026-04-30 · 2026-05-02 (refinado por ADR-079)
> **Domain:** tasks, support, operativa interna
> **Sprint:** Sprint 8 Fase B.10

---

## Contexto

El sistema convive con dos dominios operativos que el agente usa para gestionar trabajo:

- **Soporte (`Conversation`)**: chats y tickets que vienen del cliente. Tienen su propio estado (`open`, `resolved`, `closed`) y sus propias acciones canónicas en `ConversationHeader.tsx` ("Resolver", "Cerrar", "Reabrir") que disparan `DetailResolutionModal` con nota interna obligatoria. La nota se persiste como `ClientNote(category=solution, conversation_id)`.
- **Tareas (`Task`)**: trabajo interno del equipo, con su propio estado (`pending`, `in_progress`, `completed`, `cancelled`) y su propio modal de cierre (`TaskCompletionModal`, Sprint 8 Fase B.9) que captura nota al cliente.

La columna `Task.conversation_id` existe en el schema Prisma desde Sprint 8 Fase A pero **no se ha poblado nunca desde flujo UI**: ningún listener crea tareas a partir de tickets, ningún botón "convertir ticket en tarea" aparece en el detalle del ticket, y el detalle de la tarea no muestra link al ticket origen. Es una columna huérfana esperando un caso de uso explícito.

### El caso operativo real

Un ticket llega al sistema (escalado desde chat o creado directamente desde el panel admin). Hoy el flujo es:

1. El admin abre el ticket, lee, decide qué hacer.
2. Si es trabajo técnico que requiere varios días (instalar plugin, migrar configuración, revisar logs), no hay forma canónica de "convertir esto en tarea para el agente técnico". El admin/agent_full responde mensajes en el ticket pero **el trabajo interno no se trackea como tarea** — queda implícito en la cabeza del agente o en un mensaje interno del ticket.
3. Cuando el trabajo termina, el agente clica "Resolver" en el ticket. Aparece `DetailResolutionModal` que pide nota — pero esa nota NO se envía al cliente automáticamente, sólo se persiste como `ClientNote(solution)`.

Hay tres problemas:

- **El trabajo del agente no es visible como tarea** — el tablero `/admin/tasks` no muestra los tickets asignados como ítems pendientes. La carga de cada agente se mide mal.
- **Doble sitio para "cerrar"** — ConversationHeader tiene "Resolver/Cerrar" y TaskCompletionModal (cuando hay tarea relacionada) tiene "Completar". Si los conectas mal, un agente puede resolver el ticket sin cerrar la tarea, o viceversa.
- **Notas duplicadas** — al cerrar el ticket pides una nota; si además cierras la tarea pides otra. El cliente acaba recibiendo dos emails (o más) sobre el mismo trabajo, o mensajes incoherentes.

### Lo que pide Yasmin

Decisión ya tomada por la operativa (validada explícitamente 2026-04-30):

> _"Asignar el ticket a un agente crea una tarea automáticamente con los datos del ticket. El ticket siempre debe estar asignado a un agente (obligatorio); puede reasignarse. La tarea y el ticket están vinculados. Como ambos sistemas tienen tipo 'cerrar/resolver', no debería haber dos sitios donde cerrar — solo uno. Pienso en la tarea: tiene un botón "Completar" y desde ahí puedes definir 'Resolver ticket' o 'Cerrar ticket', siguiendo el flujo de añadir nota interna que ya existe al cerrar/resolver un ticket. En esa tarea no se añaden más notas ni notificaciones — la del ticket interna y la notificación implícita al cliente sobre el ticket cerrado son suficientes. El sistema de tasks no añade más notas o notificaciones en ese caso."_

### ¿Qué pasaría si NO tomáramos esta decisión?

La columna `Task.conversation_id` seguiría huérfana. El admin tendría que crear manualmente una tarea cada vez que asigne un ticket — flujo de doble entrada. La métrica "trabajo pendiente del agente" seguiría descuadrada (tickets vs tareas en silos). Cuando el agente "cierre" un ticket, el cliente recibiría una notificación y luego, si la tarea sigue abierta, otra notificación al cerrar la tarea — ruido. La operativa real seguiría dependiendo de disciplina manual del agente, no del sistema.

---

## Opciones consideradas

### A. Manual: botón "Crear tarea desde ticket" en `ConversationHeader`

El admin clica "Crear tarea" en el ticket, abre `NewTaskModal` pre-rellenado, asigna a un agente. Ambos quedan vinculados.

- **Pros:** decisión humana caso a caso. Algunos tickets se resuelven sin necesitar tarea (ej. consulta rápida), evitar crear tareas vacías.
- **Contras:** doble entrada (asignar ticket + crear tarea). El agente decide a veces saltarse el paso. La métrica de carga sigue mal en esos casos.

### B. (elegida) Automático: ticket asignado → crea tarea sin intervención

Cuando un ticket pasa de `assigned_to=null` a `assigned_to=<agentId>` (o nace ya asignado), un listener `ConversationAssignedListener` crea una `Task` con `type=support_ticket`, `conversation_id=ticketId`, `client_id`/`service_id` heredados del ticket, `title=ticket.subject`, `description=null`, `assigned_to=<agentId>`, `priority=ticket.priority`. La tarea queda como "el bloque de trabajo" del agente.

Para que esto funcione coherentemente, **el ticket pasa a ser obligatoriamente assigned**: cualquier ticket creado o escalado sin agente asignado recibe asignación automática (algoritmo: round-robin entre `agent_full|agent_billing|agent_support` activos según categoría del ticket; superadmin como fallback). Reasignar el ticket reasigna la tarea (o crea una nueva si la anterior se completó).

El flujo de cierre canónico vive en la tarea:

- `TaskCompletionModal` detecta `task.conversation_id` poblado y cambia su shape: en lugar de pedir "mensaje al cliente" (B.9), presenta un selector "¿Qué hacemos con el ticket?" con opciones `Resolver` / `Cerrar`, y un textarea "Nota interna" (obligatorio, mismo placeholder que `DetailResolutionModal`).
- Al guardar, el backend (`TasksService.complete`) detecta `conversation_id` y delega:
  1. Persiste `ClientNote(category=solution, conversation_id, body=nota)` — convención canónica del módulo support.
  2. Llama a `SupportConversationsService.updateConversation(conversationId, { status: 'resolved'|'closed', resolution_note })` — emite los eventos de support normales (`conversation.resolved`/`conversation.closed`) que ya tienen su listener para notificar al cliente.
  3. Marca la tarea como `completed`.
- **No emite `task.completed` con `clientNotes` poblado** — desactivamos el listener `TaskCompletedListener` para tareas con `conversation_id`. La notificación al cliente la dispara el módulo support (su sistema canónico). Sin duplicación.

El header del ticket pasa a ser informativo cuando hay tarea vinculada: oculta los botones "Resolver"/"Cerrar"/"Reabrir" y muestra en su lugar un link "Trabajo asignado en tarea TASK-XX → completar desde allí". El admin pleno conserva los botones para casos extraordinarios (ej. cerrar ticket sin completar tarea pendiente — caso raro auditable).

- **Pros:** una sola entrada (asignar ticket = crear tarea); tablero `/admin/tasks` refleja la carga real; cierre unificado en la tarea; cero notificaciones duplicadas; columna `Task.conversation_id` deja de ser huérfana; `assigned_to` obligatorio en tickets resuelve EC operativos preexistentes ("ticket sin owner se queda olvidado").
- **Contras:** schema cambia (nuevo `TaskType.support_ticket`); 4 sitios deben coordinar (listener crear, header ticket cambia, modal task cambia, service complete delega); requiere ADR claro y E2E exhaustivo.

### C. Convertir ticket EN tarea (no paralela)

El ticket se transforma en tarea (cambia de tabla efectiva). Pierde mensajes, estado, escalation history.

- **Contras:** rompe el dominio support; complica la timeline del cliente; no hay marcha atrás. **Descartada** (validada explícitamente con Yasmin).

### D. Status quo (deprecar FK huérfana)

Ignoramos `conversation_id` y dejamos los dominios separados.

- **Contras:** el caso operativo real se queda sin solución estándar. **Descartada**.

---

## Decisión

> Adoptar **Opción B**.

### Reglas canónicas

1. **`Conversation.assigned_to` es obligatorio para tickets** (no para chats anónimos pre-escalación). Cualquier ticket creado, escalado desde chat, o reasignado, recibe agente automáticamente si no se especifica. Algoritmo de auto-assign:

> ⚠️ **Nota de fase Sprint 8 Fase B.10 (2026-04-30)**: la auto-asignación automática queda **diferida a sub-sesión 8.B.11**. El alcance de B.10 cubre el flujo manual: cuando el admin asigna un ticket desde la UI (incluyendo el momento de creación del ticket donde el formulario obliga a seleccionar agente), el listener crea la task. Para B.10 no se ejecuta auto-asignación si un ticket nace sin `assigned_agent_id` — el escenario "ticket huérfano" sigue siendo posible operativamente y queda como deuda explícita. El algoritmo descrito a continuación es el plan canónico para B.11.

   - **Round-robin balanceado por carga**: entre los agentes activos cuya CASL permite manage del subject relevante, elegir el que tenga menor número de tareas activas (`pending | in_progress`). Empate: el de menor `last_assigned_at`. Si no hay agentes elegibles → asignar al `superadmin` y emitir `system.warning` (deuda operativa documentada — el equipo está infradimensionado).
   - **Categoría del ticket** filtra el pool: `billing` → `agent_billing` + `agent_full` + `superadmin`; `support` / `escalated_chat` → `agent_support` + `agent_full` + `superadmin`; resto → todos los staff.

2. **Listener `conversation.assigned`** consume el evento que emite `SupportConversationsService.updateConversation` cuando `assigned_to` cambia. Crea `Task` con shape canónico:

   ```ts
   {
     type: 'support_ticket',  // Nuevo valor del enum (ver §schema)
     title: conversation.subject,
     description: null,       // El "trabajo" vive en los mensajes del ticket
     priority: conversation.priority,
     client_id: conversation.user_id,
     service_id: null,        // El ticket no tiene servicio directo; si necesita,
                              // el agente lo añade después editando la tarea
     assigned_to: conversation.assigned_to,
     conversation_id: conversation.id,
     reason: `Soporte: ${conversation.subject.substring(0, 100 - 10)}`,
     created_by: <userId del que disparó la asignación>,
   }
   ```

   Si la conversación ya tiene una task vinculada activa (`status in ('pending', 'in_progress')`), el listener **reasigna** esa task en lugar de crear otra. Si la task vinculada está cerrada, el listener crea una nueva — el caso "ticket reabierto" ya tendría su propia auditoría.

3. **Cuando una tarea con `conversation_id` se completa**, el flujo canónico delega en support:

   - `TasksService.complete(id, dto)` detecta `task.conversation_id` no nulo y:
     - Si `dto.ticket_action === 'resolve'` → marca conversación como `resolved`.
     - Si `dto.ticket_action === 'close'` → marca conversación como `closed`.
     - Persiste `ClientNote(category=solution, conversation_id, body=dto.resolution_note)`.
     - Marca la tarea como `completed`.
     - Emite `task.completed` con flag `__skipClientNotification: true` para que `TaskCompletedListener` ignore el evento (la notificación al cliente la dispara el listener de support — sin duplicación).

   - El controller `/tasks/:id/complete` acepta el shape extendido `CompleteTaskDto` con campos opcionales `ticket_action` (`'resolve'|'close'`) y `resolution_note`. Si la tarea NO tiene `conversation_id`, esos campos se ignoran (compatible hacia atrás con B.9 puro).

4. **`TaskCompletionModal` (frontend)** detecta `task.conversation_id` y cambia su shape al modo "ticket bridge":
   - Title: "Cerrar ticket vinculado".
   - Selector segmentado "Acción sobre el ticket": `Resolver` (default) / `Cerrar`.
   - Description: "Esta acción cerrará el ticket TK-XXXX y marcará la tarea como completada. La notificación al cliente la envía el sistema de soporte."
   - Textarea: "Nota interna sobre la resolución" (obligatoria, placeholder copiado de `DetailResolutionModal`).
   - Botón: "Resolver ticket y completar" / "Cerrar ticket y completar".

5. **`ConversationHeader` (frontend)** detecta si la conversación tiene una task vinculada activa (`hasLinkedTask`). Si sí:
   - Oculta los botones "Resolver" / "Cerrar" del flujo legacy.
   - Muestra una pill "Trabajando en tarea TASK-XXXX" con link clicable.
   - El admin pleno (`superadmin` + `agent_full`) conserva un dropdown "Acciones de admin" con la opción "Forzar cierre del ticket" (caso extraordinario; emite `system.warning`).

   Si la conversación NO tiene task vinculada (chats no asignados, o casos legacy pre-B.10), comportamiento intacto.

6. **El detail de la tarea con `conversation_id`** muestra una card sidebar "Ticket origen" con:
   - Label "TK-XXXX" + subject.
   - Link a `/admin/support/[conversationId]`.
   - Estado actual del ticket (`open`/`resolved`/`closed`).

### Modelo de datos

**Schema Prisma** — añadir nuevo valor al enum `TaskType` y mantener `Task.conversation_id` ya existente:

```prisma
enum TaskType {
  contact_client
  maintenance
  maintenance_management
  project_task
  custom_work
  support_setup
  support_ticket   // ← NUEVO Sprint 8 Fase B.10. Tareas creadas
                   // automáticamente al asignar un ticket. SIEMPRE
                   // tienen `conversation_id` poblado (FK no opcional
                   // a nivel de invariante de negocio, aunque la
                   // columna sigue NULLABLE para coexistir con tipos
                   // que no usan FK).
}
```

**Conversation.assigned_to** sigue NULLABLE en BD (chats anónimos pre-escalación lo necesitan). La obligatoriedad para tickets se aplica a nivel **service** (validación al crear/escalar), no FK constraint.

### CASL

Sin cambios. `Subject.Task` y `Subject.Conversation` ya cubren las acciones. La nueva tarea `support_ticket` hereda los mismos permisos que cualquier otra task.

### Eventos canónicos

| Evento | Cuándo se emite | Quién consume | Nota B.10 |
|---|---|---|---|
| `conversation.assigned` | Tras `SupportConversationsService.updateConversation` cambia `assigned_to` (incluye creación con assigned) | `SupportTicketTaskCreatorListener` (NUEVO) | Crea/reasigna `Task(type=support_ticket)` con `conversation_id`. |
| `task.completed` | Igual que B.9 | `TaskCompletedListener` (B.9) | **Ignora si payload tiene flag `__skipClientNotification`** — caso ticket bridge. |
| `conversation.resolved` / `conversation.closed` | Tras `updateConversation` cambia `status` | listener support → notifica cliente | Se dispara también desde el flujo de cierre de tarea ticket-bridge — **única notificación al cliente**. |

---

## Consecuencias

### Positivas

- **Una sola entrada operativa**: asignar ticket = crear tarea. El tablero `/admin/tasks` refleja la carga real del agente.
- **Cierre unificado**: el agente sólo aprende un flujo (`TaskCompletionModal`). Cuando el ticket está vinculado, el modal le presenta las opciones que necesita; cuando no, el modo simple de B.9.
- **Cero notificaciones duplicadas**: la notificación al cliente la emite el módulo support (canónico). El listener `TaskCompletedListener` se desactiva con flag explícito para tareas tipo bridge.
- **Métrica de carga correcta**: cualquier reporte futuro "¿cuánto trabajo tiene el agente X?" suma tareas independientemente de si vienen de ticket o no.
- **`assigned_to` obligatorio en tickets** resuelve un EC preexistente (tickets huérfanos).
- **Columna `Task.conversation_id` deja de ser huérfana** y queda documentada con su flujo canónico.

### Negativas / riesgos

- **Cambio de schema** (nuevo enum value `support_ticket`) — requiere migration. Coste mínimo pero registrable.
- **Backend complejidad**: `TasksService.complete` ahora tiene tres ramas (maintenance, ticket-bridge, simple). Mitigación: helpers privados `completeAsMaintenance` / `completeAsTicketBridge` / `completeSimple` para mantener R15.
- **Tests E2E completos**: hace falta cubrir asignación → crea task, completar tarea bridge → ticket cerrado + cliente notificado, completar tarea bridge sin nota → 400, header ticket oculta botones cuando hay task vinculada.
- **Race condition** al reasignar: si el agente A está completando la tarea cuando el admin reasigna a B, hay carrera. Mitigación: el listener detecta task activa y reasigna en lugar de crear duplicada; el complete usa `findUnique({conversation_id: x, status: in_(pending, in_progress)})` para obtener la tarea correcta.
- **Caso edge**: ticket creado sin task (chats anónimos pre-escalación, casos legacy). El sistema debe seguir funcionando si `task.conversation_id` no se cumple en algunos rows. Cubrir con E2E de regresión.

### Coste estimado

~2 sesiones (Sprint 8 Fase B.10).

### Cuándo revisar

- Si la auto-asignación round-robin produce desbalance crónico (algunos agentes saturados, otros vacíos), reemplazar por algoritmo de capacidad declarada (Sprint 12+).
- Si en producción aparecen tareas `support_ticket` huérfanas (con `conversation_id` apuntando a ticket borrado), añadir cron de limpieza nocturno.
- Si los agentes se quejan de que "el ticket muestra estado pero no pueden modificarlo", evaluar permitir botón "Completar" rápido en el ticket que delegue al modal de tarea.

---

## Edge cases

> Lista canónica del bridge. Casos cerrados marcan SHA del fix; casos
> documentados sin fix tienen doctrina explícita para que cualquier
> futuro lector sepa el comportamiento esperado.

### Cerrados con código

| ID | Caso | Comportamiento | Fix |
|---|---|---|---|
| EC-B10-1 | **Cancelar task bridge** | Libera el ticket (`assigned_agent_id=null`, `status=open`) + mensaje sistema. Toast contextual al agente. | `2f5e2b8` (B.10.fix) |
| EC-B10-3 | **Reabrir ticket** (`closed`/`resolved` → `open`) con agente asignado | Re-emite `conversation.assigned` desde `support-message.service`. El listener crea task nueva (la previa quedó completed/cancelled — auditoría preservada). | `8.B.10.fix2` |
| EC-B10-7 | **Ticket nace asignado** (admin crea via `createTicketForClient` o escalación chat→ticket) | Tras crear, si `assigned_agent_id` está poblado, emite `conversation.assigned` para disparar el bridge. Antes solo `updateConversation` emitía y los tickets nacidos asignados quedaban sin task. | `8.B.10.fix2` |
| EC-B10-8 | **Desasignar ticket** (admin pone "Sin asignar") | Emite `conversation.unassigned`. El listener cancela la task bridge activa con flag `skipTicketRelease` para evitar ciclo (no reintenta liberar el ticket que ya está liberado). Mensaje sistema en el ticket: "Conversación desasignada — vuelve a la cola." | `8.B.10.fix2` |

### Decisiones doctrinales (sin fix de código)

| ID | Caso | Doctrina |
|---|---|---|
| EC-B10-2 | **DELETE task bridge** (admin destructivo) | El borrado físico de una task con `conversation_id` activo NO libera el ticket. Caso operativamente raro (la cancelación canónica es `status=cancelled`, no DELETE). El admin que borra debe desasignar el ticket manualmente desde el sidebar. Si el caso aparece en producción, considerar añadir guard al `DELETE /tasks/:id` que rechace tasks con `conversation_id` activa. **Sprint 13 Hardening** lo aborda si se materializa. |
| EC-B10-4 | **Editar título/descripción** de task bridge | NO se sincroniza al ticket. El subject del ticket es propiedad del cliente (lo escribió en su mensaje original); el title de la task es propiedad del agente (puede refinarlo para su gestión interna). **Drift textual aceptado por diseño** — son entidades con dueños distintos. |
| EC-B10-5 | **Múltiples tasks bridge en mismo ticket** (cancelaciones + reaperturas sucesivas) | Comportamiento intencional. Cada ciclo (asignar → cancelar → reasignar / reabrir) genera una task nueva; las anteriores quedan en historial con `status` terminal (`cancelled` o `completed`). El frontend filtra por activas (`pending`/`in_progress`) en operativa diaria; reportes pueden listar todas vía `tasksApi.list({conversation_id})`. |
| EC-B10-6 | **Race condition al asignar simultáneamente** (dos admins, mismo ticket) | El segundo evento ve la task ya creada por el primero y entra en la rama `existing.assigned_to !== payload.agent_id` → reasigna. El `created_by` queda con el primer admin (auditable). Riesgo bajo en operativa de un superadmin + pocos agentes. |
| EC-B10-11 | **Reasignar ticket ya `resolved`/`closed`** | El `support-message.service` emite `BadRequestException` si intentas reasignar conversation cerrada (validación de transición). El listener nunca recibe el evento — sin task creada. Comportamiento correcto: tickets cerrados no admiten cambios sin reabrirlos primero. |
| EC-B10-13 | **Cliente o agente eliminado** con task bridge activa | FK lógicas (sin constraint físico actual) — la task queda con `client_id`/`assigned_to` apuntando al fantasma. Reportar como **deuda Sprint 13 Hardening** (FKs físicas para `users(id)` referenciadas desde `tasks` + `conversations`). |
| EC-B10-14 | **Notas técnicas (`category=technical`) inline en task bridge** | Se persisten con `task_id` + `user_id=client_id`. Aparecen en `ClientNotesTab` del admin. **No se exponen al cliente** porque el portal cliente filtra por `category in (general, public)` — `technical` queda interno. Verificar en Sprint 13 cuando se publique audit/transparencia. |
| EC-B10-15 | **Cancelar task bridge cuando ticket ya está closed** | El `updateConversation({assigned_agent_id: null})` sobre un ticket cerrado no está bloqueado por el service — pasa a la rama "set null" y emite `conversation.unassigned`. El listener intenta cancelar task activa pero NO hay (la task ya estaba `completed` cuando se cerró el ticket). Idempotente. |

## Referencias

- [ADR-037](./adr-037-arquitectura-dual-chat-tickets.md) — chat → ticket escalation. Este ADR añade el flujo inverso ticket → task.
- [ADR-041](./adr-041-sistema-tareas.md) §"Tipos canónicos" — refinada por este ADR (nuevo valor `support_ticket`).
- [ADR-072](./adr-072-tareas-sin-asignar-cola-publica.md) — cola pública aplica a tareas auto-creadas si la auto-asignación falla.
- [ADR-073](./adr-073-tipos-flexibles-tasks-reason-tags.md) — el `reason` se hereda automáticamente del subject del ticket; los tags pueden añadirse manualmente.
- [tasks/contract.md](../20-modules/tasks/contract.md) §3/§5/§7 — modelo, endpoints, eventos.
- [conversations/contract.md](../20-modules/support/contract.md) — flujo de assignment + estado del ticket.
