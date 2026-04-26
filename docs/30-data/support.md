# Support — Schema

> **Dominio:** Support Inside (suscripciones + slots) + sistema dual chat/tickets (conversations + messages).
> **Módulo:** [`docs/20-modules/support/contract.md`](../20-modules/support/contract.md).
> **Sprint origen:** Sprint 7 (chat + tickets) + Sprint 7.B (notas estructuradas) + Sprint 23 (rediseño tickets) + Sprint 24 (citas).
> **Estado:** ✅ `conversations`, `messages` implementadas. ⬜ Support Inside pendiente.
> **ADRs:** [034](../10-decisions/adr-034-support-inside-modelo.md) (Support Inside) · [035](../10-decisions/adr-035-sistema-comunicacion-legacy.md) (legacy, supersede ADR-037) · [036](../10-decisions/adr-036-configuracion-chat.md) (config chat) · [037](../10-decisions/adr-037-arquitectura-dual-chat-tickets.md) (arquitectura dual) · [040](../10-decisions/adr-040-rediseno-tickets.md) (rediseño tickets) · [047](../10-decisions/adr-047-sistema-citas-comunicacion.md) (citas).

---

## Resumen de tablas

| Tabla | Estado | Sprint | Propósito |
|-------|--------|--------|-----------|
| `support_inside_subscriptions` | ⬜ | 7 | Suscripción activa de Support Inside (1:N por servicio) |
| `support_inside_slots` | ⬜ | 7 | Slots de mantenimiento o gestión asignados a servicios concretos |
| `conversations` | ✅ | 7 | Hilos de comunicación. Chat + ticket comparten tabla con `type` |
| `messages` | ✅ | 7 | Mensajes dentro de una conversación. Soporta citas (Sprint 24) |

---

## Tabla: `support_inside_subscriptions` ⬜

Suscripción activa de Support Inside de un cliente. Al cancelar, todos sus slots se cancelan automáticamente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | |
| `service_id` | uuid | NOT NULL, FK → `services(id)`, UQ | El servicio de Support Inside contratado |
| `status` | enum | NOT NULL, DEFAULT `'active'` | `active` · `cancelled` · `suspended` |
| `activated_at` | timestamptz | NOT NULL | |
| `cancelled_at` | timestamptz | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- Un slot se puede cancelar individualmente sin cancelar Support Inside.
- Al cancelar Support Inside → cascada lógica (no FK CASCADE — guard explícito en code).

---

## Tabla: `support_inside_slots` ⬜

Slots de mantenimiento (y gestión) asignados a servicios del cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `support_inside_subscription_id` | uuid | NOT NULL, FK → `support_inside_subscriptions(id)` | |
| `assigned_service_id` | uuid | NOT NULL, FK → `services(id)` | La web/producto al que aplica el slot |
| `slot_type` | enum | NOT NULL | `maintenance` · `maintenance_and_management` |
| `is_included_free` | boolean | NOT NULL, DEFAULT `false` | Viene gratis con el plan o es de pago adicional |
| `billing_cycle` | enum | NULLABLE | `monthly` · `annual` |
| `price` | decimal(10,2) | NULLABLE | `null` si `is_included_free = true` |
| `status` | enum | NOT NULL, DEFAULT `'active'` | `active` · `cancelled` |
| `anniversary_day` | integer | NOT NULL | Día del mes (1-28) — disparador del cron mensual de mantenimientos |
| `activated_at` | timestamptz | NOT NULL | |
| `cancelled_at` | timestamptz | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_slots_subscription_id` — en `support_inside_subscription_id`
- `idx_slots_service_id` — en `assigned_service_id`
- `idx_slots_anniversary` — en `anniversary_day` (cron mensual de generación de tareas)

**Notas de decisión:**
- `anniversary_day` máximo 28 para evitar problemas con febrero. CHECK constraint recomendado.
- El mantenimiento corresponde al **mes en curso**. No se arrastra si no se completa (la tarea queda como `not_completed_in_time`, [tasks.md](./tasks.md)).
- Cron mensual aspiracional — ver [jobs-reference](../50-operations/jobs-reference.md).

---

## Tabla: `conversations` ✅

Hilos de comunicación. **Chat y ticket comparten tabla** con campo `type` discriminador ([ADR-037](../10-decisions/adr-037-arquitectura-dual-chat-tickets.md)).

> **Fuente de verdad:** `backend/prisma/schema.prisma` modelos `Conversation` + 4 enums (`ConversationStatus`, `ConversationPriority`, `ConversationType`, `ConversationCategory`).
> **Nota histórica:** el documento legacy `DATABASE_SCHEMA.md` usaba nombres distintos (`realtime_chat/async`, `active`, `medium`, `assigned_to`, `parent_conversation_id`, `ai_handled`). **Esta tabla refleja Prisma**, no el legacy.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `sequence_number` | integer | NULLABLE, UQ | Auto-asignado vía PostgreSQL SEQUENCE al crear ticket — numeración correlativa visible al cliente (ej: `#1042`) |
| `type` | enum `ConversationType` | NOT NULL, DEFAULT `'chat'` | **`chat` · `ticket`** |
| `user_id` | uuid | NULLABLE, FK → `users(id)` | `null` si es anónimo (guest desde landing) |
| `assigned_agent_id` | uuid | NULLABLE | Agente asignado (FK lógica a `users(id)`) |
| `subject` | varchar(500) | NOT NULL | Asunto. Para chats se auto-genera del primer mensaje si no se pasa |
| `status` | enum `ConversationStatus` | NOT NULL, DEFAULT `'open'` | **`open`** · `waiting_client` · `waiting_agent` · `resolved` · `closed` |
| `priority` | enum `ConversationPriority` | NOT NULL, DEFAULT `'normal'` | `low` · **`normal`** · `high` · `urgent` |
| `category` | enum `ConversationCategory` | NULLABLE | `support_general` · `support_billing` · `support_technical` · `wdify_progress` · `wdify_feedback` · `escalated_chat` (las dos `wdify_*` deprecadas, [ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md) — solo para tickets pre-Sprint 22, migración a `support_technical` en Sprint 23) |
| `channel` | varchar(50) | NOT NULL, DEFAULT `'web'` | String libre (no enum). Valores actuales: `web`. Futuros: `whatsapp`, `email`. |
| `is_ai_filtered` | boolean | NOT NULL, DEFAULT `false` | Si la IA filtro intentó resolver antes de escalar ([ADR-057](../10-decisions/adr-057-agentes-ia.md)) |
| `guest_name` | varchar(200) | NULLABLE | Para anónimos en la landing |
| `guest_email` | varchar(255) | NULLABLE | Para vincular al registrarse después (Sprint 7.5.1) |
| `guest_session_hash` | varchar(500) | NULLABLE | **Hash SHA-256** del token de sesión guest (token plaintext en cookie HttpOnly) |
| `service_id` | uuid | NULLABLE | Servicio vinculado al ticket. (Originalmente Sprint 23 lo nombraba `linked_service_id` — el código real ya lo expone como `service_id` desde Sprint 7.) |
| `escalated_from_id` | uuid | NULLABLE, FK → `conversations(id)` | Self-ref. Si la conversación viene de un chat escalado a ticket. (Equivalente al concepto `parent_conversation_id` del legacy.) |
| `tags` | jsonb | NULLABLE | Tags del ticket (futuro [ADR-040](../10-decisions/adr-040-rediseno-tickets.md) Sprint 23 los formaliza en tabla aparte) |
| `closed_at` | timestamptz | NULLABLE | |
| `resolved_at` | timestamptz | NULLABLE | |
| `first_response_at` | timestamptz | NULLABLE | Timestamp del primer mensaje del agente — útil para SLA tracking ([ADR-040](../10-decisions/adr-040-rediseno-tickets.md)) |
| `resolution_note` | text | NULLABLE | Nota obligatoria al resolver/cerrar/escalar ([ADR-039](../10-decisions/adr-039-nota-obligatoria-transiciones.md)) |
| `resolved_by_id` | uuid | NULLABLE | Quién resolvió (snapshot, FK lógica a `users`) |
| `metadata` | jsonb | NULLABLE | Metadatos arbitrarios |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices reales:**
- `@@index([user_id])`
- `@@index([assigned_agent_id])`
- `@@index([status])`
- `@@index([type])`
- `@@index([guest_email])` (vinculación al registrarse)
- `@@index([guest_session_hash])`

**Campos documentados pero NO existen en Prisma todavía** (planificados para sprints futuros):

| Campo aspiracional | Sprint planificado | Notas |
|-------------------|--------------------|-------|
| `linked_project_id` | 23 ([ADR-040](../10-decisions/adr-040-rediseno-tickets.md)) | Cuando exista módulo Projects |
| `source` (enum landing/dashboard/escalated) | — | Hoy se infiere de `escalated_from_id != null` y de `is_ai_filtered`. Posible añadir si se necesita analítica de origen |
| `has_support_inside` | — | Hoy se calcula al vuelo cruzando `user_id` con `support_inside_subscriptions`. Si performance lo exige → desnormalizar |
| `ai_summary` | 15 ([ADR-057](../10-decisions/adr-057-agentes-ia.md)) | Resumen de lo que intentó la IA filtro antes de escalar |
| `anonymized_at` | 12.5 ([ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)) | RGPD — cron de anonimización a 2 años |

**Notas de decisión:**
- Vinculación de chat anónimo ocurre al registrarse el usuario con el mismo `guest_email` → listener `support-guest-link` consume `auth.registered` y migra `user_id` + limpia campos guest.
- Una conversación **solo se escala una vez** (Sprint 7.H2): `escalateToTicket()` valida que no haya child con `escalated_from_id = this.id` ya creado → 409 `CONVERSATION_ALREADY_ESCALATED`.
- `resolution_note` obligatoria en transiciones a `resolved`/`closed`/escalación ([ADR-039](../10-decisions/adr-039-nota-obligatoria-transiciones.md)) — el backend rechaza la transición si está vacía. Se persiste como mensaje de sistema y como `ClientNote(category=solution)` automática.
- `sequence_number` se asigna sólo al crear `type=ticket` (no a chats) — formato visible al cliente: `#NNNN` correlativo.

---

## Tabla: `messages` ✅

Mensajes dentro de una conversación.

> **Nota histórica:** el documento legacy `DATABASE_SCHEMA.md` nombraba el campo del cuerpo `content`. **El código real usa `body`.** Esta tabla refleja Prisma.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `conversation_id` | uuid | NOT NULL, FK → `conversations(id)` ON DELETE CASCADE | |
| `sender_type` | enum `MessageSender` | NOT NULL | `client` · `agent` · `system` · `ai` (badge "Asistente AI" — ADR-057) |
| `sender_id` | uuid | NULLABLE | `null` si es sistema o anónimo (FK lógica a `users(id)`) |
| `body` | text | NOT NULL | Cuerpo del mensaje |
| `attachments` | jsonb | NULLABLE | Adjuntos (Sprint 14 MinIO + Sprint 7.6.3) |
| `is_internal` | boolean | NOT NULL, DEFAULT `false` | Notas internas del agente. **No visibles al cliente.** Auto-crea `client_notes` ([clients.md](./clients.md)) con categoría `conversation`. |
| `read_at` | timestamptz | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices reales:**
- `@@index([conversation_id])`

**Campos aspiracionales (NO existen en Prisma todavía):**

| Campo | Sprint planificado | Notas |
|-------|--------------------|-------|
| `references` (jsonb — citas estructuradas) | 24 ([ADR-047](../10-decisions/adr-047-sistema-citas-comunicacion.md)) | Array `[{ type, id, snapshot }]` — citas a service / product / project / note |

**Notas de decisión:**
- **Cliente solo puede citar entidades propias** cuando se implemente Sprint 24 (R7 defense in depth — [ADR-047](../10-decisions/adr-047-sistema-citas-comunicacion.md)).
- Cliente intentando enviar `is_internal = true` → 403 `INTERNAL_NOTE_UNAUTHORIZED`.

---

## Diagrama de relaciones (support)

```
support_inside_subscriptions
  └── support_inside_slots (1:N)
        └── assigned_service_id → services (billing.md)

conversations
  ├── messages (1:N)              ← cascade on delete
  ├── parent_conversation_id (self-ref) ← escalado chat → ticket
  ├── linked_service_id → services (opcional, Sprint 23)
  ├── linked_project_id → projects (opcional, Sprint 23)
  └── client_notes.conversation_id (1:N) ← clients.md

messages
  └── references (jsonb) ← snapshot citas a service / product / project / note
```

---

## Cross-references

- **Apuntan aquí:**
  - `client_notes.conversation_id` → `conversations` ([clients.md](./clients.md))
  - `tasks.slot_id` → `support_inside_slots` ([tasks.md](./tasks.md))
- **Eventos:** `conversation.created`, `conversation.assigned`, `message.created`, `guest_session.expired` — ver [`_events.md`](../20-modules/_events.md).
- **Listeners:** `support-email.listener` + `support-websocket.listener` consumen los 3 eventos principales.
- **Plantillas email:** `support.conversation-created`, `support.message-reply`, `support.conversation-assigned` — ver [email-templates](../50-operations/email-templates.md).
- **WebSocket gateway:** `/support` namespace. Auth dual: JWT (clientes/agentes) + `guest_session_token` (chats anónimos en landing).
- **Settings consumidos:** `support.guest_session_ttl_days`, `support.auto_close_days`, `support.ai_filter_enabled`, `support.maintenance_critical_threshold_days` — ver [settings-reference](../50-operations/settings-reference.md).
- **Errores API:** `CONVERSATION_NOT_FOUND`, `CONVERSATION_ALREADY_ESCALATED`, `INTERNAL_NOTE_UNAUTHORIZED` + WebSocket `MESSAGE_SEND_FAILED` — ver [api-errors](../50-operations/api-errors.md).
- **Invariantes:** SUP-INV-7.H2 (escalación única), SUP-INV-7.H4 (post-escalación redirige al ticket).
