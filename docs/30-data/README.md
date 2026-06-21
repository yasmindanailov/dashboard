# Database Schema — Aelium Dashboard

> **Schema de la base de datos partido por dominio.**
> Cada archivo corresponde a un dominio coherente (alineado con `docs/20-modules/<modulo>/contract.md` cuando aplique). Si vas a tocar tablas de un dominio → consulta solo su archivo.

> **Última auditoría:** 2026-04-26 — F3 (refactor desde `docs/DATABASE_SCHEMA.md` monolítico).
> **Tablas totales:** ~80 distribuidas en 14 dominios + extensiones cross-cutting.
> **Schemas PostgreSQL:** `public` (todas) + `audit` (solo INSERT, ver [audit.md](./audit.md)).

---

## Por qué existe esta carpeta

`docs/DATABASE_SCHEMA.md` (~2.000 líneas) era el documento monolítico original. F3 lo parte por dominio para que:

- **Encontrar una tabla** sea consulta de 1 archivo, no scroll de 2k líneas.
- **Tocar el schema de un módulo** no obligue a leer el resto.
- **Cada agente IA** tenga el contexto justo para su tarea (menos tokens, más relevancia).
- **El monolítico** se mantenga como legacy con tabla de mapeo (compatibilidad con commits y referencias antiguas).

---

## Índice por dominio

### Foundations

| Dominio | Tablas | Archivo |
|---------|--------|---------|
| **Auth + sesiones** | `roles`, `users`, `sessions`, `email_verifications`, `password_resets` | [auth.md](./auth.md) |
| **Clientes (CRM)** | `client_profiles`, `billing_profiles`, `client_consents`, `client_folders`, `client_service_folders`, `client_service_tags`, `client_notes` | [clients.md](./clients.md) |

### Productos y servicios

| Dominio | Tablas | Archivo |
|---------|--------|---------|
| **Productos y catálogo** | `product_categories`, `products`, `product_pricing`, `product_extras`, `product_checklist_items`, `docker_templates`, `support_inside_config` | [products.md](./products.md) |
| **Billing (services + invoices + payments)** | `services`, `service_checklist_items`, `subscriptions`, `provisioning_log`, `billing_credits`, `invoices`, `invoice_items`, `payments` | [billing.md](./billing.md) |

### Operación al cliente

| Dominio | Tablas | Archivo |
|---------|--------|---------|
| **Soporte (chat + tickets)** | `support_inside_subscriptions`, `support_inside_slots`, `conversations`, `messages` | [support.md](./support.md) |
| **Tareas (operación interna)** | `tasks`, `task_checklist_completions`, `maintenance_logs` | [tasks.md](./tasks.md) |

### Infraestructura y comercial

| Dominio | Tablas | Archivo |
|---------|--------|---------|
| **Infraestructura (servidores)** | `servers`, `server_pools`, `server_metrics` | [infrastructure.md](./infrastructure.md) |
| **Promociones y descuentos** | `promotions`, `promotion_conditions`, `promotion_messages`, `promotion_views`, `discount_codes`, `discount_code_uses` | [promotions.md](./promotions.md) |

### Cross-cutting

| Dominio | Tablas | Archivo |
|---------|--------|---------|
| **Sistema (settings + notif + KB + outbox + errors + integrations)** | `settings`, `notifications`, `notification_templates`, `knowledge_base_articles`, `knowledge_base_tags`, `integrations_registry`, `error_log`, `event_outbox` | [system.md](./system.md) |
| **Plugin Framework** (Sprint 15A — ADR-080) | `plugin_installs` | [plugin-installs.md](./plugin-installs.md) |
| **Plugin Enhance CP — multi-tenancy mapping** (Sprint 15C — ADR-083) | `enhance_customers` | [enhance-customers.md](./enhance-customers.md) |
| **Audit (schema separado, solo INSERT)** | `audit.access_log`, `audit.change_log`, `audit.integration_log`, `audit.service_log` | [audit.md](./audit.md) |

### Fase 2 — Canales comerciales

| Dominio | Tablas | Archivo |
|---------|--------|---------|
| **Partner** | 9 tablas + extensiones a `users`, `services`, `invoices`, `products` | [partner.md](./partner.md) |
| **Referidos (clientes normales)** | `referral_codes`, `referrals`, `referral_credits` | [referrals.md](./referrals.md) |
| **Proyectos (Sprint 22)** | `projects`, `project_items`, `project_agents`, `project_history` + extensiones a `tasks`, `invoices`, `conversations`, `messages` | [projects.md](./projects.md) |

---

## Convenciones globales

> Estas convenciones aplican a TODAS las tablas. No se repiten en cada archivo de dominio para no inflar — están aquí.

### Tipos canónicos

| Concepto | Tipo PostgreSQL | Nota |
|----------|-----------------|------|
| **ID** | `uuid` | Generados con `gen_random_uuid()`. Nunca `serial` ni `bigint`. |
| **Timestamps** | `timestamptz` | Siempre con zona horaria (UTC en BD, conversión en frontend). |
| **`created_at` / `updated_at`** | `timestamptz` | Presentes en TODAS las tablas mutables. `updated_at` con trigger o gestionado por Prisma. |
| **Dinero** | `decimal(10,2)` | Nunca `float` ni `money`. |
| **Porcentajes** | `decimal(5,2)` | Permite hasta 999.99% (compatible con descuentos extremos). |
| **Email** | `varchar(255)` | RFC 5321. |
| **NIF/CIF** | `varchar(20)` | Suficiente para España + futuros formatos. |
| **País** | `varchar(2)` | ISO 3166-1 alpha-2 (`'ES'`, `'FR'`, ...). |
| **Moneda** | `varchar(3)` | ISO 4217 (`'EUR'`, `'USD'`, ...). |
| **IP** | `inet` | IPv4 e IPv6. |
| **Token / hash** | `varchar(500)` | Siempre hasheados con SHA-256 (los plaintext nunca se guardan — [ADR-015](../10-decisions/adr-015-encriptacion-credenciales.md)). |
| **Credenciales** | `text` | **Encriptadas en reposo con AES-256-GCM** (ADR-015). |
| **JSON estructurado** | `jsonb` | Siempre `jsonb`, nunca `json`. |
| **Arrays simples** | `jsonb` con array | No usar tipo `array` nativo (compatibilidad multi-DB futura). |

### Naming

- **Tablas:** snake_case plural (`users`, `client_profiles`, `partner_payouts`).
- **Columnas:** snake_case (`first_name`, `last_login_at`, `partner_commission_pct`).
- **FK:** `<entity>_id` (`user_id`, `service_id`).
- **Índices:** `idx_<table>_<columna(s)>` (`idx_users_email`, `idx_invoices_status`).
- **Enums:** PascalCase en Prisma, snake_case en BD (`UserStatus` → `'pending_verification'`).

### Restricciones

- **NOT NULL** explícito en TODAS las columnas no opcionales (Prisma lo refuerza).
- **UNIQUE** en columnas de búsqueda crítica (`email`, `slug`, `code`, `invoice_number`).
- **FK con ON DELETE:** preferir `RESTRICT` por defecto. `CASCADE` solo cuando la entidad hija no tiene sentido sin la padre (ej: `messages` cuando se borra `conversation`). `SET NULL` si la relación es opcional (`conversation_id` en `client_notes`).
- **CHECK constraints:** para invariantes de negocio (ej: `anniversary_day BETWEEN 1 AND 28`).

### Audit y reglas inmutables

- **Tablas en schema `audit`** son **append-only** (`INSERT` exclusivo, sin `UPDATE` ni `DELETE` — ni el superadmin). Ver [audit.md](./audit.md) y [ADR-017](../10-decisions/adr-017-audit-log-inmutable.md).
- **Tablas con auditabilidad fuerte** (`invoices`, `partner_commissions`, `partner_payouts`, `partner_client_notes`, `referral_credits`, `provisioning_log`, `project_history`) son funcionalmente append-only por diseño (no se editan tras crearse, solo cambian campos de status controlados).
- **Tablas mutables** (resto) llevan `updated_at` y todo cambio relevante genera entrada en `audit.change_log`.

### Desnormalización intencional (⚠️)

Algunos campos están **desnormalizados a propósito** para preservar historia ante cambios futuros:

- `partner_commissions.commission_pct` → snapshot del % en el momento del cobro (si cambia el `products.partner_commission_pct` después, el histórico no cambia).
- `audit.access_log.actor_name` / `actor_role` → snapshot del agente en el momento del acceso.
- `referral_codes.total_referrals` / `total_credits_earned` → contadores cacheados para mostrar rápido (recomputables si hace falta).
- `referrals.discount_applied_pct` / `discount_applied_amount` → snapshot del descuento aplicado.
- `partner_client_links.discount_pct` → snapshot del descuento al momento de aprobar.

Cualquier campo desnormalizado va marcado con `⚠️ desnormalizado` en su descripción.

### Outbox Pattern (R8)

Los **eventos críticos** (transición de estado, cambio de dinero, gestión de servicio) **deben** pasar por la tabla `event_outbox` (ver [system.md](./system.md)) en lugar de emitir directamente con `EventEmitter2`. Esto garantiza atomicidad transacción ↔ evento.

**Hoy:** `event_outbox` la usan `invoice.*` (created/paid/failed/overdue) + `domain.registered` (15D.D). Pendiente extender a `service.*`/`partner.*` (P-DEPLOY, ADR-069). Ver [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md) y [_events.md](../20-modules/_events.md).

### Implementación vs documentación

- **Fuente de verdad implementada:** `backend/prisma/schema.prisma`.
- **Esta documentación:** diseño de referencia. Se actualiza al implementar cada sprint.
- **Indicadores en cada tabla:**
  - ✅ Implementada en Prisma + migración aplicada.
  - ⬜ Pendiente — diseñada en doc, sin Prisma todavía.

### Migraciones

- **Tool:** Prisma Migrate (SQL versionado en git).
- **Patrón obligatorio:** **expand-contract** ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)):
  1. Añadir columna nueva nullable → deploy.
  2. Backfill de datos.
  3. Código nuevo usa la columna nueva → deploy.
  4. Eliminar columna vieja → siguiente release.
- **Nunca eliminar una columna sin deprecarla primero.** Las migraciones son siempre aditivas.

---

## Cómo está organizado cada archivo de dominio

Cada `<dominio>.md` sigue esta estructura:

```
# <Dominio> — Schema

> Metadata: módulos relacionados · sprint · estado · ADRs

## Resumen de tablas
| Tabla | Estado | Sprint | Propósito breve |

## Tabla: <nombre>
- Definición campos (igual que el monolítico)
- Índices
- Notas de decisión (con cross-ref a ADRs)

## Diagrama de relaciones (sub-dominio)

## Cross-references
- Otras tablas en este archivo / otros dominios que apuntan aquí
- ADRs que aplican
- Contracts de módulos que consumen estas tablas
```

---

## Cómo añadir una tabla nueva

1. **¿A qué dominio pertenece?** Si encaja en uno existente → añadir a su archivo. Si es transversal y nuevo → crear archivo de dominio nuevo y enlazarlo aquí.
2. **Crear/editar la tabla en `backend/prisma/schema.prisma`** primero.
3. **Documentar la tabla** en su archivo de dominio respetando la estructura canónica.
4. **Marcar el indicador** ✅ o ⬜ según estado.
5. **Si introduce decisión arquitectónica** (campo desnormalizado intencional, política de retención nueva, índice no obvio): abrir o referenciar ADR.
6. **Si afecta a billing, partner o financiero:** verificar Outbox + audit.
7. **Si emite eventos:** documentar en `docs/20-modules/_events.md` y en [system.md](./system.md).

---

## Documentos relacionados

- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — Reglas R1–R16 + D1–D11 (R3 audit, R8 outbox, R12 encryption).
- [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — Términos canónicos.
- [`docs/10-decisions/`](../10-decisions/) — 84 ADRs (decisiones arquitectónicas).
- [`docs/20-modules/`](../20-modules/) — Contracts por módulo + matriz + catálogo de eventos.
- [`docs/50-operations/`](../50-operations/) — Settings reference, email templates, jobs, errores API.
- [`docs/DATABASE_SCHEMA.md`](../99-archive/DATABASE_SCHEMA.md) — Documento legacy (origen del split). Mapping tabla → archivo en su header.
- `backend/prisma/schema.prisma` — **Fuente de verdad implementada.**
