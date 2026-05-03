# Support — Lifecycle canónico (ticket vs chat)

> **Doctrina canónica vigente: [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) Amendments A1 + A3** (Sprint 16 cerrado 2026-05-02).
> Lifecycle asimétrico entre `ticket` y `chat`: tickets tienen estado transitorio `resolved` con auto-close; chats tienen estado terminal único `resolved` sin reapertura.

> Última actualización: 2026-05-03 (post Sprint 16 cierre Fase 16.E).
> Audiencia: staff Aelium + referencia para frontend cuando renderiza estados/acciones diferenciadas.
> Documento canónico de cómo viven y mueren las conversaciones (ticket vs chat) post Sprint 16.

---

## 1. Por qué este documento

Tickets y chats comparten enum `Conversation.status` (5 valores: `open` · `waiting_agent` · `waiting_client` · `resolved` · `closed`) y el mismo módulo backend (`support`). **Pero su semántica operativa difiere profundamente:**

- **Ticket** = comunicación asíncrona. El cliente puede tardar días en responder. Necesita "estado transitorio" para esperar confirmación + cierre archivado posterior.
- **Chat** = feedback inmediato. Si el cliente sigue teniendo problemas, abre conversación nueva o escala a ticket. NO necesita reaperturas ni estado transitorio.

Sprint 16 (Amendments A1 + A3 a ADR-079) formaliza esta asimetría con reglas backend duras. Este documento describe el comportamiento canónico vivo.

---

## 2. Lifecycle del ticket (Amendment A1)

### 2.1 Estados y transiciones permitidas

```
   ┌─────────┐
   │ open    │  (creación: cliente envía mensaje al ticket o admin lo crea)
   └────┬────┘
        │ admin/agente asigna ticket → emite conversation.assigned
        ▼
  ┌──────────────────┐
  │ waiting_agent    │  (cliente espera respuesta)
  └────────┬─────────┘
           │ agente envía mensaje → cliente
           ▼
  ┌──────────────────┐
  │ waiting_client   │  (cliente debe responder)
  └────────┬─────────┘
           │ cliente responde → vuelve a waiting_agent
           │
           │ agente "Resolver" desde card task o desde /admin/support
           ▼
  ┌──────────────────┐
  │ resolved         │  ← ESTADO TRANSITORIO (Amendment A1)
  │ (transitorio)    │
  └─────────┬────────┘
            │
       ┌────┴───────────────────┬─────────────────────────┐
       ▼                        ▼                         ▼
[Cliente responde]      [Cliente confirma]      [Cron support-resolved-auto-close]
   │                        │                         │
   ▼                        ▼                         ▼
emit conversation.    PATCH /confirm-resolution  emit conversation.auto_closed
reactivated           → status='closed'          → status='closed'
                                                   silencioso
   │                        │                         │
   ▼                        ▼                         ▼
nueva task bridge    closed (terminal)        closed (terminal) +
nace en cola pública                          notif al agente que resolvió
```

### 2.2 Reglas backend canónicas

**Estado `resolved` = transitorio (NO terminal):**

- ✅ Permite mensajes (cliente puede confirmar o responder).
- ✅ Permite cambio de prioridad (manual del admin).
- ❌ NO permite cambio de `assigned_agent_id` (los listeners cross-sistema gestionan reasignación al reabrir).

**Tres caminos posibles desde `resolved`:**

1. **Cliente responde** (envía mensaje) → backend emite `conversation.reactivated` con `reason='client_replied'`. `SupportTicketTaskCreatorListener.handleAssigned` (reuse) crea task NUEVA. La task antigua queda inmutable como auditoría.
2. **Cliente confirma resolución** explícita → endpoint `PATCH /support/conversations/:id/confirm-resolution` (solo cliente propietario, solo si `status='resolved'`) → `→closed` explícito + system message en el chat.
3. **Cron `support-resolved-auto-close`** (02:30 UTC) cierra silencioso pasados N días (default `support.auto_close_resolved_days = 7`) → `→closed` + emit `conversation.auto_closed` → notif al agente que resolvió.

**Estado `closed` = terminal inmutable:**

- ❌ Backend `addMessage` rechaza escritura.
- ✅ "Reabrir" disponible: cuando admin reabre (`closed → open`), backend emite `conversation.reactivated` con `reason='admin_reopened'`. Reemplaza el patrón legacy ADR-074 EC#3 que reusaba `conversation.assigned`.

### 2.3 Notificaciones canónicas (DC.33 cerrada Sprint 16 Fase 16.E)

| Evento | Plantilla | Destinatario | Contenido |
|--------|-----------|--------------|-----------|
| `conversation.resolved` | `conversation.resolved` (cliente) | Cliente | Email + campana: "El agente ha resuelto tu ticket. Tienes 3 caminos: responder, confirmar resolución, o esperar 7 días para que se cierre automáticamente." CTA al ticket. |
| `conversation.reactivated` | (no notif directa — el listener reuse crea task nueva, el agente la ve en su widget) | — | — |
| `conversation.auto_closed` | `conversation.auto_closed` (agente) | Agente que resolvió | Email + campana: "Tu ticket #X resuelto el dd/mm se ha cerrado automáticamente tras 7 días sin respuesta del cliente." |

> **Sin emails con texto largo en `conversation.resolved`** — el cliente actúa desde el detalle del ticket, no desde el email.

### 2.4 Frontend canónico

**`/admin/support/[id]`** (admin/agente):

- Header `ConversationHeader.tsx` con botones según estado:
  - `open` / `waiting_*`: `[Resolver]` `[Cerrar]` `[Escalar a ticket]` (si chat) — los relevantes para tickets.
  - `resolved` (transitorio): muestra el ticket completo con el lifecycle indicado. Sin botones de cierre extra (ya está resuelto).
  - `closed` (terminal): solo `[Reabrir]`.
- Pill "Trabajando en tarea →" si hay task bridge activa.

**`/dashboard/support/[id]`** (cliente):

- Si `status='resolved'`: banner explicativo + botón "Confirmar resolución" → `PATCH /confirm-resolution`. Cliente también puede responder normalmente (reactiva).
- Si `status='closed'`: solo lectura.

---

## 3. Lifecycle del chat (Amendment A3)

### 3.1 Estados y transiciones permitidas

```
   ┌─────────┐
   │ open    │  (cliente envía mensaje al widget guest o autenticado)
   └────┬────┘
        │ admin/agente toma el chat → emite conversation.assigned
        ▼
  ┌──────────────────┐
  │ waiting_agent    │
  └────────┬─────────┘
           │ agente responde
           ▼
  ┌──────────────────┐
  │ waiting_client   │
  └────────┬─────────┘
           │ cliente responde → vuelve a waiting_agent
           │
           │ agente "Resolver" o "Escalar a ticket"
           ▼
  ┌──────────────────┐
  │ resolved         │  ← ESTADO TERMINAL ABSOLUTO (Amendment A3)
  │ (inmutable)      │
  └──────────────────┘
                ─── (sin reapertura ni reactivación; chat NO crea task bridge)
```

### 3.2 Reglas backend canónicas

**Lifecycle restringido para chats:**

- `open|waiting_*` → `resolved` (acción "Resolver" o `escalateToTicket()` que pasa el chat a `resolved`).
- `resolved` → ninguna transición. **Inmutable absoluto.**
- `closed` y `open` (reabrir) **PROHIBIDOS** en chats. Backend `SupportMessageService.updateConversation` lanza `BadRequestException` con mensaje canónico si se intenta.
- Backend `addMessage` rechaza escritura en chat `resolved` para **ambos lados** (cliente + agente). Mensaje canónico: *"Este chat está cerrado. Si necesitas seguir hablando, abre una nueva conversación."*

**La rama de auto-status `addMessage → resolved → reactivar`** (Amendment A1, válida para tickets) queda **restringida a tickets explícitamente** — los chats no se reactivan.

**ClientNote canónica al cerrar chat (Amendment A3):**

Al pasar a `resolved` (vía `updateConversation` del agente o vía `escalateToTicket`), se persiste `ClientNote` con:

- `source_system='chat'`
- `triggered_by_action='chat.resolved'`
- `category='support'`
- `source_id=conversation_id`

Mantiene paridad con el flujo de tickets (`source_system='ticket'`) y permite filtrar el historial del cliente por tipo de conversación.

### 3.3 Frontend canónico

**`ConversationHeader.tsx`** (admin/agente):

- **Chats vivos** (`open`/`waiting_*`): muestra SOLO `[Resolver]` + `[Escalar a ticket]`. NO `[Cerrar]`, NO `[Reabrir]`.
- **Chats `resolved`**: sin botones (estado inmutable).
- **Tickets**: mantienen su set completo (Resolver/Cerrar vivos + Reabrir terminal).

**`ConversationMessages.tsx`** — `lockReason='chat_resolved'`:

- Copy: *"Este chat ha sido cerrado. Si necesitas seguir hablando, abre una nueva conversación."*
- Aplica a ambos lados (admin y cliente).

**Banner de escalación** en `/admin/support/[id]` y `/dashboard/support/[id]`:

- Si el chat tiene `escalated_to` (lookup inverso enriquecido en `SupportQueryService.findOne`), banner azul con secuencia del ticket destino + link directo:
  - Admin → `/admin/support/${ticket.id}`
  - Cliente → `/dashboard/support/${ticket.id}`
- Permite seguimiento operativo sin buscar el ticket manualmente.

### 3.4 Por qué esta asimetría (doctrina Yasmin)

> *"el sistema de chat, no abre tarea, que es lo normal — una conversación de chat en sí es algo en el momento. Yo valoro solo tener lo de 'resolver', y si sigue habiendo problemas el cliente vuelve a chatear en nueva conversación. Aquí el estado de 'cerrar' no es necesario, porque el feedback del usuario es inmediato. Cuando se escala a ticket, el chat deberá estar cerrado."*

**Consecuencia operativa:** mantener `closed` + `Reabrir` en chats no aportaba valor operativo y producía botones que el agente no usaba. Tras Amendment A3 los chats tienen un solo terminal absoluto y la UI deja de mostrar opciones inútiles.

---

## 4. Schema (refresco)

`Conversation.status` mantiene los **5 valores del enum** (`open` / `waiting_agent` / `waiting_client` / `resolved` / `closed`) — schema Prisma intacto. Las transiciones inválidas para chats se enforcean a nivel de service.

**Datos legacy** (chats con `status='closed'` anteriores a Sprint 16):

- Siguen viéndose. La UI los renderiza como cerrados (`lockReason='closed'`) y backend bloquea escrituras.
- No se migra el dato (Opción B drop+reseed limitada a `tasks`/`client_notes`).
- Futuro chat creado nunca llegará a `closed`.

**Lookup inverso `escalated_to`:**

- Enriquecido en `SupportQueryService.findOne()`: si la conversación es un chat con un ticket destino, el query trae también `escalated_to: { id, sequence }`.
- Frontend renderiza el banner azul.

---

## 5. Eventos canónicos (resumen post Amendments A1+A3)

| Evento | Emisor | Cuándo | Consumidor canónico |
|--------|--------|--------|---------------------|
| `conversation.assigned` | `support.updateConversation` | Asignación agente al ticket / chat | `support-email.listener`, `support-websocket.listener`, `SupportTicketTaskCreatorListener` (solo `type='ticket'`) |
| `conversation.unassigned` | `support.updateConversation({assigned_agent_id: null})` | Desasignación | `SupportTicketTaskCreatorListener.handleUnassigned` |
| **`conversation.resolved`** (canónico Sprint 16 DC.33) | `support.updateConversation({status='resolved'})` | Agente resuelve ticket o chat | `notifications-conversation-resolved.listener` (cliente recibe email + campana CTA al ticket) |
| **`conversation.reactivated`** (Amendment A1) | `SupportMessageService` cuando cliente envía mensaje a ticket `resolved` (`reason='client_replied'`) o admin reabre `closed → open` (`reason='admin_reopened'`) | Reactivación de ticket | `SupportTicketTaskCreatorListener.handleAssigned` (reuse) — crea task NUEVA |
| **`conversation.auto_closed`** (Amendment A1) | `SupportResolvedAutoCloseService` (cron 02:30 UTC) | Ticket en `resolved` >`support.auto_close_resolved_days` (default 7) → `→closed` silencioso | `notifications-conversation-auto-closed.listener` (agente que resolvió recibe email + campana) |
| `message.created` | `SupportMessageService.addMessage` | Mensaje nuevo | `support-email.listener`, `support-websocket.listener` |
| `conversation.created` | `SupportChatService` / `SupportTicketService` | Creación de conversación | `support-email.listener`, `support-websocket.listener` |

---

## 6. Cron `support-resolved-auto-close` (Amendment A1)

| Item | Valor |
|------|-------|
| Schedule UTC | `30 2 * * *` (02:30, evita colisión con `tasks-overdue` 02:00) |
| Servicio | `SupportResolvedAutoCloseService` |
| Lógica | `SELECT FROM conversations WHERE type='ticket' AND status='resolved' AND resolved_at < now() - support.auto_close_resolved_days days`. Por cada uno: `UPDATE status='closed', closed_at=now()` + emit `conversation.auto_closed`. Idempotente — ejecutar dos veces el mismo día no doble-cierra. |
| Setting consumido | `support.auto_close_resolved_days` (default 7). Editable vía `/admin/settings`. |
| Manual trigger | `POST /api/v1/admin/tasks/cron/support-resolved-auto-close` (`Manage.Job` superadmin). |
| Tests | unit `support-resolved-auto-close.service.spec.ts` (4 specs — cutoff, filtros, emit, idempotencia). E2E `support-conversation-lifecycle.spec.ts` (1 spec end-to-end). |

> Detalle completo: [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md).

---

## 7. Endpoint `PATCH /support/conversations/:id/confirm-resolution` (Amendment A1)

**Solo accesible por cliente propietario.** Solo aplica si `status='resolved'`. Cierra explícito + system message en el chat.

```
PATCH /api/v1/support/conversations/:id/confirm-resolution
Authorization: Bearer <cliente JWT>

→ 200 { conversation: {...} }
→ 403 si no es cliente propietario
→ 422 si status != 'resolved'
```

**Acción:**
1. `UPDATE conversations SET status='closed', closed_at=now()`.
2. Crea system message en el chat: *"<Cliente> ha confirmado la resolución."*.
3. Emite `conversation.closed` (huérfano por ahora — Sprint 12 si se necesita notificar agente).

---

## 8. Tests E2E que cubren este lifecycle

`tests/e2e/support-conversation-lifecycle.spec.ts` (Sprint 16 Fase 16.D residual + Fase 16.E):

1. **Resolver ticket → estado transitorio `resolved`** → cliente responde → `conversation.reactivated` → nueva task bridge nace.
2. **Resolver ticket → cliente confirma** → `→closed` explícito + system message.
3. **Resolver ticket → cron auto-close** → `→closed` silencioso + agente recibe email `conversation.auto_closed`.
4. **Reabrir ticket** (`closed → open`) → emite `conversation.reactivated` con `reason='admin_reopened'` → nueva task bridge.
5. **Resolver chat** → estado terminal absoluto `resolved` → backend rechaza `addMessage` ambos lados → ClientNote `source_system='chat'` persistida.
6. **Escalar chat → ticket** → chat queda `resolved` + banner azul `escalated_to` aparece en ambos lados.

---

## 9. Edge cases conocidos

| Caso | Comportamiento | Mitigación |
|------|---------------|------------|
| Cliente envía mensaje exactamente cuando cron auto-close se está ejecutando | Race condition: el cron toma snapshot, el mensaje llega después → cron cierra y luego cliente ve "chat closed". | Aceptado — el cron es idempotente; si pasa, cliente abre nueva conversación. Mitigación futura: cron toma `FOR UPDATE` row-level. |
| Admin reabre `closed → open` después de auto-close | Funciona — emite `conversation.reactivated` con `reason='admin_reopened'`, nueva task bridge nace. | — |
| Chat con `status='closed'` legacy (anterior Sprint 16) | UI lo renderiza como cerrado, backend bloquea escrituras. No se migra. | Si en el futuro un cliente reporta caso, ad-hoc admin reabre como ticket. |
| Cliente intenta confirmar resolución después de auto-close | Endpoint devuelve 422 (`status != 'resolved'`). | UI ya oculta el botón en `closed`. |
| Múltiples reactivaciones del mismo ticket | Cada `conversation.reactivated` crea task nueva (las antiguas quedan inmutables como auditoría). | Aceptado — auditoría completa. Si volumen explota, sub-sprint dedicado. |

---

## 10. Referencias

- [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) — Doctrina canónica + Amendments A1 (lifecycle ticket) + A3 (lifecycle chat)
- [ADR-037](../../10-decisions/adr-037-arquitectura-dual-chat-tickets.md) — Arquitectura dual chat/ticket (refinada por A1+A3)
- [ADR-039](../../10-decisions/adr-039-nota-obligatoria-transiciones.md) — Nota obligatoria en transiciones (refinada por ADR-079 §3.9)
- [ADR-074](../../10-decisions/adr-074-ticket-task-bridge.md) — Bridge ticket↔task (EC#3 superseded por `conversation.reactivated`)
- [`docs/20-modules/support/contract.md`](../../20-modules/support/contract.md) — Contract canónico módulo support
- [`docs/30-data/support.md`](../../30-data/support.md) — Schema `conversations` + `messages`
- [`docs/features/support/admin.md`](./admin.md) — Operativa admin support
- [`docs/features/notes/admin.md`](../notes/admin.md) — ClientNote canónica `source_system='ticket'` / `'chat'`
- [`docs/features/tasks/admin.md`](../tasks/admin.md) — Tasks bridge `support_ticket` (consume `conversation.reactivated`)
- [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md) — Cron `support-resolved-auto-close`
