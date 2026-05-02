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
| `services` | ✅ | Instancias de productos contratados (corazón del sistema) |
| `service_checklist_items` | ⬜ | Checklist personalizado por servicio (heredado del producto) |
| `subscriptions` | ⬜ | Suscripciones activas (1:1 con `services`). Hoy el ciclo de cobro vive en `services` (`billing_cycle` + `next_due_date`); cuando se necesite separar planes/precio del servicio se migrará. |
| `provisioning_log` | ⬜ | Registro inmutable de intentos de provisioning (Sprint 11) |
| `billing_credits` | ⬜ | Créditos generados por prorrateo o aplicaciones manuales (Sprint 9) |
| `invoices` | ✅ | Facturas emitidas (inmutables tras emisión — invariante BILL-INV-2) |
| `invoice_items` | ✅ | Líneas de cada factura |
| `payments` | ⬜ | Intentos de cobro detallados (Sprint 15 — hoy el resultado del intento vive en `invoices.payment_*` + `retry_count`) |

---

## Tabla: `services` ✅

Instancias de productos contratados por clientes. **El corazón del sistema.**

> **Fuente de verdad:** `backend/prisma/schema.prisma` modelo `Service` + enum `ServiceStatus`.
> **Nota histórica:** el documento legacy `DATABASE_SCHEMA.md` listaba campos detallados de provisioning (`provisioner_reference`, `subdomain`/`custom_domain` separados, `ssl_expires_at`, `provisioned_at`, `failure_reason`, `resource_config`). El código actual mantiene `provisioner_data` (jsonb) y un único campo `domain` para los detalles operativos. **Sprint 11 Fase 11.B (2026-05-02) añade dos columnas dedicadas con índice** para queries de reconciliación + callbacks: `provisioner_slug` y `provider_reference` (ver tabla abajo).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `user_id` | uuid | NOT NULL | FK lógica a `users(id)` |
| `product_id` | uuid | NOT NULL, FK → `products(id)` | |
| `billing_profile_id` | uuid | NULLABLE, FK → `billing_profiles(id)` | Perfil de facturación de este servicio ([clients.md](./clients.md)) |
| `partner_id` | uuid | NULLABLE | FK lógica a `partners(id)`. `null` = cliente directo ([partner.md](./partner.md)) |
| `status` | enum `ServiceStatus` | NOT NULL, DEFAULT `'pending'` | `pending` · `provisioning` · `active` · `suspended` · `cancelled` · **`terminated`** |
| `label` | varchar(300) | NULLABLE | Nombre interno del servicio para el cliente (ej: "Mi tienda") |
| `domain` | varchar(300) | NULLABLE | Dominio asociado (subdominio o dominio completo — un único campo) |
| `server_id` | uuid | NULLABLE | FK lógica a `servers(id)`. Solo productos Docker ([infrastructure.md](./infrastructure.md)) |
| `billing_cycle` | enum `BillingCycle` | NOT NULL, DEFAULT `'monthly'` | `monthly` · `annual` |
| `amount` | decimal(10,2) | NOT NULL | Importe del ciclo de facturación |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | ISO 4217 |
| `next_due_date` | timestamptz | NULLABLE | Próxima fecha de cobro |
| `next_invoice_date` | timestamptz | NULLABLE | Fecha de generación de la próxima factura (anterior a `next_due_date` por `billing.invoice_advance_days`) |
| `cancelled_at` | timestamptz | NULLABLE | |
| `cancellation_reason` | text | NULLABLE | |
| `suspended_at` | timestamptz | NULLABLE | |
| `suspension_reason` | text | NULLABLE | |
| `paused_at` | timestamptz | NULLABLE | |
| `pause_max_date` | timestamptz | NULLABLE | Hasta cuándo puede estar pausado (cron `checkPauseExpiration` lo reanuda al pasar) |
| `provisioner_slug` | varchar(100) | NULLABLE | **Sprint 11 Fase 11.B (2026-05-02 — [ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md))**. Denormalizado de `product.provisioner` al momento de provisionar (`ProvisioningOrchestratorService.provisionService()`). **Inmutable tras `service.activated`** — el plugin que provisionó es el dueño del lifecycle aunque el admin cambie luego `product.provisioner` desde Settings. Indexado para queries de reconciliación cron + filtro admin. |
| `provider_reference` | varchar(500) | NULLABLE | **Sprint 11 Fase 11.B**. ID del recurso en el sistema externo (cPanel account ID, ResellerClub domain ID, Docker container ID, etc.). NULL para plugins `internal`/`manual` (no tienen referencia externa). Indexado para resolver el servicio desde callbacks/webhooks del proveedor (`WHERE provider_reference = X`). |
| `provisioner_data` | jsonb | NULLABLE | Datos específicos del provisioner adicionales que NO encajan en `provider_reference` ni `metadata`: credenciales encriptadas, ssl_expires_at, resource_config (RAM/CPU/disco). **Encriptado en reposo si contiene secrets** ([ADR-015](../10-decisions/adr-015-encriptacion-credenciales.md)) |
| `metadata` | jsonb | NULLABLE | Metadatos arbitrarios |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices reales:**
- `@@index([user_id])`
- `@@index([product_id])`
- `@@index([billing_profile_id])`
- `@@index([status])`
- `@@index([next_due_date])` (cron de renovaciones)
- `@@index([provisioner_slug])` (**Sprint 11 Fase 11.B** — queries reconciliación cron + filtro admin)
- `@@index([provider_reference])` (**Sprint 11 Fase 11.B** — resolver service desde callbacks proveedor)

**Campos aspiracionales (NO existen como columnas dedicadas — viven dentro de `provisioner_data` jsonb hoy):**

| Campo aspiracional | Sprint planificado | Notas |
|--------------------|--------------------|-------|
| ~~`provisioner_reference`~~ | ✅ Sprint 11 Fase 11.B | Promovido a columna dedicada `provider_reference` (varchar 500) con índice. Mergeado `67fd733`. |
| `ssl_expires_at` | 11 (Fase 11.D potencial) | Útil para alertas de renovación SSL |
| `provisioned_at` | 11 (Fase 11.C potencial) | Marca técnica del momento de provisión — hoy se infiere de `service.activated` event timestamp |
| `failure_reason` | 11 ✅ parcial | Hoy se persiste en `cancellation_reason` como `provisioning_failed:<code>` cuando el orquestador marca `cancelled` por error no-retriable. |
| `resource_config` (RAM/CPU/disco como columnas) | 11 (Fase 15E Docker) | Hoy en `provisioner_data` jsonb |
| `project_development` (valor del enum status) | 22 ([ADR-046](../10-decisions/adr-046-sistema-proyectos.md)) | Servicio en desarrollo de proyecto, no visible al cliente |

**Estado del enum `ServiceStatus` (real):** `pending` · `provisioning` · `active` · `suspended` · `cancelled` · `terminated`. **No tiene `failed`** (lo equivalente es `terminated`). **No tiene `paused`** todavía como valor enum, pero los campos `paused_at` y `pause_max_date` existen — el "pausado" se infiere de `paused_at != null`.

**Eventos emitidos del dominio service:**
- `service.provisioned` — emitido por `BillingCheckoutService.checkout()` al CREAR el service (legacy histórico). Consumido por `SupportInsideOnServiceProvisionedListener` (Sprint 8 D.12.9 / [ADR-076](../10-decisions/adr-076-checkout-unico-support-inside-via-evento.md)).
- **`service.activated`** — Sprint 11 Fase 11.B (`67fd733`) — emitido por `ProvisioningOrchestratorService` cuando confirma `services.status='active'` tras `plugin.provision()` exitoso. Plugins reales Sprint 15 consumen este, no `service.provisioned`.
- **`service.provisioning_failed`** — Sprint 11 Fase 11.B — emitido por orquestador en error no-retriable o plugin no registrado. Listener notifications pendiente Fase 11.E.
- **`service.metrics_fetched` / `service.action_executed` / `service.sso_opened`** — Sprint 11 Fase 11.B — emitidos por wrappers cross-cutting. Listener audit pendiente Fase 11.E.
- `service.suspended` / `service.cancelled` / `service.paused` / `service.resumed` — siguen huérfanos (Sprint 11 Fase 11.C-D los enchufa al orquestador para invocar `plugin.deprovision()` o equivalente).
- Detalle completo en [`_events.md`](../20-modules/_events.md).

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

## Tabla: `provisioning_log` ⬜ (no materializada — diferida)

> **Nota canónica (2026-05-02 — cierre Sprint 11 Fase 11.E):** la tabla NO se creó en Sprint 11. El historial de intentos de provisioning vive distribuido en **3 fuentes que cubren el mismo caso de uso**:
> - **Logs estructurados** del backend (`ProvisioningOrchestratorService` + `ProvisioningDispatchProcessor`) con `correlation_id` propagado de extremo a extremo (R9). Consulta vía `pnpm logs:backend | grep <correlation_id>` o panel `/admin/error-log` (Sprint 9 Fase F) para errores capturados.
> - **Cola BullMQ `provisioning-dispatch`** + `failed_jobs` (DLQ Postgres, Sprint 9 Fase A). Cada intento queda en BullMQ con su payload + retries. Tras agotar reintentos, fila persistente en `failed_jobs` con `last_error` + `attempts_made` (panel `/admin/jobs/failed`).
> - **`audit_change_log`** (Sprint 9 Fase E) cuando un agente reprovisiona/deprovisiona desde `/admin/services/:id` (acciones manuales).
>
> Materializar la tabla `provisioning_log` añadiría una 4ª fuente parcialmente redundante. Decisión Sprint 11 cierre: NO crearla salvo que un caso real lo justifique (auditoría fiscal, dashboard de incidentes por proveedor, etc.). Si se decide crearla, ADR específico + sprint dedicado.

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

## Tabla: `invoices` ✅

Facturas emitidas. **Inmutables tras emisión** (invariante BILL-INV-2). Rectificación = nueva factura.

> **Fuente de verdad:** `backend/prisma/schema.prisma` modelo `Invoice` + enum `InvoiceStatus`.
> **Nota histórica:** el documento legacy `DATABASE_SCHEMA.md` listaba un campo `type` enum (`full`/`simplified`) que **NO existe en Prisma** — la "factura simplificada" se infiere del perfil de facturación (`billing_profile.nif_cif IS NULL`). También listaba `credit_applied`, `project_id`, `invoice_type` que son aspiracionales.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `invoice_number` | varchar(50) | NOT NULL, UQ | Formato configurable (`billing.invoice_prefix`). Ej: `AELIUM-2026-0042`. **Generado con SEQUENCE atómica** ([ADR-025](../10-decisions/adr-025-numeracion-secuencial-facturas.md)). |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | |
| `billing_profile_id` | uuid | NULLABLE, FK → `billing_profiles(id)` | Perfil usado para esta factura ([clients.md](./clients.md)) |
| `partner_id` | uuid | NULLABLE | FK lógica a `partners(id)` ([partner.md](./partner.md)) |
| `partner_label` | varchar(200) | NULLABLE | "Aelium · Partner con Agencia X" |
| `status` | enum `InvoiceStatus` | NOT NULL, DEFAULT `'draft'` | **`draft`** · `pending` · `paid` · `overdue` · `cancelled` · `refunded` ([ADR-026](../10-decisions/adr-026-estados-factura.md)). **No tiene `failed`** — el equivalente es `overdue` con `retry_count >= max_retries`. |
| `subtotal` | decimal(10,2) | NOT NULL | Base imponible — sobre la que se calcula partner commission |
| `tax_rate` | decimal(5,2) | NOT NULL, DEFAULT `21` | IVA ([ADR-027](../10-decisions/adr-027-iva-por-pais.md)) |
| `tax_amount` | decimal(10,2) | NOT NULL | |
| `discount_amount` | decimal(10,2) | NOT NULL, DEFAULT `0` | Descuento total aplicado |
| `total` | decimal(10,2) | NOT NULL | |
| `currency` | varchar(3) | NOT NULL, DEFAULT `'EUR'` | |
| `due_date` | timestamptz | NOT NULL | |
| `paid_at` | timestamptz | NULLABLE | |
| `payment_provider` | varchar(100) | NULLABLE | Plugin que cobró: `stripe`, `manual`, `redsys`, ... ([ADR-031](../10-decisions/adr-031-payment-providers.md)) |
| `payment_method` | varchar(100) | NULLABLE | `card` · `sepa` · `transfer` · ... |
| `payment_ref` | varchar(500) | NULLABLE | ID externo del provider de pago |
| `retry_count` | integer | NOT NULL, DEFAULT `0` | Intentos de cobro fallidos |
| `max_retries` | integer | NOT NULL, DEFAULT `3` | Configurable (default coincide con `billing.max_payment_retries`) |
| `next_retry_at` | timestamptz | NULLABLE | Próximo intento programado |
| `is_manual` | boolean | NOT NULL, DEFAULT `false` | Factura creada manualmente por admin |
| `notes` | text | NULLABLE | Notas internas o para el cliente |
| `pdf_url` | varchar(1000) | NULLABLE | **Tras Sprint 11.5 (ADR-062):** guarda la **S3 key** (`invoices/{invoice_number}.pdf`), no una URL. La signed URL se genera bajo demanda con TTL desde `storage.signed_url_expiry_minutes`. Populado en `markAsPaid` y `sendToPending` vía `InvoicePdfStorageService.generateAndUploadInBackground()`. Si null (legacy / upload previo fallido), el endpoint `/pdf` regenera + sube + popula on-demand. |
| `metadata` | jsonb | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices reales:**
- `@@index([user_id])`
- `@@index([billing_profile_id])`
- `@@index([status])`
- `@@index([due_date])` (cron de vencimientos)
- `@@index([next_retry_at])` (cron `retryOverduePayments`)
- `@@unique([invoice_number])`

**Campos aspiracionales (NO existen en Prisma todavía):**

| Campo aspiracional | Sprint planificado | Notas |
|--------------------|--------------------|-------|
| `type` (enum `full`/`simplified`) | — | Se infiere de `billing_profile.nif_cif IS NULL` (factura simplificada) o `IS NOT NULL` (completa). Si una auditoría fiscal exige columna explícita → añadir |
| `credit_applied` (decimal — crédito aplicado de referidos/prorrateo) | 17/20 | Cuando exista `referral_credits.applied_to_invoice_id` y `billing_credits.applied_to_invoice_id` se puede computar; columna desnormalizada solo si se justifica |
| `project_id` (FK a projects) | 22 ([ADR-046](../10-decisions/adr-046-sistema-proyectos.md)) | Para depósito y factura final de proyecto |
| `invoice_type` (enum `standard`/`deposit`/`project_final`) | 22 | Diferenciar tipos de factura del flujo de proyectos |

**Notas de decisión:**
- Numeración secuencial por año mediante PostgreSQL SEQUENCE (`invoice_number_seq_<YEAR>`) — atómica, sin race conditions, sin saltos ([ADR-025](../10-decisions/adr-025-numeracion-secuencial-facturas.md)).
- Las facturas se conservan **10 años** (obligación Hacienda España). No configurable.
- Cron "preparar año siguiente" pendiente — ver [jobs-reference](../50-operations/jobs-reference.md).
- **Eventos críticos sin Outbox (deuda R8):** `invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue` — ver [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md). **El evento `invoice.failed` se emite cuando `retry_count >= max_retries`** (la fila sigue en `status='overdue'`).

---

## Tabla: `invoice_items` ✅

Líneas de cada factura. Inmutables tras pasar el invoice a `pending` (BILL-INV-3).

> **Fuente de verdad:** `backend/prisma/schema.prisma` modelo `InvoiceItem`.
> **Nota histórica:** el documento legacy mencionaba `discount_amount` y `subtotal`. **El código real usa `discount_pct` (porcentaje) y `total`.**

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `invoice_id` | uuid | NOT NULL, FK → `invoices(id)` ON DELETE CASCADE | |
| `service_id` | uuid | NULLABLE | FK lógica a `services(id)` |
| `product_id` | uuid | NULLABLE | FK lógica a `products(id)` (snapshot del producto) |
| `description` | varchar(500) | NOT NULL | |
| `quantity` | integer | NOT NULL, DEFAULT `1` | |
| `unit_price` | decimal(10,2) | NOT NULL | |
| `setup_fee` | decimal(10,2) | NOT NULL, DEFAULT `0` | Tarifa de alta única |
| `discount_pct` | decimal(5,2) | NULLABLE | **Porcentaje** de descuento (no importe) |
| `total` | decimal(10,2) | NOT NULL | `(quantity × unit_price) + setup_fee` con `discount_pct` aplicado |
| `period_start` | timestamptz | NULLABLE | Inicio del período facturado (suscripciones) |
| `period_end` | timestamptz | NULLABLE | Fin del período facturado |

**Índices reales:**
- `@@index([invoice_id])`

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
