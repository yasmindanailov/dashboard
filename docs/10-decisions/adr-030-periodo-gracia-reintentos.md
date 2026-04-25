# ADR-030 — Período de gracia + reintentos de cobro automáticos

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 6) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §12 (parcial)
> **Domain:** billing

---

## Contexto

Cuando una factura llega a su fecha de vencimiento, el cobro automático puede fallar por varias razones:

- Fondos insuficientes en la tarjeta.
- Tarjeta expirada o cancelada.
- Banco rechaza por sospecha de fraude.
- Webhook del payment provider llega tarde.

**Cancelar el servicio inmediatamente al primer fallo** es agresivo: muchos clientes resuelven el problema en horas. Pero **dejar el servicio activo indefinidamente sin pagar** es regalar producto.

Hace falta una política de **gracia + reintentos** que dé al cliente oportunidad de regularizar sin penalización inmediata, y que termine con suspensión + cancelación si persiste el impago.

---

## Decisión

### Configuración por producto

Cada `Product` define sus propias reglas (en `resource_config` o columnas):

| Campo | Default | Descripción |
|-------|---------|-------------|
| `grace_period_days` | 0 | Días tras vencimiento antes del primer intento de cobro |
| `payment_retry_days` | 3 | Días entre reintentos de cobro automático |
| `max_payment_retries` | 3 | Reintentos máximos antes de marcar overdue + suspender |
| `suspension_days_after_due` | 7 | Días tras `overdue` antes de suspender el servicio |
| `cancellation_days_after_suspension` | 30 | Días en `suspended` antes de cancelar |
| `data_retention_days_after_cancel` | 90 | Días que se conservan datos del servicio tras cancelación |

Estos defaults son configurables a nivel producto. Settings globales en `billing.*` proveen fallbacks si el producto no los define.

### Flujo del ciclo de cobro

```
T-X días (X = invoice_generation_days, default 7)
  → Generar factura `pending` con due_date.
  → Emitir invoice.created → email al cliente.

T = due_date
  → Pasar T = due_date + grace_period_days.

T+grace_period
  → Primer intento de cobro automático via payment provider activo.
  → Si OK: invoice.paid → cliente recibe email.
  → Si FALLA: emitir invoice.failed con retry_count=1.

T+grace_period + payment_retry_days × N (N = 1, 2, ..., max_payment_retries)
  → Reintento N. Si OK → paid. Si FALLA → invoice.failed con retry_count=N.

Tras max_payment_retries fallidos:
  → Estado de la factura: overdue.
  → Emitir invoice.overdue → email al cliente con CTA "Resolver pago".
  → Cron BillingLifecycleWorker.autoSuspendServices() vigila.

T+overdue + suspension_days_after_due
  → Servicio status → suspended.
  → Emitir service.suspended.
  → Cliente recibe email con CTA "Reactivar".

T+suspended + cancellation_days_after_suspension (default 30)
  → Servicio status → cancelled.
  → Emitir service.cancelled.
  → Cliente recibe email final.

T+cancelled + data_retention_days_after_cancel (default 90)
  → Datos del servicio se purgan (cron de housekeeping, futuro).
```

### Recuperación durante el ciclo

- **El cliente puede pagar la factura `overdue` manualmente** desde su dashboard en cualquier momento.
- Al pagar:
  - `invoice` → `paid`.
  - Si el servicio estaba `suspended` → vuelve a `active` (listener de `invoice.paid`, futuro).
  - Si el servicio estaba `cancelled` → **NO se recupera automáticamente** (caso edge: contactar admin).

### Implementación actual

- **Cron `BillingLifecycleWorker.detectOverdueInvoices()`** (1 AM diario): marca facturas `pending` con vencimiento + grace pasados como `overdue`.
- **Cron `retryPayments()`** (3 AM diario): reintenta cobros pendientes según política. **Hoy en stub** porque no hay payment provider real implementado.
- **Cron `autoSuspendServices()`** (3 AM diario): suspende servicios con factura `overdue` > X días.
- **Cron `autoCancelServices()`** (3 AM diario): cancela servicios `suspended` > Y días.

### Edge case: cliente paga durante reintentos

Si el cliente paga **manualmente** mientras los reintentos automáticos siguen pendientes, el siguiente reintento debe detectar que la factura ya está `paid` y abortar. Validación en el reintento.

### Notificaciones al cliente

Cada transición que afecta visiblemente al cliente envía email:

| Cuándo | Subject (template inline hoy) |
|--------|-------------------------------|
| `invoice.created` | "Nueva factura {number} — {total}" |
| `invoice.failed` (1er reintento fallido) | "Cobro fallido — {number} (intento 1/3)" |
| `invoice.overdue` | "Factura vencida — {number}" |
| `service.suspended` | (pendiente plantilla) |
| `service.cancelled` | (pendiente plantilla) |

---

## Consecuencias

- ✅ **Ganamos:**
  - Cliente con problema temporal de cobro (tarjeta caducada, fondos) tiene oportunidad de resolver sin perder servicio.
  - Aelium no regala producto indefinidamente — la suspensión y cancelación son automáticas.
  - Configuración por producto permite reglas distintas (ej: hosting con más gracia que dominio).
- ⚠️ **Aceptamos:**
  - **Reintentos reales no implementados** hasta tener plugin de pago. Hoy todo es manual (admin marca pagada).
  - Email de suspensión/cancelación pendientes de plantilla.
  - Defaults pueden no ser adecuados — ajustar tras experiencia con clientes reales.
- 🚪 **Cierra:**
  - **No suspensión inmediata al primer fallo de cobro.** Siempre hay gracia + reintentos.
  - **No cancelación automática sin paso por suspensión.** Siempre intermedio.

---

## Cuándo revisar

- Cuando se implemente el plugin de pago real (Stripe) → activar reintentos automáticos.
- Si los defaults resultan inadecuados (clientes molestos por suspensiones tempranas o cancelaciones tardías) → ajustar.
- Si Hacienda introduce cambios fiscales que afecten a período de gracia (improbable).

---

## Referencias

- **Módulos afectados:** billing.
- **Reglas relacionadas:** R8 (Outbox para `invoice.*` — pendiente).
- **ADRs relacionados:** ADR-025 (numeración), ADR-026 (estados factura), ADR-028 (ciclo vida servicio), ADR-031 (payment providers), ADR-033 (Outbox).
- **Glosario:** [Período de gracia](../00-foundations/glossary.md), [Suspensión](../00-foundations/glossary.md), [Cancelación](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/billing/billing-lifecycle.worker.ts`, `service-lifecycle.worker.ts`.
