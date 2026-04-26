# ADR-051 — Comisiones del partner y liquidaciones automáticas

> **Status:** Active (planificada — Fase 2)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §35 (comisiones + liquidaciones)
> **Domain:** partner, billing

---

## Contexto

El partner (ADR-048) recibe **comisión recurrente** sobre cada factura cobrada de sus clientes finales. Esto introduce dos retos económicos críticos:

1. **Cálculo y atribución de la comisión** — cada vez que `invoice.paid` ocurre y la factura tiene `partner_id`, hay que generar el registro de comisión correcto, sin duplicar y sin perder ninguno.
2. **Liquidación periódica al partner** — el partner cobra fin de mes; el sistema debe agrupar las comisiones acumuladas, generar el payout, transferir el dinero (IBAN o Stripe Connect), y registrar todo para auditoría fiscal.

Riesgos sin diseño explícito:
- **Pago duplicado o pago perdido** (race condition al procesar `invoice.paid`).
- **Comisión calculada sobre importe incorrecto** (¿bruto antes de IVA? ¿neto?).
- **Aprobación manual lenta y arbitraria** que enfada al partner.
- **Falta de trazabilidad** ante auditoría o disputa.

Hace falta proceso **automático, atómico, auditado, sin intervención manual** para liquidaciones y un cálculo de comisión claro.

---

## Decisión

### Cálculo de la comisión por factura cobrada

```
1. Evento: invoice.paid (con partner_id != null)
2. Trigger: listener en módulo partner.commissions
3. Cálculo:
     commission_amount = invoice.subtotal * product.partner_commission_pct
     (sobre el SUBTOTAL — antes de IVA)
4. Crear registro en partner_commissions:
     - id, partner_id, invoice_id, product_id, client_id
     - commission_amount, base_amount (= subtotal),
     - commission_pct, status='accrued', accrued_at, payout_id=null
5. Atómico: la creación del commission record va dentro de la misma transacción
   que actualiza invoice.status = 'paid'.
```

**Sobre el subtotal, no sobre el total** — el IVA es del Estado, no del partner. Aelium recauda el IVA y lo paga; la comisión se calcula sobre la base imponible.

### % de comisión por producto

- Definido en `products.partner_commission_pct` (decimal nullable).
- **Snapshot al momento de cobro** — si el % cambia después, las comisiones ya generadas no cambian. Solo las nuevas usan el nuevo %.
- Si `partner_commission_pct = NULL` o `0` → producto **sin comisión** (ej: addons internos no comisionables).

### Liquidaciones automáticas a fin de mes

```
Cron: 1 del mes a las 03:00 UTC
  Para cada partner activo:
    1. Buscar partner_commissions con status='accrued' y created_at < inicio del mes en curso
    2. Sumar commission_amount → total a liquidar
    3. Si total > umbral mínimo (configurable, default 50€):
       - Crear partner_payouts:
         - id, partner_id, period_start, period_end, total_amount,
           status='pending', method (iban|stripe_connect), created_at
       - Actualizar todos los partner_commissions a status='liquidated', payout_id=<id>
       - Atómico: todo en una transacción
       - Emitir evento: partner.payout.created
    4. Si total < umbral:
       - Las comisiones acumuladas quedan accrued para el mes siguiente
```

**Sin aprobación manual.** Si los datos están bien, se ejecuta. La aprobación humana solo aparece en casos de **fallo** (transferencia rechazada, datos inválidos).

### Métodos de payout

- **IBAN** → transferencia SEPA automática (futuro: integración con banca via API).
- **Stripe Connect** → transferencia automática via Stripe (cuenta conectada del partner).

El partner elige su método en su perfil. Cambiar método = revisar nueva información antes de la siguiente liquidación.

### Manejo de errores en payout

```
Si la transferencia falla (datos IBAN inválidos, Stripe error, etc.):
  - status del payout = 'failed'
  - Notificación al superadmin via system.error
  - Notificación al partner: "Tu liquidación falló — verifica tus datos"
  - Reintento automático en próximo cron (configurable: hasta N reintentos)
  - Tras N reintentos fallidos: queda en estado failed permanente, requiere intervención manual
```

### Outbox Pattern obligatorio

Eventos críticos del módulo partner.commissions y partner.payouts **deben pasar por Outbox** (R8, ADR-033):
- `partner.commission.accrued` (al crear el record).
- `partner.payout.created` (al generar el payout).
- `partner.payout.completed` (cuando la transferencia confirma).
- `partner.payout.failed` (si falla).

Esto es **crítico financiero** — un evento perdido = una liquidación perdida = disputa con el partner.

### Visualización para el partner

En su dashboard:
- **Comisión acumulada en tiempo real** (suma de `accrued` para el mes en curso).
- **Próxima liquidación estimada** (proyección según ritmo del mes).
- **Historial de liquidaciones recibidas** (lista de payouts con status, total, método, fecha).
- **Detalle por producto y cliente** (qué cliente y qué producto generó qué comisión).

### Visualización para el admin

- Cola de payouts pendientes / fallidos.
- Total a liquidar por mes (control de cash flow).
- Detección de anomalías (partner con comisión 10x lo normal → revisar).

### Auditoría

- Todo registro de `partner_commissions` y `partner_payouts` es **append-only** (R3 — solo INSERT en lo que respecta a registros financieros).
- Las transiciones de status (`pending → completed`, `accrued → liquidated`) se registran en `audit_change_log`.
- Conservación: indefinida (obligación fiscal).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Cero fricción** para el partner — cobra automáticamente sin pedir nada.
  - **Cero trabajo manual** para Aelium en el caso normal.
  - Trazabilidad completa para disputas y auditoría fiscal.
  - Cálculo predecible y auditado (subtotal × %).
  - Outbox + transacciones atómicas → sin pérdidas ni duplicados.
- ⚠️ **Aceptamos:**
  - **Dependencia fuerte de Outbox (ADR-033)** — sin Outbox implementado, el sistema actual perdería eventos. **No se puede activar este módulo en producción sin Outbox primero.**
  - **Reintentos automáticos pueden enmascarar problema sistémico** (ej: cambio de IBAN del partner). Mitigación: notificación al partner desde el primer fallo.
  - **Fallos de SEPA/Stripe necesitan intervención manual** — no todos los fallos se autocorrigen.
  - **Sin aprobación manual** = errores sistémicos se propagan rápido. Mitigación: monitoring activo + alertas por anomalías.
  - **Cálculo sobre subtotal** sorprende a partners que esperaban sobre total. Mitigación: documentación clara en el contrato del partner.
- 🚪 **Cierra:**
  - **No aprobaciones manuales en flujo normal** — el sistema debe poder operar sin admin presente.
  - **No comisión sobre IVA** — siempre sobre subtotal.
  - **No sin Outbox** — eventos `partner.commission.*` y `partner.payout.*` no pueden ir directo a EventEmitter.

---

## Cuándo revisar

- Cuando se implemente Outbox real (ADR-033) — es bloqueante.
- Si las liquidaciones fallan recurrentemente (>5%) → revisar integración bancaria / Stripe Connect.
- Si Aelium opera fuera de España → IVA y reglas fiscales pueden cambiar — revisar cálculo.
- Si surge necesidad de **comisión variable según volumen** (ej: bonus al superar X clientes) → ampliar modelo de cálculo con tiers.
- Si el umbral de liquidación de 50€ deja partners pequeños sin cobrar muchos meses → revisar.

---

## Referencias

- **Módulos afectados:** partner.commissions, partner.payouts, billing (genera `invoice.paid`), notifications (informa al partner y al admin).
- **Reglas relacionadas:** R1 (módulos por eventos), R3 (audit log + records financieros append-only), R5 (cálculos en backend), R8 (Outbox para eventos críticos — **obligatorio aquí**), R12 (encriptación de datos de pago).
- **ADRs relacionados:** ADR-048 (modelo partner), ADR-031 (payment providers — Stripe Connect comparte cuenta Stripe), ADR-033 (Outbox pendiente — bloquea este módulo), ADR-027 (IVA por país — cálculo del subtotal), ADR-026 (estados factura — `invoice.paid` es el trigger), ADR-015 (encriptación AES-256-GCM — datos de IBAN o Stripe credentials).
- **Glosario:** [Comisión](../00-foundations/glossary.md), [Payout](../00-foundations/glossary.md), [Subtotal](../00-foundations/glossary.md), [Outbox](../00-foundations/glossary.md).
- **Umbral mínimo de liquidación:** configurable en settings (`partner.payout.min_amount_eur`, default 50).
