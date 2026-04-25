# ADR-037 — Arquitectura dual de soporte: chat + tickets

> **Status:** Active (supersedes ADR-035)
> **Date:** 2026-04 (Sprint 7.B) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §43 (versión actualizada)
> **Domain:** support

---

## Contexto

El sistema original (ADR-035) trataba "chat" y "conversaciones asíncronas" como variantes del mismo concepto. La práctica reveló problemas:

1. **Nomenclatura inconsistente** — "Casos", "Conversaciones asíncronas", "tickets" se usaban indistintamente.
2. **UX confusa** — cliente y agente no percibían diferencia entre chat y "caso", aunque su propósito y cadencia son radicalmente distintos.
3. **Acciones mezcladas** — botones de "Resolver" y "Cerrar" coexistían con "Escalar a ticket" sin lógica clara de cuándo aparece cada uno.

En Sprint 7.B se rediseñó con **arquitectura dual explícita:** dos sistemas paralelos que **comparten modelo de datos** pero tienen **UX, cadencia y propósito completamente distintos**. La nomenclatura canónica se fijó: **chat** y **ticket**.

---

## Decisión

### Principio fundamental

**Dos sistemas paralelos, mismo modelo de datos.**

| Aspecto | **Chat** (tiempo real) | **Ticket** (asíncrono) |
|---------|----------------------|------------------------|
| Analogía | WhatsApp / Telegram | Gmail / Sistema de tickets |
| Propósito | Soluciones rápidas, trato cercano | Problemas complejos, trazabilidad |
| Cadencia | Instantáneo (WebSocket) | Lento, deliberado (REST + email) |
| Widget cliente | Burbuja flotante (`ChatWidget`) | Página completa `/dashboard/support` |
| Categorías | No aplica | `support_general`, `support_billing`, `support_technical`, `escalated_chat` |
| Vista agente | Panel de chat dedicado, 3 columnas (lista \| conversación \| contexto) | Bandeja tipo Gmail con filtros y columnas ordenables |
| Vista cliente | Widget flotante en landing y dashboard | Página de tickets con histórico |

### Modelo de datos compartido

Tabla `conversations`. Campo `type ∈ {'chat', 'ticket'}`. **Misma tabla, diferente lógica de presentación y entrega.**

Esto permite:
- Reutilizar el modelo de mensajes (`messages`).
- Compartir lógica de asignación de agente, marcado como leído, notas internas.
- Diferenciar UX en frontend según `type`.
- Migrar uno al otro vía escalación (ver siguiente sección).

### Escalación: chat → ticket

```
Agente en panel de chat pulsa "Escalar a ticket"
                ↓
Crear ticket nuevo con:
  - escalated_from_id: <id del chat origen>
  - subject: heredado del chat (editable)
  - category: 'escalated_chat'
  - priority: heredada o ajustada por el agente
                ↓
El historial del chat se copia como UN mensaje de sistema
(NO como mensajes individuales — preserva contexto sin contaminar el thread)
                ↓
Chat origen → status: 'resolved' con resolution_note explicando la escalación
                ↓
Cliente recibe email: "Tu consulta se ha escalado para un seguimiento más detallado"
```

**Restricciones (Sprint 7 hardening):**

- **Una conversación solo se escala una vez** (Sprint 7.H2): `escalateToTicket()` valida que `escalated_to` no existe ya. Si ya escalada → 409 Conflict.
- **Comportamiento post-escalación** (Sprint 7.H4): si el cliente escribe en un chat ya escalado a ticket, **se redirige al ticket** (no se reabre el chat).

### Endpoints REST separados

```
POST   /api/v1/support/chats              ← crear chat
GET    /api/v1/support/chats              ← listar chats (filtrado por type='chat')
POST   /api/v1/support/chats/guest        ← crear chat anónimo (landing)
PATCH  /api/v1/support/conversations/:id/escalate   ← escalar chat a ticket

POST   /api/v1/support/tickets            ← crear ticket directamente
GET    /api/v1/support/tickets            ← listar tickets (filtrado por type='ticket')

# Compartidos
GET    /api/v1/support/conversations/:id           ← detalle (cualquier type)
PATCH  /api/v1/support/conversations/:id           ← actualizar estado
POST   /api/v1/support/conversations/:id/messages  ← añadir mensaje
GET    /api/v1/support/conversations/stats         ← stats filtrados por type
```

### WebSocket gateway (`/support`)

- Reservado para **chats** primariamente. Tickets también soportan realtime en su detalle pero no usan widget flotante.
- Auth dual: JWT (clientes y agentes) + `guest_session_token` (chats anónimos en landing).
- Detalle completo en `docs/20-modules/support/contract.md`.

### Widget de chat flotante (`ChatWidget`)

- **Solo visible para clientes y guests.** Los agentes usan la bandeja completa.
- WebSocket con JWT auth. Fallback REST para persistencia garantizada (Sprint 7.H1: WS + REST con dedupe en backend para evitar mensajes duplicados).
- Reutilizable: dashboard hoy, landing en Sprint 7.4.
- **CTA "Empezar conversación"** en parte superior (no input enterrado al fondo) — Sprint 7.H20.
- Lista de conversaciones recientes con scroll independiente.

### Vistas del soporte (Sprint 7.B)

#### Panel de chats en vivo (`/dashboard/support/chats`)
- **Propósito:** operativo. El agente atiende múltiples chats en tiempo real.
- **Layout:** 3 columnas — lista de chats | conversación activa | sidebar de contexto.
- **Tecnología:** WebSocket para mensajes en tiempo real.
- **Acciones en topbar:** Resolver · Cerrar.
- **Acciones en sidebar:** Ver perfil del cliente · Escalar a ticket.

#### Bandeja de tickets (`/dashboard/support`)
- **Propósito:** gestión asíncrona tipo Gmail.
- **Layout:** lista con columnas ordenables (estado, prioridad, agente, categoría, última actividad).
- Filtros por categoría, prioridad, estado, asignado.

#### Página de detalle canónica (`/dashboard/support/[id]`)
- **Propósito:** consulta, auditoría, gestión. Funciona para chats Y tickets.
- **Layout:** 2 columnas — conversación completa | sidebar de contexto.
- **Navegación entrante:** desde ficha del cliente (tab Soporte), notas vinculadas, lista de tickets, emails.

### Coherencia de acciones (Sprint 7.H24)

- **Topbar:** acciones de resolución (Resolver, Cerrar).
- **Sidebar:** acciones de navegación / gestión (Ver perfil, Escalar, Ir a chats).
- **No se duplican** acciones entre topbar y sidebar.

### WDIFY deprecado en categorías de ticket (ADR-022)

- `wdify_progress` → eliminada (la trazabilidad de desarrollo vive en proyectos, ADR-046).
- `wdify_feedback` → eliminada (feedback vía chat o proyecto).
- Tickets existentes con estas categorías se migran a `support_technical`.

---

## Consecuencias

- ✅ **Ganamos:**
  - Nomenclatura canónica: **chat** y **ticket**, sin más sinónimos.
  - UX diferenciada que comunica el propósito al cliente y agente.
  - Escalación documentada con contexto preservado.
  - Coherencia de acciones (topbar resolutivo, sidebar navegacional).
- ⚠️ **Aceptamos:**
  - Mantener dos UIs (panel chat vs bandeja tickets) duplica trabajo de UI cuando hay cambios cross-tipo. Mitigación: page detail unificada en `[id]/page.tsx`.
  - Escalación crea ticket nuevo en lugar de "convertir" — más limpio pero produce dos registros (chat resolved + ticket nuevo). Aceptable: trazabilidad mejor.
- 🚪 **Cierra:**
  - **No mezclar UI de chat y ticket** en el mismo componente. Page detail unificada es excepción justificada.
  - **No conversaciones híbridas.** Una conversación es chat o ticket, nunca ambos a la vez. Para "convertir" → escalar.

---

## Cuándo revisar

- Si el ratio escalación-chat→ticket es alto (>30% de chats escalan): probablemente el filtro IA no funciona bien o los agentes se rinden rápido. Investigar.
- Si surgen tipos de conversación nuevos (ej: "request" para solicitudes formales con aprobación) → ampliar enum `type` con ADR.

---

## Referencias

- **Módulos afectados:** support.
- **Reglas relacionadas:** R1 (eventos cross-módulo), R15 (límites archivo — refactor Regla 15 aplicado en Sprint 7).
- **ADRs relacionados:** ADR-035 (legacy, superseded por este), ADR-022 (WDIFY deprecado), ADR-038 (notas estructuradas), ADR-039 (nota obligatoria), ADR-040 (rediseño tickets), ADR-034 (Support Inside).
- **Glosario:** [Chat](../00-foundations/glossary.md), [Ticket](../00-foundations/glossary.md), [Conversación](../00-foundations/glossary.md), [Escalación](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/support/`, frontend `app/dashboard/support/`, `ChatWidget/`.
- **Edge cases:** EC-1..EC-11 (Sprint 7 hardening), EC-1 dedupe WS+REST, EC-3 escalación única.
