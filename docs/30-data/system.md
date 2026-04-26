# System — Schema (cross-cutting)

> **Dominio:** notifications, plantillas, base de conocimiento, settings, integraciones, errores, outbox.
> **Módulos relacionados:** notifications + settings + (cross-cutting de todos).
> **Sprint origen:** Sprint 0 (`settings`) + Sprint 9 (notificaciones, plantillas, KB, error_log).
> **Estado:** ✅ `settings`, `notifications`, `event_outbox` parciales. ⬜ resto.
> **ADRs:** [042](../10-decisions/adr-042-sistema-notificaciones.md) (notifications) · [044](../10-decisions/adr-044-settings-extensos.md) (settings) · [007](../10-decisions/adr-007-observabilidad.md) (correlationId + error_log) · [033](../10-decisions/adr-033-outbox-pattern-pendiente.md) (outbox) · [055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) (DLQ y resiliencia) · [057](../10-decisions/adr-057-agentes-ia.md) (knowledge base) · [060](../10-decisions/adr-060-decisiones-pre-schema.md) (retención notifications).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `notifications` | ✅ stub | Notificaciones internas del dashboard (campana) |
| `notification_templates` | ⬜ | Plantillas editables por evento × canal |
| `knowledge_base_articles` | ⬜ | Base de conocimiento interna (solo superadmin edita) |
| `knowledge_base_tags` | ⬜ | Tags para organizar artículos KB |
| `settings` | ✅ | Configuración global clave-valor tipado |
| `integrations_registry` | ⬜ | Catálogo público de integraciones externas (visible al cliente) |
| `error_log` | ⬜ | Registro de todos los errores del sistema |
| `event_outbox` | ✅ stub | Cola persistente para entrega garantizada de eventos críticos (R8) |

---

## Tabla: `notifications` ✅ stub

Notificaciones internas del sistema (campana en el dashboard).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` ON DELETE CASCADE | |
| `type` | enum | NOT NULL | `client` · `agent` · `admin` |
| `title` | varchar(300) | NOT NULL | |
| `body` | text | NULLABLE | |
| `severity` | enum | NOT NULL, DEFAULT `'info'` | `info` · `warning` · `error` · `critical` |
| `read_at` | timestamptz | NULLABLE | `null` = no leída |
| `action_url` | varchar(500) | NULLABLE | Enlace al recurso relacionado |
| `related_entity_type` | varchar(100) | NULLABLE | `invoice` · `service` · `task` · `conversation` · ... |
| `related_entity_id` | uuid | NULLABLE | |
| `expires_at` | timestamptz | NOT NULL | DEFAULT `now() + 90 días`. Configurable: `notifications.retention_days` |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_notifications_user_id` — en `user_id`
- `idx_notifications_read` — en `(user_id, read_at)` para contar no leídas
- `idx_notifications_expires` — en `expires_at` (cron de limpieza)

**Notas de decisión:**
- Retención 90 días configurable ([ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md), [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md)).
- Vista de campana: máximo 50 más recientes; "Ver más" para histórico.
- Cron de borrado pendiente — ver [jobs-reference](../50-operations/jobs-reference.md).

---

## Tabla: `notification_templates` ⬜

Plantillas editables por evento × canal. Hoy las plantillas viven hardcoded en código (`*.listener.ts`) — ver [email-templates](../50-operations/email-templates.md). Sprint 11 las migra a esta tabla.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `event_name` | varchar(100) | NOT NULL | `invoice.paid` · `service.provisioned` · `maintenance.completed` · ... |
| `channel` | enum | NOT NULL | `email` · `whatsapp` · `internal` |
| `subject` | varchar(300) | NULLABLE | Solo para email |
| `body` | text | NOT NULL | Con variables: `{{client.name}}`, `{{service.name}}` |
| `available_variables` | jsonb | NOT NULL | Lista de variables disponibles para este evento |
| `active` | boolean | NOT NULL, DEFAULT `true` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(event_name, channel)`

**Notas de decisión:**
- Editor visual con preview en `/dashboard/admin/notifications/templates`.
- Validación: las variables usadas en el cuerpo deben existir en `available_variables` del evento.

---

## Tabla: `knowledge_base_articles` ⬜

Base de conocimiento interna para agentes IA y agentes humanos ([ADR-057](../10-decisions/adr-057-agentes-ia.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `title` | varchar(300) | NOT NULL | |
| `content` | text | NOT NULL | |
| `type` | enum | NOT NULL | `technical` · `policy` · `faq` · `product_note` |
| `product_id` | uuid | NULLABLE, FK → `products(id)` | Artículo relacionado con un producto |
| `active` | boolean | NOT NULL, DEFAULT `true` | |
| `created_by` | uuid | NOT NULL, FK → `users(id)` | **Solo superadmin puede editar** |
| `updated_by` | uuid | NULLABLE, FK → `users(id)` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Acceso de lectura:**
- Agente IA filtro (para responder al cliente).
- Agente IA copilot (para asistir al agente).
- Agentes humanos.

---

## Tabla: `knowledge_base_tags` ⬜

Etiquetas para organizar artículos.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `article_id` | uuid | NOT NULL, FK → `knowledge_base_articles(id)` ON DELETE CASCADE | |
| `tag` | varchar(100) | NOT NULL | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(article_id, tag)`

---

## Tabla: `settings` ✅

Configuración global del sistema. Clave-valor tipado ([ADR-044](../10-decisions/adr-044-settings-extensos.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | (también clave compuesta `(category, key)` UQ — ver implementación) |
| `category` | varchar(100) | NOT NULL | `auth` · `billing` · `support` · `infra` · `notifications` · `general` · `partner` · `referrals` · `ai` · ... |
| `key` | varchar(200) | NOT NULL | Sin prefijo de category — ej: `max_login_attempts` |
| `value` | jsonb | NOT NULL | Flexible |
| `description` | text | NULLABLE | Etiqueta legible para admin |
| `updated_by` | uuid | NULLABLE, FK → `users(id)` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(category, key)`

**Notas de decisión:**
- Toda lógica de negocio configurable vive aquí. Nada hardcoded de negocio en código (constantes técnicas sí).
- Cache Redis 1 minuto con invalidación inmediata al guardar.
- **Catálogo completo de keys:** [settings-reference](../50-operations/settings-reference.md).
- **Encriptación obligatoria** para credenciales de plugins (`plugins.stripe.api_key`, etc.) — patrón helper `encryptedSetting()` con AES-256-GCM ([ADR-015](../10-decisions/adr-015-encriptacion-credenciales.md)).
- Cada cambio genera entrada en `audit.change_log` ([audit.md](./audit.md), [ADR-017](../10-decisions/adr-017-audit-log-inmutable.md)).

---

## Tabla: `integrations_registry` ⬜

Catálogo público de integraciones externas. **Visible al cliente** en su portal de transparencia (RGPD, [ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `slug` | varchar(100) | NOT NULL, UQ | `stripe` · `resellerclub` · `enhance_cp` · `claude_api` |
| `name` | varchar(200) | NOT NULL | Nombre visible al cliente |
| `public_description` | text | NOT NULL | Qué hace esta integración. Visible al cliente. |
| `data_accessed` | text | NOT NULL | Qué datos del cliente accede. Visible al cliente. |
| `location_description` | text | NOT NULL | Dónde están los datos. Visible al cliente. |
| `privacy_policy_url` | varchar(500) | NULLABLE | |
| `is_essential` | boolean | NOT NULL, DEFAULT `false` | Si `true`, no se puede desactivar (sin él, el sistema no funciona) |
| `active` | boolean | NOT NULL, DEFAULT `true` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- Cada envío real de datos a una integración no esencial se registra en `audit.integration_log` ([audit.md](./audit.md)) tras validar `client_consents` ([clients.md](./clients.md)).

---

## Tabla: `error_log` ⬜

Registro de todos los errores del sistema. Solo superadmin lo lee.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `severity` | enum | NOT NULL | `low` · `medium` · `high` · `critical` |
| `module` | varchar(100) | NOT NULL | Módulo que generó el error |
| `error_code` | varchar(100) | NULLABLE | Código de error interno (ej: `INVOICE_NOT_FOUND`) |
| `message` | text | NOT NULL | |
| `stack_trace` | text | NULLABLE | |
| `context` | jsonb | NULLABLE | Datos adicionales del contexto |
| `user_id` | uuid | NULLABLE, FK → `users(id)` | Usuario relacionado si aplica |
| `request_id` | varchar(200) | NULLABLE | `correlation_id` (UUID) para trazar el request HTTP completo ([ADR-007](../10-decisions/adr-007-observabilidad.md)) |
| `resolved_at` | timestamptz | NULLABLE | |
| `resolved_by` | uuid | NULLABLE, FK → `users(id)` | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_error_log_severity` — en `severity`
- `idx_error_log_created_at` — en `created_at`
- `idx_error_log_module` — en `module`

**Notas de decisión:**
- Errores `high` y `critical` generan notificación inmediata al superadmin.
- Coexiste con **Sentry** (configurado pero sin DSN en dev) — `error_log` es la versión interna persistente; Sentry es la observabilidad externa.

---

## Tabla: `event_outbox` ✅ stub

Cola persistente de eventos. **Outbox Pattern (R8)** — garantiza entrega de eventos entre módulos aunque el proceso muera ([ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `event_name` | varchar(100) | NOT NULL | `invoice.paid` · `service.provisioned` · ... |
| `payload` | jsonb | NOT NULL | Datos del evento |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `processing` · `done` · `failed` |
| `retry_count` | integer | NOT NULL, DEFAULT `0` | |
| `max_retries` | integer | NOT NULL, DEFAULT `5` | |
| `error_message` | text | NULLABLE | Último error si falló |
| `correlation_id` | uuid | NULLABLE | Trazar el flujo completo del request ([ADR-007](../10-decisions/adr-007-observabilidad.md)) |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `processed_at` | timestamptz | NULLABLE | |

**Índices:**
- `idx_outbox_pending` — PARTIAL en `status` WHERE `status = 'pending'` (worker solo busca pendientes — eficiente)
- `idx_outbox_created` — en `created_at` (limpieza de procesados)

**Notas de decisión:**
- Worker hace polling cada 5 segundos. No usa LISTEN/NOTIFY para mantener simplicidad.
- Eventos `done` se limpian tras 7 días (configurable).
- Eventos `failed` que agotan `max_retries` generan notificación al superadmin via `system.error`.
- Esta tabla **NO** vive en schema `audit` — es operativa y mutable.
- **⚠️ Deuda crítica R8:** 0/25 eventos del catálogo usan outbox hoy. **Crítico para `invoice.*`** antes de despliegue real. Ver [`_events.md`](../20-modules/_events.md) y [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md).

---

## Diagrama de relaciones (system)

```
notifications              ← user_id → users
notification_templates     ← UQ (event_name, channel)
knowledge_base_articles    ← product_id (opcional) → products
  └── knowledge_base_tags (1:N)
settings                   ← UQ (category, key)
integrations_registry      ← UQ (slug)
error_log                  ← user_id (opcional) → users; correlation_id → request
event_outbox               ← partial idx (status='pending')
```

---

## Cross-references

- **Apuntan aquí:**
  - `audit.integration_log.integration_slug` ↪ `integrations_registry.slug` (sin FK por estar en schema separado)
  - `event_outbox.correlation_id` ↪ correlation IDs de logs/Sentry
- **ADRs principales:** [042](../10-decisions/adr-042-sistema-notificaciones.md), [044](../10-decisions/adr-044-settings-extensos.md), [007](../10-decisions/adr-007-observabilidad.md), [033](../10-decisions/adr-033-outbox-pattern-pendiente.md), [055](../10-decisions/adr-055-resiliencia-circuit-breaker.md), [057](../10-decisions/adr-057-agentes-ia.md), [060](../10-decisions/adr-060-decisiones-pre-schema.md).
- **Settings consumidos:** `notifications.retention_days`, `notifications.enabled.<event>.<channel>`, `notifications.templates.<event>` — ver [settings-reference](../50-operations/settings-reference.md).
- **Errores API:** sistema usa `INTERNAL_ERROR` (500), `CIRCUIT_BREAKER_OPEN` (503) — ver [api-errors](../50-operations/api-errors.md).
