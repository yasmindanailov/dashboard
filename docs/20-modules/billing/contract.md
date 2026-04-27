# billing — Contract

## 1. Propósito

Motor de facturación y ciclo de vida de servicios. Crea facturas (manual o vía checkout), gestiona estados (`draft → pending → paid | overdue | cancelled | refunded`), aplica IVA y descuentos, calcula prorrateos en cambios de plan, ejecuta reintentos automáticos de cobro, suspende y cancela servicios por impago, y emite los eventos que disparan emails al cliente.

**Garantiza invariantes legales españolas:** numeración secuencial sin saltos, retención 10 años, ninguna factura jamás se elimina (solo cambia de estado).

---

## 2. Estado de implementación

✅ **Producción.** Sprint 6 cerrado, hardening en Sprint 7 (EC-BILL-01..EC-CHKOUT-04).

Pendiente conocido:
- Plugin de pago real (hoy solo `manual` payment provider). Stripe está en backlog.
- ~~Outbox Pattern (R8) para `invoice.*`~~ ✅ **cerrado P0.2 (2026-04-26) + hardened Sprint 9 Fase C (ADR-064)**: 4 `invoice.*` usan `OutboxService.enqueue(tx, …)`; despacho via cola BullMQ `outbox-dispatch` con backoff exponencial 30s→480s; emit `outbox.event_failed` si agotan retries.
- ~~Email templates inline~~ ✅ **cerrado Sprint 9 Fase D (ADR-065)**: HTML movido a tabla `notification_templates` (Handlebars). `BillingEmailListener` delega a `NotificationsService.dispatchToUser()`.

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `invoices` | Facturas. Estados: draft, pending, paid, overdue, cancelled, refunded. | **Nunca se elimina** (Hacienda RD 1619/2012). Numeración secuencial sin saltos. |
| `invoice_items` | Líneas de factura | IVA inmutable tras finalización |
| `services` | Servicios contratados (instancias de productos) | Estado dirigido por billing (active/paused/suspended/cancelled) |

> Nota: `services` es un modelo "compartido" — fue creado con clients en mente pero billing es quien lo dirige funcionalmente (ciclo de vida según pagos). Se considera **propio de billing** en este contract para reflejar la realidad operacional.

---

## 4. Modelos foráneos accedidos

| Tabla | Módulo dueño | Tipo | Razón | Estado |
|-------|--------------|------|-------|--------|
| `users` | auth | lectura | Obtener email/nombre del destinatario al emitir factura, validar `targetUserId` en checkout admin | ✅ Lectura legítima |
| `products` | products | lectura | Catálogo en checkout | ✅ Lectura legítima |
| `product_pricing` | products | lectura | Precios + descuentos por ciclo en checkout | ✅ Lectura legítima |
| `billing_profiles` | clients | lectura | Datos fiscales del cliente para incluir en factura | ✅ Lectura legítima |
| `audit_access_log` | audit | escritura | Registrar accesos a facturas (lectura sensible) | ⚠️ Acceso directo. Cuando módulo audit se implemente, debería pasar por `AuditService`. |

---

## 5. API REST expuesta

Prefix: `/api/v1/billing` (facturas) y `/api/v1/subscriptions` (servicios).

### Facturas

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/billing/invoices` | Listar facturas (admin: todas; cliente: propias) | `Read.Invoice` + data isolation |
| `GET` | `/billing/invoices/stats` | Stats agregadas | `Read.Invoice` |
| `GET` | `/billing/invoices/:id` | Detalle | `Read.Invoice` + ownership |
| `POST` | `/billing/invoices` | Crear factura manual (admin) | `Create.Invoice` |
| `PATCH` | `/billing/invoices/:id` | Editar factura draft (recalcula IVA — EC-BILL-07) | `Update.Invoice` |
| `PATCH` | `/billing/invoices/:id/finalize` | draft → pending | `Update.Invoice` |
| `PATCH` | `/billing/invoices/:id/pay` | Marcar como pagada manualmente | `Update.Invoice` |
| `PATCH` | `/billing/invoices/:id/overdue` | Marcar como vencida (también lo hace el cron) | `Update.Invoice` |
| `PATCH` | `/billing/invoices/:id/cancel` | Cancelar (no elimina) | `Update.Invoice` |
| `PATCH` | `/billing/invoices/:id/refund` | Paid → Refunded | `Update.Invoice` |
| `GET` | `/billing/invoices/:id/pdf-url` | Devuelve `{ url, filename }` con la signed URL del bucket — consumido por el frontend, evita CORS cross-origin (ADR-062 §H.1) | `Read.Invoice` + ownership |
| `GET` | `/billing/invoices/:id/pdf` | 302 redirect a signed URL — para correos, curl, integraciones (ADR-062 §H.2) | `Read.Invoice` + ownership |

### Checkout

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `POST` | `/billing/checkout` | Crear servicio + factura desde producto | `Create.Service` |
| `GET` | `/billing/proration/preview` | Preview de prorrateo para cambio de plan | `Read.Service` |

> **Admin checkout (EC-BILL-01..03):** un admin puede crear servicios para un cliente concreto vía `targetUserId` en el body. Validado: el `billing_profile_id` debe pertenecer al `targetUserId`, no al admin.

### Subscriptions

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `PATCH` | `/subscriptions/:id/pause` | Pausar suscripción del cliente | `Update.Service` + ownership |
| `PATCH` | `/subscriptions/:id/resume` | Reanudar | `Update.Service` + ownership |
| `GET` | `/subscriptions/:id/change-plan/preview` | Preview de cambio de plan | `Read.Service` + ownership |

---

## 6. WebSocket gateway

N/A — billing no tiene gateway. El estado de facturas se actualiza vía REST + email.

---

## 7. Eventos emitidos

> Detalles completos en [`../_events.md`](../_events.md).

> **Status R8 (2026-04-27):** los 4 `invoice.*` cerrados al 100% — `OutboxService.enqueue(tx, …)` dentro de `prisma.$transaction`, despachados por `OutboxWorker.dispatch()` invocado desde cola BullMQ `outbox-dispatch` (ADR-064). Backoff exponencial 30s→480s en `next_retry_at`. Si agotan retries → emit `outbox.event_failed` para alerta superadmin (R7).

| Evento | Cuándo | Outbox | Estado |
|--------|--------|--------|--------|
| `invoice.created` | Tras `createInvoice()` exitoso | ✅ (P0.2 + ADR-064) | ✅ Consumido por `BillingEmailListener` → `NotificationsService.dispatchToUser` (Sprint 9 Fase D) |
| `invoice.paid` | Tras `markAsPaid()` | ✅ | ✅ Idem |
| `invoice.overdue` | Tras `markAsOverdue()` (manual o cron) | ✅ | ✅ Idem |
| `invoice.failed` | Tras intento de cobro fallido en worker | ✅ | ✅ Idem |
| `checkout.completed` | Tras `checkout()` exitoso | ❌ | 🟠 Huérfano (consumirá provisioning cuando exista) |
| `service.suspended` | Cron `autoSuspendServices()` | ❌ | 🟠 Huérfano (provisioning futuro) |
| `service.resumed` | `resumeService()` o cron `checkPauseExpiration()` | ❌ | 🟠 Huérfano (provisioning futuro) |
| `service.cancelled` | Cron `autoCancelServices()` | ❌ | 🟠 Huérfano (provisioning futuro) |
| `service.paused` | `pauseService()` | ❌ | 🟠 Huérfano (provisioning futuro) |

> ~~**Crítico R8:** los `invoice.*` deben usar Outbox Pattern.~~ ✅ **Resuelto** (P0.2 + Sprint 9 Fase C). Mecanismo descrito arriba.

---

## 8. Eventos consumidos

Ninguno. Billing emite, no escucha (pulsa el reloj del sistema vía crons + acciones de usuario).

---

## 9. Servicios consumidos cross-módulo

Ninguno cross-módulo. Sub-services internos (R15):

- `BillingService` (fachada)
- `BillingInvoiceService` — CRUD de facturas + transiciones de estado. Tras `markAsPaid` y `sendToPending` encola `pdfQueue.add('invoice-pdf', { invoice_id }, { jobId: 'invoice-pdf-{invoice_id}' })` (cola BullMQ `pdf-generation` — Sprint 9 Fase B + ADR-063). El `jobId` estable garantiza idempotencia natural.
- `BillingCheckoutService` — crea Service + Invoice desde producto
- `BillingCalculatorService` — IVA, descuentos, prorrateo
- `SubscriptionService` — pausa/reanuda, cambia plan
- `InvoicePdfService` — render puro del PDF (PDFKit). Devuelve Buffer.
- `InvoicePdfStorageService` (Sprint 11.5 + [ADR-062](../../10-decisions/adr-062-storage-canonico-minio.md)) — puente entre `InvoicePdfService` y `StorageService`. Métodos:
  - `generateAndUpload(invoiceId)` — render + upload a bucket + actualiza `Invoice.pdf_url` con la S3 key. Llamado desde `PdfGenerationProcessor` (cola `pdf-generation`).
  - `getSignedDownloadUrl(invoiceId)` — devuelve signed URL con TTL (`storage.signed_url_expiry_minutes`). Si `pdf_url` es null, hace fallback de generación on-demand (camino síncrono — semántica idéntica al `pdf_url=NULL` previo).
  - ~~`generateAndUploadInBackground(invoiceId)`~~ **eliminado en Sprint 9 Fase B** (era `setImmediate` fire-and-forget; reemplazado por cola BullMQ con DLQ + retries — cierra deuda R2 de Sprint 11.5).

Cross-módulo (core):
- `StorageService` (`core/storage`) — abstracción S3-compatible canónica. Inyectado por `InvoicePdfStorageService`.
- `OutboxService` (`core/outbox`) — usado por `BillingInvoiceService` para los 4 `invoice.*` (R8). Despachado por `OutboxDispatchProcessor` (cola BullMQ `outbox-dispatch`).
- `JobsModule` (`core/jobs`) — cola `pdf-generation` con `PdfGenerationProcessor` (Sprint 9 Fase B + ADR-063). DLQ persistente en `failed_jobs` + alerta `dlq.job_failed`.
- `NotificationsService` (`modules/notifications`) — `BillingEmailListener` delega los 4 `invoice.*` a `dispatchToUser` (Sprint 9 Fase D + D12).
- `BillingLifecycleWorker` — crons de invoice generation + retry
- `ServiceLifecycleWorker` — crons de suspension + cancellation

Listener: `BillingEmailListener` (consume eventos del propio módulo, técnicamente intra). Tras Sprint 9 Fase D delega a `NotificationsService.dispatchToUser` — la plantilla y el envío SMTP los ejecuta el processor de `notifications-dispatch`.

---

## 10. CASL — Permisos

### Subjects gestionados

| Subject | Descripción |
|---------|-------------|
| `Subject.Invoice` | Facturas |
| `Subject.Service` | Servicios contratados |
| `Subject.Payment` | (futuro, para cuando haya plugin de pago) |

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Invoice` | manage | manage | manage | — | read/list/create (own) | read/list (clients) |
| `Service` | manage | manage | read/list | read/list | read/list/update (own) | read/list (clients) |

> Los roles `client` y `partner` tienen condiciones aplicadas a nivel de **controller** (data isolation por `req.user.id`), no a nivel CASL — decisión de diseño (Sprint 6 hardening).

---

## 11. Settings consumidos

Categoría `billing`:

| Key | Default | Para qué |
|-----|---------|----------|
| `default_tax_rate` | 21 | IVA aplicado a facturas (configurable por país futuro) |
| `invoice_prefix` | `AEL` | Prefijo de numeración (`AEL-2026-00001`) |
| `payment_due_days` | 7 | Días hasta vencimiento desde finalización |
| `invoice_generation_days` | 7 | Días antes del vencimiento para generar factura automática |
| `suspension_days` | 7 | Días tras vencimiento + período de gracia para suspender servicio |

> **Settings huérfanos detectados:** `invoice_prefix`, `payment_due_days` y `default_tax_rate` están en seed pero el código los lee desde valores hardcodeados o desde el producto. **Verificar uso real** y eliminar inconsistencia (deuda menor).

---

## 12. Emails enviados

⚠️ **Plantillas inline en listener** — pendiente migrar a archivos separados (`core/email/templates/billing.templates.ts`).

| Trigger (evento) | Subject (template inline) | Destinatario |
|------------------|---------------------------|--------------|
| `invoice.created` | `Nueva factura {number} — {total}` | Cliente |
| `invoice.paid` | `Pago confirmado — {number}` | Cliente |
| `invoice.failed` | `Cobro fallido — {number} (intento X/Y)` | Cliente |
| `invoice.overdue` | `Factura vencida — {number}` | Cliente |

> Los subjects originales tenían emojis (`✓`, `⚠`, `🔴`). Esto **viola D1**. Deuda visual a corregir cuando se migren a templates.

---

## 13. Jobs / cron

Implementados en `BillingLifecycleWorker` y `ServiceLifecycleWorker`:

| Cron | Método | Qué hace |
|------|--------|----------|
| `EVERY_DAY_AT_1AM` | `detectOverdueInvoices()` | Marca como `overdue` facturas pending con vencimiento pasado |
| `EVERY_DAY_AT_2AM` | `generatePendingInvoices()` | Genera facturas para servicios próximos a vencer (X días configurable) |
| `EVERY_DAY_AT_3AM` | `retryPayments()` | Reintenta cobros automáticos (cuando haya plugin de pago) |
| `EVERY_DAY_AT_3AM` | `autoSuspendServices()` | Suspende servicios con factura vencida + retries agotados |
| `EVERY_DAY_AT_3AM` | `autoCancelServices()` | Cancela servicios suspendidos > N días |
| `EVERY_HOUR` | `checkPauseExpiration()` | Reanuda servicios pausados que excedieron `pause_max_date` |

> **Nota crítica:** los crons usan `@nestjs/schedule` (in-process). Si hay múltiples instancias del backend en producción, **se ejecutarán en todas** y duplicarán trabajo. Cuando se escale: mover a BullMQ con cron jobs, o usar leader election. Hoy no es problema (single instance).

---

## 14. Invariantes

- **BILL-INV-1:** Numeración secuencial sin saltos. PostgreSQL SEQUENCE por año (`invoice_number_seq_YYYY`). Si se necesita "borrar" una factura, se cancela (`status = cancelled`); el número queda asignado pero la factura no es válida fiscalmente. **Hacienda España RD 1619/2012, art. 6.**
- **BILL-INV-2:** Una factura nunca se elimina del sistema. Solo cambia de estado. Retención 10 años (Hacienda).
- **BILL-INV-3:** Los items de factura, IVA aplicado y total se congelan al pasar a estado `pending` (finalize). No se recalculan ante cambios de configuración posteriores. EC-BILL-07: editar items en `draft` SÍ recalcula.
- **BILL-INV-4:** `Invoice.user_id` y `Invoice.billing_profile_id` deben pertenecer al mismo usuario. Validado en checkout admin (EC-BILL-03).
- **BILL-INV-5:** Estados de servicio dirigidos por billing: `pending → active → paused | suspended | cancelled`. Transiciones desde otros módulos van vía servicios de billing (no escritura directa al modelo).
- **BILL-INV-6:** El `payment_provider` activo debe implementar la interfaz `PaymentProviderInterface`. Hoy solo existe `manual` (admin marca como pagada). El core nunca importa Stripe directo — R4.
- **BILL-INV-7:** Prorrateo: precio diario = `total_plan / días_ciclo`. Crédito = `precio_diario × días_no_consumidos`. Preview obligatorio antes de confirmar (Sprint 6.6).

---

## 15. Decisiones relacionadas

> Migrar a ADRs en F2.

- `DECISIONS.md` §12 — Numeración secuencial de facturas (Hacienda)
- `DECISIONS.md` §14 — Prorrateo en cambios de plan
- `DECISIONS.md` §21 — Suspensión y cancelación automáticas
- `DECISIONS.md` §32 — IVA por país (preparado, hoy 21%)
- `DECISIONS.md` §34 — Estrategia de payment providers (interfaz vs plugins)

---

## 16. Excepciones documentadas

- **R1 (módulos no se llaman):** ✅ cumplido. Lecturas a `users`, `products`, `billing_profiles` son legítimas (aggregator).
- **R8 (Outbox para eventos críticos):** ✅ **Cumplido al 100%** (P0.2 2026-04-26 + Sprint 9 Fase C 2026-04-27). Los 4 `invoice.*` usan `OutboxService.enqueue(tx, …)` + dispatcher BullMQ con backoff exponencial 30s→480s. Si agotan retries → alerta superadmin (R7). Cobertura E2E `tests/e2e/outbox-invoice.spec.ts` 4/4.
- **D1 (sin emojis en UI):** ❌ **Violación parcial** en subjects de emails (`✓`, `⚠`, `🔴`). Plan: migrar templates a archivos separados sin emojis.
- **R15 (límite 300 líneas):** ✅ post-refactor Sprint 7+. BillingService = fachada.

---

## 17. Pendiente / deuda técnica

- [x] ~~**CRÍTICO:** Implementar Outbox Pattern para los 4 eventos `invoice.*`~~ ✅ Cerrado P0.2 + Sprint 9 Fase C
- [ ] Migrar emails inline en `billing-email.listener` a `core/email/templates/billing.templates.ts` (sin emojis)
- [ ] Implementar plugin Stripe — Sprint dedicado post-Sprint 14
- [ ] Resolver settings huérfanos: `invoice_prefix`, `payment_due_days`, `default_tax_rate` (verificar uso real, eliminar inconsistencia entre defaults hardcodeados y settings DB)
- [ ] Cuando provisioning module se implemente: añadir listeners para `service.suspended`, `service.cancelled`, etc. para ejecutar acciones técnicas externas
- [ ] Mover crons a BullMQ + leader election cuando se escale a múltiples instancias

---

## 18. Cómo testear este módulo

### Tests E2E existentes
- `tests/e2e/checkout-admin.spec.ts`
  - Test 1: admin accede al listado de facturas sin errores
  - Test 2: admin accede al checkout para crear servicio (Step 1: cliente target)

### Tests unitarios
Pendiente. Especialmente crítico para:
- `BillingCalculatorService` — IVA, descuentos, prorrateo (lógica pura, fácil de testear)
- Numeración secuencial — invariante legal, tests obligatorios

### Smoke test manual
1. Admin crea factura manual → cliente recibe email → descarga PDF → admin marca como pagada → cliente recibe email de confirmación
2. Admin checkout para cliente: seleccionar cliente → producto → ciclo → perfil → confirmar → factura `draft` creada
3. Crear servicio con vencimiento próximo → esperar cron 02:00 → verificar factura generada
4. Pausar suscripción del cliente → verificar `pause_max_date` → reanudar manualmente
