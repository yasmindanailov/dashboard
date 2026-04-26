# Audit — Schema (`audit.*` schema separado)

> **Dominio:** registro inmutable (`INSERT only`) de accesos, cambios, integraciones externas y eventos de servicio.
> **Schema PostgreSQL:** `audit` (separado de `public` para reforzar políticas de permisos).
> **Sprint origen:** Sprint 9.
> **Estado:** ⬜ stubs en Prisma. Escritura completa pendiente.
> **ADRs:** [017](../10-decisions/adr-017-audit-log-inmutable.md) (audit inmutable) · [010](../10-decisions/adr-010-rgpd-retencion-datos.md) (retención 2 años + transparencia).

---

## ⚠️ Reglas inmutables del schema `audit`

- **Solo INSERT.** Nunca UPDATE ni DELETE. Ni el superadmin tiene esos permisos a nivel DB.
- **Sin FK** hacia `public` — el audit no depende del schema operativo. Si una fila de `users` se anonimiza/borra, el audit conserva el ID histórico aunque no resuelva.
- **Campos de actor desnormalizados intencionalmente** (`actor_name`, `actor_role`) — preservan el estado del agente en el momento del acceso (si el agente cambia de nombre/rol después, el histórico no cambia).
- **Retención: 2 años.** Borrado automático al cumplirse via cron RGPD ([ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)). El "borrado" en este contexto es la única excepción a "solo INSERT" — está **forzado por compliance**.

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `audit.access_log` | ✅ stub | Quién accedió a la ficha de un cliente, cuándo y desde qué origen. Modelo `AuditAccessLog` existe en Prisma; escritura sistemática pendiente Sprint 9.1. |
| `audit.change_log` | ✅ stub | Cambios en datos del cliente: campo, valor anterior, valor nuevo, quién. Modelo `AuditChangeLog` existe en Prisma; interceptor global de cambios pendiente Sprint 13.12. |
| `audit.integration_log` | ⬜ | Datos enviados a integraciones externas + validación de consentimiento (Sprint 12.5) |
| `audit.service_log` | ⬜ | Eventos por servicio concreto. Metadata flexible por tipo de producto (Sprint 11) |

---

## Tabla: `audit.access_log` ✅ stub

Registro de accesos a la ficha del cliente.

> **Estado actual:** modelo `AuditAccessLog` existe en `backend/prisma/schema.prisma`. Escritura sistemática (interceptor automático en cada `GET /clients/:id`) pendiente Sprint 9.1.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `client_id` | uuid | NOT NULL | Sin FK — el audit no depende del schema público |
| `actor_id` | uuid | NULLABLE | `null` = acción del sistema |
| `actor_name` | varchar(200) | NULLABLE | ⚠️ desnormalizado — nombre en el momento del acceso |
| `actor_role` | varchar(50) | NULLABLE | ⚠️ desnormalizado — rol en el momento del acceso |
| `origin_type` | enum | NOT NULL | `direct` · `ticket` · `task` · `chat` · `system` |
| `origin_id` | uuid | NULLABLE | ID del ticket/tarea/chat que originó el acceso |
| `ip_address` | inet | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_audit_access_client` — en `client_id`
- `idx_audit_access_created` — en `created_at` (limpieza por retención 2 años)

---

## Tabla: `audit.change_log` ✅ stub

Cambios en datos del cliente o configuración. Valor anterior y nuevo.

> **Estado actual:** modelo `AuditChangeLog` existe en `backend/prisma/schema.prisma`. El interceptor global que registra automáticamente cambios (old vs new + actor) está pendiente Sprint 13.12 — hoy hay escrituras manuales en algunos services.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `client_id` | uuid | NOT NULL | (en cambios de settings o entidades sin cliente, usar `00000000-0000-0000-0000-000000000000` o nullable según implementación) |
| `actor_id` | uuid | NULLABLE | |
| `actor_name` | varchar(200) | NULLABLE | ⚠️ desnormalizado |
| `actor_role` | varchar(50) | NULLABLE | ⚠️ desnormalizado |
| `entity_type` | varchar(100) | NOT NULL | Tabla afectada: `users` · `billing_profiles` · `services` · `settings` · ... |
| `entity_id` | uuid | NOT NULL | ID del registro modificado |
| `field_name` | varchar(200) | NOT NULL | Campo modificado |
| `old_value` | text | NULLABLE | Valor anterior serializado (JSON.stringify para complejos) |
| `new_value` | text | NULLABLE | Valor nuevo serializado |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_audit_change_client` — en `client_id`
- `idx_audit_change_created` — en `created_at`

**Notas de decisión:**
- Cada cambio de **settings** ([system.md](./system.md)) genera entrada aquí también ([ADR-044](../10-decisions/adr-044-settings-extensos.md)).
- Cada cambio de **rol** o estado de `users` ([auth.md](./auth.md)) → entrada aquí.
- Cada cambio de **status de un partner** ([partner.md](./partner.md), aprobación/rechazo/desvinculación) → entrada aquí.

---

## Tabla: `audit.integration_log` ⬜

Datos enviados a integraciones externas + validación de consentimiento previo. **Inmutable y automático.**

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `client_id` | uuid | NOT NULL | |
| `integration_slug` | varchar(100) | NOT NULL | `stripe` · `resellerclub` · `enhance_cp` · `claude_api` (apunta a `integrations_registry.slug` en [system.md](./system.md), sin FK) |
| `data_categories` | jsonb | NOT NULL | Categorías de datos enviados |
| `action` | varchar(200) | NOT NULL | Qué operación se realizó |
| `consent_validated` | boolean | NOT NULL | ¿Se validó el consentimiento antes de enviar? |
| `consent_granted` | boolean | NOT NULL | ¿El cliente había dado consentimiento? |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_audit_integration_client` — en `client_id`
- `idx_audit_integration_slug` — en `integration_slug`
- `idx_audit_integration_created` — en `created_at`

**Notas de decisión:**
- Registro automático e inmutable. El admin no puede modificarlo.
- El cliente lo ve en su portal de transparencia ([ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)).
- `consent_validated = true && consent_granted = false` = bug — intentamos enviar a integración no esencial sin consentimiento. Debería disparar `system.error`.

---

## Tabla: `audit.service_log` ⬜

Eventos por servicio concreto. Metadata flexible por tipo de producto.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `service_id` | uuid | NOT NULL | Sin FK |
| `client_id` | uuid | NOT NULL | Para acceso rápido sin join |
| `tipo_accion` | varchar(100) | NOT NULL | Definido en `products.audit_event_types` ([products.md](./products.md)) |
| `actor_id` | uuid | NULLABLE | `null` = sistema automático |
| `actor_name` | varchar(200) | NULLABLE | ⚠️ desnormalizado |
| `actor_role` | varchar(50) | NULLABLE | ⚠️ desnormalizado |
| `actor_nota` | text | NULLABLE | Nota opcional del agente al acceder (visible al cliente) |
| `task_id` | uuid | NULLABLE | Si el acceso viene de una tarea ([tasks.md](./tasks.md)) |
| `metadata` | jsonb | NOT NULL, DEFAULT `'{}'` | Campos específicos del tipo de producto (ver `products.audit_event_types`) |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_audit_service_service` — en `service_id`
- `idx_audit_service_client` — en `client_id`
- `idx_audit_service_created` — en `created_at`

**Notas de decisión:**
- `metadata` es JSON flexible. **Cada tipo de producto define sus campos** al crearse en el catálogo (`products.audit_event_types`). Añadir un producto nuevo no requiere alterar esta tabla.
- El cliente ve este log dentro de la gestión de cada servicio. El frontend renderiza los campos de `metadata` usando la definición en `products.audit_event_types`.
- Ejemplo de definición en `products.audit_event_types`:
  ```json
  [
    {
      "type": "container_updated",
      "label": "Tu servicio fue actualizado",
      "fields": [
        { "key": "version_old", "label": "Versión anterior" },
        { "key": "version_new", "label": "Nueva versión" }
      ]
    }
  ]
  ```

---

## Diagrama de relaciones (audit) — sin FK físicas

```
audit.access_log         ← client_id (sin FK), actor_id (sin FK)
audit.change_log         ← client_id (sin FK), actor_id (sin FK), entity_type/entity_id
audit.integration_log    ← client_id (sin FK), integration_slug (apunta a system.md sin FK)
audit.service_log        ← service_id, client_id, task_id (todos sin FK)
```

**Por qué sin FK:** el schema `audit` debe sobrevivir a cualquier operación en `public`. Si una fila se anonimiza, el audit conserva el ID histórico aunque no resuelva — esto es trazabilidad legal, no integridad referencial.

---

## Cron de retención (aspiracional — pendiente Sprint RGPD dedicado)

```
Diario · 04:00 UTC
  Para cada tabla de audit.*:
    DELETE FROM <tabla> WHERE created_at < now() - interval '2 years'
```

Ver [jobs-reference](../50-operations/jobs-reference.md). **Deuda crítica legal** ([ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)).

---

## Cross-references

- **Aquí apuntan (sin FK):**
  - `users` ([auth.md](./auth.md)) — vía `client_id` y `actor_id` en todas las tablas audit
  - `services` ([billing.md](./billing.md)) — vía `service_id` en `audit.service_log`
  - `products` ([products.md](./products.md)) — vía `products.audit_event_types` que define qué `tipo_accion` y qué `metadata` tienen los registros
  - `tasks` ([tasks.md](./tasks.md)) — vía `task_id` en `audit.service_log`
  - `integrations_registry` ([system.md](./system.md)) — vía `integration_slug` en `audit.integration_log`
  - `client_consents` ([clients.md](./clients.md)) — validados antes de escribir en `audit.integration_log`
- **Reglas:** R3 (audit inmutable), R7 (defense in depth — el audit es la última línea), R12 (encriptación si los datos auditados son sensibles).
- **ADRs:** [017](../10-decisions/adr-017-audit-log-inmutable.md), [010](../10-decisions/adr-010-rgpd-retencion-datos.md).
- **Portal de transparencia del cliente:** combina `audit.access_log` + `audit.change_log` + `audit.integration_log` + `audit.service_log` para mostrar al cliente quién accedió, qué cambió, qué se envió fuera, y qué pasó en cada uno de sus servicios.
