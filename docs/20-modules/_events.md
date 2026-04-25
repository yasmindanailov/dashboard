# Catálogo de eventos del sistema

> **Fuente única de verdad** sobre qué eventos existen en Aelium Dashboard, quién los emite, quién los consume y qué payload llevan.
>
> Cada vez que un módulo emite un `eventEmitter.emit(...)` debe corresponderse con una entrada aquí. Cada `@OnEvent(...)` también.
>
> Detectar drift entre código y este catálogo es responsabilidad de cualquier agente IA que toque el módulo afectado.

> **Última auditoría:** abril 2026 (commits ~`8c4d893`).
> **Total eventos identificados:** 25.
> **Convenio de naming:** `<dominio>.<acción>` en pasado. Verificado 100% conforme.
> **Bus:** `EventEmitter2` global (NestJS `@nestjs/event-emitter`).
> **Outbox Pattern:** ❌ ningún evento usa outbox actualmente. Deuda técnica de R8.

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Eventos totales | 25 |
| Dominios | 6 (auth, checkout, conversation, invoice, message, service, task) |
| Eventos con consumidor activo | 10 |
| **Eventos huérfanos (sin listener)** | **15** |
| Eventos con múltiples consumidores | 3 (`conversation.created`, `conversation.assigned`, `message.created`) |
| Listeners únicos | 4 (`billing-email`, `support-email`, `support-websocket`, `support-guest-link`) |
| **Eventos críticos sin Outbox** | **25 / 25** (100%) — riesgo |

### Diagnóstico de los 15 eventos huérfanos

No es necesariamente bug. Pueden ser:

1. **Hooks aspiracionales** — emitidos para que listeners futuros se enganchen sin tocar el código que emite (común en `auth.*`).
2. **Features incompletas** — el listener está planificado pero aún no implementado (caso de `service.*` esperando provisioning module).
3. **Código realmente muerto** — emisión que nadie nunca tendrá interés en escuchar (revisar y borrar).

Se ha clasificado cada evento huérfano abajo en la columna "Estado".

---

## Catálogo completo (alfabético)

### 🔐 auth.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `auth.2fa_required` | `auth-login.service.ts:initiate2fa()` | — | `{ userId }` | no | 🟡 huérfano (hook aspiracional para audit/notifications futuro) |
| `auth.account_blocked` | `auth-login.service.ts:handleFailedLogin()` | — | `{ userId, attempts }` | no | 🟡 huérfano (debería notificar al superadmin → R7) |
| `auth.email_verified` | `auth-register.service.ts:verifyEmail()` | — | `{ userId }` | no | 🟡 huérfano |
| `auth.login_failed` | `auth-login.service.ts:handleFailedLogin()` | — | `{ userId, attempt }` | no | 🟡 huérfano (audit log) |
| `auth.login_success` | `auth-token.service.ts:issueTokens()` | — | `{ userId }` | no | 🟡 huérfano (audit log) |
| `auth.password_reset` | `auth-recovery.service.ts:resetPassword()` | — | `{ userId }` | no | 🟡 huérfano (audit log) |
| `auth.registered` | `auth-register.service.ts:register()` | `support-guest-link.listener` | `{ userId, email }` | no | ✅ con consumidor (vincula chats guest previos) |
| `auth.session_closed` | `auth-token.service.ts:logout()`, `revokeSession()` | — | `{ userId, sessionId? }` | no | 🟡 huérfano (audit log) |

**Análisis del dominio auth:**
La mayoría de eventos `auth.*` se emiten "por si acaso" pero ningún listener los consume. Esto es **deuda controlada**: cuando se implemente el módulo `audit` (stub hoy), estos serán sus consumidores naturales. NO eliminar.

---

### 💳 invoice.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `invoice.created` | `billing-invoice.service.ts:createInvoice()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, currency }` | no | ✅ con consumidor — **debería usar Outbox (R8)** |
| `invoice.paid` | `billing-invoice.service.ts:markAsPaid()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, currency, payment_provider }` | no | ✅ con consumidor — **debería usar Outbox** |
| `invoice.failed` | `billing-lifecycle.worker.ts:retryPayments()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, retry_count, max_retries }` | no | ✅ con consumidor — **debería usar Outbox** |
| `invoice.overdue` | `billing-invoice.service.ts:markAsOverdue()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, retry_count, max_retries }` | no | ✅ con consumidor — **debería usar Outbox** |

**Análisis del dominio invoice:**
**Este es el grupo más crítico.** Cada evento dispara un email al cliente. Si `EventEmitter2` falla post-commit (memory leak, crash), el cliente no recibe la notificación de su factura. La factura está en BD pero el cliente no se entera.

**Recomendación firme:** primer candidato para implementar Outbox Pattern (R8).

---

### 💼 checkout.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `checkout.completed` | `billing-checkout.service.ts:checkout()` | — | `{ user_id, service_id, invoice_id, product_name, total }` | no | 🟠 huérfano (cuando exista provisioning, lo escuchará para activar el servicio) |

**Análisis:** crítico cuando se implemente el módulo `provisioning`. Por ahora, la activación es manual (admin marca factura como pagada → invoice.paid → cliente notificado). Provisioning automático = consumir `checkout.completed` o `invoice.paid`.

---

### 🔧 service.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `service.cancelled` | `service-lifecycle.worker.ts:autoCancelServices()` | — | `{ service_id, user_id, reason }` | no | 🟠 huérfano (cuando exista provisioning, lo escuchará para desactivar) |
| `service.paused` | `subscription.service.ts:pauseService()` | — | `{ service_id, user_id, pause_max_date }` | no | 🟠 huérfano (provisioning → pausar instancia) |
| `service.resumed` | `subscription.service.ts:resumeService()`, `service-lifecycle.worker.ts:checkPauseExpiration()` | — | `{ service_id, user_id, reason }` | no | 🟠 huérfano (provisioning → reactivar) |
| `service.suspended` | `service-lifecycle.worker.ts:autoSuspendServices()` | — | `{ service_id, invoice_id, reason }` | no | 🟠 huérfano (provisioning → suspender) |

**Análisis del dominio service:**
Todos huérfanos esperando al módulo `provisioning`. Cuando provisioning se implemente, será su listener principal. Los eventos están bien diseñados: el dominio billing controla el ciclo de vida funcional; provisioning ejecutará la acción técnica externa.

---

### 💬 conversation.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `conversation.assigned` | `support-message.service.ts:updateConversation()` | `support-email.listener`, `support-websocket.listener` | `{ conversation_id, agent_id, agent_name, assigned_by }` | no | ✅ con 2 consumidores |
| `conversation.created` | `support-chat.service.ts:createUserChat()`, `createGuestChat()`, `support-ticket.service.ts:emitCreated()` | `support-email.listener`, `support-websocket.listener` | `{ conversation_id, type, user_id, user_name, user_email, subject, channel, is_guest? }` | no | ✅ con 2 consumidores |

---

### 📨 message.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `message.created` | `support-message.service.ts:addMessage()` | `support-email.listener`, `support-websocket.listener` | `{ conversation_id, message_id, sender_type, sender_id, is_internal, user_id, type }` | no | ✅ con 2 consumidores |

---

### 📋 task.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `task.assigned` | `tasks.service.ts:create()`, `update()` | — | `{ task, assignedBy }` | no | 🟡 huérfano (notification al asignado, pendiente Sprint 8 cierre) |
| `task.completed` | `tasks.service.ts:update()`, `complete()` | — | `{ task, completedBy, clientNotes?, internalNotes? }` | no | 🟡 huérfano (audit) |
| `task.created` | `tasks.service.ts:create()` | — | `{ task }` | no | 🟡 huérfano |

**Análisis del dominio task:**
Sprint 8 está WIP — los listeners para notificar al agente asignado están en el plan pero no implementados.

---

## Listeners activos (consolidado)

| Listener | Eventos consumidos | Acciones |
|----------|--------------------|----------|
| `billing-email.listener` | `invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue` | Envía email al cliente con detalles + link al PDF |
| `support-email.listener` | `conversation.created`, `conversation.assigned`, `message.created` | Email a cliente o agente según tipo |
| `support-websocket.listener` | `conversation.created`, `conversation.assigned`, `message.created` | Push por WebSocket a clients conectados |
| `support-guest-link.listener` | `auth.registered` | Vincula chats guest previos al user nuevo (si email coincide) |

---

## Convenciones para añadir un evento nuevo

1. **Naming:** `<dominio>.<acción>` con la acción en pasado (ya emitida): `invoice.created`, no `invoice.create`.
2. **Payload:** objeto simple. Incluir los IDs necesarios (no el objeto completo). El listener vuelve a leer si necesita más datos.
3. **Documentar AQUÍ y en el `contract.md` del emisor**: nombre, trigger, payload, outbox-yes-no.
4. **Si es crítico (transición de estado, cambio de dinero, gestión de servicio):** **debe usar Outbox Pattern (R8)** desde el primer commit. Los eventos `invoice.*` son deuda histórica — el resto se debe hacer bien.
5. **Si es informativo (audit, log, notification opcional):** outbox no obligatorio; documentarlo igual.

---

## Cómo se valida que código y catálogo coinciden

**Hoy:** manualmente. Si descubres una emisión sin entrada aquí, o una entrada sin emisor real → hay drift, créame un issue.

**Futuro deseable:** script de CI que parsea código y verifica:
- Cada `eventEmitter.emit('xxx', ...)` tiene fila en este archivo
- Cada `@OnEvent('xxx')` tiene fila aquí y un emisor real

Pendiente para sprint dedicado.

---

## Hallazgos de la auditoría que generaron este documento

| Hallazgo | Severidad | Acción |
|----------|-----------|--------|
| 15 eventos huérfanos | 🟡 Media | Documentar caso por caso (hecho arriba). No eliminar — son hooks para módulos pendientes |
| 25/25 eventos sin Outbox | 🔴 Alta | Sprint dedicado para implementar R8 al menos en `invoice.*` y `service.*` |
| `auth.*` sin audit module que escuche | 🟡 Media | Esperado: módulo audit es stub. Cuando se implemente, listener natural. |
| `service.*` sin provisioning que escuche | 🟡 Media | Esperado: provisioning es stub. Plan: Sprint dedicado. |
| Naming 100% consistente | ✅ — | Mantener |

---

## Documentos relacionados

- [`README.md`](./README.md) — Cómo usar `20-modules/`
- [`_matrix.md`](./_matrix.md) — Matriz de dependencias entre módulos
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md#r8--eventos-cr%C3%ADticos-usan-outbox-pattern) — Regla R8 (Outbox)
- [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — Términos: evento, outbox, listener, worker
