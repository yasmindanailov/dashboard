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
| `client_notes` | ✅ | 7 | Notas estructuradas del agente sobre el cliente (categorizadas + pinned) |

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

## Tabla: `client_notes` ✅ (Sprint 7)

Notas estructuradas del cliente. Reemplaza el campo de texto `client_profiles.notes_internal`. Permite categorización, autoría, vinculación a conversaciones, y pin. Decisión [ADR-038](../10-decisions/adr-038-notas-estructuradas-cliente.md).

**Enum `NoteCategory`:** `conversation` · `solution` · `billing` · `technical` · `general`

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Cliente al que pertenece la nota |
| `author_id` | uuid | NOT NULL, FK → `users(id)` | Agente/admin que creó la nota |
| `conversation_id` | uuid | NULLABLE, FK → `conversations(id)` ON DELETE SET NULL | Conversación de origen (si aplica) |
| `body` | text | NOT NULL | Contenido de la nota |
| `category` | enum `NoteCategory` | NOT NULL, DEFAULT `'general'` | Tipo de nota |
| `is_pinned` | boolean | NOT NULL, DEFAULT `false` | Notas fijadas aparecen primero |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_client_notes_user_id` — en `user_id`
- `idx_client_notes_conversation_id` — en `conversation_id`

**Auto-creación:**
- Al enviar mensaje interno (`is_internal = true`) → categoría `conversation`.
- Al resolver/cerrar una conversación → categoría `solution` (transición obligatoria — [ADR-039](../10-decisions/adr-039-nota-obligatoria-transiciones.md)).
- Al reabrir una conversación → categoría `general`.
- Al crear nota desde la ficha → categoría seleccionada por el agente.

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
  └── client_notes (1:N)             ← notas estructuradas del agente
        └── conversation_id (nullable) → conversations
```

---

## Cross-references

- **Apuntan aquí:**
  - `services.billing_profile_id` → `billing_profiles` ([billing.md](./billing.md))
  - `invoices.billing_profile_id` → `billing_profiles` ([billing.md](./billing.md))
  - `client_notes.conversation_id` → `conversations` ([support.md](./support.md))
- **Audit:** todo cambio en `client_profiles` o `billing_profiles` genera entrada en `audit.change_log`. Cada acceso a la ficha del cliente queda en `audit.access_log` ([audit.md](./audit.md)).
- **ADRs principales:** [045](../10-decisions/adr-045-gestion-clientes-crm.md) (CRM ligero), [038](../10-decisions/adr-038-notas-estructuradas-cliente.md) (notas), [039](../10-decisions/adr-039-nota-obligatoria-transiciones.md) (nota obligatoria en transiciones), [060](../10-decisions/adr-060-decisiones-pre-schema.md) (perfiles fiscales múltiples).
- **Eventos:** `client.registered`, `client.wow_pending` — ver [`_events.md`](../20-modules/_events.md).
- **Settings consumidos:** ninguno directo (los relacionados son de billing y notifications).
- **Errores API:** `USER_NOT_FOUND`, `BILLING_PROFILE_NOT_FOUND`, `NOTE_NOT_FOUND` — ver [api-errors](../50-operations/api-errors.md).
