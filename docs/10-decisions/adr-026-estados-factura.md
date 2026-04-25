# ADR-026 — Estados de factura y transiciones permitidas

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 6) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §12 (parcial)
> **Domain:** billing

---

## Contexto

Una factura pasa por varios estados a lo largo de su vida: se redacta, se finaliza, se cobra (o no), eventualmente se anula o se reembolsa. Cada estado tiene reglas distintas:

- **¿Se puede editar?** Solo en `draft`.
- **¿Tiene número fiscal?** No en `draft`, sí en el resto.
- **¿Es válida fiscalmente?** Sí en `pending`, `paid`, `overdue`, `refunded`. NO en `cancelled`.
- **¿Cuenta para el revenue?** Solo `paid`.
- **¿Cliente la ve?** Sí en `pending` en adelante. No en `draft` (es interna del admin).

Sin un modelo claro de estados y transiciones, la lógica de negocio se llena de condicionales ad hoc. Las transiciones inválidas (ej: `cancelled → paid`) deben ser imposibles, no solo "no se hacen".

---

## Opciones consideradas

1. **Estado libre como string** validado solo en DTO al crear/actualizar.
   - Pros: simple.
   - Contras: nada impide transiciones ilegales en código no validado. Menos legible.

2. **Máquina de estados formal** (xstate o similar).
   - Pros: estados + transiciones declarativas, visualizable.
   - Contras: librería adicional. Overhead para 6 estados con transiciones simples.

3. **(Elegida)** **Enum tipado en TypeScript + validación de transiciones en el service** (sin máquina de estados formal). Estado y reglas documentadas aquí.
   - Pros: tipado TS atrapa estados inválidos. Validación explícita en cada método (`finalizeInvoice`, `markAsPaid`, etc.) que sólo permite la transición desde el estado correcto.
   - Contras: la "máquina de estados" vive distribuida en el código. Si se añade un estado nuevo hay que actualizar varios sitios.

---

## Decisión

### Estados (`enum InvoiceStatus`)

| Estado | Significado | Cliente lo ve | Cuenta revenue | Tiene número |
|--------|-------------|---------------|----------------|--------------|
| `draft` | En redacción por el admin | NO | NO | NO |
| `pending` | Finalizada, esperando cobro | SÍ | NO | SÍ |
| `paid` | Cobrada | SÍ | **SÍ** | SÍ |
| `overdue` | Vencida sin pagar | SÍ | NO | SÍ |
| `cancelled` | Anulada (no válida fiscalmente) | SÍ (con badge "Anulada") | NO | SÍ |
| `refunded` | Reembolsada tras estar paid | SÍ | **NO** (resta del revenue) | SÍ |

### Transiciones permitidas

```
                         ┌──────────────────────┐
                         │                      ▼
draft ──finalize──► pending ──cobro/manual─► paid ──refund──► refunded
   │                   │                       │
   │                   ├─marca overdue──► overdue
   │                   │                       │
   └──cancel──┐        ├──cancel─────────► cancelled
              │        │                       ▲
              │        │                       │
              │        │  (overdue→cancel también)
              ▼        ▼                       │
          cancelled (terminal salvo casos)

NO permitidas:
  paid → pending      (no se "des-paga" — hay que reembolsar)
  cancelled → cualquier (terminal)
  refunded → cualquier  (terminal)
  draft → paid          (debe pasar por pending para tener número)
```

### Reglas de transición (validadas en service)

| Método | De | A | Quién |
|--------|----|---|-------|
| `BillingInvoiceService.finalizeInvoice()` | `draft` | `pending` | Admin (tras revisar items) |
| `BillingInvoiceService.markAsPaid()` | `pending`, `overdue` | `paid` | Admin (manual) o webhook payment provider |
| `BillingInvoiceService.markAsOverdue()` | `pending` | `overdue` | Cron diario `BillingLifecycleWorker.detectOverdueInvoices()` o admin manual |
| `BillingInvoiceService.cancel()` | `draft`, `pending`, `overdue` | `cancelled` | Admin (con razón obligatoria) |
| `BillingInvoiceService.refund()` | `paid` | `refunded` | Admin (con razón obligatoria) |

### Eventos emitidos por transición

| Transición | Evento |
|------------|--------|
| `draft → pending` | `invoice.created` (vía `createInvoice` o `finalize`) |
| `pending → paid` | `invoice.paid` |
| `pending → overdue` | `invoice.overdue` |
| `* → cancelled` | (sin evento todavía — candidato `invoice.cancelled` futuro) |
| `paid → refunded` | (sin evento todavía — candidato `invoice.refunded` futuro) |
| Reintento de cobro fallido | `invoice.failed` (sin cambio de estado, contador `retry_count` aumenta) |

### Lo que NO cambia tras finalize

Una vez `pending`:

- **Items, IVA aplicado, total** quedan **congelados**. No se recalculan ante cambios de configuración global posteriores.
- **billing_profile_id** congelado. Si el cliente actualiza su perfil, las facturas pasadas no se rectifican automáticamente.
- **invoice_number** asignado e inmutable.

### Edición en draft

- En `draft`, el admin puede modificar items, descuentos, perfil de facturación, fechas.
- **EC-BILL-07** garantiza que editar items en `draft` recalcula `subtotal`, `tax_amount`, `total`.

---

## Consecuencias

- ✅ **Ganamos:**
  - Modelo claro de estados con transiciones explícitas.
  - Imposible "des-pagar" una factura — hay que reembolsar (audit trail correcto).
  - Cliente no ve borradores del admin (estado `draft` interno).
- ⚠️ **Aceptamos:**
  - Validación de transiciones distribuida en service. Si se añade estado, hay que actualizar varios sitios. Mitigación: tests unitarios obligatorios cuando se priorice testing.
  - **No hay evento `invoice.cancelled` ni `invoice.refunded` todavía** — deuda menor. Los listeners actuales (`billing-email.listener`) no notifican estos casos. Pendiente.
- 🚪 **Cierra:**
  - **No transiciones libres** (`cancelled → paid`, etc.).
  - **No edición tras finalize.** Si se necesita corregir, anular + emitir nueva.

---

## Cuándo revisar

- Si surgen estados nuevos (ej: `pending_review` antes de pasar a paid en pagos manuales que requieren validación humana).
- Si se introduce sistema de aprobaciones (admin que crea draft + admin que finaliza distintos).
- Si se prioriza implementar máquina de estados formal (xstate) → ADR de migración.

---

## Referencias

- **Módulos afectados:** billing.
- **Reglas relacionadas:** R8 (Outbox para `invoice.*` — pendiente).
- **ADRs relacionados:** ADR-025 (numeración), ADR-027 (IVA), ADR-029 (prorrateo), ADR-030 (gracia + reintentos), ADR-033 (Outbox).
- **Glosario:** [Factura](../00-foundations/glossary.md), [Estado de conversación](../00-foundations/glossary.md) (concepto análogo en support).
- **Implementación:** `backend/src/modules/billing/billing-invoice.service.ts`, enum `InvoiceStatus` en schema Prisma.
- **Edge cases relacionados:** EC-BILL-07 (recalcular items en draft).
