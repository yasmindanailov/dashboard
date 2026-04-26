# Sprint 6 — Billing Engine ✅

> **Estado:** ✅ Cerrado

---

## Objetivo

Motor de facturación completo: ciclo de vida de facturas, suscripciones, prorrateo, cobro automático con reintentos, generación de PDF, abstracción de payment providers (sin Stripe — eso es Sprint 15 dedicado a plugins).

---

## Lo que entregó

### Core billing
- **`BillingService`** (refactorizado en Sprint 13.R15.2 a fachada + `billing-invoice.service.ts` + `billing-checkout.service.ts` + `billing-calculator.service.ts`):
  - Crear factura (draft → pending), cálculo subtotal/IVA/descuento/total.
  - **Numeración secuencial** ([ADR-025](../../10-decisions/adr-025-numeracion-secuencial-facturas.md)) — PostgreSQL SEQUENCE por año (`invoice_number_seq_YYYY`), prefijo configurable. Sin saltos (obligación Hacienda RD 1619/2012).
  - **`PaymentProvider` interface** ([ADR-031](../../10-decisions/adr-031-payment-providers.md)) — `createPayment()`, `handleWebhook()`, `refund()`, `getStatus()`. Plugin `manual` como placeholder (Stripe en Sprint 15).
  - **Ciclo de cobro completo:** generar X días antes vencimiento, intentar cobro, reintentos configurables, transición a `overdue` ([ADR-030](../../10-decisions/adr-030-periodo-gracia-reintentos.md)).
  - **Suspensión y cancelación automática:** workers `autoSuspendServices`, `autoCancelServices` con período de gracia configurable.
  - **Prorrateo** ([ADR-029](../../10-decisions/adr-029-prorrateo-cambio-plan.md)) — cálculo transparente cambio mensual↔anual con preview al cliente.
  - **Pausar suscripción** + reactivación.
  - **Período de gracia** configurable por producto.
  - **Facturas manuales** (admin).

### Configuración fiscal en Settings
- IVA %, formato numeración, días antelación, reintentos cobro, días suspensión/cancelación defaults.

### Frontend
- **Checkout dashboard** — catálogo público → seleccionar producto → ciclo → perfil facturación → confirmar (sin pago real hasta Sprint 15).
- **Lista facturas** (admin + cliente con filtros role-based).
- **Detalle factura + descarga PDF autenticada**.
- **Refactor R15** del checkout (570→233 líneas).

### Plantillas email + jobs
- Emails: `invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue`.
- Crons: `detectOverdueInvoices` (01:00), `generatePendingInvoices` (02:00), `retryOverduePayments` (cada 6h), `autoSuspendServices` (03:00), `autoCancelServices` (04:00), `checkPauseExpiration` (05:00).

### Hardening de seguridad
- `userId` extraído del JWT (no query param).
- **Data isolation por rol** — admin ve todo, cliente solo lo suyo.
- Ownership enforcement en detail/PDF.
- Validación finalize (items > 0, total > 0).
- CASL: `Read.Product` para clientes.

### Documentación
- `docs/features/billing/admin.md` + `client.md`.

---

## Decisiones clave consolidadas

- **`payment_provider` string libre** en schema (no enum) — permite añadir providers sin migration ([ADR-031](../../10-decisions/adr-031-payment-providers.md)).
- **Checkout crea `Service` en `pending` + `Invoice` en `draft`**.
- **Factura nunca se elimina** (BILL-INV-2) — solo cambia de estado. Retención 10 años (Hacienda).
- **Numeración atómica con SEQUENCE** — sin race conditions.
- **PDF fallback** sin billing profile → muestra nombre + email del usuario.
- **CASL strategy** — conditions removidas del guard, data isolation en controller/service.

### Items movidos a otros sprints
- Integración Stripe → Sprint 15 (plugins).
- Webhooks Stripe → Sprint 15.
- Registro via compra desde landing → Sprint 18 (Landing Integration).

---

## Verificación de cierre (auditoría 2026-04-26)

- ✅ Modelos Prisma: `Service`, `Invoice`, `InvoiceItem`.
- ✅ 18 endpoints billing operativos.
- ✅ Sub-servicios separados.
- ✅ 6 crons activos (verificados en `*.worker.ts`).
- ✅ 4 plantillas billing email activas.
- ✅ Tests E2E billing (checkout + factura) pasan.

**Drift menor detectado en auditoría:**
- `invoices.type` (`full`/`simplified`) en doc legacy → **NO existe en Prisma** (se infiere de `billing_profile.nif_cif`). Corregido en `docs/30-data/billing.md` durante auditoría 2026-04-26.
- `invoices.credit_applied`, `project_id`, `invoice_type` aspiracionales (Sprint 17/22).

**Deuda heredada (P0 según auditoría):**
- 4 eventos `invoice.*` SIN Outbox — riesgo legal/financiero pre-producción ([ADR-033](../../10-decisions/adr-033-outbox-pattern-pendiente.md)).
