# Billing — Schema

> **Dominio:** servicios contratados, suscripciones, provisioning log, créditos, facturas, items, pagos.
> **Módulo:** [`docs/20-modules/billing/contract.md`](../20-modules/billing/contract.md).
> **Sprint origen:** Sprint 6 (billing core) + Sprint 11 (provisioning).
> **Estado:** ⬜ tablas como stub en Prisma, expansión pendiente.
> **ADRs:** [025](../10-decisions/adr-025-numeracion-secuencial-facturas.md) (numeración) · [026](../10-decisions/adr-026-estados-factura.md) (estados) · [027](../10-decisions/adr-027-iva-por-pais.md) (IVA) · [028](../10-decisions/adr-028-suscripciones-ciclo-vida.md) (suscripciones) · [029](../10-decisions/adr-029-prorrateo-cambio-plan.md) (prorrateo) · [030](../10-decisions/adr-030-periodo-gracia-reintentos.md) (gracia + retries) · [031](../10-decisions/adr-031-payment-providers.md) (payment providers) · [032](../10-decisions/adr-032-flujo-compra-checkout.md) (checkout) · [033](../10-decisions/adr-033-outbox-pattern-pendiente.md) (outbox).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `services` | ⬜ | Instancias de productos contratados (corazón del sistema) |
| `service_checklist_items` | ⬜ | Checklist personalizado por servicio (heredado del producto) |
| `subscriptions` | ⬜ | Suscripciones activas (1:1 con `services`) |
| `provisioning_log` | ⬜ | Registro inmutable de intentos de provisioning |
| `billing_credits` | ⬜ | Créditos generados por prorrateo o aplicaciones manuales |
| `invoices` | ⬜ | Facturas emitidas (inmutables tras emisión — invariante BILL-INV-2) |
| `invoice_items` | ⬜ | Líneas de cada factura |
| `payments` | ⬜ | Intentos de cobro y resultado |

---

## Tabla: `services` ⬜

Instancias de productos contratados por clientes. **El corazón del sistema.**

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | |
| `product_id` | uuid | NOT NULL, FK → `products(id)` | |
| `billing_profile_id` | uuid | NULLABLE, FK → `billing_profiles(id)` | Perfil de facturación para este servicio ([clients.md](./clients.md)) |
| `server_id` | uuid | NULLABLE, FK → `servers(id)` | Solo para productos Docker ([infrastructure.md](./infrastructure.md)) |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `provisioning` · `active` · `suspended` · `cancelled` · `failed` · `paused` · `project_development` (Sprint 22, [projects.md](./projects.md)) |
| `provisioner_reference` | varchar(500) | NULLABLE | ID externo del provisioner (ej: ID en Enhance CP) |
| `subdomain` | varchar(255) | NULLABLE | |
| `custom_domain` | varchar(255) | NULLABLE | |
| `ssl_expires_at` | timestamptz | NULLABLE | |
| `provisioned_at` | timestamptz | NULLABLE | |
| `suspended_at` | timestamptz | NULLABLE | |
| `cancelled_at` | timestamptz | NULLABLE | |
| `next_renewal_at` | timestamptz | NULLABLE | Fecha de aniversario — disparador de generación de factura |
| `paused_at` | timestamptz | NULLABLE | |
| `paused_until` | timestamptz | NULLABLE | |
| `cancellation_reason` | text | NULLABLE | |
| `failure_reason` | text | NULLABLE | Si `status = failed` |
| `provisioner_data` | jsonb | NULLABLE | Datos específicos del provisioner (credenciales, config, etc. — encriptado si contiene secrets) |
| `resource_config` | jsonb | NULLABLE | RAM, CPU, disco asignados (Docker) |
| `partner_id` | uuid | NULLABLE, FK → `partners(id)` | `null` = servicio de cliente directo. Ver [partner.md](./partner.md). |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_services_user_id` — en `user_id`
- `idx_services_status` — en `status`
- `idx_services_next_renewal` — en `next_renewal_at` (cron de renovaciones)
- `idx_services_product_id` — en `product_id`

**Eventos emitidos:** `service.provisioned`, `service.suspended`, `service.cancelled`, `service.failed`, `service.paused`, `service.resumed`, `checkout.completed` — ver [`_events.md`](../20-modules/_events.md). Hoy todos huérfanos esperando módulo `provisioning`.

---

## Tabla: `service_checklist_items` ⬜

Checklist personalizado por servicio. Hereda del producto al crear, puede modificarse después.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `service_id` | uuid | NOT NULL, FK → `services(id)` ON DELETE CASCADE | |
| `label` | varchar(200) | NOT NULL | |
| `order_index` | integer | NOT NULL, DEFAULT `0` | |
| `is_required` | boolean | NOT NULL, DEFAULT `true` | |
| `source` | enum | NOT NULL, DEFAULT `'product_default'` | `product_default` · `custom` |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

---

## Tabla: `subscriptions` ⬜

Suscripciones activas. Una por servicio (UQ en `service_id`).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | |
| `service_id` | uuid | NOT NULL, FK → `services(id)`, UQ | |
| `product_pricing_id` | uuid | NOT NULL, FK → `product_pricing(id)` | |
| `billing_cycle` | enum | NOT NULL | `monthly` · `annual` |
| `current_period_start` | timestamptz | NOT NULL | |
| `current_period_end` | timestamptz | NOT NULL | |
| `status` | enum | NOT NULL, DEFAULT `'active'` | `active` · `paused` · `cancelled` · `past_due` |
| `cancel_at_period_end` | boolean | NOT NULL, DEFAULT `false` | |
| `cancelled_at` | timestamptz | NULLABLE | |
| `payment_attempts` | integer | NOT NULL, DEFAULT `0` | Intentos fallidos en el ciclo actual |
| `last_payment_attempt_at` | timestamptz | NULLABLE | |
| `discount_code_id` | uuid | NULLABLE, FK → `discount_codes(id)` | Código aplicado ([promotions.md](./promotions.md)) |
| `promotion_discount_amount` | decimal(10,2) | NULLABLE | Descuento activo por promoción |
| `promotion_discount_until` | timestamptz | NULLABLE | Hasta cuándo aplica el descuento |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_subscriptions_status` — en `status`
- `idx_subscriptions_period_end` — en `current_period_end` (cron de renovaciones)

---

## Tabla: `provisioning_log` ⬜

Registro **inmutable** de todos los intentos de provisioning. Solo el admin lo lee — nunca se edita.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `service_id` | uuid | NOT NULL, FK → `services(id)` | |
| `action` | enum | NOT NULL | `provision` · `suspend` · `reactivate` · `terminate` |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `processing` · `completed` · `failed` |
| `attempt_number` | integer | NOT NULL, DEFAULT `1` | |
| `plugin_used` | varchar(100) | NOT NULL | |
| `request_payload` | jsonb | NULLABLE | Qué se envió al provisioner |
| `response_payload` | jsonb | NULLABLE | Qué respondió |
| `error_message` | text | NULLABLE | |
| `started_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `completed_at` | timestamptz | NULLABLE | |

**Notas de decisión:**
- Append-only de facto. Cada job es idempotente; reintentos crean registro nuevo con `attempt_number` incrementado.

---

## Tabla: `billing_credits` ⬜

Créditos generados por prorrateo al cambiar de plan ([ADR-029](../10-decisions/adr-029-prorrateo-cambio-plan.md)) o aplicaciones manuales del admin.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | |
| `service_id` | uuid | NULLABLE, FK → `services(id)` | |
| `amount` | decimal(10,2) | NOT NULL | |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | |
| `reason` | text | NULLABLE | Descripción legible del prorrateo |
| `applied_at` | timestamptz | NULLABLE | `null` = pendiente de aplicar |
| `applied_to_invoice_id` | uuid | NULLABLE, FK → `invoices(id)` | En qué factura se aplicó |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- Los créditos **nunca se devuelven como dinero**. Se aplican como descuento en próxima factura.
- Cálculo: precio diario del plan actual × días no consumidos.
- Distinto de `referral_credits` ([referrals.md](./referrals.md)) que tiene su propia tabla y lógica.

---

## Tabla: `invoices` ⬜

Facturas emitidas. **Inmutables tras emisión** (invariante BILL-INV-2). Rectificación = nueva factura.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | |
| `billing_profile_id` | uuid | NULLABLE, FK → `billing_profiles(id)` | Perfil usado para esta factura ([clients.md](./clients.md)) |
| `invoice_number` | varchar(50) | NOT NULL, UQ | Formato configurable. Ej: `AELIUM-2026-0042`. **Generado con SEQUENCE atómica** (ADR-025). |
| `type` | enum | NOT NULL | `full` · `simplified` (sin NIF del receptor) |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `paid` · `failed` · `cancelled` · `refunded` ([ADR-026](../10-decisions/adr-026-estados-factura.md)) |
| `subtotal` | decimal(10,2) | NOT NULL | Base imponible — sobre la que se calcula partner commission |
| `tax_rate` | decimal(5,2) | NOT NULL, DEFAULT `21.00` | IVA ([ADR-027](../10-decisions/adr-027-iva-por-pais.md)) |
| `tax_amount` | decimal(10,2) | NOT NULL | |
| `total` | decimal(10,2) | NOT NULL | |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | |
| `due_date` | timestamptz | NOT NULL | |
| `paid_at` | timestamptz | NULLABLE | |
| `notes` | text | NULLABLE | Notas internas o para el cliente |
| `pdf_url` | varchar(500) | NULLABLE | Generado async via job |
| `is_manual` | boolean | NOT NULL, DEFAULT `false` | Factura creada manualmente por admin |
| `credit_applied` | decimal(10,2) | NOT NULL, DEFAULT `0` | Crédito de prorrateo o referidos aplicado |
| `partner_id` | uuid | NULLABLE, FK → `partners(id)` | Cliente del partner ([partner.md](./partner.md)) |
| `partner_label` | varchar(200) | NULLABLE | "Aelium · Partner con Agencia X" |
| `project_id` | uuid | NULLABLE, FK → `projects(id)` | Para depósito o factura final ([projects.md](./projects.md)) |
| `invoice_type` | enum | NOT NULL, DEFAULT `'standard'` | `standard` · `deposit` · `project_final` |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_invoices_user_id` — en `user_id`
- `idx_invoices_status` — en `status`
- `idx_invoices_due_date` — en `due_date` (cron de vencimientos)
- `idx_invoices_number` — UNIQUE en `invoice_number`

**Notas de decisión:**
- Numeración secuencial por año mediante PostgreSQL SEQUENCE (`invoice_number_seq_<YEAR>`) — atómica, sin race conditions, sin saltos ([ADR-025](../10-decisions/adr-025-numeracion-secuencial-facturas.md)).
- Las facturas se conservan **10 años** (obligación Hacienda España). No configurable.
- Cron "preparar año siguiente" pendiente — ver [jobs-reference](../50-operations/jobs-reference.md).
- **Eventos críticos sin Outbox (deuda R8):** `invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue` — ver [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md).

---

## Tabla: `invoice_items` ⬜

Líneas de cada factura. Inmutables tras pasar el invoice a `pending` (BILL-INV-3).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `invoice_id` | uuid | NOT NULL, FK → `invoices(id)` ON DELETE CASCADE | |
| `service_id` | uuid | NULLABLE, FK → `services(id)` | |
| `description` | varchar(500) | NOT NULL | |
| `quantity` | integer | NOT NULL, DEFAULT `1` | |
| `unit_price` | decimal(10,2) | NOT NULL | |
| `discount_amount` | decimal(10,2) | NOT NULL, DEFAULT `0` | |
| `subtotal` | decimal(10,2) | NOT NULL | `(quantity × unit_price) - discount_amount` |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

---

## Tabla: `payments` ⬜

Intentos de cobro y su resultado. Cada intento crea un registro nuevo (no se sobreescribe).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `invoice_id` | uuid | NOT NULL, FK → `invoices(id)` | |
| `plugin_used` | varchar(100) | NOT NULL | `stripe` · `redsys` · `manual` ([ADR-031](../10-decisions/adr-031-payment-providers.md)) |
| `external_transaction_id` | varchar(500) | NULLABLE | ID en el sistema del proveedor de pagos |
| `amount` | decimal(10,2) | NOT NULL | |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | |
| `status` | enum | NOT NULL | `pending` · `processing` · `succeeded` · `failed` · `refunded` |
| `attempt_number` | integer | NOT NULL, DEFAULT `1` | |
| `failure_reason` | text | NULLABLE | |
| `payment_method_type` | varchar(100) | NULLABLE | `card` · `sepa_debit` |
| `payment_method_last4` | varchar(4) | NULLABLE | Últimos 4 dígitos (nunca datos completos — PCI) |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_payments_invoice_id` — en `invoice_id`
- `idx_payments_status` — en `status`

**Notas de decisión:**
- **Webhooks Stripe** validados con `Stripe-Signature` antes de procesar ([ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) — obligatorio).
- **Idempotency:** cada intento incluye `idempotency_key` para evitar dobles cargos en reintentos.

---

## Diagrama de relaciones (billing)

```
users
  └── services (1:N)
        ├── subscriptions (1:1)
        ├── service_checklist_items (1:N)
        ├── support_inside_slots (1:N) → support.md
        ├── tasks (1:N) → tasks.md
        ├── provisioning_log (1:N)
        ├── billing_credits (1:N, opcional)
        └── client_service_folders (1:1, opcional) → clients.md

invoices
  ├── invoice_items (1:N) → service_id (opcional) → services
  ├── payments (1:N)
  └── billing_credits.applied_to_invoice_id (N:1)

products
  └── product_pricing → subscriptions
```

---

## Cron jobs activos

Ver [jobs-reference](../50-operations/jobs-reference.md) para detalles. Resumen:

| Cron | Schedule | Función |
|------|----------|---------|
| `detectOverdueInvoices` | 01:00 | `pending` → `overdue` si `due_date < now` |
| `generatePendingInvoices` | 02:00 | Genera facturas para servicios próximos a vencer |
| `retryOverduePayments` | cada 6h | Reintenta cobro hasta `billing.max_payment_retries` |
| `autoSuspendServices` | 03:00 | Suspende servicios tras agotar reintentos |
| `autoCancelServices` | 04:00 | Cancela servicios suspendidos tras `cancellation_days` |
| `checkPauseExpiration` | 05:00 | Reanuda servicios pausados vencidos |

**⚠️ Bloqueo arquitectónico:** crons in-process duplicarían trabajo si se escala a múltiples instancias del backend. Migrar a BullMQ scheduled jobs antes de escalar ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)).

---

## Cross-references

- **Apuntan aquí:**
  - `tasks.service_id` → `services` ([tasks.md](./tasks.md))
  - `support_inside_slots.assigned_service_id` → `services` ([support.md](./support.md))
  - `partner_commissions.invoice_id` → `invoices` ([partner.md](./partner.md))
  - `referral_credits.applied_to_invoice_id` → `invoices` ([referrals.md](./referrals.md))
  - `audit.service_log.service_id` → `services` ([audit.md](./audit.md))
- **Eventos:** `invoice.*`, `service.*`, `payment.retry_attempt`, `checkout.completed` — ver [`_events.md`](../20-modules/_events.md).
- **Plantillas email:** `billing.invoice-created`, `billing.invoice-paid`, `billing.invoice-failed`, `billing.invoice-overdue` — ver [email-templates](../50-operations/email-templates.md).
- **Settings consumidos:** `billing.invoice_prefix`, `billing.payment_due_days`, `billing.default_tax_rate`, `billing.max_payment_retries`, `billing.invoice_advance_days`, `billing.payment_retry_interval_days`, `billing.grace_period_days`, `billing.cancellation_after_suspension_days`, `billing.data_retention_after_suspension_days` — ver [settings-reference](../50-operations/settings-reference.md).
- **Errores API:** `INVOICE_NOT_FOUND`, `INVOICE_EMPTY`, `INVOICE_ALREADY_PAID`, `INVOICE_ALREADY_CANCELLED`, `CANNOT_CANCEL_PAID`, `CANNOT_PAY_CANCELLED`, `CANNOT_REFUND_UNPAID`, `INVALID_STATE_TRANSITION` — ver [api-errors](../50-operations/api-errors.md).
- **Invariantes:** BILL-INV-1 (cálculo en backend), BILL-INV-2 (no borrar), BILL-INV-3 (items frozen), BILL-INV-4 (ownership), BILL-INV-5 (numeración sin saltos) — ver [`rules.md`](../00-foundations/rules.md).
