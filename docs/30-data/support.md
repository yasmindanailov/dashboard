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

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NULLABLE, FK → `users(id)` | `null` si es anónimo (guest desde landing) |
| `guest_name` | varchar(200) | NULLABLE | Para anónimos |
| `guest_email` | varchar(255) | NULLABLE | Para vincular al registrarse después |
| `guest_session_token` | varchar(500) | NULLABLE | Token (hasheado SHA-256) para vincular conversación anónima |
| `assigned_to` | uuid | NULLABLE, FK → `users(id)` | Agente asignado |
| `type` | enum | NOT NULL | `realtime_chat` · `async` (= ticket) |
| `status` | enum | NOT NULL, DEFAULT `'active'` | `active` · `waiting_agent` · `waiting_client` · `resolved` · `closed` |
| `channel` | enum | NOT NULL, DEFAULT `'webchat'` | `webchat` · `whatsapp` · `email` |
| `subject` | varchar(300) | NULLABLE | Para tickets |
| `priority` | enum | NOT NULL, DEFAULT `'medium'` | `low` · `medium` · `high` · `urgent` |
| `source` | enum | NOT NULL | `landing` · `dashboard` · `escalated_from_chat` |
| `parent_conversation_id` | uuid | NULLABLE, FK → `conversations(id)` | Si viene de un chat escalado a ticket |
| `has_support_inside` | boolean | NOT NULL, DEFAULT `false` | Estado del cliente al crear |
| `ai_handled` | boolean | NOT NULL, DEFAULT `false` | Si la IA filtro intentó resolver ([ADR-057](../10-decisions/adr-057-agentes-ia.md)) |
| `ai_summary` | text | NULLABLE | Resumen de lo que intentó la IA antes de escalar |
| `closed_at` | timestamptz | NULLABLE | |
| `anonymized_at` | timestamptz | NULLABLE | Cuando se anonimizan datos (RGPD 2 años, [ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)) |
| `linked_service_id` | uuid | NULLABLE, FK → `services(id)` | Sprint 23: ticket vinculado a servicio ([ADR-040](../10-decisions/adr-040-rediseno-tickets.md)) |
| `linked_project_id` | uuid | NULLABLE, FK → `projects(id)` | Sprint 23: ticket vinculado a proyecto |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_conversations_user_id` — en `user_id`
- `idx_conversations_status` — en `status`
- `idx_conversations_assigned` — en `assigned_to`
- `idx_conversations_guest_email` — en `guest_email` (vinculación al registrarse)
- `idx_conversations_created_at` — en `created_at` (limpieza por retención)

**Notas de decisión:**
- Retención 2 años; después: anonimización (no borrado). El hilo existe pero sin datos personales — cron pendiente, ver [jobs-reference](../50-operations/jobs-reference.md).
- Vinculación de chat anónimo ocurre al registrarse el usuario con el mismo `guest_email` → listener `support-guest-link` consume `auth.registered`.
- Sprint 23 añade `linked_service_id` y `linked_project_id` para enriquecer tickets ([ADR-040](../10-decisions/adr-040-rediseno-tickets.md)).
- Una conversación **solo se escala una vez** (Sprint 7.H2): `escalateToTicket()` valida que no haya child con `parent_conversation_id` ya creado → 409 `CONVERSATION_ALREADY_ESCALATED`.

---

## Tabla: `messages` ✅

Mensajes dentro de una conversación.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `conversation_id` | uuid | NOT NULL, FK → `conversations(id)` ON DELETE CASCADE | |
| `sender_id` | uuid | NULLABLE, FK → `users(id)` | `null` si es anónimo o sistema |
| `sender_type` | enum | NOT NULL | `client` · `agent` · `system` · `ai` (badge "Asistente AI" — ADR-057) |
| `content` | text | NOT NULL | |
| `is_internal` | boolean | NOT NULL, DEFAULT `false` | Notas internas del agente. **No visibles al cliente.** Auto-crea `client_notes` ([clients.md](./clients.md)) con categoría `conversation`. |
| `read_at` | timestamptz | NULLABLE | |
| `references` | jsonb | NULLABLE | Sprint 24: array de citas `[{ type, id, snapshot }]` ([ADR-047](../10-decisions/adr-047-sistema-citas-comunicacion.md)) |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_messages_conversation_id` — en `conversation_id`
- `idx_messages_created_at` — en `created_at`

**Notas de decisión:**
- **Cliente solo puede citar entidades propias** (sus servicios, sus proyectos). Validación en backend (R7 defense in depth — [ADR-047](../10-decisions/adr-047-sistema-citas-comunicacion.md)).
- Snapshot del campo `references` es **inmutable** — preserva contexto histórico aunque la entidad cambie/desaparezca.
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
