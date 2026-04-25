# ADR-031 — Payment providers como plugins (interface intercambiable)

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 6) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §34 + Regla R4
> **Domain:** billing, foundation

---

## Contexto

Aelium aceptará pagos por al menos los siguientes medios:

- **Stripe** (tarjeta + SEPA Direct Debit) — primer plugin a implementar.
- **Redsys** (gateway español, posible alternativa B2B nacional).
- **GoCardless** (SEPA puro).
- **Manual** (admin marca como pagada — caso transferencia bancaria, efectivo, etc.).

Si el código de billing **importa Stripe directamente**, cambiar de proveedor o añadir Redsys = refactor cross-módulo. Esto contradice la Regla R4 (plugins) y el modelo de plugins de ADR-009.

Hace falta una **interfaz `PaymentProvider`** que el core conoce, con implementaciones intercambiables como plugins.

---

## Decisión

### Interfaz `PaymentProviderInterface`

Definida en `backend/src/modules/billing/interfaces/payment-provider.interface.ts`:

```typescript
export interface PaymentProviderInterface {
  /** Identificador del provider (ej: 'stripe', 'manual') */
  readonly name: string;
  /** Etiqueta visible al admin/cliente (ej: 'Stripe', 'Pago manual (admin)') */
  readonly label: string;

  /** Inicia un cobro */
  createPayment(invoice: { ... }): Promise<PaymentResult>;

  /** Procesa webhook entrante del provider (Stripe envía aquí confirmación de pago) */
  handleWebhook(payload: ...): Promise<PaymentResult & { invoice_id?: string }>;

  /** Reembolsa total o parcialmente */
  refund(invoice: { ... }): Promise<RefundResult>;

  /** Consulta el estado actual de un pago */
  getStatus(paymentRef: string): Promise<{
    status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    provider: string;
  }>;
}
```

### Plugin activo configurable

- Campo `payment_provider` en `Invoice` y `Service` es un **string libre** (no enum). Permite añadir providers nuevos sin migration.
- El plugin activo por defecto se elige en settings (cuando exista UI: `billing.default_payment_provider`).
- Cada Service / Invoice puede tener su propio `payment_provider` específico (caso edge: cliente con tarjeta Stripe + cliente con transferencia manual).

### Implementación actual: solo `manual`

```
backend/src/plugins/payment/manual/
└── manual-payment.provider.ts
```

`ManualPaymentProvider` implementa la interfaz pero no llama a APIs externas:

- `createPayment`: devuelve `{ success: true, external_id: 'manual-<invoice_id>' }`.
- `handleWebhook`: devuelve `{ success: false, error: 'Manual provider does not support webhooks.' }`.
- `refund`: devuelve éxito sin acción real (admin gestiona el refund por su cuenta).
- `getStatus`: devuelve siempre `succeeded` (porque manual implies trust).

Resultado: el flujo de billing funciona end-to-end aunque no haya plugin real. El admin marca facturas como pagadas manualmente desde la UI cuando recibe transferencia.

### Stripe — pendiente

```
backend/src/plugins/payment/stripe/  (futuro)
```

Cuando se priorice (sprint dedicado post-Sprint 14), el plugin Stripe implementará:

- `createPayment` → crea PaymentIntent / Subscription en Stripe API.
- `handleWebhook` → endpoint `/webhooks/stripe` que valida firma, procesa eventos `payment_intent.succeeded`, `charge.failed`, `invoice.paid`, etc.
- `refund` → llamada a Stripe Refund API.
- `getStatus` → consulta a Stripe.

**Documento dedicado al desarrollar el plugin** (decisión paralela a ADR-021 sobre provisioners — cada plugin con su doc).

### Reglas de plugin (Regla R4)

1. Core no importa Stripe SDK directamente. Solo dentro de `plugins/payment/stripe/`.
2. Credenciales del provider (API keys) cifradas con AES-256-GCM (ADR-015).
3. Webhook secrets validados criptográficamente antes de procesar.
4. Circuit breaker (R11) en llamadas a la API externa.
5. Retries y backoff específicos al plugin — no asunción cross-plugin.

---

## Consecuencias

- ✅ **Ganamos:**
  - Cambiar de Stripe a Redsys = nuevo plugin sin tocar billing core.
  - Tests del core con `manual` plugin sin necesidad de mockear Stripe.
  - El campo `payment_provider` libre permite añadir providers sin migration.
- ⚠️ **Aceptamos:**
  - **Hoy solo `manual` está implementado.** Hasta que haya plugin real, el cobro automático (ADR-030 reintentos) no se ejecuta — admin debe marcar manualmente.
  - Cada plugin reimplementa su retry / error handling. Aceptable: APIs externas tienen quirks.
  - Webhooks requieren endpoint público accesible — implica configuración de DNS / Traefik cuando haya despliegue.
- 🚪 **Cierra:**
  - **No `import { Stripe } from 'stripe'`** en código de negocio. Solo en `plugins/payment/stripe/`.
  - **No múltiples payment providers activos simultáneos** en la misma instalación, salvo casos edge documentados.

---

## Cuándo revisar

- Cuando se implemente Stripe: documentar plugin específicamente, validar interfaz, ajustar si descubrimos que falta algún método.
- Si surgen requisitos de pagos múltiples (cliente con varias tarjetas, split payments) → ampliar interfaz con métodos adicionales.
- Si Stripe deprecia API que usamos → revisión obligatoria (mantenerse en versión soportada).

---

## Referencias

- **Módulos afectados:** billing.
- **Reglas relacionadas:** R4 (plugins), R11 (circuit breaker), R12 (credenciales encriptadas).
- **ADRs relacionados:** ADR-009 (estrategia plugins), ADR-015 (encriptación), ADR-021 (provisioners — patrón análogo), ADR-026 (estados factura), ADR-030 (reintentos).
- **Glosario:** [Payment provider](../00-foundations/glossary.md), [Plugin](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/billing/interfaces/payment-provider.interface.ts`, `backend/src/plugins/payment/manual/`.
