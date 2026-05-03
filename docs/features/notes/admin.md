# Notes — Guía de administración (consolidación canónica)

> **Doctrina canónica vigente: [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) §3.8** + Amendment A3 (chat → ClientNote) + Amendment A1 (auto-close ticket → cierre silencioso, sin nota nueva).
> Sistema **único y consolidado** de notas estructuradas sobre el cliente con source tracking polimórfico. Refina ADR-038 §"Categorías" + §"Origen de la nota".

> Módulo dueño: `clients` (consolidado en Sprint 16 con `ClientNotesService` en `modules/clients/`).
> Sprints: 7 (modelo legacy 5 categorías) → 16 (refactor canónico ADR-079: 7 categorías + 5 source_system + source_id polimórfico + triggered_by_action).
> Última actualización: 2026-05-03 (post Sprint 16 cierre Fase 16.E).
> Audiencia: staff Aelium (`superadmin` + 3 roles agente) que escribe / lee notas sobre clientes.

---

## 1. Resumen — qué es una `client_note`

Una `client_note` es **registro de cualquier acción significativa del staff sobre un cliente**. Toda interacción que merece trazabilidad pasa por aquí: cierre de ticket, completar mantenimiento, registrar llamada de bienvenida, completar setup manual, marcar item de proyecto, nota libre desde perfil.

**Tres principios canónicos (ADR-079 §3.8):**

1. **Una sola tabla.** No existen `Task.client_note` ni `MaintenanceLog.internal_notes` paralelos — todo va a `client_notes`. La consolidación se hizo en Sprint 16.
2. **Source tracking polimórfico.** Cada nota lleva `source_system` + `source_id` + `triggered_by_action` que la vinculan al sistema de origen. Permite filtrar el historial del cliente con granularidad.
3. **Creación automática vía listener.** El agente NO llama `POST /client-notes` libre (salvo nota excepcional). Cuando el agente completa un trabajo, el `ClientNotesService` correspondiente persiste la nota atómicamente.

---

## 2. Modelo canónico

### 2.1 Categorías (`NoteCategory` — 7 valores)

| Categoría | Cuándo se usa |
|-----------|---------------|
| `support` | Notas de tickets cerrados o chats resueltos |
| `maintenance` | Notas de mantenimientos completados (Support Inside) |
| `onboarding` | Notas de bienvenida / primer servicio del cliente |
| `billing` | Notas relacionadas con facturación / pagos (futuro — sub-sprint billing) |
| `project` | Notas de proyectos completados o items promocionados (Sprint 22) |
| `technical_incident` | Notas de incidentes técnicos del cliente (sin asociación a otro flujo formal) |
| `exceptional` | Nota libre del agente desde perfil cliente, sin actuador |

### 2.2 Source systems (`NoteSourceSystem` — 5 valores)

| `source_system` | `source_id` apunta a | Cuándo se crea |
|-----------------|---------------------|----------------|
| `ticket` | `conversations(id)` (type=ticket) | Cierre / resolución de ticket |
| `chat` (Amendment A3) | `conversations(id)` (type=chat) | Chat resuelto manualmente o por escalación |
| `maintenance_log` | `support_inside_slots(id)` | `MaintenanceLogService.recordCompletion()` (atómico) |
| `task_completion` | `tasks(id)` | Agente completa task `provisioning_manual` / `client_lifecycle` / `project` |
| `exceptional` | null | Endpoint `POST /admin/clients/:id/structured-notes` (nota libre) |

### 2.3 `triggered_by_action` — granularidad fina

Acciones canónicas registradas:

- `ticket.resolved`
- `ticket.closed`
- `chat.resolved` (Amendment A3)
- `task.completed`
- `maintenance.completed`
- `manual_entry` (alias de `exceptional`)

Sirve para filtrar el historial del cliente con criterio fino sin descender al detalle del sistema vinculado.

---

## 3. Punto de creación canónico — `ClientNotesService`

Consolidado en Sprint 16 en `backend/src/modules/clients/client-notes.service.ts`. **Es el único punto que escribe en `client_notes`** salvo el endpoint público de nota excepcional.

| Método | Invocador | `source_system` | `category` | `triggered_by_action` |
|--------|-----------|-----------------|------------|-----------------------|
| `createFromTicketCompletion(...)` | `support.updateConversation(status='resolved' \| 'closed')` o bridge ticket task | `ticket` | `support` | `ticket.resolved` o `ticket.closed` |
| `createFromChatCompletion(...)` (Amendment A3) | `support.updateConversation(status='resolved')` cuando es chat, o `escalateToTicket()` | `chat` | `support` | `chat.resolved` |
| `createFromMaintenanceCompletion(...)` | `MaintenanceLogService.recordCompletion()` (atómico) | `maintenance_log` | `maintenance` | `maintenance.completed` |
| `createFromTaskCompletion(...)` | `TasksService.complete()` para `provisioning_manual` / `client_lifecycle` / `project` | `task_completion` | `support` / `onboarding` / `project` (según `task.source_system`) | `task.completed` |
| `createExceptional(...)` | Endpoint público (única vía libre) | `exceptional` | `exceptional` | `manual_entry` |
| `findByClient(clientId, filters?)` | Listado timeline cliente (lectura) | — | — | — |
| `findByTask(taskId)` | Listado notas vinculadas a task (vista detalle) | — | — | — |

**Por qué consolidación:** antes de Sprint 16, las notas vivían dispersas en 3 mecanismos paralelos (`Task.client_note`, `client_notes(task_id)`, `MaintenanceLog.internal_notes`). Cada flujo había elegido el suyo y ninguno era canónico. La consolidación Sprint 16 fija un único punto de creación y un schema único.

---

## 4. UI canónica — `ClientNotesTab`

Vista cliente: `/admin/clients/[id]` → tab "Notas" (`frontend/app/admin/clients/[id]/ClientNotesTab.tsx`).

### 4.1 Listado

Por defecto: cronológico descendente (`created_at DESC`). Pinned arriba siempre.

**Filtros disponibles:**

- **Por `source_system`**: `ticket` / `chat` / `maintenance_log` / `task_completion` / `exceptional`.
- **Por `category`**: `support` / `maintenance` / `onboarding` / `billing` / `project` / `technical_incident` / `exceptional`.
- **Sólo pinned**.

### 4.2 Render de la nota

Cada item muestra:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [📌 if pinned]  [category badge]  [source_system icon]                │
│  Body de la nota (texto libre).                                         │
│                                                                         │
│  por <Author> · <relative_time> · [Ver origen →]                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Botón "Ver origen →"** (helper `noteSourceHref`) según `source_system`:

| `source_system` | `source_id` apunta a | Link |
|-----------------|---------------------|------|
| `ticket` | `conversation_id` | `/admin/support/[id]` |
| `chat` | `conversation_id` | `/admin/support/[id]` |
| `maintenance_log` | `slot_id` | (sin link aún — DC.36 condicional Sprint 22) |
| `task_completion` | `task_id` | (depende del `task.source_system` original — pendiente DC.36 Sprint 22) |
| `exceptional` | null | (sin link) |

### 4.3 Botón "Añadir nota excepcional"

Header del tab → modal `ExceptionalNoteModal.tsx`:

- Body de la nota (textarea, max 50.000 caracteres).
- Toggle pinned (default false).
- Persiste con `source_system='exceptional'`, `category='exceptional'`, `triggered_by_action='manual_entry'`, `source_id=null`.

> **CASL `Manage.ClientNote`**: solo `superadmin` y `agent_full` pueden crear notas excepcionales (evita spam). `agent_billing` y `agent_support` tienen `Read+Create+List` sobre `ClientNote` pero la creación **siempre va vía listener / modal de completar**, no vía endpoint libre.

### 4.4 Toggle pin

Botón "📌 Fijar" en cada nota → `PATCH /admin/clients/notes/:noteId/pin` (toggle). Las pinned aparecen primero. Útil para resaltar contexto importante (ej. "este cliente prefiere comunicación por email, NO llamarle nunca").

---

## 5. Endpoints REST

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/admin/clients/:id/structured-notes` | Listado paginado canónico con filtros: `?source_system=...&category=...&pinned_only=...&page=...` | `Read.ClientNote` |
| `POST` | `/admin/clients/:id/structured-notes` | Crear nota excepcional (única vía pública libre). Body: `{ body, is_pinned? }`. | `Manage.ClientNote` (superadmin + agent_full) |
| `PATCH` | `/admin/clients/notes/:noteId/pin` | Toggle pin de nota. | `Update.ClientNote` |
| `GET` | `/tasks/:id/notes` | Notas vinculadas a una task específica (`source_system='task_completion'` + `source_id=task.id`). | `Read.Task` |

> **NO existe** `POST /api/v1/client-notes` libre. La creación vía cierre de ticket / mantenimiento / task / chat siempre va vía listener, no vía endpoint público.

---

## 6. Nota obligatoria al completar — regla canónica (ADR-079 §3.9)

| Acción del staff | Nota obligatoria | Categoría asignada | Source system |
|------------------|------------------|--------------------|---------------|
| Resolver ticket support | NO (el modal de support ya pide `internal_note` que pasa al `ClientNotesService`) | `support` | `ticket` |
| Cerrar ticket support | NO (idem) | `support` | `ticket` |
| Resolver chat (Amendment A3) | NO (el modal de support pide nota de cierre que pasa al `ClientNotesService`) | `support` | `chat` |
| Completar mantenimiento | NO (el modal de mantenimiento ya pide `client_facing_notes` + `internal_notes`; `internal_notes` va a `ClientNotesService`) | `maintenance` | `maintenance_log` |
| Completar setup servicio (`provisioning_manual`) | **SÍ** (modal `CompleteTaskModal` exige nota) | `support` | `task_completion` |
| Marcar contactado (`client_lifecycle`) | **SÍ** (modal exige nota obligatoria de la llamada) | `onboarding` | `task_completion` |
| Marcar item completado (`project`) | **SÍ** (modal exige nota explicando qué se hizo) | `project` | `task_completion` |
| Cancelar task | NO (la cancelación es consecuencia mecánica de evento cross-sistema — Amendment A2) | — | — |
| `not_completed_in_time` (cron) | NO (fallo operativo, no acción del agente) | — | — |
| Nota libre desde perfil cliente | Sí (sin texto = sin sentido — el modal lo valida) | `exceptional` | `exceptional` |

**Regla canónica:** *si el agente actúa significativamente sobre algo del cliente, queda nota. Si el sistema vinculado ya tiene su propio mecanismo de nota canónico, se delega allí.*

---

## 7. CASL — Permisos

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `ClientNote` | Manage | Manage | Read+Create+List | Read+Create+List | — | — |

**Reglas derivadas:**

- **`Read+Create+List`** lo tienen todos los agentes porque cualquier acción que completen genera nota. La creación va siempre vía listener / modal de completar; no hay endpoint `POST /client-notes` libre salvo el de "nota excepcional" restringido a `Manage.ClientNote`.
- **`Manage`** (superadmin + agent_full): pueden crear nota excepcional, editar, borrar. Edición y borrado deben evitarse en práctica — las notas son trazabilidad cliente.
- **Cliente y partner NO ven notas internas.** Son herramienta del staff. (El portal RGPD `/dashboard/transparency` muestra eventos audit, no las notas internas — son cosas distintas.)

---

## 8. Schema (resumen — detalle en `docs/30-data/clients.md`)

```prisma
enum NoteCategory {
  support
  maintenance
  onboarding
  billing
  project
  technical_incident
  exceptional
}

enum NoteSourceSystem {
  ticket
  chat               // Amendment A3
  maintenance_log
  task_completion
  exceptional
}

model ClientNote {
  id                    String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id               String              @db.Uuid     // Cliente
  author_id             String              @db.Uuid     // Staff que escribió
  category              NoteCategory
  body                  String              @db.Text
  source_system         NoteSourceSystem
  source_id             String?             @db.Uuid     // Polimórfico, sin FK física salvo opcional a Task
  triggered_by_action   String?             @db.VarChar(100)
  is_pinned             Boolean             @default(false)
  created_at            DateTime            @default(now()) @db.Timestamptz()

  user                  User                @relation("ClientNoteUser", fields: [user_id], references: [id])
  author                User                @relation("ClientNoteAuthor", fields: [author_id], references: [id])
  task                  Task?               @relation("TaskClientNotes", fields: [source_id], references: [id], onDelete: SetNull, map: "fk_clientnote_task_optional")

  @@index([user_id, created_at(sort: Desc)])
  @@index([author_id])
  @@index([source_system, source_id])
  @@index([category])
  @@map("client_notes")
}
```

---

## 9. Buenas prácticas

- **Escribe la nota como si fuese leída en 6 meses por otro agente.** Contexto + qué hiciste + por qué.
- **Para tickets / chats / mantenimientos**, la nota canónica la escribes en el modal del sistema vinculado (no la dupliques excepcionalmente).
- **Nota excepcional** úsala solo para contextos que NO salen de un flujo automático (decisión interna, observación comentada por teléfono fuera de chat, comportamiento del cliente que merece registro).
- **Pin** úsalo para contextos que cualquier agente que abra la ficha en el futuro debe ver inmediatamente. No abuses — pinned excesivos pierden señal.
- **NO edites notas a posteriori.** Si la nota original era incorrecta, añade nota excepcional rectificando.
- **Si la nota toca datos sensibles** (RGPD), valora si debería vivir en `audit_change_log` con campos cifrados o si la nota basta para el caso.

---

## 10. Cómo testear este flujo (smoke manual)

1. **Resolver un ticket** → verificar nota nueva en perfil cliente con `source_system='ticket'` + `category='support'` + `triggered_by_action='ticket.resolved'`.
2. **Resolver un chat (Amendment A3)** → verificar nota con `source_system='chat'` + `category='support'` + `triggered_by_action='chat.resolved'`.
3. **Completar mantenimiento** → verificar nota con `source_system='maintenance_log'` + `category='maintenance'` + email cliente con `client_facing_notes` + nota interna en `client_notes`.
4. **Completar task de bienvenida** → verificar nota con `source_system='task_completion'` + `category='onboarding'` + `triggered_by_action='task.completed'`.
5. **Crear nota excepcional** desde perfil cliente → modal → verificar nota con `source_system='exceptional'`.
6. **Filtros UI** funcionan independientes (por categoría / por source_system / pinned only).
7. **Pin / unpin** una nota → reorden inmediato (pinned arriba).
8. **Click "Ver origen →"** en nota `ticket` → te lleva a `/admin/support/[id]`.

---

## 11. Referencias

- [ADR-079 §3.8](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) — Consolidación canónica de notas con source tracking + Amendment A3 (chat → ClientNote)
- [ADR-038](../../10-decisions/adr-038-notas-estructuradas-cliente.md) — Notas estructuradas v1 (parcialmente superseded)
- [ADR-039](../../10-decisions/adr-039-nota-obligatoria-transiciones.md) — Nota obligatoria en transiciones (refinada por ADR-079 §3.9)
- [ADR-067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md) — Granularidad CASL
- [`docs/30-data/clients.md`](../../30-data/clients.md) — Schema canónico `client_notes`
- [`docs/features/tasks/admin.md`](../tasks/admin.md) — Tasks como bridge (relacionado)
- [`docs/features/support/lifecycle.md`](../support/lifecycle.md) — Lifecycle ticket vs chat (Amendments A1+A3)
