# ADR-029 — Prorrateo en cambio de plan (mensual ↔ anual)

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 6) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §21 (parcial)
> **Domain:** billing

---

## Contexto

Un cliente contratado en plan **mensual** puede querer pasar a **anual** (con descuento) en cualquier momento del ciclo. Lo opuesto también: anual → mensual al renovar.

La pregunta: **¿qué hacemos con el dinero ya pagado del ciclo en curso?**

Opciones posibles:

- A) Ignorar — el cliente pierde lo pagado. Inaceptable comercialmente.
- B) Devolver dinero — implica refund de la factura anterior. Complejidad fiscal alta.
- C) **Prorrateo en crédito** — calcular días no consumidos, descontar del nuevo plan. **Sin devolución de dinero.**

Aelium prefiere C: simplicidad fiscal (no hay refund), transparencia con el cliente (el crédito es visible), liquidez preservada.

---

## Decisión

### Cálculo del prorrateo

```
precio_diario = precio_total_plan_actual / dias_periodo_actual
dias_no_consumidos = (fecha_fin_periodo - fecha_cambio_de_plan).dias
credito = precio_diario × dias_no_consumidos

total_a_pagar = precio_nuevo_plan - credito
```

### Ejemplo

```
Cliente tiene Web Pro mensual a 30 €/mes.
Lleva 15 días del ciclo de 30 días.
Quiere cambiar a Web Pro anual a 300 €/año (descuento 17% vs 12 mensuales).

precio_diario_actual = 30 / 30 = 1 €/día
dias_no_consumidos = 15
credito = 1 × 15 = 15 €

total_a_pagar = 300 - 15 = 285 €
nuevo_periodo = 365 días desde la fecha de cambio
```

### Sin devolución de dinero

- **El crédito SOLO se aplica al nuevo plan.** Si el nuevo plan es **más barato** que el crédito, el cliente NO recibe la diferencia. El crédito sobrante queda en cuenta y se aplica al siguiente cargo.
- Implementación con campo `Service.credit_balance_eur` (o similar). Cada renovación consume el crédito antes de cobrar.

### Preview obligatorio antes de confirmar

- Endpoint `GET /api/v1/billing/proration/preview?service_id=X&new_pricing_id=Y`.
- Devuelve:
  ```json
  {
    "current_plan": { "name": "Web Pro mensual", "price": 30 },
    "new_plan": { "name": "Web Pro anual", "price": 300 },
    "days_consumed": 15,
    "days_remaining": 15,
    "daily_price_current": 1,
    "credit_eur": 15,
    "amount_to_pay": 285,
    "new_period_start": "2026-04-26",
    "new_period_end": "2027-04-26"
  }
  ```
- UI muestra el desglose **antes** de pedir confirmación. **Transparencia obligatoria** (R5: no lógica oculta).

### Cambio aplicado al confirmar

1. Crear factura nueva con `total = amount_to_pay`.
2. La factura anterior del periodo en curso queda como está (no se modifica retroactivamente — invariante BILL-INV-3).
3. Servicio actualiza `pricing_id` al nuevo plan.
4. Nuevo período empieza el día del cambio.

### Restricciones

- **Solo cambia entre planes del MISMO producto.** Cambiar de `Web Pro` a `Web Business` es otro caso (upgrade) — distinto, ADR futuro si es necesario.
- **Solo entre ciclos** (mensual → anual o viceversa). Otros saltos (ej: mensual → trimestral) cuando se introduzca el ciclo `quarterly`.
- **Cliente no puede cambiar más de N veces por ciclo** (configurable en settings — anti-abuse de prorrateos repetidos). Default no implementado, pendiente.

---

## Consecuencias

- ✅ **Ganamos:**
  - Cliente cambia de plan sin perder lo pagado.
  - Preview transparente — el cliente ve el cálculo exacto antes de pagar.
  - Sin refunds → simplicidad fiscal.
- ⚠️ **Aceptamos:**
  - Si el nuevo plan es más barato que el crédito, el sobrante queda como `credit_balance_eur` que se aplica en siguientes facturas. UI debe mostrar el saldo.
  - Cálculo asume días enteros. Casos de cambio "a mitad de día" se redondean (al alza para no privilegiar a Aelium ni al cliente — convención: hoy contado entero).
- 🚪 **Cierra:**
  - **No devolución de dinero al cambiar de plan.** Si el cliente quiere cancelar y recuperar dinero → flujo de cancelación con refund (ADR-026), procedimiento distinto.
  - **No cambios sin preview.** El cliente debe ver el cálculo antes de confirmar.

---

## Cuándo revisar

- Si surge necesidad de upgrade entre productos distintos (Web Pro → Web Business): ADR adicional con lógica de migración + prorrateo de la diferencia.
- Si Hacienda obliga a tratamiento fiscal específico para créditos no consumidos en cuenta de cliente.
- Si el "abuse" de cambios de plan repetidos se vuelve real → activar restricción N cambios por ciclo.
- **Si surge demanda de wallet/loyalty/refunds visibles al cliente** (ej. campañas "5€ por referir", compensación por incident, créditos navideños) → **NO extender `services.credit_balance_eur`**, escribir ADR-NNN nuevo con tabla dedicada `credit_transactions` (audit inmutable, expiración, source enum, RGPD) + UI cliente "Mi saldo" + reportes admin. El campo `credit_balance_eur` de este ADR es **buffer técnico interno** del flujo de prorrateo, no un sistema de créditos transversal. Mantener esa frontera evita que el dashboard se convierta en un wallet de facto sin haber tomado la decisión consciente.

---

## Referencias

- **Módulos afectados:** billing.
- **ADRs relacionados:** ADR-026 (estados factura — el prorrateo crea factura nueva), ADR-028 (ciclo de vida del servicio), ADR-030 (gracia + reintentos).
- **Glosario:** [Prorrateo](../00-foundations/glossary.md), [Plan / Pricing](../00-foundations/glossary.md), [Servicio](../00-foundations/glossary.md).
- **Implementación (2026-06-24):** cálculo en `billing-calculator.service.ts:calculateProration()` (devuelve además `creditRemaining` = sobrante); flujo en `subscription-plan-change.service.ts` (`previewPlanChange` + `confirmPlanChange`, restricciones mismo-producto/cambio-de-ciclo/misma-moneda/activo/ownership) sobre `SubscriptionController` (`GET /api/v1/subscriptions/:id/change-plan/preview` + `POST /api/v1/subscriptions/:id/change-plan`, dueño resuelto del JWT — no `@Query`); factura del prorrateo vía `GenerateInvoiceOnPlanChangedListener` (consume `service.plan_changed`, Outbox R8, **BILL-INV-3**); sobrante en `Service.credit_balance_eur`, consumido en la renovación (`BillingLifecycleWorker.generatePendingInvoices`, descuento pre-IVA). **Pendiente (consciente):** límite de N cambios por ciclo (anti-abuse, §Restricciones) + UI cliente del preview/confirm (R5/R16).
- **Sprint:** Sprint 6.6 (doctrina) · backend materializado 2026-06-24.
