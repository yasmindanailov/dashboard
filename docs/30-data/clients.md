# Clients — Schema

> **Dominio:** clientes (CRM ligero), perfiles fiscales, notas estructuradas, organización personal.
> **Módulo:** [`docs/20-modules/clients/contract.md`](../20-modules/clients/contract.md).
> **Sprint origen:** Sprint 0 (`client_profiles`) + Sprint 4 (`billing_profiles`, `client_consents`, folders, tags) + Sprint 7 (`client_notes`).
> **Estado:** ✅ parcialmente implementado. ⬜ folders/tags/consents pendientes.
> **ADRs:** [010](../10-decisions/adr-010-rgpd-retencion-datos.md) (RGPD) · [038](../10-decisions/adr-038-notas-estructuradas-cliente.md) (notas) · [045](../10-decisions/adr-045-gestion-clientes-crm.md) (CRM ligero) · [060](../10-decisions/adr-060-decisiones-pre-schema.md) (perfiles fiscales múltiples).

---

## Resumen de tablas

| Tabla | Estado | Sprint | Propósito |
|-------|--------|--------|-----------|
| `client_profiles` | ✅ | 0 | Datos del cliente (1:1 con `users`). Notas históricas. |
| `billing_profiles` | ✅ | 4 | Perfiles fiscales múltiples por cliente (personal / autónomo / empresa) |
| `client_consents` | ⬜ | 4 | Consentimientos RGPD de analíticas e integraciones no esenciales |
| `client_folders` | ⬜ | 4 | Carpetas opcionales del cliente para organizar sus servicios |
| `client_service_folders` | ⬜ | 4 | Relación servicio ↔ carpeta |
| `client_service_tags` | ⬜ | 4 | Etiquetas opcionales del cliente sobre sus servicios |
| `client_notes` | ✅ | 7 + refactor 16 | Notas estructuradas con source tracking polimórfico (`source_system` + `source_id` + `triggered_by_action`). Canónico ADR-079 §3.8. |

---

## Tabla: `client_profiles` ✅

Perfil del cliente. Datos de facturación (legacy — los nuevos van en `billing_profiles`), contacto y notas internas históricas. Cada cliente tiene exactamente un perfil (1:1 con `users`).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE, UQ | |
| `client_type` | enum `ClientType` | DEFAULT `'individual'` | `individual` · `company` |
| `company_name` | varchar(300) | NULLABLE | Solo si company |
| `tax_id` | varchar(20) | NULLABLE | NIF/CIF. Obligatorio para company. |
| `phone` | varchar(20) | NULLABLE | |
| `address_line1` | varchar(500) | NULLABLE | |
| `address_line2` | varchar(500) | NULLABLE | |
| `city` | varchar(100) | NULLABLE | |
| `state` | varchar(100) | NULLABLE | |
| `postal_code` | varchar(10) | NULLABLE | |
| `country` | varchar(2) | DEFAULT `'ES'` | ISO 3166-1 alpha-2 |
| `billing_email` | varchar(255) | NULLABLE | Email alternativo para facturas |
| `notes_internal` | text | NULLABLE | **(Legacy)** Reemplazado por `client_notes` (estructuradas, ADR-038). Conservar por compat. |
| `stripe_customer_id` | varchar(200) | NULLABLE | ID en Stripe |
| `credit_balance` | decimal(10,2) | DEFAULT `0` | Saldo a favor del cliente |
| `metadata` | json | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

> **⚠️ Limitación histórica:** un solo perfil de facturación por cliente. **Resuelta** con `billing_profiles` (perfiles múltiples — ver siguiente).

---

## Tabla: `billing_profiles` ✅ (Sprint 4)

Perfiles fiscales del cliente. Un cliente puede tener varios. Decisión [ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md): personal + autónomo + empresa simultáneamente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `type` | enum | NOT NULL | `personal` · `autonomo` · `empresa` |
| `label` | varchar(100) | NOT NULL | Nombre interno del cliente: "Mi empresa", "Personal" |
| `first_name` | varchar(100) | NULLABLE | Para personal y autónomo |
| `last_name` | varchar(100) | NULLABLE | Para personal y autónomo |
| `company_name` | varchar(200) | NULLABLE | Para empresa |
| `nif_cif` | varchar(20) | NULLABLE | Obligatorio para `autonomo` y `empresa`. Opcional para `personal` (sin NIF → factura simplificada) |
| `address_line1` | varchar(255) | NOT NULL | |
| `address_line2` | varchar(255) | NULLABLE | |
| `city` | varchar(100) | NOT NULL | |
| `postal_code` | varchar(20) | NOT NULL | |
| `country` | varchar(2) | NOT NULL, DEFAULT `'ES'` | ISO 3166-1 alpha-2 |
| `is_default` | boolean | NOT NULL, DEFAULT `false` | Solo uno puede ser `true` por usuario |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_billing_profiles_user_id` — en `user_id`
- `idx_billing_profiles_default` — PARTIAL UNIQUE en `(user_id)` WHERE `is_default = true`

**Notas de decisión:**
- Sin NIF en perfil `personal` → factura simplificada (`invoices.type = 'simplified'`).
- Validar a nivel de constraint o trigger: `type IN ('autonomo','empresa') REQUIRES nif_cif IS NOT NULL`.

---

## Tabla: `client_consents` ⬜ (Sprint 4)

Consentimientos RGPD de analíticas y privacidad por cliente. Las integraciones técnicas necesarias (Stripe, Enhance CP, etc.) **no aparecen aquí** — siempre activas. Ver `integrations_registry` ([system.md](./system.md)) para el catálogo público.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `consent_type` | enum | NOT NULL | `internal_analytics` · `third_party_analytics` |
| `granted` | boolean | NOT NULL, DEFAULT `false` | |
| `granted_at` | timestamptz | NULLABLE | |
| `revoked_at` | timestamptz | NULLABLE | |
| `ip_address` | inet | NULLABLE | IP en el momento de la decisión |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(user_id, consent_type)`

**Notas de decisión:**
- Antes de enviar datos a integraciones no esenciales, el sistema valida esta tabla.
- Cada envío queda registrado en `audit.integration_log` ([audit.md](./audit.md)) con `consent_validated` y `consent_granted`.

---

## Tabla: `client_folders` ⬜ (Sprint 4)

Carpetas opcionales creadas por el cliente para organizar sus servicios. Solo visible al cliente — el agente ve siempre lista plana.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `name` | varchar(100) | NOT NULL | |
| `color` | varchar(7) | NULLABLE | Color hex: `#3B82F6` |
| `order_index` | integer | NOT NULL, DEFAULT `0` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

---

## Tabla: `client_service_folders` ⬜ (Sprint 4)

Relación entre servicios y carpetas del cliente. Un servicio en una sola carpeta a la vez.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `service_id` | uuid | NOT NULL, FK → `services(id)` ON DELETE CASCADE, UQ | Un servicio en una sola carpeta |
| `folder_id` | uuid | NOT NULL, FK → `client_folders(id)` ON DELETE CASCADE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

---

## Tabla: `client_service_tags` ⬜ (Sprint 4)

Etiquetas opcionales del cliente sobre sus servicios. Múltiples por servicio.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `service_id` | uuid | NOT NULL, FK → `services(id)` ON DELETE CASCADE | |
| `tag` | varchar(50) | NOT NULL | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(service_id, tag)`

---

## Tabla: `client_notes` ✅ (Sprint 7 → refactor canónico Sprint 16)

> **Doctrina canónica vigente: [ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) §3.8** + Amendment A3 (lifecycle chat: ClientNote canónica con `source_system='chat'`).
> Una sola tabla de notas; todas las acciones del staff sobre el cliente quedan registradas con source tracking polimórfico. Refina ADR-038 §"Categorías" + §"Origen de la nota".

Notas estructuradas del cliente. Cada acción significativa del agente sobre un cliente (cerrar ticket, completar mantenimiento, registrar llamada de bienvenida, completar setup manual, marcar item de proyecto, nota libre desde perfil cliente) deja un `client_notes` con `source_system` + `source_id` + `triggered_by_action`. Reemplaza el campo legacy `client_profiles.notes_internal`.

**Enum `NoteCategory` (canónico Sprint 16):** `support` · `maintenance` · `onboarding` · `billing` · `project` · `technical_incident` · `exceptional`

**Enum `NoteSourceSystem` (nuevo Sprint 16):** `ticket` · `chat` · `maintenance_log` · `task_completion` · `exceptional`

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Cliente al que pertenece la nota |
| `author_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE RESTRICT | Staff que escribió. RESTRICT para impedir borrado de usuario con notas |
| `category` | enum `NoteCategory` | NOT NULL | 7 valores canónicos: `support` (tickets/chats) · `maintenance` (mantenimientos) · `onboarding` (bienvenida primer servicio) · `billing` (notas relacionadas con facturación) · `project` (notas de proyectos) · `technical_incident` (notas de incidentes técnicos del cliente) · `exceptional` (nota libre del agente desde perfil cliente, sin actuador) |
| `body` | text | NOT NULL | Contenido de la nota |
| **`source_system`** | enum `NoteSourceSystem` | NOT NULL | 5 valores canónicos: `ticket` (ticket cerrado/resolved → nota) · `chat` (Amendment A3 — chat resuelto → nota) · `maintenance_log` (mantenimiento completado) · `task_completion` (task non-bridge completada: `provisioning_manual`/`client_lifecycle`/`project`) · `exceptional` (nota libre desde perfil cliente) |
| **`source_id`** | uuid | NULLABLE | ID en el sistema vinculado (`conversation_id` para `ticket`/`chat`, `slot_id` para `maintenance_log`, `task_id` para `task_completion`, `project_id` para project notes via task). **Sin FK física** salvo relación opcional declarada Prisma a `Task` (cuando `source_system='task_completion'`) — la integridad la valida el listener emisor. null sólo para `exceptional`. |
| **`triggered_by_action`** | varchar(100) | NULLABLE | Acciones canónicas: `ticket.resolved` · `ticket.closed` · `chat.resolved` · `task.completed` · `maintenance.completed` · `manual_entry` (alias de `exceptional`). Sirve para audit / filtrado fino. |
| `is_pinned` | boolean | NOT NULL, DEFAULT `false` | Notas fijadas aparecen primero |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_client_notes_user_created` — `(user_id, created_at DESC)` — listado timeline cliente.
- `idx_client_notes_author` — `author_id`.
- `idx_client_notes_source` — `(source_system, source_id)` — para enriquecer con info del sistema vinculado.
- `idx_client_notes_category` — `category`.

**Cambios respecto al schema pre-Sprint 16:**

| Cambio | Tipo |
|--------|------|
| Drop columnas `conversation_id` + `task_id` directas | breaking — reemplazadas por `(source_system, source_id)` polimórfico. |
| Drop enum `NoteCategory` legacy (`conversation`/`solution`/`billing`/`technical`/`general`) | breaking — mapping intencional perdido (Opción B drop+reseed por ADR-069 pre-producción). El enum canónico nuevo no es backward-compatible. |
| Añadir `source_system` enum `NoteSourceSystem` (NOT NULL) | nuevo |
| Añadir `source_id` uuid (NULLABLE, sin FK física salvo opcional a `Task`) | nuevo |
| Añadir `triggered_by_action` varchar(100) (NULLABLE) | nuevo |

**Punto canónico de creación — `ClientNotesService` (consolidado Sprint 16 en `modules/clients/`):**

| Método | Trigger | `source_system` / `category` / `triggered_by_action` |
|--------|---------|------------------------------------------------------|
| `createFromTicketCompletion(...)` | Agente resuelve/cierra ticket | `source_system='ticket'`, `category='support'`, `triggered_by_action='ticket.resolved'` o `'ticket.closed'` |
| `createFromChatCompletion(...)` (Amendment A3) | Chat se resuelve manualmente o por escalación | `source_system='chat'`, `category='support'`, `triggered_by_action='chat.resolved'` |
| `createFromMaintenanceCompletion(...)` | `MaintenanceLogService.recordCompletion()` (atómico) | `source_system='maintenance_log'`, `category='maintenance'`, `triggered_by_action='maintenance.completed'` |
| `createFromTaskCompletion(...)` | Agente completa task `provisioning_manual` / `client_lifecycle` / `project` | `source_system='task_completion'`, `category` según `source_system` de la task: `'support'` / `'onboarding'` / `'project'`, `triggered_by_action='task.completed'` |
| `createExceptional(...)` | Endpoint `POST /admin/clients/:id/structured-notes` (única vía pública libre) | `source_system='exceptional'`, `category='exceptional'`, `triggered_by_action='manual_entry'`. Restringido a `Manage.ClientNote`. |

**Nota obligatoria al completar (ADR-079 §3.9):** los modales de completar task `provisioning_manual` / `client_lifecycle` / `project` exigen nota obligatoria. Para `support_ticket` y `support_inside_slot` la nota la captura el modal del sistema vinculado (`Resolver ticket` con `internal_note` / `Completar mantenimiento` con `internal_notes`).

---

## Diagrama de relaciones (clients)

```
users (cliente)
  ├── client_profiles (1:1)
  ├── billing_profiles (1:N)         ← personal · autónomo · empresa
  ├── client_consents (1:N)          ← consentimientos RGPD
  ├── client_folders (1:N)           ← organización personal del cliente
  │     └── client_service_folders (N:1) → services
  ├── client_service_tags (1:N)      ← etiquetas sobre servicios
  └── client_notes (1:N)             ← notas estructuradas (canónico Sprint 16)
        ├── source_system enum (5 valores cerrados)
        ├── source_id (polimórfico, sin FK física salvo opcional a Task)
        │     ├── source_system='ticket'         → conversations(id)
        │     ├── source_system='chat'           → conversations(id)
        │     ├── source_system='maintenance_log'→ support_inside_slots(id)
        │     ├── source_system='task_completion'→ tasks(id)  (FK opcional Prisma)
        │     └── source_system='exceptional'    → null
        └── triggered_by_action (varchar 100)
```

---

## Cross-references

- **Apuntan aquí:**
  - `services.billing_profile_id` → `billing_profiles` ([billing.md](./billing.md))
  - `invoices.billing_profile_id` → `billing_profiles` ([billing.md](./billing.md))
  - `client_notes.source_id` (cuando `source_system='task_completion'`) → `tasks` ([tasks.md](./tasks.md)) — FK opcional declarada Prisma como relation `TaskClientNotes`.
- **Audit:** todo cambio en `client_profiles` o `billing_profiles` genera entrada en `audit.change_log`. Cada acceso a la ficha del cliente queda en `audit.access_log` ([audit.md](./audit.md)).
- **ADRs principales:** [045](../10-decisions/adr-045-gestion-clientes-crm.md) (CRM ligero), [038](../10-decisions/adr-038-notas-estructuradas-cliente.md) (notas — parcialmente superseded por ADR-079 §3.8), [039](../10-decisions/adr-039-nota-obligatoria-transiciones.md) (nota obligatoria — refinada por ADR-079 §3.9), [060](../10-decisions/adr-060-decisiones-pre-schema.md), **[079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) (canónico vigente)**.
- **Eventos:** `client.registered`, `client.wow_pending` — ver [`_events.md`](../20-modules/_events.md).
- **Settings consumidos:** ninguno directo (los relacionados son de billing y notifications).
- **Errores API:** `USER_NOT_FOUND`, `BILLING_PROFILE_NOT_FOUND`, `NOTE_NOT_FOUND` — ver [api-errors](../50-operations/api-errors.md).
- **Operativa staff:** [`docs/features/notes/admin.md`](../features/notes/admin.md) — guía consolidada de operativa de notas (Sprint 16 Fase 16.E).
