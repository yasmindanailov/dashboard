# ADR-038 — Sistema de notas estructuradas del cliente

> **Status:** Active
> **Date:** 2026-04 (Sprint 7.B) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §41
> **Domain:** clients, support

---

## Contexto

Antes del Sprint 7.B, las notas internas sobre clientes vivían en un campo `notes_internal` (texto libre) en `client_profiles`. Limitaciones detectadas:

- **No categorizable:** todas las notas se mezclaban sin distinción de propósito (¿es problema técnico? ¿histórico de soporte? ¿negociación de precio?).
- **No buscable:** texto monolítico sin filtros.
- **No vinculable a conversaciones:** una nota técnica no podía enlazar a la conversación que la motivó.
- **No auditable:** sin autoría ni fecha por nota individual.
- **No destacable:** información crítica perdida en el texto.

Resultado: los agentes **perdían contexto** al atender clientes recurrentes, repetían preguntas que el cliente ya había respondido, no encontraban soluciones aplicadas anteriormente.

---

## Decisión

### Modelo `ClientNote` — tabla dedicada

```prisma
model ClientNote {
  id              String          @id @default(uuid()) @db.Uuid
  client_user_id  String          @db.Uuid     // FK a User (cliente)
  category        NoteCategory                  // enum
  body            String                         // contenido
  is_pinned       Boolean         @default(false)
  author_id       String?         @db.Uuid     // FK a User (agente que la creó)
  conversation_id String?         @db.Uuid     // FK a Conversation (origen, opcional)
  created_at      DateTime        @default(now())
  updated_at      DateTime        @updatedAt

  @@index([client_user_id])
  @@index([conversation_id])
  @@map("client_notes")
}

enum NoteCategory {
  general          // por defecto
  conversation     // generada al añadir nota interna en una conversación
  solution         // generada al resolver / cerrar conversación con resolution_note
  billing          // notas relacionadas con facturación específica
  technical        // notas técnicas del servicio
}
```

### Categorías y semántica

| Categoría | Cuándo se usa | Auto-generada? |
|-----------|---------------|----------------|
| `general` | Nota libre del agente sobre el cliente. Default. | Manual; también auto al reabrir conversación |
| `conversation` | Nota interna escrita por agente DENTRO de una conversación | Auto: cuando se manda mensaje con `is_internal: true` |
| `solution` | Cómo se resolvió un problema | Auto: cuando se resuelve / cierra conversación con `resolution_note` |
| `billing` | Negociaciones, descuentos especiales, problemas de cobro | Manual desde ficha del cliente |
| `technical` | Configuraciones específicas del cliente, particularidades técnicas | Manual desde ficha del cliente |

### Auto-creación (sincronización bidireccional)

| Evento | Categoría | Dónde se dispara | Vinculación |
|--------|-----------|------------------|-------------|
| Agente envía mensaje interno (`is_internal: true`) | `conversation` | `SupportService.addMessage` | `conversation_id` populado |
| Resolver conversación (`status → resolved` con `resolution_note`) | `solution` | `SupportService.updateConversation` | `conversation_id` + autor |
| Cerrar conversación (`status → closed` con `resolution_note`) | `solution` | `SupportService.updateConversation` | `conversation_id` + autor |
| Reabrir conversación (`status → open` con `resolution_note`) | `general` | `SupportService.updateConversation` | `conversation_id` + autor |
| Nota manual desde ficha del cliente | la que elija el agente | `ClientsService.addNote` | sin `conversation_id` |

### API REST

```
GET   /api/v1/clients/:id/structured-notes?category=X&limit=N
POST  /api/v1/clients/:id/structured-notes
PATCH /api/v1/clients/notes/:noteId/pin
```

Filtros soportados en GET:
- `category` (opcional) — una de las 5 categorías
- `pinned` (opcional, boolean) — solo pinneadas
- `with_conversation` (opcional, boolean) — solo las vinculadas a conversaciones
- `limit` y `offset` — paginación

### Pin de notas

- Campo `is_pinned: boolean`. Las pinneadas aparecen primero en listings.
- **Recomendado:** máximo 3 pinneadas visibles a la vez (no enforced — convención).
- Toggle vía `PATCH /clients/notes/:noteId/pin`.

### Convivencia con legacy

- El campo `notes_internal` (texto libre) en `client_profiles` se **mantiene por backward compat**.
- Al usar el endpoint legacy `POST /clients/:id/notes`, se escribe en **ambos**:
  - Campo de texto `notes_internal` (concatenado).
  - Tabla `client_notes` con categoría `general`.
- UI nueva debe usar exclusivamente el endpoint structured. El legacy se mantiene mientras código antiguo lo siga llamando.

### Visualización en ficha del cliente

Tab "Notas" en `/dashboard/clients/[id]`:
- Pinneadas arriba.
- Filtros por categoría (chips).
- Cada nota muestra: categoría (badge), autor, fecha, body, link a conversación origen si aplica.

### Visibilidad por rol

- **Agentes y admin:** todas las notas del cliente.
- **El cliente:** **NO ve estas notas.** Son **internas**, distintas de las notas de cliente que el cliente sí pueda ver en otros contextos. Si en el futuro se quiere exponer alguna al cliente vía portal de transparencia, requiere ADR adicional.
- **Partner:** ve solo las notas de SUS clientes referidos (CASL condition `client_user_id IN (partner.clients)`).

---

## Consecuencias

- ✅ **Ganamos:**
  - Notas categorizadas y buscables.
  - Trazabilidad completa: quién, cuándo, en qué conversación.
  - Auto-generación reduce fricción: el agente no tiene que copiar notas internas a la ficha del cliente — pasa solo.
  - Pin destaca lo crítico.
- ⚠️ **Aceptamos:**
  - Doble escritura legacy + structured durante transición. Eventualmente el campo `notes_internal` se eliminará (sprint dedicado de cleanup) — hoy se mantiene.
  - Auto-generación puede crear ruido si los agentes escriben muchas notas internas sueltas en conversaciones — se sincronizan TODAS a `client_notes` categoría `conversation`. Filtro en UI permite ocultar este ruido al ver "lo importante".
- 🚪 **Cierra:**
  - **No notas no categorizadas en la UI nueva.** El campo `notes_internal` legacy sigue existiendo pero no se promueve.
  - **No edición / borrado de notas históricas.** Si una nota es errónea, se añade nota correctiva nueva (R3 patrón análogo).

---

## Cuándo revisar

- Si los agentes piden categorías nuevas (ej: `legal`, `marketing`): añadir al enum `NoteCategory` con migración.
- Si el cliente debería ver alguna nota (transparencia) → ADR adicional con scope visible-al-cliente.
- Si el ruido de auto-generación afecta la usabilidad → hacer la creación auto opt-in en lugar de default.

---

## Referencias

- **Módulos afectados:** clients (propietario), support (genera notas via auto-sync).
- **Reglas relacionadas:** R1 (módulos no se llaman directamente — pero support escribe a `client_notes`, excepción documentada en `support/contract.md`).
- **ADRs relacionados:** ADR-037 (arquitectura dual chat+tickets), ADR-039 (nota obligatoria en transiciones).
- **Glosario:** [Nota del cliente](../00-foundations/glossary.md), [Nota interna](../00-foundations/glossary.md), [Conversación](../00-foundations/glossary.md).
- **Implementación:** schema Prisma `ClientNote` y enum `NoteCategory`, `backend/src/modules/clients/clients-billing.service.ts` (parcial — gestión de notas), `SupportMessageService` para auto-sync.
