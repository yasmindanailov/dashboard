# Support — Schema

> **Dominio:** Support Inside (suscripciones + slots) + sistema dual chat/tickets (conversations + messages).
> **Módulo:** [`docs/20-modules/support/contract.md`](../20-modules/support/contract.md).
> **Sprint origen:** Sprint 7 (chat + tickets) + Sprint 7.B (notas estructuradas) + Sprint 23 (rediseño tickets) + Sprint 24 (citas).
> **Estado:** ✅ `conversations`, `messages` implementadas. ✅ Support Inside Sprint 8 Fase D backend + frontend cerrado 2026-05-01 (`support_inside_subscriptions` + `support_inside_slots` + `support_inside_config` + 5 enums). ⬜ Sub-fase 8.D.12 (visibilidad transversal + drift `anniversary_day` + listener canónico) en curso.
> **ADRs:** [034](../10-decisions/adr-034-support-inside-modelo.md) (Support Inside modelo) · [035](../10-decisions/adr-035-sistema-comunicacion-legacy.md) (legacy, supersede ADR-037) · [036](../10-decisions/adr-036-configuracion-chat.md) (config chat) · [037](../10-decisions/adr-037-arquitectura-dual-chat-tickets.md) (arquitectura dual) · [040](../10-decisions/adr-040-rediseno-tickets.md) (rediseño tickets) · [047](../10-decisions/adr-047-sistema-citas-comunicacion.md) (citas) · [061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) (Support Inside UX dedicada) · [075](../10-decisions/adr-075-support-inside-ux-lista-y-aislamiento-productos.md) (Support Inside aislamiento CRUD) · [076](../10-decisions/adr-076-checkout-unico-support-inside-via-evento.md) (Support Inside checkout único vía evento).

---

## Resumen de tablas

| Tabla | Estado | Sprint | Propósito |
|-------|--------|--------|-----------|
| `support_inside_subscriptions` | ✅ | 8 Fase D | Suscripción activa de Support Inside del cliente (UQ por `client_id`) |
| `support_inside_slots` | ✅ | 8 Fase D · 8.D.12 (anniversary_day) | Slots de mantenimiento o gestión asignados a servicios concretos |
| `support_inside_config` | ✅ | 8 Fase D | Config 1:1 con `products` type=support_inside (slots, canales, SLA, prioridad, CTA visibility) |
| `conversations` | ✅ | 7 | Hilos de comunicación. Chat + ticket comparten tabla con `type` |
| `messages` | ✅ | 7 | Mensajes dentro de una conversación. Soporta citas (Sprint 24) |

---

## Tabla: `support_inside_subscriptions` ✅

Suscripción activa de Support Inside de un cliente. Al cancelar, todos sus slots se cancelan automáticamente.

> **Fuente de verdad:** `backend/prisma/schema.prisma` modelo `SupportInsideSubscription` + enum `SupportInsideSubscriptionStatus`.
> **Sprint origen:** Sprint 8 Fase D (cerrado 2026-05-01).
> **Refactor 8.D.12 (en curso):** ningún cambio de schema en esta tabla. Cambios en `support_inside_slots` (campo `anniversary_day` añadido) y nueva relación con `tasks.slot_id` (DC.17).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `client_id` | uuid | NOT NULL, FK → `users(id)`, **UQ** | Un cliente máximo 1 subscription activa o cancelada (UQ permite reactivar tras cancel). |
| `product_id` | uuid | NOT NULL, FK → `products(id)` | Plan contratado (Básico / Medium / Pro). |
| `service_id` | uuid | NOT NULL, FK → `services(id)`, **UQ** | Service estándar de billing que cubre la facturación recurrente del plan. |
| `status` | enum `SupportInsideSubscriptionStatus` | NOT NULL, DEFAULT `'active'` | **`active`** · `cancelled` · `past_due` |
| `started_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `cancelled_at` | timestamptz | NULLABLE | |
| `cancellation_reason` | varchar(500) | NULLABLE | Razón opcional pasada por el cliente al cancelar. |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices reales:**
- `@@unique([client_id])`
- `@@unique([service_id])`
- `@@index([product_id])`
- `@@index([status])`

**Notas de decisión:**
- Un slot se puede cancelar individualmente sin cancelar Support Inside.
- Al cancelar Support Inside → cascada **lógica** (NO FK CASCADE — el `cancel()` libera slots en transacción explícita; cumple ADR-034 §reglas y permite emit `support_inside.slot_released` por slot liberado).
- `subscribe()` con subscription `cancelled` previa **reactiva** vía update (no create) — cumple UQ `client_id`.
- Sub-fase 8.D.12.9 (ADR-076): la creación pasa a ser efecto colateral del listener `support-inside-on-service-provisioned` cuando `BillingCheckoutService.checkout()` resuelve un producto `type='support_inside'`.

---

## Tabla: `support_inside_slots` ✅ (sub-fase 8.D.12.1: añadir `anniversary_day`)

Slots de mantenimiento (o mantenimiento + gestión) asignados a servicios del cliente.

> **Fuente de verdad:** `backend/prisma/schema.prisma` modelo `SupportInsideSlot` + enum `SupportInsideSlotType`.
> **Sprint origen:** Sprint 8 Fase D (cerrado 2026-05-01).
> **Refactor pendiente 8.D.12.1:** añadir campo `anniversary_day INTEGER NOT NULL CHECK (anniversary_day BETWEEN 1 AND 28)` para que el `MaintenanceMonthlyService` distribuya carga a lo largo del mes (ADR-034 §recurrencia). Hoy el cron dispara `0 6 1 * *` (todos día 1) — **drift detectado y formalizado en ADR-034 nota 2026-05-01**.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `subscription_id` | uuid | NOT NULL, FK → `support_inside_subscriptions(id)` | |
| `service_id` | uuid | NOT NULL, FK → `services(id)` | El servicio del cliente al que aplica el slot. UQ parcial validada en app: 1 slot activo por `service_id` (Postgres no admite UNIQUE WHERE released_at IS NULL en Prisma). |
| `slot_type` | enum `SupportInsideSlotType` | NOT NULL | `maintenance` · `maintenance_management` |
| `is_extra` | boolean | NOT NULL, DEFAULT `false` | `true` = slot adicional fuera del cupo `slots_included` del plan. Hoy NO factura (DC.19 P1). |
| `assigned_at` | timestamptz | NOT NULL, DEFAULT `now()` | Fecha de asignación del slot al servicio. |
| `released_at` | timestamptz | NULLABLE | NULL = slot activo. Setear a `now()` en `releaseSlot()` o cancelación cascada. |
| `anniversary_day` | integer | NOT NULL, CHECK 1..28 | **Pendiente 8.D.12.1** — día del mes en que el cron diario debe disparar el mantenimiento. Backfill `LEAST(EXTRACT(DAY FROM assigned_at), 28)`. |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices reales (Sprint 8 Fase D):**
- `@@index([subscription_id])`
- `@@index([service_id])`
- `@@index([released_at])`

**Índices a añadir (Sprint 8 Fase D.12.1):**
- `@@index([anniversary_day])` — disparador del cron diario `WHERE anniversary_day = EXTRACT(DAY FROM NOW())`.

**Notas de decisión:**
- `anniversary_day` máximo 28 para evitar problemas con febrero. Si el slot se contrata día 29-31, el seed/service computa `LEAST(EXTRACT(DAY FROM assigned_at), 28)`.
- El mantenimiento corresponde al **mes en curso**. No se arrastra si no se completa (la tarea queda como `not_completed_in_time`, [tasks.md](./tasks.md)).
- **Cron canónico (post-D.12.1):** `0 6 * * *` UTC diario, filtra `WHERE anniversary_day = EXTRACT(DAY FROM NOW()) AND released_at IS NULL`. Idempotencia `(service_id, billing_month, type)` ya cubierta en `tasks` UQ.
- Slot adicional (`is_extra=true`) hoy crea row sin facturar — DC.19 P1 documenta el cierre como producto `support_addon` independiente.

---

## Tabla: `support_inside_config` ✅

Configuración 1:1 con `products` type=support_inside. Cada plan tiene su propia config con slots, canales, SLA, prioridad y visibilidad CTA.

> **Fuente de verdad:** `backend/prisma/schema.prisma` modelo `SupportInsideConfig` + 4 enums (`SupportInsideSlotType`, `SupportInsideChannel`, `SupportInsidePriorityTier`, `SupportInsideCtaVisibility`).
> **Sprint origen:** Sprint 8 Fase D (cerrado 2026-05-01).
> **Editor admin:** `/admin/support-inside-plans/<slug>` con 5 secciones card extensibles (ADR-075 §B.2).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `product_id` | uuid | NOT NULL, FK → `products(id)`, **UQ** | 1:1 con producto Support Inside. |
| `slots_included` | integer | NOT NULL, DEFAULT `0`, CHECK 0..100 | Slots gratis incluidos en el plan. |
| `slot_types_allowed` | enum[] `SupportInsideSlotType` | NOT NULL | Tipos de slot que el plan permite asignar (Pro: ambos · Básico/Medium: solo `maintenance`). |
| `extra_slot_price` | decimal(10,2) | NOT NULL, DEFAULT `0` | Precio mostrado al cliente para el slot adicional (DC.19 P1 lo materializará como producto `support_addon`). |
| `channels_active` | enum[] `SupportInsideChannel` | NOT NULL | Canales habilitados: `webchat`, `email`, `phone`, `whatsapp`. Pro tiene WhatsApp. DC.20 P2: canales no-email pendientes de adapter real (`NotificationsService` solo despacha email + in-app hoy). |
| `priority_tier` | enum `SupportInsidePriorityTier` | NOT NULL, DEFAULT `'standard'` | `standard` · `high` · `max`. **Sub-fase 8.D.12.2** lo enlaza con `conversation.priority` automáticamente. |
| `response_sla_hours` | integer | NOT NULL, CHECK 1..720 | SLA visible al cliente y al agente. Hoy informativo (no dispara alertas) — futuro listener cuando llegue Sprint 7.6 ops. |
| `cta_visibility` | enum `SupportInsideCtaVisibility` | NOT NULL, DEFAULT `'hidden'` | `hidden` · `catalog_banner` · `landing_cta`. Lo consume futura landing pública (Sprint 18). |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices reales:**
- `@@unique([product_id])`

**Notas de decisión:**
- `support_inside_config` se siembra en `prisma/seeds/support-inside-plans.ts` para los 3 planes canónicos (Básico/Medium/Pro). Operación canónica de la empresa, NO demo data — se siembra incluso en `NODE_ENV=production`.
- El editor admin `/admin/support-inside-plans/<slug>` (8.D.6b) actualiza el config + el producto + el pricing en una sola transacción atómica vía `SupportInsidePlansAdminService.update()` (no via `ProductsService` para preservar invariantes específicas — ADR-075 §"directo a Prisma").

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
products (type='support_inside')
  └── support_inside_config (1:1)

support_inside_subscriptions (UQ client_id, UQ service_id)
  ├── product_id → products (plan: Básico/Medium/Pro)
  ├── service_id → services (motor billing recurrente)
  └── support_inside_slots (1:N)
        ├── service_id → services (servicio del cliente cubierto)
        ├── anniversary_day (cron diario filtro — D.12.1)
        └── tasks.slot_id (DC.17 — pendiente Sprint 11)

conversations
  ├── messages (1:N)              ← cascade on delete
  ├── parent_conversation_id (self-ref) ← escalado chat → ticket
  ├── linked_service_id → services (opcional, Sprint 23)
  ├── linked_project_id → projects (opcional, Sprint 23)
  ├── support_inside_subscription (lookup vía client_id, sub-fase D.12.2)
  └── client_notes.conversation_id (1:N) ← clients.md

messages
  └── references (jsonb) ← snapshot citas a service / product / project / note
```

---

## Cross-references

- **Apuntan aquí:**
  - `client_notes.conversation_id` → `conversations` ([clients.md](./clients.md))
  - `tasks.slot_id` → `support_inside_slots` ([tasks.md](./tasks.md)) — **DC.17 P1 dependiente Sprint 11 Provisioning**: campo declarado en doc pero NO existe en `tasks` schema todavía. Migración pendiente al cerrar la asignación slot↔servicio desde `/dashboard/services/[id]` (Sprint 11).
- **Eventos:** `conversation.created`, `conversation.assigned`, `message.created`, `guest_session.expired` — ver [`_events.md`](../20-modules/_events.md).
- **Listeners:** `support-email.listener` + `support-websocket.listener` consumen los 3 eventos principales.
- **Plantillas email:** `support.conversation-created`, `support.message-reply`, `support.conversation-assigned` — ver [email-templates](../50-operations/email-templates.md).
- **WebSocket gateway:** `/support` namespace. Auth dual: JWT (clientes/agentes) + `guest_session_token` (chats anónimos en landing).
- **Settings consumidos:** `support.guest_session_ttl_days`, `support.auto_close_days`, `support.ai_filter_enabled`, `support.maintenance_critical_threshold_days` — ver [settings-reference](../50-operations/settings-reference.md).
- **Errores API:** `CONVERSATION_NOT_FOUND`, `CONVERSATION_ALREADY_ESCALATED`, `INTERNAL_NOTE_UNAUTHORIZED` + WebSocket `MESSAGE_SEND_FAILED` — ver [api-errors](../50-operations/api-errors.md).
- **Invariantes:** SUP-INV-7.H2 (escalación única), SUP-INV-7.H4 (post-escalación redirige al ticket).
