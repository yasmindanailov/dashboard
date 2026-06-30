# support — Contract

## 1. Propósito

Canal asíncrono y síncrono entre cliente y agentes. Gestiona dos tipos de conversación: **chat** (síncrono, WebSocket, expectativa de respuesta en minutos) y **ticket** (asíncrono, email-style, expectativa de horas/días). Permite que un chat se **escale a ticket** cuando no se puede resolver al momento. Acepta también **chats anónimos** desde la landing (guests sin login), vinculables después al usuario que los inicia.

---

## 2. Estado de implementación

✅ **Producción.** Sprint 7 cerrado, Sprint 7.H1-H25 hardening, refactor R15 completo (división en sub-services), tests E2E verdes.

Pendiente:
- IA copilot para agentes (Sprint 7.9, bloqueado por Sprint 15)
- Filtro IA para clientes sin Support Inside (Sprint 7.8, bloqueado por Sprint 15)
- Adjuntos en mensajes (Sprint 7.7, bloqueado por MinIO en Sprint 14)
- Rich text editor para tickets (Sprint 7.6.1)
- Horario de soporte (Sprint 7.6 ops)

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `conversations` | Chats y tickets (campo `type`) | Type inmutable tras creación. `escalated_from_id` enlaza chat→ticket. |
| `messages` | Mensajes individuales | Tipos: `text`, `system`, `internal_note`. Internal notes nunca se envían al cliente. |

---

## 4. Modelos foráneos accedidos

| Tabla | Módulo dueño | Tipo | Razón | Estado |
|-------|--------------|------|-------|--------|
| `users` | auth | lectura | Resolver nombre/email del sender o assignee. Vincular guest chats. | ✅ Lectura legítima |
| `services` | billing | lectura | Mostrar al agente qué servicios tiene contratado el cliente que reporta | ✅ Lectura legítima (contexto opcional) |
| `client_notes` | clients | lectura/escritura | Mostrar notas del cliente en panel de chat. Sync bidireccional con notas internas (Sprint 7.H22). | ⚠️ **Escritura cross-módulo.** Documentado como excepción legítima por la sincronización requerida. |

> **Sobre `client_notes`:** la decisión arquitectónica fue que las notas internas de soporte se reflejan automáticamente en `client_notes` del cliente (categoría `conversation`). Para evitar el patrón "support pide a clients que cree la nota vía servicio", se acepta escritura directa. **Riesgo:** si la lógica de cliente (validaciones de notas) cambia, support podría introducir notas inválidas. Plan: añadir validador en `prisma.middleware` o crear `ClientNoteService` con interfaz mínima invocada desde support.

---

## 5. API REST expuesta

**Prefix**: `/api/v1/support`. JWT auth en todos salvo `POST /chats/guest`. **NO migra a `/admin/*`** (Sprint 9.6 + ADR-066): es endpoint **compartido** cliente/staff. Distinción audiencia server-side:

- Controller filtra por `ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_support']`. Si caller no es admin, se fuerza `user_id = caller.id` y CASL `Read.Conversation` (own) limita el scope. `agent_billing` recibe 403 sobre cualquier endpoint de soporte (no tiene `Read.Conversation` en CASL — verificado en `tests/e2e/admin-granular-roles.spec.ts`).
- Las páginas frontend SÍ están splitteadas (Sprint 9.6 Fase E.3): `/dashboard/support/*` (UX cliente — tabs reducidas Todas/Abiertas/Resueltas, sin sidebar contexto, sin toggle is_internal, sin acciones de status/priority/escalate) y `/admin/support/*` (UX staff full — tabs full workflow 6 estados, sidebar contexto cliente con servicios + notas, toggle is_internal en respuestas, redirect a `/admin/support/chats` si conversation.type='chat').

### Conversaciones

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `POST` | `/chats` | Crear chat (cliente o admin) | `Create.Conversation` |
| `POST` | `/chats/guest` | Crear chat guest desde landing (rate-limited 3/h por IP) | Sin auth + guest_session_token |
| `GET` | `/chats` | Listar chats (filtros por type, status, assigned_to) | `Read.Conversation` + data isolation |
| `POST` | `/tickets` | Crear ticket directamente (sin chat previo) | `Create.Conversation` |
| `GET` | `/tickets` | Listar tickets (filtros category, priority, status) | `Read.Conversation` + data isolation |
| `GET` | `/conversations/:id` | Detalle conversación + mensajes | `Read.Conversation` + ownership |
| `PATCH` | `/conversations/:id` | Actualizar (status, assignee, etc.) | `Update.Conversation` |
| `PATCH` | `/conversations/:id/escalate` | Convertir chat → ticket | `Update.Conversation` |
| `PATCH` | `/conversations/:id/assign` | Asignar a un agente | `Update.Conversation` (admin only) |
| `POST` | `/conversations/:id/messages` | Enviar mensaje (texto o nota interna) | `Create.Message` |
| `GET` | `/conversations/:id/messages` | Listar mensajes | `Read.Message` + ownership |
| `GET` | `/conversations/stats` | Stats por status/type | `Read.Conversation` |

> **Data isolation:** clientes solo ven sus conversaciones (filtro por `user_id` del JWT). Agentes ven todas según rol. Validado en service (no solo CASL).

### Sugerencia IA para agentes (Rediseño UI F3·E13)

Materializa el "IA copilot para agentes" (antes Sprint 7.9). **Solo staff**; nunca
auto-envía: produce un **borrador** que el agente revisa e inserta en el composer.

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `POST` | `/conversations/:id/ai-suggestion` | Genera un borrador de respuesta para la conversación (staff only, rate-limited) | `Update.Conversation` |

- **Provider** = plugin IA del subsistema paralelo ([ADR-080 Amendment D](../../10-decisions/adr-080-plugin-framework.md#amendment-d-2026-06-30--tipo-de-plugin-ai-como-subsistema-paralelo-rediseño-ui-f3e13)). El endpoint llama a `AiSuggestionService` (core/ai), que resuelve el proveedor IA **activo** (`anthropic`), descifra su `api_key` (SecretVault) y envuelve la llamada en circuit breaker (R11).
- **Contexto server-side (R5):** el backend arma el transcript (`messages` cliente/agente, sin notas internas — SUPP-INV-3) + idioma del cliente; el front **no** construye el prompt. Respuesta: `{ suggestion, model }`.
- **Mock-first:** sin `api_key` configurada, un stub determinista responde (la feature es demostrable sin clave; la llamada real a Claude se activa al configurar el plugin en `/admin/settings/plugins`).
- **Rate limit (R10):** restrictivo por agente (evita coste/abuso del LLM).

---

## 6. WebSocket gateway

✅ Implementado en `support.gateway.ts`. Sub-helper: `support-gateway-auth.helper.ts` para auth dual.

### Namespace
`/support`

### Auth (dual)
1. **JWT en `Authorization: Bearer ...`** o cookie — usuarios autenticados
2. **`guest_session_token` en cookie HttpOnly** — guests desde la landing

Al conectar, el gateway resuelve el `userInfo` (JWT) o `guestSessionHash` y lo guarda en `connectedUsers`. Si no hay ninguno válido → desconecta.

### Eventos cliente → servidor

| Evento | Payload | Permisos | Descripción |
|--------|---------|----------|-------------|
| `conversation:join` | `{ conversationId }` | propietario o admin | Une el socket a la room `conversation:{id}` |
| `conversation:leave` | `{ conversationId }` | — | Sale de la room |
| `message:send` | `{ conversationId, body, isInternal? }` | propietario o admin | Crea mensaje + emite a la room (vía REST internamente) |
| `typing:start` | `{ conversationId }` | — | Broadcast `typing:start` a la room |
| `typing:stop` | `{ conversationId }` | — | Broadcast `typing:stop` |

### Eventos servidor → cliente

| Evento | Payload | Cuándo se emite |
|--------|---------|-----------------|
| `message:new` | `{ message, conversationId }` | Tras `message.created` event en bus interno (vía `support-websocket.listener`) |
| `conversation:assigned` | `{ conversationId, agentId, agentName }` | Tras `conversation.assigned` |
| `conversation:created` | `{ conversation }` | Tras `conversation.created` (broadcast a `agent:inbox`) |
| `unread:update` | `{ count }` | Al conectar y al cambiar contador |
| `typing:start` / `typing:stop` | `{ userId, role }` | Echo desde el peer escribiendo |

> **Limpieza de typing en disconnect (Sprint 7.H3):** `handleDisconnect` broadcasta `typing:stop` a todas las rooms del socket desconectado para evitar indicadores fantasma.

---

## 7. Eventos emitidos

| Evento | Cuándo | Outbox | Estado |
|--------|--------|--------|--------|
| `conversation.created` | Tras crear chat (`createUserChat`, `createGuestChat`) o ticket (`emitCreated`) | ❌ | ✅ Consumido por `support-email.listener` y `support-websocket.listener` |
| `conversation.assigned` | Tras `updateConversation()` con cambio de assignee | ❌ | ✅ Consumido por mismos 2 listeners |
| `message.created` | Tras `addMessage()` exitoso | ❌ | ✅ Consumido por mismos 2 listeners |

> **Outbox:** no implementado. Riesgo menor que `invoice.*` porque los chats se ven en UI vía REST (refresh) si el WS falla. Aún así, los emails de notificación pueden perderse — deuda controlada.

---

## 8. Eventos consumidos

| Evento | Origen | Listener | Qué hace |
|--------|--------|----------|----------|
| `auth.registered` | auth | `support-guest-link.listener` | Si el email del nuevo user coincide con `guest_email` de chats existentes, los vincula (`user_id = nuevo`, limpia campos guest) |

---

## 9. Servicios consumidos cross-módulo

Ninguno. Sub-services internos (R15):

- `SupportService` (fachada)
- `SupportChatService` — creación de chats user/guest, vinculación
- `SupportTicketService` — creación de tickets, escalación
- `SupportMessageService` — addMessage, markAsRead, conversation update
- `SupportQueryService` — findAll, findOne, getStats
- `SupportCleanupWorker` — cron de cleanup guest sessions
- Listeners: `SupportEmailListener`, `SupportWebsocketListener`, `SupportGuestLinkListener`
- Helper: `SupportGatewayAuthHelper`

---

## 10. CASL — Permisos

### Subjects gestionados

| Subject | Descripción |
|---------|-------------|
| `Subject.Conversation` | Chats y tickets |
| `Subject.Message` | Mensajes individuales |

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Conversation` | manage | manage | — | manage | create/read/list (own) | read/list (clients del partner, sin reply) |
| `Message` | manage | manage | — | manage | create/read (own) | — |

> Internal notes (`type: 'internal_note'`) son visibles solo a roles `agent_*` y `superadmin`. Filtrado en `SupportQueryService` (no solo CASL).

---

## 11. Settings consumidos

Categoría `support`:

| Key | Default | Para qué |
|-----|---------|----------|
| `guest_session_ttl_days` | 30 | Días sin actividad antes de cerrar chat guest |

> Settings huérfanos detectados: `auto_close_days`, `ai_filter_enabled` están en seed pero el código no los consume todavía (features futuras).

---

## 12. Notificaciones (email + campana)

✅ **GL-25 (audit 2026-06-25):** migrado de HTML inline en `support-email.listener`
(interpolación CRUDA del contenido de usuario → inyección + violación D12) a
`NotificationsService.dispatchToUser` con **plantillas de BD** (`notification_templates`,
Handlebars). Todo contenido de usuario (asunto, cuerpo del mensaje) se escapa con el
helper **`{{e}}`** — OBLIGATORIO en el canal `email` (`noEscape:true`, donde `{{var}}`
no escaparía). Cada evento tiene plantilla `email` + `internal` (campana). Editable por
superadmin en `/admin/notifications/templates`.

| Trigger (evento) | Template key | Destinatario | Canales |
|------------------|--------------|--------------|---------|
| `conversation.created` | `conversation.created` | Cliente (registrado o guest) | email + campana (guest: email-only) |
| `message.created` (agent → client) | `message.created` | Cliente registrado | email + campana |
| `conversation.assigned` | `conversation.assigned` | Agente asignado | email + campana |

> **Chats GUEST** (sin cuenta → `user_id=null`): `conversation.created` se envía
> renderizando la misma plantilla de BD + `EmailService` (escapada, respetando el
> kill-switch `notifications.email_enabled_globally`). Sin campana (no hay cuenta).
> **Reseed requerido** tras pull (6 plantillas nuevas en `notification-templates.ts`).

---

## 13. Jobs / cron

| Cron | Método | Qué hace |
|------|--------|----------|
| `EVERY_DAY_AT_6AM` | `cleanupExpiredGuestSessions()` | Cierra conversaciones guest sin actividad > `guest_session_ttl_days` |

---

## 14. Invariantes

- **SUPP-INV-1:** El `type` de conversación (`chat` vs `ticket`) es inmutable tras creación. Para "convertir" un chat en ticket existe el mecanismo de **escalación** que crea un ticket nuevo con `escalated_from_id` apuntando al chat origen.
- **SUPP-INV-2:** Una conversación solo se escala una vez. `escalateToTicket()` valida que `escalated_to` no existe ya (Sprint 7.H2).
- **SUPP-INV-3:** Internal notes (`type: 'internal_note'`) nunca se envían por email al cliente, nunca se push-emiten al socket del cliente. Filtros en `SupportEmailListener` y `SupportWebsocketListener`.
- **SUPP-INV-4:** Cierre o resolución de conversación requiere `resolution_note` obligatoria (Sprint 7.H17). Backend lo enforza vía DTO.
- **SUPP-INV-5:** Reapertura (status → `open` desde `resolved`/`closed`) también requiere nota explicativa (Sprint 7.H23).
- **SUPP-INV-6:** Chats guest (`is_guest = true`) tienen `guest_session_hash` no nulo y `user_id` nulo. Al vincularse a un user (Sprint 7.5.1), `user_id` se llena y `guest_*` se limpian. La transición es unidireccional.
- **SUPP-INV-7:** Rate limiting estricto en endpoint `/chats/guest`: 3 chats/hora por IP, 10 mensajes/min por sesión guest. Implementado en throttler config.

---

## 15. Decisiones relacionadas

> Migrar a ADRs en F2.

- `DECISIONS.md` §7 — Soporte: 3 planes (Inside vs filtro IA vs sin)
- `DECISIONS.md` §41 — Notas estructuradas del cliente
- `DECISIONS.md` §42 — Nota obligatoria en transiciones de estado
- `DECISIONS.md` §43 — Arquitectura dual chat + ticket
- `DECISIONS.md` §47 — Sistema de citas en comunicación

---

## 16. Excepciones documentadas

- **R1 (módulos no se llaman):** ✅ cumplido. Lecturas legítimas a `users` y `services`. Excepción: escritura a `client_notes` (sync bidireccional documentada).
- **R8 (Outbox):** ⚠️ No implementado. Eventos `conversation.*` y `message.created` consumidos por listeners. Riesgo: emails y notificaciones WS pueden perderse si el proceso muere post-commit. Deuda menor (refresh de UI compensa).
- **D12 (notificaciones vía dispatcher + plantilla BD):** ✅ **cumplido (GL-25, audit 2026-06-25)** — `support-email.listener` ya NO usa HTML inline; delega en `NotificationsService.dispatchToUser` con plantillas de BD (escape `{{e}}`). Antes era la única violación D12 del código.
- **D1 (sin emojis):** ✅ las plantillas de support no usan emojis en subjects.
- **R15:** ✅ post-refactor Sprint 7 (`SupportService` = 90 líneas, era 1054) + GL-25 (`support-email.listener` 217→~145 líneas, fin del HTML inline).

---

## 17. Pendiente / deuda técnica

- [x] ✅ **Migrar emails inline en `support-email.listener`** (GL-25, audit 2026-06-25) — hecho vía `NotificationsService` + plantillas de BD (no a `core/email/templates/`, que quedó superado por D12). Cierra inyección HTML + violación D12 + deuda R15.
- [ ] Implementar Outbox para `conversation.created` y `message.created` (deuda menor pero correcta)
- [ ] Considerar `ClientNoteService` con interfaz mínima para que support no escriba directo en `client_notes` (mejora de R1)
- [ ] **Bloqueado en otros sprints:**
  - Adjuntos en mensajes — Sprint 14 MinIO
  - Rich text editor (TipTap) para tickets — Sprint 7.6.1
  - IA copilot agente — Sprint 15
  - Filtro IA cliente — Sprint 15
  - Horario de soporte — Sprint 7.6 ops
- [ ] Validar permisos partner-scoped (read conversations de sus clientes) — actualmente sin tests E2E

---

## 18. Cómo testear este módulo

### Tests E2E existentes
- `tests/e2e/support-escalation.spec.ts`
  - Test 1: admin accede a la bandeja de tickets
  - Test 2: admin accede al panel de chats en tiempo real
  - Test 3: admin puede crear un nuevo ticket desde el modal

### Tests unitarios
Pendiente. Crítico para:
- Lógica de escalación (chat → ticket)
- Filtros de internal_note (no enviarse a cliente)
- Auth dual del gateway (JWT vs guest_token)

### Smoke test manual
1. Cliente abre chat desde widget → mensaje → agente recibe en panel → responde → cliente recibe email + push WS
2. Cliente reporta tema técnico → agente lo escala a ticket → ticket aparece en bandeja → enlace al chat origen visible
3. Visitante anónimo (no logueado) abre chat desde landing → recibe `guest_session_token` → conversa → registra cuenta con mismo email → chat se vincula a su user
4. Agente cierra ticket → backend exige `resolution_note` → mensaje de sistema generado → `ClientNote` categoría `solution` creada
