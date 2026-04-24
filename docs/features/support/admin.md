# Soporte — Documentación Administrativa

> Generado al cierre de Sprint 7 — Arquitectura dual Chat + Tickets
> Última actualización: Sprint 7.5 (Design System + audit)

---

## Arquitectura dual

El módulo de soporte tiene **dos sistemas paralelos**:

| Sistema | Propósito | Analogía | Canal |
|---------|-----------|----------|-------|
| **Chat** | Soluciones rápidas, trato cercano | WhatsApp | WebSocket (widget flotante) |
| **Ticket** | Problemas complejos, trazabilidad | Gmail | REST (página completa) |

Comparten modelo de datos (`Conversation` + `Message`) pero se diferencian por el campo `type` (`chat` | `ticket`).

## Campos del modelo

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `type` | enum | `chat` o `ticket` |
| `category` | enum? | Solo tickets: `support_general`, `support_billing`, `support_technical`, `escalated_chat`. ~~`wdify_progress`, `wdify_feedback`~~ deprecadas → reemplazadas por módulo Projects (§44) |
| `escalated_from_id` | uuid? | Si el ticket fue escalado desde un chat, referencia al chat original |
| `status` | enum | `open`, `waiting_client`, `waiting_agent`, `resolved`, `closed` |
| `priority` | enum | `low`, `normal`, `high`, `urgent` |

## Flujo de estados

```
NUEVO → open
  ↓ (cliente envía mensaje)
waiting_agent
  ↓ (agente responde)
waiting_client
  ↓ (agente marca resuelta)
resolved
  ↓ (agente cierra)
closed
  ↓ (agente reabre)
open (vuelve al ciclo)
```

## Escalación: Chat → Ticket

1. Agente pulsa "⬆ Escalar" en el panel de chat
2. Se crea un ticket con categoría `escalated_chat`
3. El historial del chat se copia como contexto unificado (mensaje de sistema)
4. El chat original se marca como `resolved`
5. El cliente recibe notificación

## Endpoints REST

### Chats (real-time)
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/support/chats` | Crear chat (cliente, desde widget) |
| `GET` | `/support/chats` | Listar chats |
| `POST` | `/support/chats/:id/escalate` | Escalar chat a ticket (agente) |

### Tickets (async)
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/support/tickets` | Crear ticket (cliente o admin con `?targetUserId=`) |
| `GET` | `/support/tickets` | Listar tickets |

### Compartidos
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/support/conversations/:id` | Detalle (chat o ticket) |
| `PATCH` | `/support/conversations/:id` | Actualizar estado/prioridad/asignación |
| `POST` | `/support/conversations/:id/messages` | Añadir mensaje |
| `PATCH` | `/support/conversations/:id/messages/read` | Marcar como leído |
| `GET` | `/support/conversations/stats?type=` | Estadísticas (filtrable por tipo) |
| `GET` | `/support/conversations/unread` | Conteo no leídos |

## Mensajes

- **client**: enviado por el cliente
- **agent**: enviado por un agente/admin
- **system**: generado automáticamente (asignaciones, cambios de estado, escalación)
- **ai**: generado por el filtro IA (futuro — Sprint 7.8)

### Notas internas
- Solo visibles para agentes (`is_internal: true`)
- Borde naranja punteado en la UI
- Los clientes NUNCA ven notas internas

## SLA tracking

- **first_response_at**: primera respuesta de un agente (automático)
- **resolved_at**: cuando se marca como resuelta
- **closed_at**: cuando se cierra
- **Promedio calculado**: últimos 30 días, en dashboard de stats

## Interfaces de usuario

### Panel de chat para agentes (`/dashboard/support/chats`)
- 3 columnas: Lista chats | Conversación RT | Contexto cliente
- WebSocket para mensajería en tiempo real
- Typing indicators bidireccionales
- Notas internas con toggle visual
- Botón "⬆ Escalar a ticket" + "✓ Resolver"
- Panel derecho: avatar, email, empresa, teléfono, servicios activos, acciones rápidas

### Widget flotante de chat (`ChatWidget`)
- Burbuja flotante en la esquina inferior derecha
- Solo visible para clientes (agentes usan el panel completo)
- Conecta por WebSocket para mensajería en tiempo real
- Lista de chats + crear nuevo + chat con typing indicators
- Unread badge, read receipts, auto-scroll
- Reutilizable para landing (futuro Sprint 7.4)

### Bandeja de tickets (`/dashboard/support`)
- Admin: lista de tickets con filtros (estado, categoría, prioridad)
- Cliente: "Mis tickets" con mismos filtros
- Modal de creación: categoría obligatoria + prioridad + asunto + mensaje
- Admin puede crear tickets para clientes (`targetUserId`)

## WebSocket (Socket.io)

### Namespace: `/support`

**Autenticación:** JWT token en `handshake.auth.token`

**Rooms:**
- `conversation:<id>` — participantes de una conversación
- `agent:inbox` — todos los agentes conectados
- `user:<id>` — room personal para notificaciones

**Eventos server→client:**
| Evento | Payload | Uso |
|--------|---------|-----|
| `message:new` | `{ conversationId, message }` | Nuevo mensaje |
| `conversation:new` | `{ conversationId, subject, type }` | Nueva conversación |
| `conversation:updated` | `{ conversationId, ...fields }` | Cambio de estado |
| `typing:start/stop` | `{ conversationId, userId, role }` | Indicador de escritura |
| `unread:update` | `{ count }` | Conteo no leídos |

**Eventos client→server:**
| Evento | Payload | Uso |
|--------|---------|-----|
| `message:send` | `{ conversationId, body, is_internal? }` | Enviar mensaje |
| `conversation:join` | `{ conversationId }` | Unirse a sala |
| `conversation:leave` | `{ conversationId }` | Salir de sala |
| `typing` | `{ conversationId, isTyping }` | Indicador escritura |
| `messages:read` | `{ conversationId }` | Marcar como leído |

## Categorías de tickets

| Categoría | Uso |
|-----------|-----|
| `support_general` | Soporte técnico general |
| `support_billing` | Problemas de facturación |
| `support_technical` | Problemas técnicos del servicio |
| ~~`wdify_progress`~~ | ~~Progreso de proyecto~~ — **DEPRECADA (§44)**. Migrar a `support_technical`. La trazabilidad de desarrollo vive en Projects |
| ~~`wdify_feedback`~~ | ~~Feedback del cliente~~ — **DEPRECADA (§44)**. El feedback se gestiona via chat o proyecto |
| `escalated_chat` | Escalado automático desde un chat |

## Componentes DS utilizados (Sprint 7.5)

### Bandeja de tickets (`/dashboard/support`)
| Componente | Uso |
|------------|-----|
| `ListPage` | Layout con título, statusTabs, filterBar, pagination |
| `StatusTabs` | Tabs con contadores: Todas, Abiertas, Esperando, Resueltas |
| `FilterBar` | Container para SearchInput + Select categoría |
| `Card` | Ticket cards con Badge + metadata |
| `Badge` | Estado (success/warning/danger/neutral) + prioridad |
| `EmptyState` | Sin tickets |
| `Skeleton` | Loading de lista |
| `Pagination` | Paginación estándar |
| `Modal` | Crear ticket (Input + Select + Textarea + SearchInput admin) |
| `Button` | CTA “Nuevo ticket” con texto role-aware |
| `useToast` | Feedback de creación |

### Panel de chats (`/dashboard/support/chats`)
| Componente | Uso |
|------------|-----|
| `SearchInput` | Búsqueda de chats |
| `Badge` | Estado chat + mensaje count |
| `StatusDot` | Online/offline del cliente |
| `Skeleton` | Loading de lista |
| `EmptyState` | Sin chats / sin chat seleccionado |
| `Button` | Resolver, Cerrar, Escalar, Enviar |
| `Avatar` | Perfil del cliente en sidebar |
| `Card` | Secciones del sidebar de contexto |
| `Modal` | Resolución (Textarea + Button loading) |
| `useToast` | Feedback de resolución, escalación, vinculación guest |

### Detalle ticket/conversación (`/dashboard/support/:id`)
| Componente | Uso |
|------------|-----|
| `DetailPage` | Layout 2 columnas con breadcrumb DS |
| `Badge` | Estado + prioridad + categoría |
| `Select` | Cambiar estado + prioridad (admin) |
| `Button` | Resolver, Cerrar, Escalar, Enviar |
| `Card` | Sidebar: perfil, servicios, notas, acciones |
| `Skeleton` | Loading conversación + sidebar |
| `Modal` | Resolución (Textarea + Button loading) |
| `useToast` | Feedback de mensajes, estado, prioridad, resolución |

## Feedback UX (§4)

| Acción | Feedback | Tipo |
|--------|----------|------|
| Crear ticket | Toast success | `useToast` |
| Enviar mensaje (error) | Toast error | `useToast` |
| Cambiar estado | Toast success/error | `useToast` |
| Cambiar prioridad | Toast success/error | `useToast` |
| Resolver/Cerrar chat | Toast success | `useToast` |
| Escalar a ticket | Toast success | `useToast` |
| Vincular guest | Toast success/error | `useToast` |
| Resolución error | Toast error | `useToast` |

## Edge cases documentados

Ver `docs/edge_cases.md`:
- §1.2: `loadChats()` en closure WS se desactualiza si `chatSearch` cambia
- §3.1: Catches silenciosos en `loadConversations` y `loadChats`
- §3.2: 11 `console.error` + 1 `console.log` en producción
- §7.1: Raw `fetch()` para servicios (no usa capa API, params inconsistentes)
- §7.2: WebSocket no maneja reconexión con token expirado
- §7.3: `message:send` vía WS sin confirmación de entrega
- §11.2: Chat poll sin throttle (cada `message:new` dispara fetch)

## Pendiente

- **7.4-7.5**: Chat anónimo desde landing + vinculación por email ✅
- **7.6**: Horario de atención configurable
- **7.7**: Archivos adjuntos (MinIO) — bloqueado por Sprint 14
- **7.8-7.9**: IA (filtro + copilot del agente) — bloqueado por Sprint 15
- **Sprint 8+**: Resolver edge cases P1-P2 documentados en `edge_cases.md`

## Ref

- DECISIONS.md §7 (Support Inside)
- DECISIONS.md §8 (We Do It For You) — **DEPRECADO**, ver §44 (Projects)
- DECISIONS.md §9 (Sistema de comunicación)
- DECISIONS.md §43 (Arquitectura dual Chat + Tickets)
- DECISIONS.md §44 (Sistema de Proyectos — reemplaza WDIFY)
- DECISIONS.md §46 (Rediseño de Tickets)
- UI_SPEC.md §5.7 (Tickets — especificación de página)
- UI_SPEC.md §5.8 (Chats — especificación de página)
- DESIGN_SYSTEM.md (componentes DS)
- edge_cases.md (análisis exhaustivo Sprint 7)
